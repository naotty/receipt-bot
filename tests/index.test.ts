import { 
  validateEmailContent, 
  isAllowedSender, 
  logExtractedData, 
  prepareSheetRows,
  extractDataWithAI,
  getGoogleCredentials
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
    it('should prepare rows correctly for multiple items', () => {
      const items = [
        { name: 'Product A', amount: 1000 },
        { name: 'Product B', amount: 2000 }
      ];
      
      const result = prepareSheetRows(items);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual([
        expect.any(String), // 日付
        'Product A',
        1000,
        'クレカ'
      ]);
      expect(result[1]).toEqual([
        expect.any(String), // 日付
        'Product B', 
        2000,
        'クレカ'
      ]);
    });

    it('should handle empty item name', () => {
      const items = [
        { name: '', amount: 1000 }
      ];
      
      const result = prepareSheetRows(items);
      
      expect(result[0]).toEqual([
        expect.any(String), // 日付
        'サービス',
        1000,
        'クレカ'
      ]);
    });

    it('should handle zero amount', () => {
      const items = [
        { name: 'Free Item', amount: 0 }
      ];
      
      const result = prepareSheetRows(items);
      
      expect(result[0]).toEqual([
        expect.any(String), // 日付
        'Free Item',
        0,
        'クレカ'
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

    it('should log extracted items correctly', () => {
      const extractedData = {
        items: [
          { name: 'Product A', amount: 1000 },
          { name: 'Product B', amount: 2000 }
        ],
        total: 3000
      };
      
      logExtractedData(extractedData);
      
      expect(consoleSpy).toHaveBeenCalledWith('2件の商品が見つかりました:');
      expect(consoleSpy).toHaveBeenCalledWith('  1. Product A: ¥1000');
      expect(consoleSpy).toHaveBeenCalledWith('  2. Product B: ¥2000');
      expect(consoleSpy).toHaveBeenCalledWith('合計金額: ¥3000');
    });

    it('should not log total when not provided', () => {
      const extractedData = {
        items: [
          { name: 'Product A', amount: 1000 }
        ]
      };
      
      logExtractedData(extractedData);
      
      expect(consoleSpy).toHaveBeenCalledWith('1件の商品が見つかりました:');
      expect(consoleSpy).toHaveBeenCalledWith('  1. Product A: ¥1000');
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
    it('should extract data successfully', async () => {
      const mockBedrockClient = {
        send: jest.fn().mockResolvedValue({
          body: new TextEncoder().encode(JSON.stringify({
            content: [{
              text: JSON.stringify({
                items: [{ name: 'Test Product', amount: 1000 }],
                total: 1000
              })
            }]
          }))
        })
      } as any;

      const result = await extractDataWithAI('test content', 'test-model', mockBedrockClient);

      expect(result).toEqual({
        items: [{ name: 'Test Product', amount: 1000 }],
        total: 1000
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
}); 