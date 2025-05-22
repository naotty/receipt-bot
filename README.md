# WIP: Receipt Bot

メールから金額を抽出してGoogle Sheetsに記録するAWS Lambdaベースのボット

## 動機

手動で記録するのが手間だから


## 前提条件

- Node.js v22以上
- AWS CLIのセットアップと認証済み
- 以下のアカウントと認証情報
  - OpenAI APIキー
  - Google Cloud Platformのサービスアカウント
  - Google Sheets APIの有効化済み
- S3バケットは事前に作成しておく
  - CDKでの実装はあとで
- SESでメール受信できるようにしておく


## 環境変数の設定

`.env`ファイルをプロジェクトルートに作成し、以下の環境変数を設定してください：

```
S3_BUCKET_NAME=your-unique-bucket-name
OPENAI_API_KEY=your-openai-api-key
GOOGLE_SERVICE_ACCOUNT_JSON={"your":"service-account-json"}
SPREADSHEET_ID=your-google-spreadsheet-id
AWS_REGION=ap-northeast-1  # 任意のリージョン
```

## デプロイ手順

1. 依存関係のインストール
```bash
npm install
```

2. AWS CDKブートストラップ（初回のみ）
```bash
npm run bootstrap
```

3. ビルドとデプロイ
```bash
npm run deploy
```

## デプロイ後の設定

1. SESのルールで設定したメールアドレスに領収書のメールを転送すると、自動的に処理が開始されます
2. 処理結果は指定したGoogle Spreadsheetsに記録されます

## 注意事項

- S3バケット名は全世界で一意である必要があります
- 環境変数の`GOOGLE_SERVICE_ACCOUNT_JSON`は、改行を含まない一行のJSON文字列にしてください
- Google SheetsのスプレッドシートIDは、URLの`spreadsheets/d/`と`/edit`の間の文字列です