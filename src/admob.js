const ADMOB_ACCOUNT_ID =
	PropertiesService.getScriptProperties().getProperty("admob_account_id");

// admobAPIから昨日のアプリ収益を取得する
function fetchYesterdayRevenueReport() {
	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1); // 前日の日付を設定
	const accessToken = admobAPIService.getAccessToken(); // 認証情報としてアクセストークンを設定

	const options = {
		method: "post",
		contentType: "application/json",
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
		payload: JSON.stringify({
			reportSpec: {
				dateRange: {
					startDate: {
						year: yesterday.getFullYear(),
						month: yesterday.getMonth() + 1,
						day: yesterday.getDate(),
					},
					endDate: {
						year: yesterday.getFullYear(),
						month: yesterday.getMonth() + 1,
						day: yesterday.getDate(),
					},
				},
				dimensions: ["APP", "PLATFORM"],
				metrics: ["ESTIMATED_EARNINGS"],
			},
		}),
		muteHttpExceptions: true,
	};

	const apiResponse = UrlFetchApp.fetch(
		`https://admob.googleapis.com/v1/accounts/${ADMOB_ACCOUNT_ID}/mediationReport:generate`,
		options,
	);

	const responseContent = JSON.parse(apiResponse.getContentText());

	// 200以外の時、エラー
	if (apiResponse.getResponseCode() !== 200) {
		Logger.log(`Error fetching data: ${apiResponse.getResponseCode()}`);
		return null;
	}

	const revenueReport = new RevenueReport();

	for (const item of responseContent) {
		if (item.row) {
			const platform = item.row.dimensionValues.PLATFORM.value;
			const appName = item.row.dimensionValues.APP.displayLabel;
			const earnings =
				Number.parseFloat(
					item.row.metricValues.ESTIMATED_EARNINGS.microsValue,
				) / 1e6;
			const revenueData = new RevenueData(platform, appName, earnings);
			revenueReport.addEntry(revenueData);
		}
	}

	return revenueReport;
}
