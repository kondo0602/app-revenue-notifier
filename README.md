# App Revenue Notifier

AdMobの収益レポートを自動的に取得し、Slackに通知するGoogle Apps Scriptアプリケーションです。

## 概要

このアプリケーションは、毎日AdMob APIから前日の収益データを取得し、整形されたレポートをSlackチャンネルに送信します。Google Apps Scriptのタイムベーストリガーを使用して定期実行することを想定しています。

## 機能

- AdMob APIを使用した前日の収益データの自動取得
- アプリごとの収益をテーブル形式で表示
- Slack Webhookを使用したチャンネルへの通知
- OAuth2認証によるセキュアなAPI接続
- トークン期限切れ時の自動通知

## プロジェクト構造

```
src/
├── main.js      # メインエントリーポイント
├── admob.js     # AdMob API連携処理
├── auth.js      # OAuth2認証処理
├── model.js     # データモデル定義
└── slack.js     # Slack通知処理
```

## セットアップ

### 1. 必要な情報の準備

以下の情報を事前に準備してください：

- Google Cloud ProjectのOAuth2クライアントID/シークレット
- AdMobアカウントID
- Slack Webhook URL

### 2. Google Apps Scriptプロパティの設定

スクリプトプロパティに以下の値を設定してください：

- `client_id`: OAuth2クライアントID
- `client_secret`: OAuth2クライアントシークレット
- `admob_account_id`: AdMobアカウントID
- `slack_web_hooks_url`: Slack Webhook URL

### 3. 認証の実行

1. Google Sheetsでスプレッドシートを開く
2. メニューから「Admob API連携」→「認可処理」を選択
3. 表示されたダイアログの「認可する」ボタンをクリック
4. Googleアカウントでログインし、必要な権限を許可

### 4. 定期実行の設定

Google Apps Scriptのトリガー機能を使用して、`main`関数を毎日実行するように設定してください。

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

Slackに送信される収益レポートは以下のような形式です：

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

## 注意事項

- AdMob APIの認証トークンは定期的に更新が必要です
- トークンの期限が切れた場合は、Slackに通知が送信されます
- 収益データは前日分のみ取得されます
- タイムゾーンは日本時間（Asia/Tokyo）に設定されています

## トラブルシューティング

### 認証エラーが発生する場合

1. OAuth2クライアントの設定を確認
2. スクリプトプロパティの値が正しいか確認
3. 必要なOAuthスコープが有効になっているか確認

### データが取得できない場合

1. AdMobアカウントIDが正しいか確認
2. APIのレスポンスログを確認
3. AdMob側でデータが生成されているか確認

## ライセンス

このプロジェクトのライセンスについては、プロジェクトオーナーにお問い合わせください。