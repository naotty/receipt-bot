# GitHub Actions設定

このプロジェクトでは、GitHub ActionsでCI/CDを実行します。

## 必要なSecrets設定

以下のSecretsをGitHubリポジトリの設定で追加してください：

### AWS認証関連
- `AWS_ROLE_ARN_PRODUCTION`: 本番環境用のAWS IAMロールARN
- `AWS_REGION`: デプロイ先のAWSリージョン（例: `ap-northeast-1`）

### テストカバレッジ（オプション）
- `CODECOV_TOKEN`: CodecovでカバレッジレポートをアップロードするためのToken

## Environments設定

以下のEnvironmentsを設定してください：

- `production`: mainブランチからの自動デプロイ用（承認が必要な設定を推奨）

## ワークフロー概要

### CI/CDワークフロー (`ci-cd.yml`)
- **全ブランチ・プルリクエスト**: テストを実行
  - TypeScriptの型チェック
  - Jest単体テスト実行
  - カバレッジレポート生成
- **mainブランチのみ**: テスト → ビルド → デプロイの順番で実行
  - 本番環境にデプロイ
- **developブランチ**: テストのみ実行（デプロイは行わない）

## CDKデプロイコンテキスト

デプロイ時に環境固有の設定を使用する場合、CDKスタック内で以下のようにコンテキストを参照できます：

```typescript
const env = this.node.tryGetContext('env') || 'dev';
``` 