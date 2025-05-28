#!/bin/bash

echo "🚀 LocalStack初期化を開始します..."

# S3バケットを作成（AWS CLIを直接使用）
echo "📦 S3バケットを作成中..."
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test aws --endpoint-url=http://localhost:4566 s3 mb s3://receipt-bot-local
echo "✅ S3バケット 'receipt-bot-local' を作成しました"

# Mailboxフォルダを作成（空のオブジェクトをアップロード）
echo "📁 Mailboxフォルダを作成中..."
echo "" | AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test aws --endpoint-url=http://localhost:4566 s3 cp - s3://receipt-bot-local/Mailbox/.keep
echo "✅ Mailboxフォルダを作成しました"

echo "🎉 LocalStack初期化が完了しました！"
echo ""
echo "📋 作成されたリソース:"
echo "  - S3バケット: receipt-bot-local"
echo "  - S3フォルダ: Mailbox/"
echo ""
echo "💡 次のステップ:"
echo "  1. npm run dev:upload でサンプルメールをアップロード"
echo "  2. npm run dev:local でローカル開発を開始" 