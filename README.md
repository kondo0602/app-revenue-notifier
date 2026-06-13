# App Revenue Notifier

AdMobの収益レポートとApp Storeの月次アプリ内課金売上をSlackに通知するアプリケーションです。

## 概要

このアプリケーションは、毎日AdMob APIから前日の収益データを取得し、整形されたレポートをSlackチャンネルに送信します。AdMob通知はGoogle Apps Scriptのタイムベーストリガーを使用して定期実行することを想定しています。

App Storeの月次アプリ内課金売上は、GitHub Actionsで毎月6日にApp Store Connect APIから前月分のSales and Trends Summary Sales Reportを取得してSlackに通知します。

## 機能

- AdMob APIを使用した前日の収益データの自動取得
- アプリごとの収益をテーブル形式で表示
- Slack Webhookを使用したチャンネルへの通知
- OAuth2認証によるセキュアなAPI接続
- トークン期限切れ時の自動通知
- App Store Connect APIを使用した前月分アプリ内課金売上の月次通知

## プロジェクト構造

```
src/
├── main.js      # メインエントリーポイント
├── admob.js     # AdMob API連携処理
├── auth.js      # OAuth2認証処理
├── model.js     # データモデル定義
└── slack.js     # Slack通知処理
scripts/
├── app-store-revenue.mjs        # App Store売上取得・集計・Slack整形
├── notify-app-store-revenue.mjs # App Store月次通知CLI
└── app-store-revenue.test.mjs   # App Store通知のNode標準テスト
```

## セットアップ

### AdMob日次通知

#### 1. 必要な情報の準備

以下の情報を事前に準備してください：

- Google Cloud ProjectのOAuth2クライアントID/シークレット
- AdMobアカウントID
- Slack Webhook URL

#### 2. Google Apps Scriptプロパティの設定

スクリプトプロパティに以下の値を設定してください：

- `client_id`: OAuth2クライアントID
- `client_secret`: OAuth2クライアントシークレット
- `admob_account_id`: AdMobアカウントID
- `slack_web_hooks_url`: Slack Webhook URL

#### 3. 認証の実行

1. Google Sheetsでスプレッドシートを開く
2. メニューから「Admob API連携」→「認可処理」を選択
3. 表示されたダイアログの「認可する」ボタンをクリック
4. Googleアカウントでログインし、必要な権限を許可

#### 4. 定期実行の設定

Google Apps Scriptのトリガー機能を使用して、`main`関数を毎日実行するように設定してください。

### App Store月次通知

#### 1. App Store Connect API Keyの準備

App Store ConnectでSales and Trends Reportを参照できるAPI Keyを作成し、以下を控えてください：

- Issuer ID
- Key ID
- `.p8` private key
- Vendor Number

Vendor NumberはApp Store ConnectのPayments and Financial Reportsで確認できます。

#### 2. GitHub Secretsの設定

GitHubリポジトリのSettings → Secrets and variables → Actionsに以下を設定してください：

- `APPSTORE_ISSUER_ID`: App Store Connect APIのIssuer ID
- `APPSTORE_KEY_ID`: App Store Connect API Key ID
- `APPSTORE_PRIVATE_KEY_BASE64`: `.p8` private keyをbase64化した値
- `APPSTORE_VENDOR_NUMBER`: App Store ConnectのVendor Number
- `SLACK_WEBHOOK_URL`: Slack Incoming Webhook URL

macOSでprivate keyをbase64化する例：

```bash
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
```

Linuxでprivate keyをbase64化する例：

```bash
base64 -w 0 AuthKey_XXXXXXXXXX.p8
```

#### 3. 定期実行

`.github/workflows/app-store-revenue.yml`により、毎月6日 09:17 JSTに前月分のApp Store月次アプリ内課金売上を通知します。

GitHub Actionsの`workflow_dispatch`から手動実行できます。`report_month`に`YYYY-MM`を指定すると任意の対象月を通知し、未指定の場合はJST基準の前月を通知します。

## 開発

### 環境構築

```bash
# 依存関係のインストール
pnpm install
```

### コードフォーマット・リント

```bash
# Biomeを使用したコードの整形とリント
pnpm lint
```

### App Store月次通知のテスト

```bash
pnpm run test:app-store
```

### App Store月次通知のローカル実行

必要な環境変数を設定して実行します：

```bash
APPSTORE_ISSUER_ID=... \
APPSTORE_KEY_ID=... \
APPSTORE_PRIVATE_KEY_BASE64=... \
APPSTORE_VENDOR_NUMBER=... \
SLACK_WEBHOOK_URL=... \
pnpm run notify:app-store -- --report-month=2026-05
```

### デプロイ

claspを使用してGoogle Apps Scriptにデプロイします：

```bash
# claspのインストール（グローバル）
npm install -g @google/clasp

# ログイン
clasp login

# デプロイ
clasp push
```

## 通知フォーマット

AdMobの日次収益レポートは以下のような形式です：

```
*2025/01/20(月)の収益*
```
| App Name             | Revenue      |
|----------------------|--------------|
| アプリ名1            |      ¥1,234  |
| アプリ名2            |        ¥567  |
|----------------------|--------------|
| total                |      ¥1,801  |
```
```

App Storeの月次アプリ内課金売上レポートは、対象月、商品別のDeveloper Proceeds、通貨別合計をSlackに送信します。金額は税金とApple手数料を差し引いた開発者収益ベースです。複数通貨は換算せず通貨別に表示します。

## 注意事項

- AdMob APIの認証トークンは定期的に更新が必要です
- トークンの期限が切れた場合は、Slackに通知が送信されます
- 収益データは前日分のみ取得されます
- タイムゾーンは日本時間（Asia/Tokyo）に設定されています
- App Storeの月次レポートはApple公式仕様上、月末から5日後に利用可能になります
- App Store月次通知はGitHub Actions上で実行されるため、GitHub Secretsの値をリポジトリにコミットしないでください

## トラブルシューティング

### 認証エラーが発生する場合

1. OAuth2クライアントの設定を確認
2. スクリプトプロパティの値が正しいか確認
3. 必要なOAuthスコープが有効になっているか確認

### データが取得できない場合

1. AdMobアカウントIDが正しいか確認
2. APIのレスポンスログを確認
3. AdMob側でデータが生成されているか確認

### App Store月次通知が失敗する場合

1. GitHub Secretsの値が設定されているか確認
2. App Store Connect API KeyにSales and Trends Reportを参照できる権限があるか確認
3. Vendor Numberが正しいか確認
4. 対象月のSummary Sales Reportが利用可能になっているか確認

## ライセンス

このプロジェクトのライセンスについては、プロジェクトオーナーにお問い合わせください。
