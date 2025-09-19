import { loadConfig, validateConfig } from '../../src/config';

// Mock environment variables
const originalEnv = process.env;

describe('Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
    // Clear environment variables and set only what's needed for tests
    process.env = {};
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    test('should load config with default values', () => {
      process.env.DISTRIBUTOR_PRIVATE_KEY =
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      const config = loadConfig();

      expect(config.network).toBe('chronos'); // Default
      expect(config.distributorPrivateKey).toBe(
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      );
      expect(config.logLevel).toBe('info');
      expect(config.logToFile).toBe(true);
      expect(config.confirmationBlocks).toBe(2);
      expect(config.batchSize).toBe(10);
      expect(config.gasBufferAi3).toBe(1);
    });

    test('should load config with custom values', () => {
      process.env.NETWORK = 'mainnet';
      process.env.DISTRIBUTOR_PRIVATE_KEY =
        '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      process.env.RPC_ENDPOINT = 'wss://custom-endpoint.com/ws';
      process.env.LOG_LEVEL = 'debug';
      process.env.LOG_TO_FILE = 'false';
      process.env.CONFIRMATION_BLOCKS = '5';
      process.env.BATCH_SIZE = '25';

      const config = loadConfig();

      expect(config.network).toBe('mainnet');
      expect(config.distributorPrivateKey).toBe(
        '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      );
      expect(config.rpcEndpoint).toBe('wss://custom-endpoint.com/ws');
      expect(config.logLevel).toBe('debug');
      expect(config.logToFile).toBe(false);
      expect(config.confirmationBlocks).toBe(5);
      expect(config.batchSize).toBe(25);
    });

    test('should throw error for invalid network', () => {
      process.env.NETWORK = 'invalid-network';
      process.env.DISTRIBUTOR_PRIVATE_KEY =
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      expect(() => loadConfig()).toThrow('Invalid network: invalid-network');
    });

    test('should throw error for invalid log level', () => {
      process.env.LOG_LEVEL = 'invalid-level';
      process.env.DISTRIBUTOR_PRIVATE_KEY =
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      expect(() => loadConfig()).toThrow('Invalid log level: invalid-level');
    });

    test('should throw error for missing private key', () => {
      delete process.env.DISTRIBUTOR_PRIVATE_KEY;

      expect(() => loadConfig()).toThrow(
        'Required environment variable DISTRIBUTOR_PRIVATE_KEY is not set'
      );
    });

    test('should handle invalid number values', () => {
      process.env.DISTRIBUTOR_PRIVATE_KEY =
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      process.env.CONFIRMATION_BLOCKS = 'not-a-number';

      expect(() => loadConfig()).toThrow(
        'Environment variable CONFIRMATION_BLOCKS must be a valid number'
      );
    });
  });

  describe('validateConfig', () => {
    test('should validate correct config', () => {
      const config = {
        network: 'chronos',
        distributorPrivateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        logLevel: 'info',
        logToFile: true,
        confirmationBlocks: 2,
        batchSize: 10,
        gasBufferAi3: 1,
      };

      expect(() => validateConfig(config)).not.toThrow();
    });

    test('should reject config without private key', () => {
      const config = {
        network: 'chronos',
        distributorPrivateKey: '',
        logLevel: 'info',
        logToFile: true,
        confirmationBlocks: 2,
        batchSize: 10,
        gasBufferAi3: 1,
      };

      expect(() => validateConfig(config)).toThrow('DISTRIBUTOR_PRIVATE_KEY is required');
    });

    test('should validate private key format', () => {
      const validConfigs = [
        {
          network: 'chronos',
          distributorPrivateKey:
            '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          logLevel: 'info',
          logToFile: true,
          confirmationBlocks: 2,
          batchSize: 10,
          gasBufferAi3: 1,
        },
        {
          network: 'chronos',
          distributorPrivateKey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', // Without 0x
          logLevel: 'info',
          logToFile: true,
          confirmationBlocks: 2,
          batchSize: 10,
          gasBufferAi3: 1,
        },
      ];

      validConfigs.forEach(config => {
        expect(() => validateConfig(config)).not.toThrow();
      });
    });

    test('should reject invalid private key formats', () => {
      const invalidKeys = [
        'too-short',
        '0x123', // Too short
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefg', // Invalid hex character
        'not-hex-at-all',
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1', // Too long
      ];

      invalidKeys.forEach(key => {
        const config = {
          network: 'chronos',
          distributorPrivateKey: key,
          logLevel: 'info',
          logToFile: true,
          confirmationBlocks: 2,
          batchSize: 10,
          gasBufferAi3: 1,
        };

        expect(() => validateConfig(config)).toThrow(
          'DISTRIBUTOR_PRIVATE_KEY must be a valid 64-character hexadecimal private key'
        );
      });
    });

    test('should validate numeric constraints', () => {
      const baseConfig = {
        network: 'chronos',
        distributorPrivateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        logLevel: 'info',
        logToFile: true,
        confirmationBlocks: 2,
        batchSize: 10,
        gasBufferAi3: 1,
      };

      // Test confirmation blocks
      expect(() => validateConfig({ ...baseConfig, confirmationBlocks: 0 })).toThrow(
        'CONFIRMATION_BLOCKS must be at least 1'
      );

      // Test batch size
      expect(() => validateConfig({ ...baseConfig, batchSize: 0 })).toThrow(
        'BATCH_SIZE must be at least 1'
      );
    });
  });
});
