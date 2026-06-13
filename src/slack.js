const SLACK_WEB_HOOKS_URL = PropertiesService.getScriptProperties().getProperty(
	"slack_web_hooks_url",
);

const APP_NAME_ALIASES = {
	"1人でウミガメのスープ": "海亀のスープ",
};
const APP_NAME_COLUMN_WIDTH = 12;
const EARNINGS_COLUMN_WIDTH = 9;

// #admob-revenueにRevenueReportの結果を送信する
function sendSlackForRevenueReport(revenueReport) {
	const message = formatReportForSlack(revenueReport);
	Logger.log(message);
	sendSlackForMessage(message);
}

// RevenueReportをslackメッセージ用にフォーマットする
const formatReportForSlack = (revenueReport) => {
	const summaryLines = [
		`*${_generateYesterdayDate()}の収益*`,
		"```",
		_generateSummaryHeader(),
		_generateSeparatorLine(),
		..._generateSummaryLine(revenueReport),
		_generateSeparatorLine(),
		_generateTotalLine(revenueReport.totalEarnings),
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

const _generateSummaryHeader = () => {
	return _generateTableRow("App", "Revenue");
};

const _generateSeparatorLine = () => {
	return `|-${"-".repeat(APP_NAME_COLUMN_WIDTH)}-|-${"-".repeat(
		EARNINGS_COLUMN_WIDTH,
	)}-|`;
};

const _generateSummaryLine = (revenueReport) => {
	return revenueReport.entries.map((entry) => {
		const appName = _formatAppName(entry.appName);
		const earnings = _formatYen(entry.earnings);
		return _generateTableRow(appName, earnings);
	});
};

const _generateTotalLine = (totalEarnings) => {
	return _generateTableRow("total", _formatYen(totalEarnings));
};

const _generateTableRow = (appName, earnings) => {
	return `| ${_padDisplay(appName, APP_NAME_COLUMN_WIDTH)} | ${earnings.padStart(
		EARNINGS_COLUMN_WIDTH,
	)} |`;
};

const _formatAppName = (appName) => {
	const trimmedAppName = appName.trim();
	return _truncateDisplay(
		APP_NAME_ALIASES[trimmedAppName] || trimmedAppName,
		APP_NAME_COLUMN_WIDTH,
	);
};

const _formatYen = (value) => {
	return `¥${value.toFixed(0)}`;
};

const _padDisplay = (value, width) => {
	return value.padEnd(width - _countWideCharacters(value), " ");
};

const _truncateDisplay = (value, maxLength) => {
	if (value.length <= maxLength) {
		return value;
	}
	return `${value.slice(0, maxLength - 1)}…`;
};

const _countWideCharacters = (value) => {
	return [...value].filter((char) => char.charCodeAt(0) > 255).length / 2;
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
