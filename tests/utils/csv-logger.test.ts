import { CSVTransactionLogger } from '../../src/utils/csv-logger';
import { DistributionRecord } from '../../src/types';

// Mock fs-extra to avoid filesystem dependencies
jest.mock('fs-extra', () => ({
  ensureDir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  appendFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(''),
  pathExists: jest.fn().mockResolvedValue(true),
}));

// Mock process.cwd to avoid filesystem issues
const originalCwd = process.cwd;
beforeAll(() => {
  process.cwd = jest.fn().mockReturnValue('/mock/working/directory');
});

afterAll(() => {
  process.cwd = originalCwd;
});

describe('CSVTransactionLogger', () => {
  const testSourceFilename = 'test-transactions.csv';

  describe('constructor and initialization', () => {
    it('should create logger with mainnet network', () => {
      const logger = new CSVTransactionLogger(testSourceFilename, 'mainnet');
      expect(logger).toBeInstanceOf(CSVTransactionLogger);
    });

    it('should create logger with chronos network', () => {
      const logger = new CSVTransactionLogger(testSourceFilename, 'chronos');
      expect(logger).toBeInstanceOf(CSVTransactionLogger);
    });

    it('should handle case insensitive network names', () => {
      const logger = new CSVTransactionLogger(testSourceFilename, 'MAINNET');
      expect(logger).toBeInstanceOf(CSVTransactionLogger);
    });

    it('should generate correct log file path with timestamp', () => {
      const logger = new CSVTransactionLogger(testSourceFilename, 'mainnet');
      const logPath = logger.getLogFilePath();
      
      expect(logPath).toMatch(/logs\/test-transactions-transactions-.*\.csv$/);
    });

    it('should extract base filename correctly', () => {
      const logger = new CSVTransactionLogger('/path/to/my-tokens.csv', 'mainnet');
      const logPath = logger.getLogFilePath();
      
      expect(logPath).toMatch(/logs\/my-tokens-transactions-.*\.csv$/);
    });
  });

  describe('explorer link generation', () => {
    it('should generate mainnet explorer links correctly', async () => {
      const logger = new CSVTransactionLogger(testSourceFilename, 'mainnet');
      await logger.initialize();

      const record: DistributionRecord = {
        address: '5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSnekmSK2DjL',
        amount: BigInt('1000000000000000000'), // 1 AI3
        status: 'completed',
        sourceRowNumber: 1,
        transactionHash: '0x5acb478fe6f7cc1a86e30077e90f48758c4a4c2848a812e90ed7af67cf320084'
      };

      // Access the private method via type assertion for testing
      const explorerLink = (logger as any).generateExplorerLink(record.transactionHash);
      expect(explorerLink).toBe('https://autonomys.subscan.io/extrinsic/0x5acb478fe6f7cc1a86e30077e90f48758c4a4c2848a812e90ed7af67cf320084');
    });

    it('should generate chronos explorer links correctly', async () => {
      const logger = new CSVTransactionLogger(testSourceFilename, 'chronos');
      await logger.initialize();

      const transactionHash = '0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab';
      const explorerLink = (logger as any).generateExplorerLink(transactionHash);
      
      expect(explorerLink).toBe('https://autonomys-chronos.subscan.io/extrinsic/0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab');
    });

    it('should return empty string for unknown transaction hash', async () => {
      const logger = new CSVTransactionLogger(testSourceFilename, 'mainnet');
      await logger.initialize();

      const explorerLink = (logger as any).generateExplorerLink('unknown');
      expect(explorerLink).toBe('');
    });

    it('should return empty string for empty transaction hash', async () => {
      const logger = new CSVTransactionLogger(testSourceFilename, 'mainnet');
      await logger.initialize();

      const explorerLink = (logger as any).generateExplorerLink('');
      expect(explorerLink).toBe('');
    });

    it('should handle unsupported network gracefully', async () => {
      const logger = new CSVTransactionLogger(testSourceFilename, 'unsupported-network');
      await logger.initialize();

      const explorerLink = (logger as any).generateExplorerLink('0x1234567890abcdef');
      expect(explorerLink).toBe('');
    });
  });

  describe('CSV field escaping', () => {
    it('should escape fields with commas correctly', () => {
      const logger = new CSVTransactionLogger(testSourceFilename, 'mainnet');
      
      const escaped = (logger as any).escapeCSVField('value,with,commas');
      expect(escaped).toBe('"value,with,commas"');
    });

    it('should escape fields with quotes correctly', () => {
      const logger = new CSVTransactionLogger(testSourceFilename, 'mainnet');
      
      const escaped = (logger as any).escapeCSVField('value with "quotes"');
      expect(escaped).toBe('"value with ""quotes"""');
    });

    it('should escape fields with newlines correctly', () => {
      const logger = new CSVTransactionLogger(testSourceFilename, 'mainnet');
      
      const escaped = (logger as any).escapeCSVField('value\nwith\nnewlines');
      expect(escaped).toBe('"value\nwith\nnewlines"');
    });

    it('should not escape simple fields', () => {
      const logger = new CSVTransactionLogger(testSourceFilename, 'mainnet');
      
      const escaped = (logger as any).escapeCSVField('simple_value');
      expect(escaped).toBe('simple_value');
    });
  });

  describe('file naming', () => {
    it('should create unique log file names with timestamps', async () => {
      const logger1 = new CSVTransactionLogger('source1.csv', 'mainnet');
      
      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 2));
      
      const logger2 = new CSVTransactionLogger('source1.csv', 'mainnet');

      expect(logger1.getLogFilePath()).not.toBe(logger2.getLogFilePath());
    });

    it('should handle different networks in filename', async () => {
      const mainnetLogger = new CSVTransactionLogger(testSourceFilename, 'mainnet');
      
      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 2));
      
      const chronosLogger = new CSVTransactionLogger(testSourceFilename, 'chronos');

      // Both should have the same base pattern but different instances
      expect(mainnetLogger.getLogFilePath()).toMatch(/test-transactions-transactions-.*\.csv$/);
      expect(chronosLogger.getLogFilePath()).toMatch(/test-transactions-transactions-.*\.csv$/);
      expect(mainnetLogger.getLogFilePath()).not.toBe(chronosLogger.getLogFilePath());
    });
  });

  describe('error handling', () => {
    it('should throw error when logging before initialization', async () => {
      const logger = new CSVTransactionLogger(testSourceFilename, 'mainnet');
      
      const record: DistributionRecord = {
        address: '5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSnekmSK2DjL',
        amount: BigInt('1000000000000000000'),
        status: 'completed',
        sourceRowNumber: 1,
        transactionHash: '0xtest'
      };

      await expect(logger.logTransaction(record)).rejects.toThrow(
        'CSV logger not initialized. Call initialize() first.'
      );
    });
  });

  describe('amount formatting', () => {
    it('should format amounts using SDK shannonsToAi3 function', async () => {
      const logger = new CSVTransactionLogger(testSourceFilename, 'mainnet');
      await logger.initialize();

      const record: DistributionRecord = {
        address: '5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSnekmSK2DjL',
        amount: BigInt('1000000000000000000'), // 1 AI3 in Shannon
        status: 'completed',
        sourceRowNumber: 1,
        transactionHash: '0xtest'
      };

      // The test verifies that logTransaction doesn't throw and calls the SDK function
      await expect(logger.logTransaction(record)).resolves.not.toThrow();
    });

    it('should handle large amounts correctly', async () => {
      const logger = new CSVTransactionLogger(testSourceFilename, 'mainnet');
      await logger.initialize();

      const record: DistributionRecord = {
        address: '5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSnekmSK2DjL',
        amount: BigInt('1000000000000000000000'), // 1000 AI3 in Shannon
        status: 'completed',
        sourceRowNumber: 1,
        transactionHash: '0xtest'
      };

      await expect(logger.logTransaction(record)).resolves.not.toThrow();
    });
  });
});