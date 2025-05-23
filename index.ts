import { S3 } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Event } from 'aws-lambda';
import { simpleParser } from 'mailparser';
import { google } from 'googleapis';

const s3 = new S3();
const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION });
const bedrockClient = new BedrockRuntimeClient({ 
  region: process.env.AWS_REGION // Lambdaランタイムが自動設定
});

export const handler = async (event: S3Event): Promise<void> => {
  try {
    // S3イベントからファイル情報を取得
    const record = event.Records[0];
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    
    console.log(`処理開始: バケット=${bucket}, キー=${key}`);
    
    // S3からメールファイル取得
    const s3Object = await s3.getObject({ Bucket: bucket, Key: key });
    const email = await simpleParser(s3Object.Body as unknown as Buffer);

    const content = email.text || email.html || '';
    console.log('メール本文:', content);

    if (!content.trim()) {
      console.log('メール本文が空です。処理を終了します。');
      return;
    }

    // AWS Bedrockで金額抽出
    const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
    const prompt = `メール本文から商品名と金額の情報を抽出してください。商品名がない場合は、サービス名を商品名としてください。以下のJSON形式で返してください：

{
  "items": [
    {
      "name": "商品名",
      "amount": 1000
    }
  ],
  "total": 1000
}

ルール：
- 商品名と金額のペアを配列で返す
- 金額は数値として返す（カンマなし）
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
      // JSONレスポンスをパース
      const extractedData = JSON.parse(extractedText);
      console.log('抽出された商品情報:', JSON.stringify(extractedData, null, 2));

      if (extractedData.items && extractedData.items.length > 0) {
        console.log(`${extractedData.items.length}件の商品が見つかりました:`);
        extractedData.items.forEach((item: any, index: number) => {
          console.log(`  ${index + 1}. ${item.name}: ¥${item.amount}`);
        });
        
        if (extractedData.total) {
          console.log(`合計金額: ¥${extractedData.total}`);
        }
      } else {
        console.log('商品情報が見つかりませんでした。');
      }

      // Google Sheetsに記録
      if (extractedData.items && extractedData.items.length > 0) {
        await recordToGoogleSheets(extractedData.items, email);
      }
      
    } catch (parseError) {
      console.error('JSONパースエラー:', parseError);
      console.error('パース対象テキスト:', extractedText);
    }

  } catch (error) {
    console.error('処理中にエラーが発生しました:', error);
    throw error;
  }
};

// Google Sheetsに商品情報を記録する関数
async function recordToGoogleSheets(items: any[], email: any): Promise<void> {
  try {
    console.log('Google Sheetsに記録を開始...');
    console.log('メール件名:', email.subject);
    console.log('送信者:', email.from?.text);

    const sheetName = process.env.SHEET_NAME || 'debug';
    
    // Google Sheetsの認証設定
    const credentials = await getGoogleCredentials();
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SPREADSHEET_ID!;

    // 現在のシートの最後の行を取得
    console.log('シートの現在のデータを取得中...');
    const existingDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:D`,
    });

    const existingRows = existingDataResponse.data.values || [];
    const nextRowIndex = existingRows.length + 1; // 次に書き込む行番号（1-indexed）
    
    console.log(`現在のデータ行数: ${existingRows.length}, 次の書き込み行: ${nextRowIndex}`);

    // 各商品について行を準備
    const rows: any[][] = [];
    const currentDate = new Date().toLocaleDateString('ja-JP'); // 日本の日付形式

    items.forEach((item: any) => {
      rows.push([
        currentDate, // A列：日付
        item.name || 'サービス', // B列：商品名
        item.amount || 0, // C列：金額
        'クレカ', // D列：支払い方法
      ]);
    });

    console.log(`${rows.length}行を${sheetName}シートの行${nextRowIndex}から追加します:`, rows);

    // 固定範囲に書き込み（appendではなくupdateを使用）
    const endRowIndex = nextRowIndex + rows.length - 1;
    const range = `${sheetName}!A${nextRowIndex}:D${endRowIndex}`;
    
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
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

// Google認証情報をSecrets Managerから取得する関数
async function getGoogleCredentials(): Promise<any> {
  try {
    console.log('Secrets ManagerからGoogle認証情報を取得中...');
    
    const secretId = process.env.AWS_SECRET_GOOGLE_CREDENTIALS_ID || 'credential';
    console.log('使用するシークレットID:', secretId);
    
    const command = new GetSecretValueCommand({
      SecretId: secretId
    });
    
    const response = await secretsManager.send(command);
    
    if (!response.SecretBinary) {
      throw new Error('Secrets Managerから認証情報を取得できませんでした');
    }

    let credentials: any;
    
    // バイナリデータの場合（Base64エンコードされている）
    console.log('バイナリ形式の認証情報を処理中...');
    const binaryData = response.SecretBinary;
    const decodedString = new TextDecoder().decode(binaryData);
    
    try {
      // まずそのままJSONパースを試行
      credentials = JSON.parse(decodedString);
    } catch (firstParseError) {
      // JSONパースに失敗した場合、Base64デコードを試行
      console.log('Base64デコードを試行中...');
      const base64DecodedBuffer = Buffer.from(decodedString, 'base64');
      const base64DecodedString = base64DecodedBuffer.toString('utf8');
      console.log('Base64デコード後の文字列の先頭:', base64DecodedString.substring(0, 100));
      credentials = JSON.parse(base64DecodedString);
    }

    console.log('Google認証情報の取得が完了しました');
    return credentials;
  } catch (error) {
    console.error('Secrets Managerからの認証情報取得中にエラーが発生しました:', error);
    throw error;
  }
}

