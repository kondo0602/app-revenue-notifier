var SLACK_WEB_HOOKS_URL = PropertiesService.getScriptProperties().getProperty('slack_web_hooks_url');

// #admob-revenueにRevenueReportの結果を送信する
function sendSlackForRevenueReport(revenueReport) {
  let message = formatReport(revenueReport);
  Logger.log(message);
  sendSlackForMessage(message)
}

// #admob-revenueにメッセージを送信する
function sendSlackForMessage(message) {
  const jsonData =
  {
    "text": message,
  };
  let options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(jsonData),
  };
  UrlFetchApp.fetch(SLACK_WEB_HOOKS_URL, options);
}

// RevenueReportをslackメッセージ用にフォーマットする
function formatReport(revenueReport) {
  const col1Width = 16; // プラットフォーム列の幅
  const col2Width = 20; // アプリ名列の幅
  const col3Width = 12; // 収益列の幅

  let headerPlatform = "Platform".padEnd(col1Width, ' ');
  let headerAppName = "App Name".padEnd(col2Width, ' ');
  let headerEarnings = "Revenue".padEnd(col3Width, ' ');
  let reportSummary = "```\n" 
    + `| ${headerPlatform} | ${headerAppName} | ${headerEarnings} |\n`;
  reportSummary += `|-${"-".repeat(col1Width)}-|-${"-".repeat(col2Width)}-|-${"-".repeat(col3Width)}-|\n`;

  revenueReport.entries.forEach(entry => {
      let platform = entry.platform.padEnd(col1Width, ' ');
      let appName = entry.appName.padEnd(col2Width, ' ');
      let earnings = (entry.earnings.toFixed(0) + "円").padStart(col3Width, ' ');
      reportSummary += `| ${platform} | ${appName} | ${earnings} |\n`;
  });

  reportSummary += `|-${"-".repeat(col1Width)}-|-${"-".repeat(col2Width)}-|-${"-".repeat(col3Width)}-|\n`;
  let totalEarnings = (revenueReport.totalEarnings.toFixed(0) + "円").padStart(col3Width, ' ');
  reportSummary += `| ${"total".padEnd(col1Width, ' ')} | ${"".padEnd(col2Width, ' ')} | ${totalEarnings} |\n`;
  reportSummary += "```\n";

  return reportSummary;
}