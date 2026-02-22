import { 
  validateEmailContent, 
  isAllowedSender, 
  logExtractedData, 
  prepareSheetRows,
  extractDataWithAI,
  getGoogleCredentials,
  extractImageAttachments,
  deduplicateItems,
  parseAndValidateExtractedData
} from '../index';
import { ParsedMail } from 'mailparser';

// モック
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-secrets-manager');
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('mailparser');

describe('Receipt Bot Functions', () => {
  
  describe('validateEmailContent', () => {
    it('should return content when email has text', () => {
      const email: Partial<ParsedMail> = {
        text: 'Test email content',
        html: '<p>HTML content</p>'
      };
      
      const result = validateEmailContent(email as ParsedMail);
      expect(result).toBe('Test email content');
    });

    it('should return html when email has no text but has html', () => {
      const email: Partial<ParsedMail> = {
        text: '',
        html: '<p>HTML content</p>'
      };
      
      const result = validateEmailContent(email as ParsedMail);
      expect(result).toBe('<p>HTML content</p>');
    });

    it('should return null when email has no content', () => {
      const email: Partial<ParsedMail> = {
        text: '',
        html: ''
      };
      
      const result = validateEmailContent(email as ParsedMail);
      expect(result).toBeNull();
    });

    it('should return null when email has only whitespace', () => {
      const email: Partial<ParsedMail> = {
        text: '   \n\t  ',
        html: ''
      };
      
      const result = validateEmailContent(email as ParsedMail);
      expect(result).toBeNull();
    });
  });

  describe('isAllowedSender', () => {
    it('should return false when allowedSenders is empty', () => {
      const email: Partial<ParsedMail> = {
        from: {
          value: [{ address: 'test@example.com', name: 'Test User' }],
          text: 'test@example.com',
          html: 'test@example.com'
        }
      };
      
      const result = isAllowedSender(email as ParsedMail, []);
      expect(result).toBe(false);
    });

    it('should return true when sender is in allowed list', () => {
      const email: Partial<ParsedMail> = {
        from: {
          value: [{ address: 'test@example.com', name: 'Test User' }],
          text: 'test@example.com',
          html: 'test@example.com'
        }
      };
      
      const allowedSenders = ['test@example.com', 'admin@example.com'];
      const result = isAllowedSender(email as ParsedMail, allowedSenders);
      expect(result).toBe(true);
    });

    it('should return false when sender is not in allowed list', () => {
      const email: Partial<ParsedMail> = {
        from: {
          value: [{ address: 'unauthorized@example.com', name: 'Unauthorized User' }],
          text: 'unauthorized@example.com',
          html: 'unauthorized@example.com'
        }
      };
      
      const allowedSenders = ['test@example.com', 'admin@example.com'];
      const result = isAllowedSender(email as ParsedMail, allowedSenders);
      expect(result).toBe(false);
    });

    it('should handle case insensitive comparison', () => {
      const email: Partial<ParsedMail> = {
        from: {
          value: [{ address: 'TEST@EXAMPLE.COM', name: 'Test User' }],
          text: 'TEST@EXAMPLE.COM',
          html: 'TEST@EXAMPLE.COM'
        }
      };
      
      const allowedSenders = ['test@example.com'];
      const result = isAllowedSender(email as ParsedMail, allowedSenders);
      expect(result).toBe(true);
    });

    it('should return false when email has no sender', () => {
      const email: Partial<ParsedMail> = {
        from: undefined
      };
      
      const allowedSenders = ['test@example.com'];
      const result = isAllowedSender(email as ParsedMail, allowedSenders);
      expect(result).toBe(false);
    });
  });

  describe('prepareSheetRows', () => {
    it('should prepare rows correctly for multiple items with account categories', () => {
      const items = [
        { name: 'Product A', amount: 1000, accountCategory: '消耗品' },
        { name: 'Product B', amount: 2000, accountCategory: '交通費' }
      ];
      
      const result = prepareSheetRows(items);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual([
        expect.any(String), // 日付
        'Product A',
        1000,
        'クレカ',
        '消耗品'
      ]);
      expect(result[1]).toEqual([
        expect.any(String), // 日付
        'Product B', 
        2000,
        'クレカ',
        '交通費'
      ]);
    });

    it('should prepare rows correctly with payment methods', () => {
      const items = [
        { name: 'コーヒー', amount: 500, accountCategory: '接待交際費', paymentMethod: '現金' },
        { name: '電車代', amount: 300, accountCategory: '交通費', paymentMethod: '電子マネー' },
        { name: 'ランチ', amount: 1200, accountCategory: '接待交際費', paymentMethod: 'QR決済' }
      ];
      
      const result = prepareSheetRows(items);
      
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual([
        expect.any(String), // 日付
        'コーヒー',
        500,
        '現金',
        '接待交際費'
      ]);
      expect(result[1]).toEqual([
        expect.any(String), // 日付
        '電車代',
        300,
        '電子マネー',
        '交通費'
      ]);
      expect(result[2]).toEqual([
        expect.any(String), // 日付
        'ランチ',
        1200,
        'QR決済',
        '接待交際費'
      ]);
    });

    it('should use default payment method when not provided', () => {
      const items = [
        { name: 'Product A', amount: 1000, accountCategory: '消耗品' },
        { name: 'Product B', amount: 2000, accountCategory: '交通費', paymentMethod: undefined }
      ];
      
      const result = prepareSheetRows(items);
      
      expect(result[0][3]).toBe('クレカ');
      expect(result[1][3]).toBe('クレカ');
    });

    it('should handle empty item name and default account category', () => {
      const items = [
        { name: '', amount: 1000, accountCategory: '' }
      ];
      
      const result = prepareSheetRows(items);
      
      expect(result[0]).toEqual([
        expect.any(String), // 日付
        'サービス',
        1000,
        'クレカ',
        '雑費'
      ]);
    });

    it('should handle zero amount with account category', () => {
      const items = [
        { name: 'Free Item', amount: 0, accountCategory: '福利厚生費' }
      ];
      
      const result = prepareSheetRows(items);
      
      expect(result[0]).toEqual([
        expect.any(String), // 日付
        'Free Item',
        0,
        'クレカ',
        '福利厚生費'
      ]);
    });

    it('should use default account category when not provided', () => {
      const items = [
        { name: 'Test Item', amount: 1000, accountCategory: undefined as any }
      ];
      
      const result = prepareSheetRows(items);
      
      expect(result[0]).toEqual([
        expect.any(String), // 日付
        'Test Item',
        1000,
        'クレカ',
        '雑費'
      ]);
    });

    it('should return empty array for empty items', () => {
      const result = prepareSheetRows([]);
      expect(result).toEqual([]);
    });
  });

  describe('logExtractedData', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should log extracted items correctly with account categories', () => {
      const extractedData = {
        items: [
          { name: 'Product A', amount: 1000, accountCategory: '消耗品' },
          { name: 'Product B', amount: 2000, accountCategory: '交通費' }
        ],
        total: 3000
      };
      
      logExtractedData(extractedData);
      
      expect(consoleSpy).toHaveBeenCalledWith('2件の商品が見つかりました:');
      expect(consoleSpy).toHaveBeenCalledWith('  1. Product A: ¥1000 (消耗品) [クレカ]');
      expect(consoleSpy).toHaveBeenCalledWith('  2. Product B: ¥2000 (交通費) [クレカ]');
      expect(consoleSpy).toHaveBeenCalledWith('合計金額: ¥3000');
    });

    it('should log extracted items with payment methods', () => {
      const extractedData = {
        items: [
          { name: 'コーヒー', amount: 500, accountCategory: '接待交際費', paymentMethod: '現金' },
          { name: '電車代', amount: 300, accountCategory: '交通費', paymentMethod: '電子マネー' }
        ],
        total: 800
      };
      
      logExtractedData(extractedData);
      
      expect(consoleSpy).toHaveBeenCalledWith('2件の商品が見つかりました:');
      expect(consoleSpy).toHaveBeenCalledWith('  1. コーヒー: ¥500 (接待交際費) [現金]');
      expect(consoleSpy).toHaveBeenCalledWith('  2. 電車代: ¥300 (交通費) [電子マネー]');
      expect(consoleSpy).toHaveBeenCalledWith('合計金額: ¥800');
    });

    it('should not log total when not provided', () => {
      const extractedData = {
        items: [
          { name: 'Product A', amount: 1000, accountCategory: '雑費' }
        ]
      };
      
      logExtractedData(extractedData);
      
      expect(consoleSpy).toHaveBeenCalledWith('1件の商品が見つかりました:');
      expect(consoleSpy).toHaveBeenCalledWith('  1. Product A: ¥1000 (雑費) [クレカ]');
      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('合計金額'));
    });

    it('should not log anything when no items', () => {
      const extractedData = {
        items: []
      };
      
      logExtractedData(extractedData);
      
      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('件の商品が見つかりました'));
    });
  });

  describe('extractDataWithAI', () => {
    it('should extract data successfully with account category', async () => {
      const mockBedrockClient = {
        send: jest.fn().mockResolvedValue({
          body: new TextEncoder().encode(JSON.stringify({
            content: [{
              text: JSON.stringify({
                items: [{ name: 'Test Product', amount: 1000, accountCategory: '消耗品' }],
                total: 1000
              })
            }]
          }))
        })
      } as any;

      const result = await extractDataWithAI('test content', 'test-model', mockBedrockClient);

      expect(result).toEqual({
        items: [{ name: 'Test Product', amount: 1000, paymentMethod: 'クレカ', accountCategory: '消耗品' }],
        total: 1000
      });
    });

    it('should send up to two images to Bedrock', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: JSON.stringify({ items: [] }) }]
        }))
      });
      const mockBedrockClient = { send: mockSend } as any;

      const result = await extractDataWithAI('test content', 'test-model', mockBedrockClient, [
        { mediaType: 'image/jpeg', data: 'base64-a' },
        { mediaType: 'image/png', data: 'base64-b' }
      ]);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ items: [] });
    });

    it('should extract data with payment methods', async () => {
      const mockBedrockClient = {
        send: jest.fn().mockResolvedValue({
          body: new TextEncoder().encode(JSON.stringify({
            content: [{
              text: JSON.stringify({
                items: [
                  { name: 'コーヒー', amount: 500, paymentMethod: '現金', accountCategory: '接待交際費' },
                  { name: '電車代', amount: 300, paymentMethod: '電子マネー', accountCategory: '交通費' }
                ],
                total: 800
              })
            }]
          }))
        })
      } as any;

      const result = await extractDataWithAI('現金でコーヒーを買い、Suicaで電車に乗った', 'test-model', mockBedrockClient);

      expect(result).toEqual({
        items: [
          { name: 'コーヒー', amount: 500, paymentMethod: '現金', accountCategory: '接待交際費' },
          { name: '電車代', amount: 300, paymentMethod: '電子マネー', accountCategory: '交通費' }
        ],
        total: 800
      });
    });

    it('should return empty items on parse error', async () => {
      const mockBedrockClient = {
        send: jest.fn().mockResolvedValue({
          body: new TextEncoder().encode(JSON.stringify({
            content: [{
              text: 'invalid json'
            }]
          }))
        })
      } as any;

      const result = await extractDataWithAI('test content', 'test-model', mockBedrockClient);

      expect(result).toEqual({ items: [] });
    });

    it('should extract multiple items with different account categories', async () => {
      const mockBedrockClient = {
        send: jest.fn().mockResolvedValue({
          body: new TextEncoder().encode(JSON.stringify({
            content: [{
              text: JSON.stringify({
                items: [
                  { name: '電車代', amount: 500, accountCategory: '交通費' },
                  { name: 'ボールペン', amount: 200, accountCategory: '消耗品' },
                  { name: '携帯料金', amount: 3000, accountCategory: '通信費' }
                ],
                total: 3700
              })
            }]
          }))
        })
      } as any;

      const result = await extractDataWithAI('交通費と事務用品の購入', 'test-model', mockBedrockClient);

      expect(result).toEqual({
        items: [
          { name: '電車代', amount: 500, paymentMethod: 'クレカ', accountCategory: '交通費' },
          { name: 'ボールペン', amount: 200, paymentMethod: 'クレカ', accountCategory: '消耗品' },
          { name: '携帯料金', amount: 3000, paymentMethod: 'クレカ', accountCategory: '通信費' }
        ],
        total: 3700
      });
    });

    it('should handle items with default account category when AI returns empty category', async () => {
      const mockBedrockClient = {
        send: jest.fn().mockResolvedValue({
          body: new TextEncoder().encode(JSON.stringify({
            content: [{
              text: JSON.stringify({
                items: [
                  { name: '不明な費用', amount: 1000, accountCategory: '' }
                ],
                total: 1000
              })
            }]
          }))
        })
      } as any;

      const result = await extractDataWithAI('不明な費用', 'test-model', mockBedrockClient);

      expect(result.items[0].accountCategory).toBe('雑費');
      // prepareSheetRowsでデフォルト値「雑費」が設定されることをテスト
      const sheetRows = prepareSheetRows(result.items);
      expect(sheetRows[0][4]).toBe('雑費');
    });
  });

  describe('extractImageAttachments', () => {
    it('should extract only supported images and limit to 2', () => {
      const email: Partial<ParsedMail> = {
        attachments: [
          {
            contentType: 'image/jpeg',
            content: Buffer.from('image-1'),
            filename: 'a.jpg'
          } as any,
          {
            contentType: 'image/png',
            content: Buffer.from('image-2'),
            filename: 'b.png'
          } as any,
          {
            contentType: 'image/webp',
            content: Buffer.from('image-3'),
            filename: 'c.webp'
          } as any,
          {
            contentType: 'application/pdf',
            content: Buffer.from('doc'),
            filename: 'd.pdf'
          } as any
        ]
      };

      const images = extractImageAttachments(email as ParsedMail);
      expect(images).toHaveLength(2);
      expect(images[0].mediaType).toBe('image/jpeg');
      expect(images[1].mediaType).toBe('image/png');
    });

    it('should skip oversized images', () => {
      const tooLarge = Buffer.alloc(6 * 1024 * 1024, 1);
      const email: Partial<ParsedMail> = {
        attachments: [
          {
            contentType: 'image/jpeg',
            content: tooLarge,
            filename: 'large.jpg'
          } as any
        ]
      };

      const images = extractImageAttachments(email as ParsedMail);
      expect(images).toHaveLength(0);
    });
  });

  describe('deduplicateItems', () => {
    it('should remove duplicates by normalized key', () => {
      const items = [
        { name: ' コーヒー ', amount: 500, paymentMethod: '現金', accountCategory: '接待交際費' },
        { name: 'コーヒー', amount: 500, paymentMethod: ' 現金 ', accountCategory: '接待交際費' },
        { name: '電車代', amount: 300, paymentMethod: '電子マネー', accountCategory: '交通費' }
      ];

      const result = deduplicateItems(items);
      expect(result).toHaveLength(2);
      expect(result[0].name).toContain('コーヒー');
      expect(result[1].name).toBe('電車代');
    });
  });

  describe('parseAndValidateExtractedData', () => {
    it('should sanitize invalid fields and keep only valid items', () => {
      const raw = JSON.stringify({
        items: [
          { name: '  テスト ', amount: '1000', paymentMethod: 'UNKNOWN', accountCategory: 'UNKNOWN' },
          { name: '', amount: -10, paymentMethod: '現金', accountCategory: '交通費' },
          { name: '正常', amount: 500, paymentMethod: '現金', accountCategory: '交通費' }
        ],
        total: '999999999999'
      });

      const result = parseAndValidateExtractedData(raw);
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        name: 'テスト',
        amount: 1000,
        paymentMethod: 'クレカ',
        accountCategory: '雑費'
      });
      expect(result.items[1]).toEqual({
        name: '正常',
        amount: 500,
        paymentMethod: '現金',
        accountCategory: '交通費'
      });
      expect(result.total).toBeUndefined();
    });
  });

  describe('getGoogleCredentials', () => {
    it('should get credentials from direct JSON', async () => {
      const mockCredentials = {
        type: 'service_account',
        project_id: 'test-project',
        private_key_id: 'key-id',
        private_key: 'private-key',
        client_email: 'test@test.com',
        client_id: 'client-id',
        auth_uri: 'auth-uri',
        token_uri: 'token-uri',
        auth_provider_x509_cert_url: 'cert-url',
        client_x509_cert_url: 'client-cert-url'
      };

      const mockSecretsManager = {
        send: jest.fn().mockResolvedValue({
          SecretBinary: new TextEncoder().encode(JSON.stringify(mockCredentials))
        })
      } as any;

      const result = await getGoogleCredentials('test-secret', mockSecretsManager);

      expect(result).toEqual(mockCredentials);
    });

    it('should get credentials from base64 encoded JSON', async () => {
      const mockCredentials = {
        type: 'service_account',
        project_id: 'test-project',
        private_key_id: 'key-id',
        private_key: 'private-key',
        client_email: 'test@test.com',
        client_id: 'client-id',
        auth_uri: 'auth-uri',
        token_uri: 'token-uri',
        auth_provider_x509_cert_url: 'cert-url',
        client_x509_cert_url: 'client-cert-url'
      };

      const base64Encoded = Buffer.from(JSON.stringify(mockCredentials)).toString('base64');
      const mockSecretsManager = {
        send: jest.fn().mockResolvedValue({
          SecretBinary: new TextEncoder().encode(base64Encoded)
        })
      } as any;

      const result = await getGoogleCredentials('test-secret', mockSecretsManager);

      expect(result).toEqual(mockCredentials);
    });

    it('should throw error when SecretBinary is missing', async () => {
      const mockSecretsManager = {
        send: jest.fn().mockResolvedValue({
          SecretBinary: undefined
        })
      } as any;

      await expect(getGoogleCredentials('test-secret', mockSecretsManager))
        .rejects.toThrow('Secrets Managerから認証情報を取得できませんでした');
    });
  });

  describe('Payment Method Classification', () => {
    it('should correctly classify credit card payments', async () => {
      const mockBedrockClient = {
        send: jest.fn().mockResolvedValue({
          body: new TextEncoder().encode(JSON.stringify({
            content: [{
              text: JSON.stringify({
                items: [
                  { name: 'オンライン購入', amount: 5000, paymentMethod: 'クレカ', accountCategory: '消耗品' },
                  { name: '月額サービス', amount: 1000, paymentMethod: 'クレカ', accountCategory: '通信費' }
                ]
              })
            }]
          }))
        })
      } as any;

      const result = await extractDataWithAI('クレジットカードで支払い', 'test-model', mockBedrockClient);

      result.items.forEach(item => {
        expect(item.paymentMethod).toBe('クレカ');
      });
    });

    it('should correctly classify cash payments', async () => {
      const mockBedrockClient = {
        send: jest.fn().mockResolvedValue({
          body: new TextEncoder().encode(JSON.stringify({
            content: [{
              text: JSON.stringify({
                items: [
                  { name: 'コーヒー', amount: 300, paymentMethod: '現金', accountCategory: '接待交際費' },
                  { name: '駐車場代', amount: 500, paymentMethod: '現金', accountCategory: '交通費' }
                ]
              })
            }]
          }))
        })
      } as any;

      const result = await extractDataWithAI('現金で支払い', 'test-model', mockBedrockClient);

      result.items.forEach(item => {
        expect(item.paymentMethod).toBe('現金');
      });
    });

    it('should correctly classify electronic money payments', async () => {
      const mockBedrockClient = {
        send: jest.fn().mockResolvedValue({
          body: new TextEncoder().encode(JSON.stringify({
            content: [{
              text: JSON.stringify({
                items: [
                  { name: '電車代', amount: 200, paymentMethod: '電子マネー', accountCategory: '交通費' },
                  { name: 'コンビニ購入', amount: 800, paymentMethod: '電子マネー', accountCategory: '雑費' }
                ]
              })
            }]
          }))
        })
      } as any;

      const result = await extractDataWithAI('Suicaで支払い', 'test-model', mockBedrockClient);

      result.items.forEach(item => {
        expect(item.paymentMethod).toBe('電子マネー');
      });
    });

    it('should correctly classify QR payments', async () => {
      const mockBedrockClient = {
        send: jest.fn().mockResolvedValue({
          body: new TextEncoder().encode(JSON.stringify({
            content: [{
              text: JSON.stringify({
                items: [
                  { name: 'ランチ', amount: 1200, paymentMethod: 'QR決済', accountCategory: '接待交際費' },
                  { name: 'タクシー代', amount: 1500, paymentMethod: 'QR決済', accountCategory: '交通費' }
                ]
              })
            }]
          }))
        })
      } as any;

      const result = await extractDataWithAI('PayPayで支払い', 'test-model', mockBedrockClient);

      result.items.forEach(item => {
        expect(item.paymentMethod).toBe('QR決済');
      });
    });

    it('should use クレカ as default payment method', () => {
      const items = [
        { name: '不明な支払い', amount: 1000, accountCategory: '雑費', paymentMethod: undefined },
        { name: '支払い方法なし', amount: 500, accountCategory: '雑費' }
      ];

      const result = prepareSheetRows(items);

      expect(result[0][3]).toBe('クレカ');
      expect(result[1][3]).toBe('クレカ');
    });

    it('should preserve all supported payment methods', () => {
      const supportedPaymentMethods = [
        'クレカ', '現金', 'デビット', '電子マネー', 'QR決済', '銀行振込', 'その他'
      ];

      supportedPaymentMethods.forEach(paymentMethod => {
        const items = [{ name: 'テスト項目', amount: 1000, accountCategory: '雑費', paymentMethod }];
        const result = prepareSheetRows(items);
        expect(result[0][3]).toBe(paymentMethod);
      });
    });

    it('should handle mixed payment methods in single extraction', async () => {
      const mockBedrockClient = {
        send: jest.fn().mockResolvedValue({
          body: new TextEncoder().encode(JSON.stringify({
            content: [{
              text: JSON.stringify({
                items: [
                  { name: 'コーヒー', amount: 300, paymentMethod: '現金', accountCategory: '接待交際費' },
                  { name: '電車代', amount: 200, paymentMethod: '電子マネー', accountCategory: '交通費' },
                  { name: 'ランチ', amount: 1200, paymentMethod: 'QR決済', accountCategory: '接待交際費' },
                  { name: 'ネット購入', amount: 2500, paymentMethod: 'クレカ', accountCategory: '消耗品' }
                ],
                total: 4200
              })
            }]
          }))
        })
      } as any;

      const result = await extractDataWithAI('様々な支払い方法での購入', 'test-model', mockBedrockClient);

      expect(result.items[0].paymentMethod).toBe('現金');
      expect(result.items[1].paymentMethod).toBe('電子マネー');
      expect(result.items[2].paymentMethod).toBe('QR決済');
      expect(result.items[3].paymentMethod).toBe('クレカ');
    });
  });

  describe('Account Category Classification', () => {
    it('should correctly classify transportation expenses', async () => {
      const mockBedrockClient = {
        send: jest.fn().mockResolvedValue({
          body: new TextEncoder().encode(JSON.stringify({
            content: [{
              text: JSON.stringify({
                items: [
                  { name: 'JR東日本 電車代', amount: 500, accountCategory: '交通費' },
                  { name: 'タクシー代', amount: 1200, accountCategory: '交通費' },
                  { name: 'ガソリン代', amount: 3000, accountCategory: '交通費' }
                ]
              })
            }]
          }))
        })
      } as any;

      const result = await extractDataWithAI('交通費の領収書', 'test-model', mockBedrockClient);

      result.items.forEach(item => {
        expect(item.accountCategory).toBe('交通費');
      });
    });

    it('should correctly classify office supplies', async () => {
      const mockBedrockClient = {
        send: jest.fn().mockResolvedValue({
          body: new TextEncoder().encode(JSON.stringify({
            content: [{
              text: JSON.stringify({
                items: [
                  { name: 'ボールペン', amount: 100, accountCategory: '消耗品' },
                  { name: 'コピー用紙', amount: 500, accountCategory: '消耗品' },
                  { name: 'USB メモリ', amount: 1500, accountCategory: '消耗品' }
                ]
              })
            }]
          }))
        })
      } as any;

      const result = await extractDataWithAI('事務用品の購入', 'test-model', mockBedrockClient);

      result.items.forEach(item => {
        expect(item.accountCategory).toBe('消耗品');
      });
    });

    it('should use 雑費 as fallback category', () => {
      const items = [
        { name: '不明な費用', amount: 1000, accountCategory: undefined as any },
        { name: '分類不能', amount: 500, accountCategory: '' }
      ];

      const result = prepareSheetRows(items);

      expect(result[0][4]).toBe('雑費');
      expect(result[1][4]).toBe('雑費');
    });

    it('should preserve all supported account categories', () => {
      const supportedCategories = [
        '交通費', '通信費', '消耗品', '接待交際費', '広告宣伝費',
        '福利厚生費', '水道光熱費', '地代家賃', '修繕費', '雑費'
      ];

      supportedCategories.forEach(category => {
        const items = [{ name: 'テスト項目', amount: 1000, accountCategory: category }];
        const result = prepareSheetRows(items);
        expect(result[0][4]).toBe(category);
      });
    });
  });
}); 