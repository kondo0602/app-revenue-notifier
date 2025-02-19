const SLACK_WEB_HOOKS_URL = PropertiesService.getScriptProperties().getProperty(
	"slack_web_hooks_url",
);

// #admob-revenueにRevenueReportの結果を送信する
function sendSlackForRevenueReport(revenueReport) {
	const message = formatReportForSlack(revenueReport);
	Logger.log(message);
	sendSlackForMessage(message);
}

// RevenueReportをslackメッセージ用にフォーマットする
const formatReportForSlack = (revenueReport) => {
	const appNameColumnWidth = 20;
	const earningsColumnWidth = 12;

	const summaryLines = [
		`*${_generateYesterdayDate()}の収益*`,
		"```",
		_generateSummaryHeader(appNameColumnWidth, earningsColumnWidth),
		_generateSeparatorLine(appNameColumnWidth, earningsColumnWidth),
		..._generateSummaryLine(
			appNameColumnWidth,
			earningsColumnWidth,
			revenueReport,
		),
		_generateSeparatorLine(appNameColumnWidth, earningsColumnWidth),
		_generateTotalLine(
			appNameColumnWidth,
			earningsColumnWidth,
			revenueReport.totalEarnings,
		),
		"```",
	];

	return summaryLines.join("\n");
};

const _generateYesterdayDate = () => {
	return new Date(Date.now() - 86400000).toLocaleDateString("ja-JP", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		weekday: "narrow",
	});
};

const _generateSummaryHeader = (appNameColumnWidth, earningsColumnWidth) => {
	return `| ${"App Name".padEnd(appNameColumnWidth, " ")} | ${"Revenue".padEnd(earningsColumnWidth, " ")} |`;
};

const _generateSeparatorLine = (width1, width2) => {
	return `|-${"-".repeat(width1)}-|-${"-".repeat(width2)}-|`;
};

const _generateSummaryLine = (
	appNameColumnWidth,
	earningsColumnWidth,
	revenueReport,
) => {
	return revenueReport.entries.map((entry) => {
		// NOTE: アプリ名が全角なので半分にする
		const appName = entry.appName.padEnd(
			appNameColumnWidth - entry.appName.length / 2,
			" ",
		);
		const earnings = `¥${entry.earnings.toFixed(0)}`.padStart(
			earningsColumnWidth - 1,
			" ",
		);
		return `| ${appName} | ${earnings} |`;
	});
};

const _generateTotalLine = (
	appNameColumnWidth,
	earningsColumnWidth,
	totalEarnings,
) => {
	return `| ${"total".padEnd(appNameColumnWidth, " ")} | ${`¥${totalEarnings.toFixed(0)}`.padStart(earningsColumnWidth, " ")} |`;
};

// #admob-revenueにメッセージを送信する
const sendSlackForMessage = (message) => {
	const options = {
		method: "post",
		contentType: "application/json",
		payload: JSON.stringify({ text: message }),
	};

	UrlFetchApp.fetch(SLACK_WEB_HOOKS_URL, options);
};
