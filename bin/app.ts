#!/usr/bin/env node
import 'dotenv/config';
import * as cdk from 'aws-cdk-lib';
import { ReceiptBotStack } from '../lib/receipt-bot-stack';

// 必要な環境変数の存在確認
const requiredEnvVars = [
  'S3_BUCKET_NAME',
  'SPREADSHEET_ID',
  'SHEET_NAME'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`環境変数 ${envVar} が設定されていません。`);
  }
}

const app = new cdk.App();
new ReceiptBotStack(app, 'ReceiptBotStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.AWS_REGION || 'ap-northeast-1'
  },
  s3BucketName: process.env.S3_BUCKET_NAME!,
  bedrockModelId: process.env.BEDROCK_MODEL_ID,
  spreadsheetId: process.env.SPREADSHEET_ID!,
  sheetName: process.env.SHEET_NAME!,
  awsSecretGoogleCredentialsId: process.env.AWS_SECRET_GOOGLE_CREDENTIALS_ID
}); 