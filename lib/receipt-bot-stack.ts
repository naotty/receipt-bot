import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { Construct } from 'constructs';
import * as path from 'path';

interface ReceiptBotStackProps extends cdk.StackProps {
  s3BucketName: string;
  openaiApiKey: string;
  googleServiceAccountJson: string;
  spreadsheetId: string;
}

export class ReceiptBotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ReceiptBotStackProps) {
    super(scope, id, props);

    // 既存のS3バケットを参照
    const bucket = s3.Bucket.fromBucketName(
      this,
      'ExistingReceiptEmailBucket',
      props.s3BucketName
    );

    // Lambda関数の作成
    const receiptFunction = new nodejs.NodejsFunction(this, 'ReceiptFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../index.ts'),
      handler: 'handler',
      bundling: {
        minify: true,
        sourceMap: false,
      },
      memorySize: 256,
      timeout: cdk.Duration.seconds(20),
      environment: {
        OPENAI_API_KEY: props.openaiApiKey,
        GOOGLE_SERVICE_ACCOUNT_JSON: props.googleServiceAccountJson,
        SPREADSHEET_ID: props.spreadsheetId,
      },
    });

    // S3バケットへのアクセス権限を付与
    bucket.grantRead(receiptFunction);

    // S3イベント通知の設定
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(receiptFunction),
      { prefix: 'Mailbox/' } // Mailboxフォルダ配下のファイルのみを対象にする
    );
  }
} 