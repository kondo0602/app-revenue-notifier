
function main() {
  if (!admobAPIService.hasAccess()) {
    let message = "⛔️トークンの期限が切れました。スプレッドシートを開いて再認証してください。";
    sendSlackForMessage(message);
    return;
  }

  // 収入レポート取得
  var revenueReport = fetchYesterdayRevenueReport();
  sendSlackForRevenueReport(revenueReport);
}
