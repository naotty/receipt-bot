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

## 開発

### テスト実行

```bash
# 全テスト実行
npm test

# テスト監視モード
npm run test:watch

# カバレッジ付きテスト
npm run test:coverage
```

### ビルド

```bash
# TypeScriptコンパイル
npm run build

# 監視モード
npm run watch
```

### ローカル開発環境

ローカルでLambda関数をテストするために、LocalStackを使用してAWSサービスをエミュレートできます。

#### 前提条件

- Docker Desktop
- AWS CLI（LocalStack用のawslocalコマンド）

```bash
# awslocalコマンドのインストール
brew install awscli-local
```

#### セットアップ手順

1. **Google認証情報の配置（必須）**

LocalStack環境を使用するには、Google認証情報ファイルが必要です：

```bash
# Google認証情報のJSONファイルをプロジェクトルートに配置
cp path/to/your/service-account-key.json google-service-account-key.json
```

2. **ローカル環境の起動**

```bash
# docker-compose up、LocalStackとS3バケット、Secrets Managerを自動セットアップ
npm run dev:up
```

3. **サンプルメールのアップロード**

```bash
# サンプルメールをローカルS3にアップロード
npm run dev:upload
```

4. **Lambda関数のテスト実行**

```bash
# ローカルでLambda関数を実行
npm run dev:local
```

5. **ワンコマンドで全実行**

```bash
# セットアップ → アップロード → 実行を一括で行う
npm run dev:full
```

#### ローカル開発用コマンド

```bash
# LocalStack環境の起動
npm run dev:up

# LocalStack環境の停止
npm run dev:down

# サンプルメールのアップロード
npm run dev:upload

# Lambda関数のローカル実行
npm run dev:local

# 全工程を一括実行
npm run dev:full
```

#### ローカル環境の特徴

- **S3**: LocalStackでエミュレート（http://localhost:4566）
- **Secrets Manager**: LocalStackでエミュレート（http://localhost:4566、AWS側と同じBase64バイナリ形式）
- **Bedrock**: 実際のAWSサービスを使用（LocalStackでサポートされていないため）
- **Google Sheets**: 実際のAPIを使用

#### 前提条件

LocalStack環境を使用するには、以下が必要です：

- **Google認証情報ファイル**: `google-service-account-key.json`をプロジェクトルートに配置
- **Google Sheets API**: 使用する認証情報でGoogle Sheets APIが有効になっている必要があります

> **重要**: `google-service-account-key.json`ファイルは自動的に`.gitignore`に含まれているため、誤ってコミットされることはありません。

#### トラブルシューティング

```bash
# LocalStackのログを確認
docker logs receipt-bot-localstack

# LocalStackのサービス状態を確認
curl http://localhost:4566/health

# S3バケットの確認
awslocal s3 ls

# Secrets Managerのシークレット一覧確認
awslocal secretsmanager list-secrets

# Secrets Managerの内容確認（全体）
awslocal secretsmanager get-secret-value --secret-id local-google-credentials

# Secrets Managerの値をバイナリから文字列として取得
awslocal secretsmanager get-secret-value --secret-id local-google-credentials --query SecretBinary --output text | base64 -d

# JSON形式で整形して表示
awslocal secretsmanager get-secret-value --secret-id local-google-credentials --query SecretBinary --output text | base64 -d | jq .
```

## AWS Bedrockのモデルアクセス設定

1. AWS ConsoleでAmazon Bedrockサービスに移動
2. 左メニューから「Model access」を選択
3. 「Enable specific models」をクリック
4. 使用したいモデル（推奨：Claude 3.5 Sonnet）を選択
5. 「Request model access」で申請（通常は即座に承認される）

## 環境変数の設定

`.env`ファイルをプロジェクトルートに作成し、以下の環境変数を設定してください：

```text
# AWS
AWS_REGION=ap-northeast-1
S3_BUCKET_NAME=your-unique-bucket-name
BEDROCK_MODEL_ID=apac.anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_SECRET_GOOGLE_CREDENTIALS_ID=your-credential-id

# Google Sheets
SPREADSHEET_ID=your-google-spreadsheet-id
SHEET_NAME=your-sheet-name

# 許可する送信元
ALLOWED_SENDER_EMAILS=user1@example.com,user2@example.com

# ローカル開発用
LOCAL_S3_BUCKET=receipt-bot-local
LOCAL_EMAIL_FILE=sample-email.eml
LOCAL_GOOGLE_CREDENTIALS_SECRET_ID=local-google-credentials
```

### 環境変数の説明

- `ALLOWED_SENDER_EMAILS`: 処理を許可するメールアドレスをカンマ区切りで指定（セキュリティ機能）
  - 設定しない場合は、すべての送信者からのメールを処理します
  - 例: `user@example.com,admin@company.com`
- `LOCAL_GOOGLE_CREDENTIALS_SECRET_ID`: ローカル開発で使用するSecrets ManagerのシークレットID
  - デフォルト: `local-google-credentials`

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
- **テスト**: Jest
- **ローカル開発**: LocalStack, Docker

## 注意事項

- S3バケット名は全世界で一意である必要があります
- Google SheetsのスプレッドシートIDは、URLの`spreadsheets/d/`と`/edit`の間の文字列です
- BedrockのモデルアクセスはAWSリージョンごとに設定が必要です
- 一部のモデルはクロスリージョン推論のみ対応している場合があります
- **ローカル開発には`google-service-account-key.json`ファイルが必須です**
