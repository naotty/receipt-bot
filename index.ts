import { S3 } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Event } from 'aws-lambda';
import { simpleParser, ParsedMail } from 'mailparser';
import { google } from 'googleapis';

interface ExtractedItem {
  name: string;
  amount: number;
  accountCategory: string;
}

interface ExtractedData {
  items: ExtractedItem[];
  total?: number;
}

interface GoogleCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

interface ProcessingConfig {
  modelId: string;
  allowedSenders: string[];
  sheetName: string;
  spreadsheetId: string;
  secretId: string;
}

interface Dependencies {
  s3: S3;
  secretsManager: SecretsManagerClient;
  bedrockClient: BedrockRuntimeClient;
}

const s3 = new S3();
const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION });
const bedrockClient = new BedrockRuntimeClient({ 
  region: process.env.AWS_REGION
});

const defaultDependencies: Dependencies = {
  s3,
  secretsManager,
  bedrockClient
};

export const handler = async (event: S3Event): Promise<void> => {
  const config: ProcessingConfig = {
    modelId: process.env.BEDROCK_MODEL_ID!,
    allowedSenders: process.env.ALLOWED_SENDER_EMAILS!.split(',').map(email => email.trim().toLowerCase()),
    sheetName: process.env.SHEET_NAME!,
    spreadsheetId: process.env.SPREADSHEET_ID!,
    secretId: process.env.AWS_SECRET_GOOGLE_CREDENTIALS_ID!
  };

  await processEmailEvent(event, config, defaultDependencies);
};

export async function processEmailEvent(
  event: S3Event, 
  config: ProcessingConfig, 
  dependencies: Dependencies
): Promise<void> {
  try {
    const record = event.Records[0];
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    
    console.log(`処理開始: バケット=${bucket}, キー=${key}`);
    
    const email = await getEmailFromS3(bucket, key, dependencies.s3);
    
    const content = validateEmailContent(email);
    if (!content) {
      console.log('メール本文が空です。処理を終了します。');
      return;
    }

    if (!isAllowedSender(email, config.allowedSenders)) {
      const senderEmail = email.from?.value?.[0]?.address?.toLowerCase();
      console.log(`送信者 ${senderEmail} は許可されていないため、処理を終了します。`);
      return;
    }
    
    console.log('送信者チェック: 許可されたメールアドレスです。');

    const extractedData = await extractDataWithAI(content, config.modelId, dependencies.bedrockClient);
    
    if (!extractedData.items || extractedData.items.length === 0) {
      console.log('商品情報が見つかりませんでした。');
      return;
    }

    logExtractedData(extractedData);

    await recordToGoogleSheets(extractedData.items, email, config, dependencies.secretsManager);
    
  } catch (error) {
    console.error('処理中にエラーが発生しました:', error);
    throw error;
  }
}

export async function getEmailFromS3(bucket: string, key: string, s3Client: S3): Promise<ParsedMail> {
  const s3Object = await s3Client.getObject({ Bucket: bucket, Key: key });
  const email = await simpleParser(s3Object.Body as unknown as Buffer);
  
  console.log('メール件名:', email.subject);
  console.log('送信者:', email.from?.text);
  
  return email;
}

export function validateEmailContent(email: ParsedMail): string | null {
  const content = email.text || email.html || '';
  console.log('メール本文:', content);
  
  return content.trim() || null;
}

export function isAllowedSender(email: ParsedMail, allowedSenders: string[]): boolean {
  const senderEmail = email.from?.value?.[0]?.address?.toLowerCase();
  
  console.log('許可されたメールアドレス:', allowedSenders);
  console.log('送信者メールアドレス:', senderEmail);
  
  return senderEmail ? allowedSenders.includes(senderEmail) : false;
}

export async function extractDataWithAI(
  content: string, 
  modelId: string, 
  bedrockClient: BedrockRuntimeClient
): Promise<ExtractedData> {
  const prompt = `メール本文から商品名、金額、適切な勘定科目を抽出してください。商品名がない場合は、サービス名を商品名としてください。以下のJSON形式で返してください：

{
  "items": [
    {
      "name": "商品名",
      "amount": 1000,
      "accountCategory": "勘定科目"
    }
  ],
  "total": 1000
}

勘定科目の分類基準：
- "交通費": 電車、タクシー、交通系IC、ガソリン、駐車場など
- "通信費": 携帯電話、インターネット、電話代など
- "消耗品": 文房具、コピー用紙、USB、電池など
- "接待交際費": 飲食代、接待、贈答品など
- "広告宣伝費": 広告費、宣伝費、マーケティング費用など
- "福利厚生費": 健康診断、保険、社員研修など
- "水道光熱費": 電気、ガス、水道料金など
- "地代家賃": 事務所賃料、駐車場代など
- "修繕費": 設備修理、メンテナンス費用など
- "雑費": その他、分類できないもの

ルール：
- 商品名、金額、勘定科目の組み合わせを配列で返す
- 金額は数値として返す（カンマなし）
- 勘定科目は上記の分類から最も適切なものを選択
- 判断が難しい場合は「雑費」を使用
- 合計金額がある場合はtotalフィールドに設定
- 商品や金額が見つからない場合は空の配列を返す
- JSONのみを返し、他の説明文は含めない

メール本文:
${content}`;

  const command = new InvokeModelCommand({
    modelId: modelId,
    contentType: 'application/json',
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 500,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  console.log(`Bedrockモデル ${modelId} に送信中...`);
  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const extractedText = responseBody.content[0].text.trim();
  
  console.log('Bedrockからの生レスポンス:', extractedText);

  try {
    const extractedData = JSON.parse(extractedText) as ExtractedData;
    console.log('抽出された商品情報:', JSON.stringify(extractedData, null, 2));
    return extractedData;
  } catch (parseError) {
    console.error('JSONパースエラー:', parseError);
    console.error('パース対象テキスト:', extractedText);
    return { items: [] };
  }
}

export function logExtractedData(extractedData: ExtractedData): void {
  if (extractedData.items && extractedData.items.length > 0) {
    console.log(`${extractedData.items.length}件の商品が見つかりました:`);
    extractedData.items.forEach((item: ExtractedItem, index: number) => {
      console.log(`  ${index + 1}. ${item.name}: ¥${item.amount} (${item.accountCategory})`);
    });
    
    if (extractedData.total) {
      console.log(`合計金額: ¥${extractedData.total}`);
    }
  }
}

export async function recordToGoogleSheets(
  items: ExtractedItem[], 
  email: ParsedMail, 
  config: ProcessingConfig,
  secretsManager: SecretsManagerClient
): Promise<void> {
  try {
    console.log('Google Sheetsに記録を開始...');
    console.log('メール件名:', email.subject);
    console.log('送信者:', email.from?.text);
    
    const credentials = await getGoogleCredentials(config.secretId, secretsManager);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    console.log('シートの現在のデータを取得中...');
    const existingDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `${config.sheetName}!A:E`,
    });

    const existingRows = existingDataResponse.data.values || [];
    const nextRowIndex = existingRows.length + 1;
    
    console.log(`現在のデータ行数: ${existingRows.length}, 次の書き込み行: ${nextRowIndex}`);

    const rows = prepareSheetRows(items);

    console.log(`${rows.length}行を${config.sheetName}シートの行${nextRowIndex}から追加します:`, rows);

    const endRowIndex = nextRowIndex + rows.length - 1;
    const range = `${config.sheetName}!A${nextRowIndex}:E${endRowIndex}`;
    
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range: range,
      valueInputOption: 'RAW',
      requestBody: {
        values: rows,
      },
    });

    console.log('Google Sheetsへの記録が完了しました:', response.data);
    console.log(`更新された範囲: ${range}`);
    console.log(`追加された行数: ${rows.length}`);
    
  } catch (error) {
    console.error('Google Sheetsへの記録中にエラーが発生しました:', error);
    throw error;
  }
}

export function prepareSheetRows(items: ExtractedItem[]): (string | number)[][] {
  const rows: (string | number)[][] = [];
  const currentDate = new Date().toLocaleDateString('ja-JP');

  items.forEach((item: ExtractedItem) => {
    rows.push([
      currentDate, // A列：日付
      item.name || 'サービス', // B列：商品名
      item.amount || 0, // C列：金額
      'クレカ', // D列：支払い方法
      item.accountCategory || '雑費', // E列：勘定科目
    ]);
  });

  return rows;
}

export async function getGoogleCredentials(
  secretId: string, 
  secretsManager: SecretsManagerClient
): Promise<GoogleCredentials> {
  try {
    console.log('Secrets ManagerからGoogle認証情報を取得中...');
    console.log('使用するシークレットID:', secretId);
    
    const command = new GetSecretValueCommand({
      SecretId: secretId
    });
    
    const response = await secretsManager.send(command);
    
    if (!response.SecretBinary) {
      throw new Error('Secrets Managerから認証情報を取得できませんでした');
    }

    let credentials: GoogleCredentials;
    
    console.log('バイナリ形式の認証情報を処理中...');
    const binaryData = response.SecretBinary;
    const decodedString = new TextDecoder().decode(binaryData);
    
    try {
      credentials = JSON.parse(decodedString) as GoogleCredentials;
    } catch (firstParseError) {
      console.log('Base64デコードを試行中...');
      const base64DecodedBuffer = Buffer.from(decodedString, 'base64');
      const base64DecodedString = base64DecodedBuffer.toString('utf8');
      console.log('Base64デコード後の文字列の先頭:', base64DecodedString.substring(0, 100));
      credentials = JSON.parse(base64DecodedString) as GoogleCredentials;
    }

    console.log('Google認証情報の取得が完了しました');
    return credentials;
  } catch (error) {
    console.error('Secrets Managerからの認証情報取得中にエラーが発生しました:', error);
    throw error;
  }
}
