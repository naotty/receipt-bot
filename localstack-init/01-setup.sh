#!/bin/bash

echo "🚀 LocalStack初期化を開始します..."

# LocalStack用のAWS認証情報とリージョンを設定
export AWS_ACCESS_KEY_ID="test"
export AWS_SECRET_ACCESS_KEY="test"
export AWS_DEFAULT_REGION="ap-northeast-1"

# Google認証情報ファイルの存在チェック（必須）
GOOGLE_CREDENTIALS_FILE="/etc/localstack/google-service-account-key.json"

echo "🔍 Google認証情報ファイルをチェック中..."
if [ ! -f "$GOOGLE_CREDENTIALS_FILE" ]; then
    echo ""
    echo "❌ エラー: Google認証情報ファイルが見つかりません"
    echo "📄 必要なファイル: google-service-account-key.json"
    echo "📍 配置場所: プロジェクトルート"
    echo ""
    echo "💡 解決方法:"
    echo "  1. Google Cloud Consoleでサービスアカウントを作成"
    echo "  2. サービスアカウントのJSONキーをダウンロード"
    echo "  3. 以下のコマンドでファイルを配置:"
    echo "     cp path/to/your/service-account-key.json google-service-account-key.json"
    echo ""
    echo "🔗 詳細な手順: README.mdの「Google認証情報の設定」セクションを参照"
    echo ""
    exit 1
fi

echo "✅ Google認証情報ファイルが見つかりました: $GOOGLE_CREDENTIALS_FILE"

# S3バケットを作成（AWS CLIを直接使用）
echo "📦 S3バケットを作成中..."
aws --endpoint-url=http://localhost:4566 s3 mb s3://receipt-bot-local
echo "✅ S3バケット 'receipt-bot-local' を作成しました"

# Mailboxフォルダを作成（空のオブジェクトをアップロード）
echo "📁 Mailboxフォルダを作成中..."
echo "" | aws --endpoint-url=http://localhost:4566 s3 cp - s3://receipt-bot-local/Mailbox/.keep
echo "✅ Mailboxフォルダを作成しました"

# Secrets ManagerにGoogle認証情報を作成
echo "🔐 Secrets ManagerにGoogle認証情報を作成中..."
echo "📄 JSONファイルをBase64エンコード中..."

# 環境変数からシークレットIDを取得（デフォルト値を設定）
SECRET_ID=${LOCAL_GOOGLE_CREDENTIALS_SECRET_ID:-"local-google-credentials"}
echo "🏷️  使用するシークレットID: $SECRET_ID"

# JSONファイルをBase64エンコード
BASE64_ENCODED=$(base64 -i "$GOOGLE_CREDENTIALS_FILE")

# 一時ファイルに保存
TEMP_BASE64_FILE="/tmp/google-credentials-base64.txt"
echo "$BASE64_ENCODED" > "$TEMP_BASE64_FILE"

# Secrets Managerにバイナリとして保存（AWS側と同じ形式）
aws --endpoint-url=http://localhost:4566 secretsmanager create-secret \
  --name "$SECRET_ID" \
  --description "LocalStack用Google認証情報（Base64エンコード済み）" \
  --secret-binary "fileb://$TEMP_BASE64_FILE"

# 一時ファイルを削除
rm "$TEMP_BASE64_FILE"

echo "✅ Secrets Manager '$SECRET_ID' をバイナリ形式で作成しました"

echo "🎉 LocalStack初期化が完了しました！"
echo ""
echo "📋 作成されたリソース:"
echo "  - S3バケット: receipt-bot-local"
echo "  - S3フォルダ: Mailbox/"
echo "  - Secrets Manager: $SECRET_ID (Google認証情報)"
echo ""
echo "💡 次のステップ:"
echo "  1. npm run dev:upload でサンプルメールをアップロード"
echo "  2. npm run dev:local でローカル開発を開始" 