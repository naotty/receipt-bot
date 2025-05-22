import { S3 } from '@aws-sdk/client-s3';
import { S3Event } from 'aws-lambda';

import { simpleParser } from 'mailparser';

// import { OpenAI } from 'openai';
// import { google } from 'googleapis';



const s3 = new S3();
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export const handler = async (event: S3Event): Promise<void> => {
  // S3イベントからファイル情報を取得
  const record = event.Records[0];
  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
  
  // S3からメールファイル取得
  const s3Object = await s3.getObject({ Bucket: bucket, Key: key });
  const email = await simpleParser(s3Object.Body as unknown as Buffer);

  const content = email.text || email.html || '';
  console.log('メール本文:', content);

  // Note: Lambdaのデプロイまでは一旦コメントアウトする
  // // OpenAIに投げて金額抽出
  // const aiResponse = await openai.chat.completions.create({
  //   model: 'gpt-4',
  //   messages: [
  //     { role: 'system', content: 'メール本文から合計金額を抜き出してください。数字だけを返してください。' },
  //     { role: 'user', content }
  //   ]
  // });

  // const amount = aiResponse.choices[0]?.message?.content?.trim();
  // console.log('抽出された金額:', amount);

  // // Google Sheets に書き込み
  // const auth = new google.auth.GoogleAuth({
  //   credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!),
  //   scopes: ['https://www.googleapis.com/auth/spreadsheets']
  // });

  // const sheets = google.sheets({ version: 'v4', auth });
  // const spreadsheetId = process.env.SPREADSHEET_ID!;
  
  // await sheets.spreadsheets.values.append({
  //   spreadsheetId,
  //   range: 'A1',
  //   valueInputOption: 'USER_ENTERED',
  //   requestBody: {
  //     values: [[new Date().toISOString(), amount]]
  //   }
  // });
};

