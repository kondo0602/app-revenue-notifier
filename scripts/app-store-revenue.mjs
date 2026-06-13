import { Buffer } from "node:buffer";
import { gunzipSync } from "node:zlib";
import { parse } from "csv-parse/sync";
import { SignJWT, importPKCS8 } from "jose";

export const APP_STORE_SALES_REPORT_URL =
	"https://api.appstoreconnect.apple.com/v1/salesReports";

export const APP_STORE_IAP_PRODUCT_TYPE_IDENTIFIERS = new Set([
	"FI1",
	"IA1",
	"IA1-M",
	"IA9",
	"IA9-M",
	"IAY",
	"IAY-M",
]);

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const REPORT_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export class AppStoreRevenueError extends Error {
	constructor(message, options = {}) {
		super(message);
		this.name = "AppStoreRevenueError";
		this.status = options.status;
		this.body = options.body;
	}
}

export function getDefaultReportMonth(now = new Date()) {
	const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
	const reportMonthDate = new Date(
		Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth() - 1, 1),
	);
	return `${reportMonthDate.getUTCFullYear()}-${pad2(
		reportMonthDate.getUTCMonth() + 1,
	)}`;
}

export function validateReportMonth(reportMonth) {
	if (!REPORT_MONTH_PATTERN.test(reportMonth)) {
		throw new AppStoreRevenueError(
			`report_month must be in YYYY-MM format: ${reportMonth}`,
		);
	}
	return reportMonth;
}

export function getReportDate(reportMonth) {
	return validateReportMonth(reportMonth);
}

export function getReportMonthFromArgs(argv, env = process.env) {
	const reportMonthArg = argv.find((arg) => arg.startsWith("--report-month="));
	const reportMonth =
		env.REPORT_MONTH ||
		env.INPUT_REPORT_MONTH ||
		(reportMonthArg ? reportMonthArg.split("=").slice(1).join("=") : "");

	return reportMonth
		? validateReportMonth(reportMonth)
		: getDefaultReportMonth();
}

export function loadConfig(env = process.env) {
	const requiredKeys = [
		"APPSTORE_ISSUER_ID",
		"APPSTORE_KEY_ID",
		"APPSTORE_PRIVATE_KEY_BASE64",
		"APPSTORE_VENDOR_NUMBER",
		"SLACK_WEBHOOK_URL",
	];
	const missingKeys = requiredKeys.filter((key) => !env[key]);

	if (missingKeys.length > 0) {
		throw new AppStoreRevenueError(
			`Missing required environment variables: ${missingKeys.join(", ")}`,
		);
	}

	return {
		issuerId: env.APPSTORE_ISSUER_ID,
		keyId: env.APPSTORE_KEY_ID,
		privateKey: Buffer.from(env.APPSTORE_PRIVATE_KEY_BASE64, "base64").toString(
			"utf8",
		),
		vendorNumber: env.APPSTORE_VENDOR_NUMBER,
		slackWebhookUrl: env.SLACK_WEBHOOK_URL,
	};
}

export async function createAppStoreConnectJwt({
	issuerId,
	keyId,
	privateKey,
	now = new Date(),
}) {
	const privateKeyObject = await importPKCS8(privateKey, "ES256");
	const issuedAt = Math.floor(now.getTime() / 1000);

	return new SignJWT({})
		.setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
		.setIssuer(issuerId)
		.setAudience("appstoreconnect-v1")
		.setIssuedAt(issuedAt)
		.setExpirationTime(issuedAt + 19 * 60)
		.sign(privateKeyObject);
}

export function buildSalesReportUrl({ vendorNumber, reportMonth }) {
	const url = new URL(APP_STORE_SALES_REPORT_URL);
	url.searchParams.set("filter[frequency]", "MONTHLY");
	url.searchParams.set("filter[reportDate]", getReportDate(reportMonth));
	url.searchParams.set("filter[reportSubType]", "SUMMARY");
	url.searchParams.set("filter[reportType]", "SALES");
	url.searchParams.set("filter[vendorNumber]", vendorNumber);
	url.searchParams.set("filter[version]", "1_0");
	return url;
}

export async function fetchMonthlySalesReport({
	token,
	vendorNumber,
	reportMonth,
	fetchImpl = fetch,
}) {
	const url = buildSalesReportUrl({ vendorNumber, reportMonth });
	const response = await fetchImpl(url, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/a-gzip",
		},
	});

	if (!response.ok) {
		const body = await readResponseBody(response);
		throw new AppStoreRevenueError(
			`App Store Connect sales report request failed: ${response.status} ${response.statusText}`,
			{ status: response.status, body },
		);
	}

	const compressedReport = Buffer.from(await response.arrayBuffer());
	if (compressedReport.length === 0) {
		throw new AppStoreRevenueError(
			`App Store Connect returned an empty sales report for ${reportMonth}`,
		);
	}

	return gunzipSync(compressedReport).toString("utf8");
}

export function parseAppStoreSalesReport(tsv) {
	return parse(tsv, {
		bom: true,
		columns: true,
		delimiter: "\t",
		relax_column_count: true,
		skip_empty_lines: true,
	});
}

export function summarizeAppStoreSalesRows(rows, reportMonth) {
	validateReportMonth(reportMonth);

	const entryMap = new Map();
	const proceedsTotalsByCurrency = new Map();
	const salesTotalsByCurrency = new Map();

	for (const row of rows) {
		const productTypeIdentifier = row["Product Type Identifier"]?.trim();
		if (!APP_STORE_IAP_PRODUCT_TYPE_IDENTIFIERS.has(productTypeIdentifier)) {
			continue;
		}

		const units = parseNumber(row.Units);
		const developerProceedsPerUnit = parseNumber(row["Developer Proceeds"]);
		const customerPricePerUnit = parseNumber(row["Customer Price"]);
		const proceeds = units * developerProceedsPerUnit;
		const sales = calculateCustomerSales(units, customerPricePerUnit);
		const proceedsCurrency = row["Currency of Proceeds"]?.trim() || "N/A";
		const salesCurrency = row["Customer Currency"]?.trim() || proceedsCurrency;
		const title = row.Title?.trim() || "(untitled)";
		const parentIdentifier = row["Parent Identifier"]?.trim() || "";
		const entryKey = [
			title,
			parentIdentifier,
			productTypeIdentifier,
			salesCurrency,
			proceedsCurrency,
		].join("\u0000");

		const entry = entryMap.get(entryKey) ?? {
			title,
			parentIdentifier,
			productTypeIdentifier,
			salesCurrency,
			proceedsCurrency,
			units: 0,
			sales: 0,
			proceeds: 0,
		};

		entry.units += units;
		entry.sales += sales;
		entry.proceeds += proceeds;
		entryMap.set(entryKey, entry);
		salesTotalsByCurrency.set(
			salesCurrency,
			(salesTotalsByCurrency.get(salesCurrency) ?? 0) + sales,
		);
		proceedsTotalsByCurrency.set(
			proceedsCurrency,
			(proceedsTotalsByCurrency.get(proceedsCurrency) ?? 0) + proceeds,
		);
	}

	const entries = [...entryMap.values()].sort((a, b) => {
		const proceedsCurrencyCompare = a.proceedsCurrency.localeCompare(
			b.proceedsCurrency,
		);
		if (proceedsCurrencyCompare !== 0) {
			return proceedsCurrencyCompare;
		}
		const salesCurrencyCompare = a.salesCurrency.localeCompare(b.salesCurrency);
		if (salesCurrencyCompare !== 0) {
			return salesCurrencyCompare;
		}
		return b.proceeds - a.proceeds;
	});
	const proceedsTotals = formatTotals(proceedsTotalsByCurrency, "proceeds");
	const salesTotals = formatTotals(salesTotalsByCurrency, "sales");

	return {
		reportMonth,
		entries,
		proceedsTotalsByCurrency: proceedsTotals,
		salesTotalsByCurrency: salesTotals,
		totalsByCurrency: proceedsTotals,
	};
}

export function formatSlackMessage(report) {
	const lines = [
		`*App Store ${report.reportMonth} のアプリ内課金売上*`,
		"_Sales: Customer Price basis / Proceeds: Developer Proceeds basis_",
	];

	if (report.entries.length === 0) {
		return [...lines, "", "対象のアプリ内課金売上はありませんでした。"].join(
			"\n",
		);
	}

	return [
		...lines,
		"",
		"```",
		formatEntriesTable(report.entries),
		"",
		formatTotalsTable("Sales totals", report.salesTotalsByCurrency, "sales"),
		"",
		formatTotalsTable(
			"Developer proceeds totals",
			report.proceedsTotalsByCurrency,
			"proceeds",
		),
		"```",
	].join("\n");
}

export function formatFailureMessage(error, reportMonth = "") {
	const lines = ["*:warning: App Store 月次売上通知に失敗しました*"];
	if (reportMonth) {
		lines.push(`対象月: ${reportMonth}`);
	}
	lines.push(`理由: ${error.message}`);

	if (error.status) {
		lines.push(`HTTP Status: ${error.status}`);
	}
	if (error.body) {
		lines.push(`Response: ${truncate(error.body.replace(/\s+/g, " "), 800)}`);
	}

	return lines.join("\n");
}

export async function postSlackMessage(webhookUrl, text, fetchImpl = fetch) {
	const response = await fetchImpl(webhookUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ text }),
	});

	if (!response.ok) {
		const body = await readResponseBody(response);
		throw new AppStoreRevenueError(
			`Slack webhook request failed: ${response.status} ${response.statusText}`,
			{ status: response.status, body },
		);
	}
}

function formatEntriesTable(entries) {
	const rows = [
		["Product", "Type", "Units", "Sales", "Proceeds"],
		[
			"-".repeat(24),
			"-".repeat(7),
			"-".repeat(8),
			"-".repeat(18),
			"-".repeat(18),
		],
	];

	for (const entry of entries) {
		const title =
			entry.parentIdentifier && entry.parentIdentifier !== entry.title
				? `${entry.title} (${entry.parentIdentifier})`
				: entry.title;
		rows.push([
			truncate(title, 24),
			entry.productTypeIdentifier,
			formatNumber(entry.units),
			formatMoney(entry.sales, entry.salesCurrency),
			formatMoney(entry.proceeds, entry.proceedsCurrency),
		]);
	}

	return rows
		.map(
			([product, type, units, sales, proceeds]) =>
				`${product.padEnd(24)} | ${type.padEnd(7)} | ${units.padStart(
					8,
				)} | ${sales.padStart(18)} | ${proceeds.padStart(18)}`,
		)
		.join("\n");
}

function formatTotalsTable(title, totalsByCurrency, valueKey) {
	const rows = [
		["Currency", valueKey === "sales" ? "Total Sales" : "Total Proceeds"],
		["-".repeat(8), "-".repeat(18)],
		...totalsByCurrency.map((total) => [
			total.currency,
			formatMoney(total[valueKey], total.currency),
		]),
	];

	const table = rows
		.map(
			([currency, proceeds]) =>
				`${currency.padEnd(8)} | ${proceeds.padStart(18)}`,
		)
		.join("\n");

	return `${title}\n${table}`;
}

function formatTotals(totalsByCurrency, valueKey) {
	return [...totalsByCurrency.entries()]
		.map(([currency, value]) => ({ currency, [valueKey]: value }))
		.sort((a, b) => a.currency.localeCompare(b.currency));
}

function calculateCustomerSales(units, customerPricePerUnit) {
	if (units === 0) {
		return customerPricePerUnit;
	}
	return Math.abs(units) * customerPricePerUnit;
}

function parseNumber(value) {
	if (value === undefined || value === null || value === "") {
		return 0;
	}

	const parsed = Number(String(value).replace(/,/g, "").trim());
	if (!Number.isFinite(parsed)) {
		throw new AppStoreRevenueError(`Invalid numeric value in report: ${value}`);
	}
	return parsed;
}

function formatMoney(value, currency) {
	return `${currency} ${formatNumber(value)}`;
}

function formatNumber(value) {
	return new Intl.NumberFormat("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
}

function truncate(value, maxLength) {
	if (value.length <= maxLength) {
		return value;
	}
	return `${value.slice(0, maxLength - 1)}…`;
}

function pad2(value) {
	return String(value).padStart(2, "0");
}

async function readResponseBody(response) {
	try {
		return truncate(await response.text(), 1200);
	} catch (error) {
		return `Unable to read response body: ${error.message}`;
	}
}
