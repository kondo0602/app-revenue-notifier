var ADMOB_ACCOUNT_ID = PropertiesService.getScriptProperties().getProperty('admob_account_id');

// admobAPIから昨日のアプリ収益を取得する
function fetchYesterdayRevenueReport() {
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1); // 前日の日付を設定
  var accessToken = admobAPIService.getAccessToken();  // 認証情報としてアクセストークンを設定

  var options = {
    'method': 'post',
    'contentType': 'application/json',
    'headers': {
      'Authorization': 'Bearer ' + accessToken
    },
    'payload': JSON.stringify({
      "reportSpec": {
        "dateRange": {
          "startDate": { "year": yesterday.getFullYear(), "month": yesterday.getMonth() + 1, "day": yesterday.getDate() },
          "endDate": { "year": yesterday.getFullYear(), "month": yesterday.getMonth() + 1, "day": yesterday.getDate() }
        },
        "dimensions": ["APP", "PLATFORM"],
        "metrics": ["ESTIMATED_EARNINGS"]
      }
    }),
    'muteHttpExceptions': true
  };

  var apiResponse = UrlFetchApp.fetch('https://admob.googleapis.com/v1/accounts/' + ADMOB_ACCOUNT_ID + '/mediationReport:generate', options);
  var responseContent = JSON.parse(apiResponse.getContentText());

  // 200以外の時、エラー
  if (apiResponse.getResponseCode() != 200) {
    Logger.log('Error fetching data: ' + apiResponse.getResponseCode());
    return null
  }

  var revenueReport = new RevenueReport();
  responseContent.forEach(item => {
    if (item.row) {
      let platform = item.row.dimensionValues.PLATFORM.value;
      let appName = item.row.dimensionValues.APP.displayLabel;
      let earnings = parseFloat(item.row.metricValues.ESTIMATED_EARNINGS.microsValue) / 1e6;
      let revenueData = new RevenueData(platform, appName, earnings);
      revenueReport.addEntry(revenueData);
    }
  });
  return revenueReport;
}
