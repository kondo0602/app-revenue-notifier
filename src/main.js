function main() {
	if (!admobAPIService.hasAccess()) {
		const message =
			"⛔️トークンの期限が切れました。スプレッドシートを開いて再認証してください。";
		sendSlackForMessage(message);
		return;
	}

	// 収入レポート取得
	const revenueReport = fetchYesterdayRevenueReport();
	sendSlackForRevenueReport(revenueReport);
}
