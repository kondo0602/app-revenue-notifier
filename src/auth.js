var CLIENT_ID = PropertiesService.getScriptProperties().getProperty('client_id');
var CLIENT_SECRET = PropertiesService.getScriptProperties().getProperty('client_secret');
const admobAPIService = getAdmobAPIService();

// スプレッドシートのメニューにAdmob API認可用のボタンを設置
// スプレッドシートを開いたタイミングで、「Admob API連携」メニューが追加される。
function onOpen(e) {
  SpreadsheetApp.getUi()
    .createMenu("Admob API連携")
    .addItem("認可処理", "initAuth")
    .addToUi();
}


// Admob API認可URLをダイアログに表示
function initAuth() {
  console.log(1);
  const authorizationUrl = admobAPIService.getAuthorizationUrl();
  const template = HtmlService.createTemplate(`
    <html>
      <head>
        <style>
          body, html {
            font-family: 'Arial', sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f4f4f4;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100%;
          }
          .button {
            padding: 10px 20px;
            font-size: 16px;
            text-decoration: none;
            color: white;
            background-color: #4CAF50;
            border: none;
            border-radius: 5px;
            cursor: pointer;
          }
          .button:hover {
            background-color: #45a049;
          }
        </style>
      </head>
      <body>
        <a href="<?= authorizationUrl ?>" target="_blank" class="button">認可する</a>
      </body>
    </html>
  `);
  console.log(2);
  template.authorizationUrl = authorizationUrl;
  const html = template.evaluate();
  const title = "Admobアプリの認可処理";
  console.log(3);
  const htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(400)
    .setHeight(150);
  SpreadsheetApp.getUi().showModelessDialog(htmlOutput, title);
}

// OAuthの準備
function getAdmobAPIService() {
  return OAuth2.createService("AdmobAPI")
    .setAuthorizationBaseUrl("https://accounts.google.com/o/oauth2/auth")
    .setTokenUrl("https://oauth2.googleapis.com/token")
    .setClientId(CLIENT_ID)
    .setClientSecret(CLIENT_SECRET)
    .setCallbackFunction("authCallback")
    .setPropertyStore(PropertiesService.getUserProperties())
    .setScope("https://www.googleapis.com/auth/admob.readonly")
    .setParam("access_type", "offline")
    .setParam('prompt', 'consent');
}

// 認証処理後のコールバックの処理を定義
function authCallback(request) {
  const isAuthorized = admobAPIService.handleCallback(request);
  if (isAuthorized) {
    var htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #f8f9fa;
          text-align: center;
          padding: 50px;
        }
        .message {
          background-color: #c8e6c9;
          color: #256029;
          padding: 20px;
          border-radius: 8px;
          display: inline-block;
          max-width: 300px;
        }
      </style>
    </head>
    <body>
      <div class="message">
        認可処理が正常に終了しました。このタブを閉じてください。
      </div>
    </body>
    </html>
    `;
    return HtmlService.createHtmlOutput(htmlContent);
  } else {
    var htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f8f9fa;
            text-align: center;
            padding: 50px;
          }
          .message {
            background-color: #ffcdd2;
            color: #c63737;
            padding: 20px;
            border-radius: 8px;
            display: inline-block;
            max-width: 300px;
          }
        </style>
      </head>
      <body>
        <div class="message">
          認可処理に失敗し、リソースへのアクセスが拒否されました。設定を確認してください。
        </div>
      </body>
    </html>
    `;
    return HtmlService.createHtmlOutput(htmlContent);
  }
}