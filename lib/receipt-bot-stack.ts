import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { Construct } from 'constructs';
import * as path from 'path';

interface ReceiptBotStackProps extends cdk.StackProps {
  s3BucketName: string;
  bedrockModelId?: string;
  spreadsheetId: string;
  sheetName?: string; 
  awsSecretGoogleCredentialsId?: string;
  allowedSenderEmails?: string;
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
      memorySize: 512, // Bedrockのレスポンス処理のためメモリを増量
      timeout: cdk.Duration.seconds(60), // Bedrockのレスポンス時間を考慮してタイムアウトを延長
      environment: {
        BEDROCK_MODEL_ID: props.bedrockModelId || 'apac.anthropic.claude-3-5-sonnet-20241022-v2:0',
        SPREADSHEET_ID: props.spreadsheetId,
        SHEET_NAME: props.sheetName || 'debug',
        AWS_SECRET_GOOGLE_CREDENTIALS_ID: props.awsSecretGoogleCredentialsId || 'credential',
        ALLOWED_SENDER_EMAILS: props.allowedSenderEmails || '',
      },
    });

    // S3バケットへのアクセス権限を付与
    bucket.grantRead(receiptFunction);

    // Bedrockへのアクセス権限を付与
    receiptFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream'
      ],
      resources: [
        // 現在のリージョンのリソース
        `arn:aws:bedrock:${this.region}::foundation-model/*`,
        `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/*`,
        
        // APAC inference profileのデスティネーションリージョン
        `arn:aws:bedrock:ap-northeast-1::foundation-model/*`,
        `arn:aws:bedrock:ap-northeast-2::foundation-model/*`,
        `arn:aws:bedrock:ap-northeast-3::foundation-model/*`,
        `arn:aws:bedrock:ap-south-1::foundation-model/*`,
        `arn:aws:bedrock:ap-southeast-1::foundation-model/*`,
        `arn:aws:bedrock:ap-southeast-2::foundation-model/*`,
        
        // USリージョン（クロスリージョンinference profile用）
        `arn:aws:bedrock:us-east-1::foundation-model/*`,
        `arn:aws:bedrock:us-east-1:${this.account}:inference-profile/*`,
        `arn:aws:bedrock:us-west-2::foundation-model/*`,
        `arn:aws:bedrock:us-west-2:${this.account}:inference-profile/*`
      ]
    }));

    // Secrets Managerへのアクセス権限を付与
    const googleCredentialsSecretId = props.awsSecretGoogleCredentialsId || 'credential';
    receiptFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue'
      ],
      resources: [
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${googleCredentialsSecretId}*`
      ]
    }));

    // S3イベント通知の設定
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(receiptFunction),
      { prefix: 'Mailbox/' } // Mailboxフォルダ配下のファイルのみを対象にする
    );
  }
} 