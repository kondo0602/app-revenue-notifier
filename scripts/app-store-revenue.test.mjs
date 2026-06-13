import assert from "node:assert/strict";
import test from "node:test";
import {
	formatSlackMessage,
	getDefaultReportMonth,
	getReportDate,
	parseAppStoreSalesReport,
	summarizeAppStoreSalesRows,
} from "./app-store-revenue.mjs";

const summarySalesTsv = [
	[
		"Provider",
		"Provider Country",
		"SKU",
		"Developer",
		"Title",
		"Version",
		"Product Type Identifier",
		"Units",
		"Developer Proceeds",
		"Begin Date",
		"End Date",
		"Customer Currency",
		"Country Code",
		"Currency of Proceeds",
		"Apple Identifier",
		"Customer Price",
		"Promo Code",
		"Parent Identifier",
		"Subscription",
		"Period",
		"Category",
		"CMB",
		"Supported Platforms",
		"Device",
		"Preserved Pricing",
		"Proceeds Reason",
		"Client",
		"Order Type",
	].join("\t"),
	[
		"Example Provider",
		"JP",
		"coin_pack",
		"Example Developer",
		"Coin Pack",
		"",
		"IA1",
		"10",
		".70",
		"05/01/2026",
		"05/31/2026",
		"USD",
		"US",
		"USD",
		"1234567890",
		".99",
		"",
		"parent.app",
		"",
		"",
		"Games",
		"",
		"iOS",
		"iPhone",
		"",
		"",
		"",
		"",
	].join("\t"),
	[
		"Example Provider",
		"JP",
		"coin_pack",
		"Example Developer",
		"Coin Pack",
		"",
		"IA1",
		"-2",
		".70",
		"05/01/2026",
		"05/31/2026",
		"USD",
		"US",
		"USD",
		"1234567890",
		"-.99",
		"",
		"parent.app",
		"",
		"",
		"Games",
		"",
		"iOS",
		"iPhone",
		"",
		"",
		"",
		"",
	].join("\t"),
	[
		"Example Provider",
		"JP",
		"monthly_subscription",
		"Example Developer",
		"Monthly Premium",
		"",
		"IAY",
		"3",
		"500",
		"05/01/2026",
		"05/31/2026",
		"JPY",
		"JP",
		"JPY",
		"1234567890",
		"700",
		"",
		"parent.app",
		"Renewal",
		"1 Month",
		"Games",
		"",
		"iOS",
		"iPhone",
		"",
		"",
		"",
		"",
	].join("\t"),
	[
		"Example Provider",
		"JP",
		"app_download",
		"Example Developer",
		"App Download",
		"",
		"1F",
		"100",
		"0",
		"05/01/2026",
		"05/31/2026",
		"USD",
		"US",
		"USD",
		"1234567890",
		"0",
		"",
		"",
		"",
		"",
		"Games",
		"",
		"iOS",
		"iPhone",
		"",
		"",
		"",
		"",
	].join("\t"),
].join("\n");

test("calculates the previous report month in JST", () => {
	assert.equal(
		getDefaultReportMonth(new Date("2026-06-05T15:00:00.000Z")),
		"2026-05",
	);
	assert.equal(
		getDefaultReportMonth(new Date("2026-01-05T15:00:00.000Z")),
		"2025-12",
	);
	assert.equal(getReportDate("2026-05"), "2026-05");
});

test("summarizes only App Store IAP and subscription rows", () => {
	const rows = parseAppStoreSalesReport(summarySalesTsv);
	const report = summarizeAppStoreSalesRows(rows, "2026-05");

	assert.equal(report.entries.length, 2);
	assert.deepEqual(
		report.entries.map((entry) => ({
			title: entry.title,
			type: entry.productTypeIdentifier,
			currency: entry.currency,
			units: entry.units,
			proceeds: entry.proceeds,
		})),
		[
			{
				title: "Monthly Premium",
				type: "IAY",
				currency: "JPY",
				units: 3,
				proceeds: 1500,
			},
			{
				title: "Coin Pack",
				type: "IA1",
				currency: "USD",
				units: 8,
				proceeds: 5.6,
			},
		],
	);
	assert.deepEqual(report.totalsByCurrency, [
		{ currency: "JPY", proceeds: 1500 },
		{ currency: "USD", proceeds: 5.6 },
	]);
});

test("uses developer proceeds instead of customer sales", () => {
	const report = summarizeAppStoreSalesRows(
		[
			{
				Title: "Example IAP",
				"Product Type Identifier": "IA1",
				Units: "6",
				"Customer Price": "74",
				"Customer Currency": "JPY",
				"Developer Proceeds": "49.3333333333",
				"Currency of Proceeds": "JPY",
				"Parent Identifier": "parent.app",
			},
		],
		"2026-05",
	);

	assert.equal(report.totalsByCurrency[0].currency, "JPY");
	assert.equal(roundMoney(report.totalsByCurrency[0].proceeds), 296);
});

test("formats a Slack message with entries and currency totals", () => {
	const rows = parseAppStoreSalesReport(summarySalesTsv);
	const report = summarizeAppStoreSalesRows(rows, "2026-05");
	const message = formatSlackMessage(report);

	assert.match(message, /2026\/05のApp Store収益/);
	assert.match(message, /Monthly/);
	assert.match(message, /Coin Pack/);
	assert.match(message, /Item/);
	assert.match(message, /Profit/);
	assert.match(message, /¥1,500/);
	assert.match(message, /USD 5\.60/);
	assert.doesNotMatch(message, /Sales/);
	assert.doesNotMatch(message, /Proceeds/);
	assert.doesNotMatch(message, /App Download/);
});

function roundMoney(value) {
	return Math.round(value * 100) / 100;
}
