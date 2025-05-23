import { S3 } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Event } from 'aws-lambda';
import { simpleParser } from 'mailparser';

const s3 = new S3();
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

      // TODO: Google Sheetsに記録する処理をここに追加
      
    } catch (parseError) {
      console.error('JSONパースエラー:', parseError);
      console.error('パース対象テキスト:', extractedText);
    }

  } catch (error) {
    console.error('処理中にエラーが発生しました:', error);
    throw error;
  }
};

