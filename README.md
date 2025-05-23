# Receipt Bot

メールから金額を抽出してGoogle Sheetsに記録するAWS Lambdaベースのボット

## 動機

手動で記録するのが手間だから

## 前提条件

- Node.js v22以上
- AWS CLIのセットアップと認証済み
- 以下のアカウントと認証情報
  - AWS BedrockのModel Accessが有効（Claude 3 Sonnetなど）
  - Google Cloud Platformのサービスアカウント
  - Google Sheets APIの有効化済み
- S3バケットは事前に作成しておく
  - CDKでの実装はあとで
- SESでメール受信できるようにしておく

## AWS Bedrockのモデルアクセス設定

1. AWS ConsoleでAmazon Bedrockサービスに移動
2. 左メニューから「Model access」を選択
3. 「Enable specific models」をクリック
4. 使用したいモデル（推奨：Claude 3 Sonnet）を選択
5. 「Request model access」で申請（通常は即座に承認される）

## 環境変数の設定

`.env`ファイルをプロジェクトルートに作成し、以下の環境変数を設定してください：

```text
S3_BUCKET_NAME=your-unique-bucket-name
BEDROCK_MODEL_ID=apac.anthropic.claude-3-5-sonnet-20241022-v2:0
GOOGLE_SERVICE_ACCOUNT_JSON={"your":"service-account-json"}
SPREADSHEET_ID=your-google-spreadsheet-id
AWS_REGION=ap-northeast-1  # 任意のリージョン
```

### 利用可能なBedrockモデル（Inference Profile）

**新しいClaude 3.5 Sonnet v2 (推奨)**

**APAC地域用（ap-northeast-1など）**
- `apac.anthropic.claude-3-5-sonnet-20241022-v2:0` (クロスリージョン・高性能)

**US地域用（us-east-1, us-west-2など）**
- `us.anthropic.claude-3-5-sonnet-20241022-v2:0` (クロスリージョン・高性能)

**従来モデル**
- `anthropic.claude-3-sonnet-20240229-v1:0` (バランス型)
- `anthropic.claude-3-haiku-20240307-v1:0` (高速・低コスト)
- `amazon.titan-text-express-v1` (Amazon製)
- `mistral.mistral-7b-instruct-v0:2` (Mistral AI)

> **重要**: Claude 3.5 Sonnet v2は**inference profile**として提供されており、リージョンに応じて適切なプレフィックスが必要です：
> - **APAC地域**: `apac.` プレフィックス
> - **US地域**: `us.` プレフィックス  
> - **EU地域**: `eu.` プレフィックス

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
2. 処理結果は指定したGoogle Spreadsheetsに記録されます（日時、金額、件名、送信者の順）

## 技術スタック

- **AI/ML**: AWS Bedrock (Claude 3 Sonnet)
- **コンピューティング**: AWS Lambda
- **ストレージ**: Amazon S3
- **メール**: Amazon SES
- **データベース**: Google Sheets API
- **インフラ**: AWS CDK
- **言語**: TypeScript

## 注意事項

- S3バケット名は全世界で一意である必要があります
- 環境変数の`GOOGLE_SERVICE_ACCOUNT_JSON`は、改行を含まない一行のJSON文字列にしてください
- Google SheetsのスプレッドシートIDは、URLの`spreadsheets/d/`と`/edit`の間の文字列です
- BedrockのモデルアクセスはAWSリージョンごとに設定が必要です
- 一部のモデルはクロスリージョン推論のみ対応している場合があります

## コスト効率性

OpenAI APIからAWS Bedrockに移行することで、以下のメリットがあります：
- Claude 3 SonnetはGPT-4より約68%安価
- AWSエコシステム内での統合によるデータ転送コストの削減
- IAMによる細かな権限制御でセキュリティ向上