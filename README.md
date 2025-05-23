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
4. 使用したいモデル（推奨：Claude 3.5 Sonnet）を選択
5. 「Request model access」で申請（通常は即座に承認される）

## 環境変数の設定

`.env`ファイルをプロジェクトルートに作成し、以下の環境変数を設定してください：

```text
AWS_REGION=ap-northeast-1
S3_BUCKET_NAME=your-unique-bucket-name
BEDROCK_MODEL_ID=apac.anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_SECRET_GOOGLE_CREDENTIALS_ID=your-credential-id
SPREADSHEET_ID=your-google-spreadsheet-id
SHEET_NAME=your-sheet-name
ALLOWED_SENDER_EMAILS=user1@example.com,user2@example.com
```

### 環境変数の説明

- `ALLOWED_SENDER_EMAILS`: 処理を許可するメールアドレスをカンマ区切りで指定（セキュリティ機能）
  - 設定しない場合は、すべての送信者からのメールを処理します
  - 例: `user@example.com,admin@company.com`

## Google認証情報の設定

Google Sheets APIを使用するために、サービスアカウントの認証情報をAWS Secrets Managerに保存する必要があります。

### 1. Google Cloud Platformでサービスアカウント作成

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. プロジェクトを選択または新規作成
3. 「APIとサービス」→「認証情報」に移動
4. 「認証情報を作成」→「サービスアカウント」を選択
5. サービスアカウント名を入力して作成
6. 作成したサービスアカウントをクリック
7. 「キー」タブ→「キーを追加」→「新しいキーを作成」
8. 「JSON」形式を選択してダウンロード

### 2. Google Sheets APIの有効化

1. Google Cloud Consoleで「APIとサービス」→「ライブラリ」に移動
2. "Google Sheets API"を検索して有効化
3. Google Sheetsでサービスアカウントのメールアドレスを共有設定に追加

### 3. AWS Secrets Managerに認証情報を保存

ダウンロードしたJSONファイルをBase64エンコードしてからAWS Secrets Managerに保存します：

```bash
# JSONファイルをBase64エンコード
base64 -i path/to/your/service-account-key.json > base64.json

# AWS Secrets Managerにバイナリとして保存
aws secretsmanager create-secret \
  --name "your-credential-id" \
  --description "Google Sheets API用のサービスアカウント認証情報" \
  --secret-binary fileb://base64.json

# または既存のシークレットを更新する場合
aws secretsmanager update-secret \
  --secret-id "your-credential-id" \
  --secret-binary fileb://base64.json
```

> **重要**: 
> - 認証情報はバイナリ形式（Base64エンコード）でSecrets Managerに保存されます。Lambda関数は自動的にデコード処理を行います。

> - `your-credential-id` の部分は任意の名前で、環境変数 `AWS_SECRET_GOOGLE_CREDENTIALS_ID` に設定する値と同じものを使用してください。

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
2. 処理結果は指定したGoogle Spreadsheetsに記録されます（日時、商品名、金額の順）

## セキュリティ機能

- **送信者制限**: `ALLOWED_SENDER_EMAILS` 環境変数で指定したメールアドレスからのメールのみを処理
- **認証情報保護**: Google認証情報はAWS Secrets Managerで暗号化して保存
- **IAM権限**: Lambda関数は最小限の権限のみを付与

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
- Google SheetsのスプレッドシートIDは、URLの`spreadsheets/d/`と`/edit`の間の文字列です
- BedrockのモデルアクセスはAWSリージョンごとに設定が必要です
- 一部のモデルはクロスリージョン推論のみ対応している場合があります
