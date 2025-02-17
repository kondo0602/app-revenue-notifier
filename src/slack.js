const SLACK_WEB_HOOKS_URL = PropertiesService.getScriptProperties().getProperty(
	"slack_web_hooks_url",
);

// #admob-revenueにRevenueReportの結果を送信する
function sendSlackForRevenueReport(revenueReport) {
	const message = formatReport(revenueReport);
	Logger.log(message);
	sendSlackForMessage(message);
}

// #admob-revenueにメッセージを送信する
function sendSlackForMessage(message) {
	const jsonData = {
		text: message,
	};
	const options = {
		method: "post",
		contentType: "application/json",
		payload: JSON.stringify(jsonData),
	};
	UrlFetchApp.fetch(SLACK_WEB_HOOKS_URL, options);
}

// RevenueReportをslackメッセージ用にフォーマットする
function formatReport(revenueReport) {
	const col1Width = 16; // プラットフォーム列の幅
	const col2Width = 20; // アプリ名列の幅
	const col3Width = 12; // 収益列の幅

	const headerPlatform = "Platform".padEnd(col1Width, " ");
	const headerAppName = "App Name".padEnd(col2Width, " ");
	const headerEarnings = "Revenue".padEnd(col3Width, " ");
	let reportSummary = `\`\`\`\n| ${headerPlatform} | ${headerAppName} | ${headerEarnings} |\n`;
	reportSummary += `|-${"-".repeat(col1Width)}-|-${"-".repeat(col2Width)}-|-${"-".repeat(col3Width)}-|\n`;

	for (const entry of revenueReport.entries) {
		const platform = entry.platform.padEnd(col1Width, " ");
		const appName = entry.appName.padEnd(col2Width, " ");
		const earnings = `${entry.earnings.toFixed(0)}円`.padStart(col3Width, " ");
		reportSummary += `| ${platform} | ${appName} | ${earnings} |\n`;
	}

	reportSummary += `|-${"-".repeat(col1Width)}-|-${"-".repeat(col2Width)}-|-${"-".repeat(col3Width)}-|\n`;
	const totalEarnings = `${revenueReport.totalEarnings.toFixed(0)}円`.padStart(
		col3Width,
		" ",
	);
	reportSummary += `| ${"total".padEnd(col1Width, " ")} | ${"".padEnd(col2Width, " ")} | ${totalEarnings} |\n`;
	reportSummary += "```\n";

	return reportSummary;
}
