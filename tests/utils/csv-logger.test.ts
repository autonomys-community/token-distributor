import fs from 'fs-extra';
import path from 'path';
import { CSVTransactionLogger } from '../../src/utils/csv-logger';
import { DistributionRecord } from '../../src/types';

describe('CSVTransactionLogger', () => {
  const testLogsDir = path.join(__dirname, '../../test-logs');
  const testSourceFilename = 'test-transactions.csv';

  beforeEach(async () => {
    // Ensure test logs directory exists
    await fs.ensureDir(testLogsDir);
    
    // Change working directory to test logs for test isolation
    process.chdir(testLogsDir);
  });

  afterEach(async () => {
    // Clean up test files
    await fs.remove(testLogsDir);
  });

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

    it('should initialize and create CSV file with correct header', async () => {
      const logger = new CSVTransactionLogger(testSourceFilename, 'mainnet');
      await logger.initialize();

      const logPath = logger.getLogFilePath();
      expect(await fs.pathExists(logPath)).toBe(true);

      const content = await fs.readFile(logPath, 'utf-8');
      expect(content).toBe('SourceFileRowNumber,Address,Amount,Status,TransactionHash,ExplorerLink\n');
    });
  });

  describe('transaction logging', () => {
    let logger: CSVTransactionLogger;

    beforeEach(async () => {
      logger = new CSVTransactionLogger(testSourceFilename, 'mainnet');
      await logger.initialize();
    });

    it('should log successful transaction with mainnet explorer link', async () => {
      const record: DistributionRecord = {
        address: '5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSnekmSK2DjL',
        amount: BigInt('1000000000000000000'), // 1 AI3
        status: 'completed',
        sourceRowNumber: 1,
        transactionHash: '0x5acb478fe6f7cc1a86e30077e90f48758c4a4c2848a812e90ed7af67cf320084'
      };

      await logger.logTransaction(record);

      const content = await fs.readFile(logger.getLogFilePath(), 'utf-8');
      const lines = content.trim().split('\n');
      
      expect(lines).toHaveLength(2); // Header + 1 data row
      expect(lines[1]).toBe(
        '1,5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSnekmSK2DjL,1,completed,0x5acb478fe6f7cc1a86e30077e90f48758c4a4c2848a812e90ed7af67cf320084,https://autonomys.subscan.io/extrinsic/0x5acb478fe6f7cc1a86e30077e90f48758c4a4c2848a812e90ed7af67cf320084'
      );
    });

    it('should log successful transaction with chronos explorer link', async () => {
      const chronosLogger = new CSVTransactionLogger(testSourceFilename, 'chronos');
      await chronosLogger.initialize();

      const record: DistributionRecord = {
        address: '5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSnekmSK2DjL',
        amount: BigInt('500000000000000000'), // 0.5 AI3
        status: 'completed',
        sourceRowNumber: 2,
        transactionHash: '0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab'
      };

      await chronosLogger.logTransaction(record);

      const content = await fs.readFile(chronosLogger.getLogFilePath(), 'utf-8');
      const lines = content.trim().split('\n');
      
      expect(lines[1]).toContain('https://autonomys-chronos.subscan.io/extrinsic/0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab');
    });

    it('should handle failed transaction without explorer link', async () => {
      const record: DistributionRecord = {
        address: '5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSnekmSK2DjL',
        amount: BigInt('1000000000000000000'),
        status: 'failed',
        sourceRowNumber: 3,
        error: 'Insufficient balance'
      };

      await logger.logTransaction(record);

      const content = await fs.readFile(logger.getLogFilePath(), 'utf-8');
      const lines = content.trim().split('\n');
      
      expect(lines[1]).toBe(
        '3,5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSnekmSK2DjL,1,failed,,'
      );
    });

    it('should handle transaction with unknown hash', async () => {
      const record: DistributionRecord = {
        address: '5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSnekmSK2DjL',
        amount: BigInt('1000000000000000000'),
        status: 'completed',
        sourceRowNumber: 4,
        transactionHash: 'unknown'
      };

      await logger.logTransaction(record);

      const content = await fs.readFile(logger.getLogFilePath(), 'utf-8');
      const lines = content.trim().split('\n');
      
      expect(lines[1]).toBe(
        '4,5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSnekmSK2DjL,1,completed,unknown,'
      );
    });

    it('should handle unsupported network gracefully', async () => {
      const unsupportedLogger = new CSVTransactionLogger(testSourceFilename, 'unsupported-network');
      await unsupportedLogger.initialize();

      const record: DistributionRecord = {
        address: '5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSnekmSK2DjL',
        amount: BigInt('1000000000000000000'),
        status: 'completed',
        sourceRowNumber: 5,
        transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      };

      await unsupportedLogger.logTransaction(record);

      const content = await fs.readFile(unsupportedLogger.getLogFilePath(), 'utf-8');
      const lines = content.trim().split('\n');
      
      // Should have empty explorer link for unsupported network
      expect(lines[1]).toBe(
        '5,5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSnekmSK2DjL,1,completed,0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef,'
      );
    });

    it('should properly escape CSV fields with commas and quotes', async () => {
      // Test with address that has special characters
      const record: DistributionRecord = {
        address: '5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSnekmSK2DjL',
        amount: BigInt('1000000000000000000'),
        status: 'failed',
        sourceRowNumber: 6,
        transactionHash: 'hash,with,"commas"and"quotes'
      };

      await logger.logTransaction(record);

      const content = await fs.readFile(logger.getLogFilePath(), 'utf-8');
      const lines = content.trim().split('\n');
      
      // Transaction hash with special characters should be properly escaped
      expect(lines[1]).toContain('"hash,with,""commas""and""quotes"');
    });

    it('should handle multiple transactions correctly', async () => {
      const records: DistributionRecord[] = [
        {
          address: '5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSnekmSK2DjL',
          amount: BigInt('1000000000000000000'),
          status: 'completed',
          sourceRowNumber: 1,
          transactionHash: '0xhash1'
        },
        {
          address: '5EyQqnqZjAWCbkjWCa6MnjNokrgYjMqmKndv2rSnekmSK2ABC',
          amount: BigInt('2000000000000000000'),
          status: 'completed',
          sourceRowNumber: 2,
          transactionHash: '0xhash2'
        }
      ];

      for (const record of records) {
        await logger.logTransaction(record);
      }

      const content = await fs.readFile(logger.getLogFilePath(), 'utf-8');
      const lines = content.trim().split('\n');
      
      expect(lines).toHaveLength(3); // Header + 2 data rows
      expect(lines[1]).toContain('0xhash1');
      expect(lines[1]).toContain('https://autonomys.subscan.io/extrinsic/0xhash1');
      expect(lines[2]).toContain('0xhash2');
      expect(lines[2]).toContain('https://autonomys.subscan.io/extrinsic/0xhash2');
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

  describe('file naming', () => {
    it('should create unique log file names with timestamps', async () => {
      const logger1 = new CSVTransactionLogger('source1.csv', 'mainnet');
      await logger1.initialize();
      
      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const logger2 = new CSVTransactionLogger('source1.csv', 'mainnet');
      await logger2.initialize();

      expect(logger1.getLogFilePath()).not.toBe(logger2.getLogFilePath());
    });

    it('should extract base filename correctly', async () => {
      const logger = new CSVTransactionLogger('/path/to/my-tokens.csv', 'mainnet');
      await logger.initialize();
      
      const logPath = logger.getLogFilePath();
      expect(path.basename(logPath)).toMatch(/^my-tokens-transactions-.*\.csv$/);
    });
  });
});
