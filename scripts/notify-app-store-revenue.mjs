import { pathToFileURL } from "node:url";
import {
	createAppStoreConnectJwt,
	fetchMonthlySalesReport,
	formatFailureMessage,
	formatSlackMessage,
	getReportMonthFromArgs,
	loadConfig,
	parseAppStoreSalesReport,
	postSlackMessage,
	summarizeAppStoreSalesRows,
} from "./app-store-revenue.mjs";

export async function main(argv = process.argv.slice(2), env = process.env) {
	const reportMonth = getReportMonthFromArgs(argv, env);
	const config = loadConfig(env);
	const token = await createAppStoreConnectJwt(config);
	const tsv = await fetchMonthlySalesReport({
		token,
		vendorNumber: config.vendorNumber,
		reportMonth,
	});
	const rows = parseAppStoreSalesReport(tsv);
	const report = summarizeAppStoreSalesRows(rows, reportMonth);
	const message = formatSlackMessage(report);

	await postSlackMessage(config.slackWebhookUrl, message);
	console.log(`Posted App Store revenue report for ${reportMonth}`);
}

async function run() {
	let reportMonth = "";

	try {
		reportMonth = getReportMonthFromArgs(process.argv.slice(2), process.env);
		await main(process.argv.slice(2), process.env);
	} catch (error) {
		console.error(error);

		if (process.env.SLACK_WEBHOOK_URL) {
			try {
				await postSlackMessage(
					process.env.SLACK_WEBHOOK_URL,
					formatFailureMessage(error, reportMonth),
				);
			} catch (slackError) {
				console.error("Failed to post failure message to Slack:", slackError);
			}
		}

		process.exitCode = 1;
	}
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	await run();
}
