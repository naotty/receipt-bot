# GitHub Actions設定

このプロジェクトでは、GitHub ActionsでCI/CDを実行します。

## 必要なSecrets設定

以下のSecretsをGitHubリポジトリの設定で追加してください：

### AWS認証関連
- `AWS_ROLE_ARN_PRODUCTION`: 本番環境用のAWS IAMロールARN
  - `production` のEnvironmentsで設定する必要があります。

### アプリケーション設定
- `AWS_REGION`: デプロイ先のAWSリージョン（例: `ap-northeast-1`）
- `S3_BUCKET_NAME`: レシートファイル保存用S3バケット名
- `BEDROCK_MODEL_ID`: Amazon Bedrock モデル ID（例: `anthropic.claude-3-sonnet-20240229-v1:0`）
- `AWS_SECRET_GOOGLE_CREDENTIALS_ID`: Google認証情報を保存するAWS Secrets Manager の秘密名
- `SPREADSHEET_ID`: データを書き込むGoogle スプレッドシート ID
- `SHEET_NAME`: 書き込み先のシート名（例: `receipts`）
- `ALLOWED_SENDER_EMAILS`: 処理を許可する送信者メールアドレス（カンマ区切り）

### テストカバレッジ（オプション）
- `CODECOV_TOKEN`: CodecovでカバレッジレポートをアップロードするためのToken

## ワークフロー概要

### CI/CDワークフロー (`ci-cd.yml`)
- **全ブランチ・プルリクエスト**: テストを実行
  - TypeScriptの型チェック
  - Jest単体テスト実行
  - カバレッジレポート生成
- **mainブランチのみ**: テスト → ビルド → デプロイの順番で実行
  - 本番環境にデプロイ

## CDKデプロイコンテキスト

デプロイ時に環境固有の設定を使用する場合、CDKスタック内で以下のようにコンテキストを参照できます：

```typescript
const env = this.node.tryGetContext('env') || 'dev';
``` 