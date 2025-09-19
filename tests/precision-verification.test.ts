import {
  ai3ToShannon,
  shannonToAi3,
  formatAi3Amount,
  CSVValidator,
} from '../src/utils/validation';
import fs from 'fs-extra';
import path from 'path';

// Mock fs-extra to prevent filesystem operations
jest.mock('fs-extra', () => ({
  ensureDir: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  pathExists: jest.fn().mockResolvedValue(true),
  createReadStream: jest.fn(),
}));

// Store CSV content for mocking
let mockCsvContent = '';

// Helper to set mock CSV content for tests
const setMockCsvContent = (content: string) => {
  mockCsvContent = content;
  
  // Update the mock implementation
  (fs.createReadStream as jest.Mock).mockReturnValue({
    pipe: jest.fn().mockReturnValue({
      on: jest.fn().mockImplementation((event, callback) => {
        const lines = mockCsvContent.split('\n').filter(line => line.trim());
        
        if (event === 'data') {
          // Parse CSV content and emit row events
          lines.forEach((line, index) => {
            const [address, amount] = line.split(',');
            setTimeout(() => callback({ address: address?.trim(), amount: amount?.trim() }), index + 1);
          });
        } else if (event === 'end') {
          setTimeout(() => callback(), lines.length + 10);
        } else if (event === 'error') {
          // Store error callback for potential use
        }
        return this;
      })
    })
  });
};

// Mock logger for tests
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  logValidationResults: jest.fn(),
} as any;

describe('Shannon Precision Verification', () => {
  let tempDir: string;
  let validator: CSVValidator;

  beforeEach(async () => {
    tempDir = path.join(__dirname, 'temp-precision');
    await fs.ensureDir(tempDir);
    validator = new CSVValidator(mockLogger);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    jest.clearAllMocks();
  });

  describe('Edge Case Precision Tests', () => {
    test('1 Shannon (minimum possible amount)', async () => {
      const csvContent = 'sufsKsx4kZ26i7bJXc1TFguysVzjkzsDtE2VDiCEBY2WjyGAj,0.000000000000000001';
      
      setMockCsvContent(csvContent);
      // Test CSV processing maintains exact precision
      const validation = await validator.validateCSV('mock-file.csv');
      expect(validation.isValid).toBe(true);
      expect(validation.totalAmount).toBe(1n); // Exact 1 Shannon

      const records = await validator.parseValidatedCSV('mock-file.csv');
      expect(records[0].amount).toBe(1n); // Exact Shannon amount

      // Verify conversion functions maintain precision
      expect(ai3ToShannon('0.000000000000000001')).toBe(1n);
      expect(shannonToAi3(1n)).toBe('0.000000000000000001');
      expect(formatAi3Amount(1n)).toBe('0.000000000000000001');
    });

    test('Very small amounts below existential deposit should generate warnings', async () => {
      const csvContent = 'sufsKsx4kZ26i7bJXc1TFguysVzjkzsDtE2VDiCEBY2WjyGAj,0.000000000000000001';
      
      setMockCsvContent(csvContent);
      // Test CSV processing with very small amount
      const validation = await validator.validateCSV('mock-file.csv');
      expect(validation.isValid).toBe(true); // Valid but with warning
      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.warnings.some(w => w.includes('below existential deposit'))).toBe(true);
    });

    test('1 billion AI3 (maximum test amount)', () => {
      const oneBillionAI3 = '1000000000';
      const expectedShannon = 1000000000000000000000000000n; // 1B * 10^18

      // Test conversion accuracy
      expect(ai3ToShannon(oneBillionAI3)).toBe(expectedShannon);
      expect(shannonToAi3(expectedShannon)).toBe(oneBillionAI3);
      expect(formatAi3Amount(expectedShannon)).toBe(oneBillionAI3);

      // Test round-trip precision
      const backToAI3 = shannonToAi3(ai3ToShannon(oneBillionAI3));
      expect(backToAI3).toBe(oneBillionAI3);
    });

    test('Maximum precision (18 decimals)', () => {
      const maxPrecision = '123.123456789012345678';
      const expectedShannon = 123123456789012345678n;

      expect(ai3ToShannon(maxPrecision)).toBe(expectedShannon);
      expect(shannonToAi3(expectedShannon)).toBe(maxPrecision);
      expect(formatAi3Amount(expectedShannon)).toBe(maxPrecision);

      // Test round-trip precision
      const backToAI3 = shannonToAi3(ai3ToShannon(maxPrecision));
      expect(backToAI3).toBe(maxPrecision);
    });

    test('Mixed precision CSV processing', async () => {
      const amounts = [
        '0.000000000000000001', // 1 Shannon (minimum)
        '0.000001',             // Existential deposit
        '0.5',                  // 0.5 AI3
        '1.123456789012345678', // Max precision
        '1000000',              // 1 Million AI3
      ];

      const csvLines = amounts.map(amount => 
        `sufsKsx4kZ26i7bJXc1TFguysVzjkzsDtE2VDiCEBY2WjyGAj,${amount}`
      );
      const csvContent = csvLines.join('\n');
      
      setMockCsvContent(csvContent);
      // Test CSV validation maintains precision
      const validation = await validator.validateCSV('mock-file.csv');
      expect(validation.isValid).toBe(true);
      expect(validation.recordCount).toBe(5);

      // Calculate expected total in Shannon using BigInt
      const expectedTotal = amounts.reduce((sum, amount) => {
        return sum + ai3ToShannon(amount);
      }, 0n);

      expect(validation.totalAmount).toBe(expectedTotal);

      // Test individual record precision
      const records = await validator.parseValidatedCSV('mock-file.csv');
      amounts.forEach((amount, i) => {
        const expectedShannon = ai3ToShannon(amount);
        expect(records[i].amount).toBe(expectedShannon);

        // Verify round-trip precision
        const backToAI3 = shannonToAi3(expectedShannon);
        expect(backToAI3).toBe(amount);
      });
    });
  });

  describe('BigInt Arithmetic Precision', () => {
    test('Large sum calculations maintain precision', () => {
      // Create amounts that would cause floating point issues
      const amounts = ['1.1', '2.2', '3.3'];
      const shannonAmounts = amounts.map(ai3ToShannon);
      const total = shannonAmounts.reduce((sum, amount) => sum + BigInt(amount), BigInt(0));

      // Expected: 6.6 AI3 = 6600000000000000000 Shannon
      expect(total.toString()).toBe('6600000000000000000');

      // Verify exact conversion back
      const backToAI3 = shannonToAi3(total);
      expect(backToAI3).toBe('6.6');
    });

    test('Very large sums without precision loss', () => {
      // 1000 records of 1 million AI3 each = 1 billion AI3 total
      const records = Array.from({ length: 1000 }, () => ai3ToShannon('1000000'));
      const total = records.reduce((sum, amount) => sum + amount, 0n);

      expect(total.toString()).toBe('1000000000000000000000000000');
      expect(shannonToAi3(total)).toBe('1000000000');
    });

    test('Precision beyond JavaScript safe integers', () => {
      const maxSafeShannon = Number.MAX_SAFE_INTEGER.toString();
      const largeShannon = '9007199254740992000'; // Beyond MAX_SAFE_INTEGER

      // Our BigInt implementation handles both
      const ai3FromSafe = shannonToAi3(BigInt(maxSafeShannon));
      const ai3FromLarge = shannonToAi3(BigInt(largeShannon));

      // Verify round-trip precision
      expect(ai3ToShannon(ai3FromSafe)).toBe(BigInt(maxSafeShannon));
      expect(ai3ToShannon(ai3FromLarge)).toBe(BigInt(largeShannon));

      // Verify JavaScript would fail
      expect(Number.isSafeInteger(parseInt(largeShannon))).toBe(false);
    });
  });

  describe('Format Precision and Rejection Tests', () => {
    test('Format functions maintain precision', () => {
      const testCases = [
        { shannon: '1', expected: '0.000000000000000001' },
        { shannon: '1000000000000000000', expected: '1' },
        { shannon: '1123456789012345678', expected: '1.123456789012345678' },
        { shannon: '999999999999999999', expected: '0.999999999999999999' },
        { shannon: '500000000000000000', expected: '0.5' },
      ];

      testCases.forEach(({ shannon, expected }) => {
        const formatted = formatAi3Amount(BigInt(shannon));
        expect(formatted).toBe(expected);
        
        // Verify round-trip precision
        const backToShannon = ai3ToShannon(formatted);
        expect(backToShannon).toBe(BigInt(shannon));
      });
    });

    test('Scientific notation properly rejected', () => {
      const scientificNotation = [
        '1e-18',
        '5e-16',
        '1.5e+2',
        '1.23456789012345678e-7',
        '2.5e-10',
      ];

      scientificNotation.forEach(notation => {
        expect(() => ai3ToShannon(notation)).toThrow('Invalid AI3 amount format');
      });
    });

    test('Invalid formats properly rejected', () => {
      const invalidFormats = [
        'abc',
        '1.2.3',
        '1a.5',
        '-1',
        'NaN',
        'Infinity',
        '',
        '1.',
        '.5',
      ];

      invalidFormats.forEach(format => {
        expect(() => ai3ToShannon(format)).toThrow('Invalid AI3 amount format');
      });
    });
  });

  describe('Shannon Arithmetic Edge Cases', () => {
    test('Zero amounts handled correctly', () => {
      expect(ai3ToShannon('0')).toBe(0n);
      expect(ai3ToShannon('0.0')).toBe(0n);
      expect(ai3ToShannon('0.000000000000000000')).toBe(0n);
      expect(shannonToAi3(0n)).toBe('0');
      expect(formatAi3Amount(0n)).toBe('0');
    });

    test('Trailing zeros handled correctly', () => {
      expect(ai3ToShannon('1.500000000000000000')).toBe(1500000000000000000n);
      expect(shannonToAi3(1500000000000000000n)).toBe('1.5'); // Removes trailing zeros
      expect(formatAi3Amount(1000000000000000000n)).toBe('1'); // No decimal for whole numbers
    });

    test('Leading zeros handled correctly', () => {
      expect(ai3ToShannon('001.5')).toBe(1500000000000000000n);
      expect(ai3ToShannon('0000000001')).toBe(1000000000000000000n);
    });

    test('Very precise fractions handled correctly', () => {
      // Test fractions that require all 18 decimal places
      const preciseAmounts = [
        '0.999999999999999999', // Maximum precision less than 1
        '0.000000000000000999', // Very small with precision
        '1.000000000000000001', // Minimum precision more than 1
      ];

      preciseAmounts.forEach(amount => {
        const shannon = ai3ToShannon(amount);
        const backToAI3 = shannonToAi3(shannon);
        expect(backToAI3).toBe(amount);
      });
    });
  });
});
