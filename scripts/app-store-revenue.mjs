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
	const totalsByCurrency = new Map();

	for (const row of rows) {
		const productTypeIdentifier = row["Product Type Identifier"]?.trim();
		if (!APP_STORE_IAP_PRODUCT_TYPE_IDENTIFIERS.has(productTypeIdentifier)) {
			continue;
		}

		const units = parseNumber(row.Units);
		const developerProceedsPerUnit = parseNumber(row["Developer Proceeds"]);
		const proceeds = units * developerProceedsPerUnit;
		const currency = row["Currency of Proceeds"]?.trim() || "N/A";
		const title = row.Title?.trim() || "(untitled)";
		const parentIdentifier = row["Parent Identifier"]?.trim() || "";
		const entryKey = [
			title,
			parentIdentifier,
			productTypeIdentifier,
			currency,
		].join("\u0000");

		const entry = entryMap.get(entryKey) ?? {
			title,
			parentIdentifier,
			productTypeIdentifier,
			currency,
			units: 0,
			proceeds: 0,
		};

		entry.units += units;
		entry.proceeds += proceeds;
		entryMap.set(entryKey, entry);
		totalsByCurrency.set(
			currency,
			(totalsByCurrency.get(currency) ?? 0) + proceeds,
		);
	}

	const entries = [...entryMap.values()].sort((a, b) => {
		const currencyCompare = a.currency.localeCompare(b.currency);
		if (currencyCompare !== 0) {
			return currencyCompare;
		}
		return b.proceeds - a.proceeds;
	});

	return {
		reportMonth,
		entries,
		totalsByCurrency: formatTotals(totalsByCurrency),
	};
}

export function formatSlackMessage(report) {
	const lines = [
		`*${formatReportMonthForTitle(report.reportMonth)}のApp Store収益*`,
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
		formatTotalsTable(report.totalsByCurrency),
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
	const itemColumnWidth = 12;
	const profitColumnWidth = 9;
	const rows = [
		formatTableRow("Item", "Profit", itemColumnWidth, profitColumnWidth),
		formatSeparatorLine(itemColumnWidth, profitColumnWidth),
	];

	for (const entry of entries) {
		rows.push(
			formatTableRow(
				truncate(entry.title, itemColumnWidth),
				formatMoney(entry.proceeds, entry.currency),
				itemColumnWidth,
				profitColumnWidth,
			),
		);
	}

	return rows.join("\n");
}

function formatTotalsTable(totalsByCurrency) {
	const itemColumnWidth = 12;
	const profitColumnWidth = 9;
	const rows = [formatSeparatorLine(itemColumnWidth, profitColumnWidth)];

	for (const total of totalsByCurrency) {
		const label =
			total.currency === "JPY" ? "total" : `total ${total.currency}`;
		rows.push(
			formatTableRow(
				label,
				formatMoney(total.proceeds, total.currency),
				itemColumnWidth,
				profitColumnWidth,
			),
		);
	}

	return rows.join("\n");
}

function formatTotals(totalsByCurrency) {
	return [...totalsByCurrency.entries()]
		.map(([currency, proceeds]) => ({ currency, proceeds }))
		.sort((a, b) => a.currency.localeCompare(b.currency));
}

function formatTableRow(item, profit, itemColumnWidth, profitColumnWidth) {
	return `| ${padDisplay(item, itemColumnWidth)} | ${profit.padStart(
		profitColumnWidth,
	)} |`;
}

function formatSeparatorLine(itemColumnWidth, profitColumnWidth) {
	return `|-${"-".repeat(itemColumnWidth)}-|-${"-".repeat(
		profitColumnWidth,
	)}-|`;
}

function padDisplay(value, width) {
	return value.padEnd(width - countWideCharacters(value), " ");
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
	if (currency === "JPY") {
		return `¥${new Intl.NumberFormat("ja-JP", {
			maximumFractionDigits: 0,
		}).format(value)}`;
	}
	return `${currency} ${formatNumber(value)}`;
}

function formatReportMonthForTitle(reportMonth) {
	return reportMonth.replace("-", "/");
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

function countWideCharacters(value) {
	return [...value].filter((char) => char.charCodeAt(0) > 255).length / 2;
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
