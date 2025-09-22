import {
  validateAddress,
  isValidAutonomysAddress,
  isValidAmount,
  getAddressNetworkInfo,
  CSVValidator,
} from '../../src/utils/validation';
import { encodeAddress } from '@polkadot/util-crypto';
import { Keyring } from '@polkadot/keyring';
import fs from 'fs-extra';
import path from 'path';
import { ai3ToShannons, shannonsToAi3 } from '@autonomys/auto-utils';

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
            setTimeout(
              () => callback({ address: address?.trim(), amount: amount?.trim() }),
              index + 1
            );
          });
        } else if (event === 'end') {
          setTimeout(() => callback(), lines.length + 10);
        } else if (event === 'error') {
          // Store error callback for potential use
        }
        return this;
      }),
    }),
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

// Global test addresses - available to all test suites
let keyring: Keyring;
let testAddresses: {
  validAutonomys: string;
  validSubstrate: string;
  invalidAddress: string;
  malformedAddress: string;
};

beforeAll(() => {
  keyring = new Keyring({ type: 'sr25519' });

  // Generate test addresses
  const testAccount = keyring.addFromUri('//Alice');
  const publicKey = testAccount.addressRaw;

  testAddresses = {
    validAutonomys: encodeAddress(publicKey, 6094), // Autonomys prefix
    validSubstrate: encodeAddress(publicKey, 42), // Substrate prefix
    invalidAddress: 'invalid_address_123',
    malformedAddress: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY_INVALID',
  };
});

describe('Address Validation', () => {
  describe('validateAddress (SDK-based enhanced validation)', () => {
    test('should validate correct Autonomys addresses with network type', () => {
      const result = validateAddress(testAddresses.validAutonomys);
      expect(result.isValid).toBe(true);
      expect(result.networkType).toBe('autonomys');
      expect(result.error).toBeUndefined();
    });

    test('should validate correct Substrate addresses with network type', () => {
      const result = validateAddress(testAddresses.validSubstrate);
      expect(result.isValid).toBe(true);
      expect(result.networkType).toBe('substrate');
      expect(result.error).toBeUndefined();
    });

    test('should provide detailed error messages for invalid addresses', () => {
      const result = validateAddress(testAddresses.invalidAddress);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid SS58 address format');
      expect(result.networkType).toBeUndefined();
    });

    test('should handle empty and null addresses with specific errors', () => {
      const emptyResult = validateAddress('');
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.error).toBe('Address cannot be empty');

      const nullResult = validateAddress(null as any);
      expect(nullResult.isValid).toBe(false);
      expect(nullResult.error).toBe('Address is required and must be a string');

      const undefinedResult = validateAddress(undefined as any);
      expect(undefinedResult.isValid).toBe(false);
      expect(undefinedResult.error).toBe('Address is required and must be a string');
    });

    test('should handle addresses with whitespace', () => {
      const addressWithSpaces = `  ${testAddresses.validSubstrate}  `;
      const result = validateAddress(addressWithSpaces);
      expect(result.isValid).toBe(true);
      expect(result.networkType).toBe('substrate');
    });

    test('should provide specific error messages for malformed addresses', () => {
      const invalidFormats = [
        '123456789',
        'not_an_address',
        '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQ', // Too short
        '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY123', // Too long
        'OGrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', // Invalid base58 character
      ];

      invalidFormats.forEach(addr => {
        const result = validateAddress(addr);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid SS58 address format');
      });
    });

    test('should handle non-string inputs', () => {
      const result = validateAddress(12345 as any);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Address is required and must be a string');
    });
  });

  describe('isValidAutonomysAddress', () => {
    test('should validate correct Autonomys addresses', () => {
      expect(isValidAutonomysAddress(testAddresses.validAutonomys)).toBe(true);
    });

    test('should validate correct Substrate addresses', () => {
      expect(isValidAutonomysAddress(testAddresses.validSubstrate)).toBe(true);
    });

    test('should reject invalid addresses', () => {
      expect(isValidAutonomysAddress(testAddresses.invalidAddress)).toBe(false);
      expect(isValidAutonomysAddress(testAddresses.malformedAddress)).toBe(false);
    });

    test('should reject empty or null addresses', () => {
      expect(isValidAutonomysAddress('')).toBe(false);
      expect(isValidAutonomysAddress(null as any)).toBe(false);
      expect(isValidAutonomysAddress(undefined as any)).toBe(false);
    });

    test('should handle addresses with whitespace', () => {
      const addressWithSpaces = `  ${testAddresses.validSubstrate}  `;
      expect(isValidAutonomysAddress(addressWithSpaces)).toBe(true);
    });

    test('should reject addresses with wrong format', () => {
      const invalidFormats = [
        '123456789',
        'not_an_address',
        '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQ', // Too short
        '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY123', // Too long
        'OGrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', // Invalid base58 character
      ];

      invalidFormats.forEach(addr => {
        expect(isValidAutonomysAddress(addr)).toBe(false);
      });
    });
  });

  describe('getAddressNetworkInfo', () => {
    test('should identify Autonomys addresses correctly', () => {
      const info = getAddressNetworkInfo(testAddresses.validAutonomys);
      expect(info).toEqual({
        prefix: 6094,
        network: 'Autonomys',
      });
    });

    test('should identify Substrate addresses correctly', () => {
      const info = getAddressNetworkInfo(testAddresses.validSubstrate);
      expect(info).toEqual({
        prefix: 42,
        network: 'Substrate',
      });
    });

    test('should return null for invalid addresses', () => {
      expect(getAddressNetworkInfo(testAddresses.invalidAddress)).toBeNull();
      expect(getAddressNetworkInfo('')).toBeNull();
    });
  });
});

describe('Amount Validation', () => {
  describe('isValidAmount', () => {
    test('should validate correct amounts', () => {
      const validAmounts = ['1', '1.0', '100.5', '0.1', '1000000.123456'];
      validAmounts.forEach(amount => {
        expect(isValidAmount(amount)).toBe(true);
      });
    });

    test('should reject invalid amounts', () => {
      const invalidAmounts = ['', '0', '-1', 'abc', '1.2.3', 'NaN', 'Infinity'];
      invalidAmounts.forEach(amount => {
        expect(isValidAmount(amount)).toBe(false);
      });
    });

    test('should handle amounts with whitespace', () => {
      expect(isValidAmount('  100.5  ')).toBe(true);
    });
  });

  describe('ai3ToShannons (AI3 to Shannon) - from SDK', () => {
    test('should convert amounts to Shannon correctly', () => {
      expect(ai3ToShannons('1')).toBe(1000000000000000000n);
      expect(ai3ToShannons('0.1')).toBe(100000000000000000n);
      expect(ai3ToShannons('100.5')).toBe(100500000000000000000n);
    });

    test('should handle maximum precision (18 decimals)', () => {
      const result = ai3ToShannons('1.123456789012345678');
      expect(result).toBe(1123456789012345678n); // Exact precision with BigInt
    });

    test('should handle very small amounts', () => {
      expect(ai3ToShannons('0.000000000000000001')).toBe(1n); // 1 Shannon
      expect(ai3ToShannons('0.000000000000001')).toBe(1000n); // 1000 Shannon
    });
  });

  describe('Shannon Precision Functions', () => {
    describe('ai3ToShannons', () => {
      test('should convert whole AI3 amounts correctly', () => {
        expect(ai3ToShannons('1')).toBe(1000000000000000000n);
        expect(ai3ToShannons('100')).toBe(100000000000000000000n);
        expect(ai3ToShannons('0')).toBe(0n);
      });

      test('should convert decimal AI3 amounts correctly', () => {
        expect(ai3ToShannons('0.5')).toBe(500000000000000000n);
        expect(ai3ToShannons('1.5')).toBe(1500000000000000000n);
        expect(ai3ToShannons('0.000000000000000001')).toBe(1n); // 1 Shannon
      });

      test('should handle maximum precision (18 decimals)', () => {
        expect(ai3ToShannons('1.123456789012345678')).toBe(1123456789012345678n);
        expect(ai3ToShannons('0.123456789012345678')).toBe(123456789012345678n);
      });

      test('should throw error for too many decimals', () => {
        expect(() => ai3ToShannons('1.1234567890123456789')).toThrow('too many decimal places'); // SDK rejects >18 decimals
      });

      test('should handle whitespace', () => {
        expect(ai3ToShannons('  1.5  ')).toBe(1500000000000000000n);
      });

      test('should throw on invalid format', () => {
        expect(() => ai3ToShannons('abc')).toThrow('invalid numeric string');
        expect(() => ai3ToShannons('1.2.3')).toThrow('invalid numeric string');
        expect(() => ai3ToShannons('1a.5')).toThrow('invalid numeric string');
      });
    });

    describe('shannonsToAi3', () => {
      test('should convert whole Shannon amounts correctly', () => {
        expect(shannonsToAi3(1000000000000000000n)).toBe('1');
        expect(shannonsToAi3(100000000000000000000n)).toBe('100');
        expect(shannonsToAi3(0n)).toBe('0');
      });

      test('should convert fractional Shannon amounts correctly', () => {
        expect(shannonsToAi3(500000000000000000n)).toBe('0.5');
        expect(shannonsToAi3(1500000000000000000n)).toBe('1.5');
        expect(shannonsToAi3(1n)).toBe('0.000000000000000001'); // 1 Shannon
      });

      test('should handle maximum precision', () => {
        expect(shannonsToAi3(1123456789012345678n)).toBe('1.123456789012345678');
        expect(shannonsToAi3(123456789012345678n)).toBe('0.123456789012345678');
      });

      test('should remove trailing zeros', () => {
        expect(shannonsToAi3(1500000000000000000n)).toBe('1.5'); // Not '1.500000000000000000'
        expect(shannonsToAi3(1000000000000000000n)).toBe('1'); // Not '1.000000000000000000'
      });
    });

    describe('shannonsToAi3', () => {
      test('should format Shannon amounts as AI3', () => {
        expect(shannonsToAi3(1000000000000000000n)).toBe('1');
        expect(shannonsToAi3(1500000000000000000n)).toBe('1.5');
        expect(shannonsToAi3(123456789012345678n)).toBe('0.123456789012345678');
      });

      test('should maintain precision for very small amounts', () => {
        expect(shannonsToAi3(1n)).toBe('0.000000000000000001');
        expect(shannonsToAi3(999n)).toBe('0.000000000000000999');
      });
    });

    describe('Round-trip consistency', () => {
      test('should maintain precision in round-trip conversions', () => {
        const testValues = [
          '1',
          '0.5',
          '100.25',
          '0.000000000000000001', // 1 Shannon
          '1.123456789012345678', // Max precision
          '999999.999999999999999999', // Large with max precision
        ];

        testValues.forEach(ai3Value => {
          const shannon = ai3ToShannons(ai3Value);
          const backToAi3 = shannonsToAi3(shannon);
          // Handle truncation for values beyond 18 decimals
          const expectedAi3 =
            ai3Value.includes('.') && ai3Value.split('.')[1].length > 18
              ? ai3Value.split('.')[0] + '.' + ai3Value.split('.')[1].slice(0, 18)
              : ai3Value;
          expect(backToAi3).toBe(expectedAi3);
        });
      });
    });

    describe('Edge cases and limits', () => {
      test('should handle very large amounts', () => {
        const largeAmount = '999999999999999999999'; // Large AI3 amount
        expect(() => ai3ToShannons(largeAmount)).not.toThrow();
        const shannon = ai3ToShannons(largeAmount);
        expect(shannonsToAi3(shannon)).toBe(largeAmount);
      });

      test('should handle zero correctly', () => {
        expect(ai3ToShannons('0')).toBe(0n);
        expect(ai3ToShannons('0.0')).toBe(0n);
        expect(ai3ToShannons('0.000000000000000000')).toBe(0n);
        expect(shannonsToAi3(0n)).toBe('0');
      });
    });
  });
});

describe('CSV Validation', () => {
  let validator: CSVValidator;
  let tempDir: string;

  beforeEach(async () => {
    validator = new CSVValidator(mockLogger);
    tempDir = path.join(__dirname, 'temp');
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    jest.clearAllMocks();
  });

  test('should validate correct CSV file', async () => {
    const csvContent = [
      `${testAddresses.validAutonomys},100.5`,
      `${testAddresses.validSubstrate},250.0`,
    ].join('\n');

    setMockCsvContent(csvContent);
    const result = await validator.validateCSV('mock-file.csv');

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.recordCount).toBe(2);
    expect(result.addressStats?.autonomysCount).toBe(1);
    expect(result.addressStats?.substrateCount).toBe(1);
  });

  test('should detect invalid addresses in CSV', async () => {
    const csvContent = [`${testAddresses.validAutonomys},100.5`, `invalid_address,250.0`].join(
      '\n'
    );

    setMockCsvContent(csvContent);
    const result = await validator.validateCSV('mock-file.csv');

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Line 2: Invalid SS58 address format: invalid_address');
  });

  test('should detect invalid amounts in CSV', async () => {
    const csvContent = [
      `${testAddresses.validAutonomys},100.5`,
      `${testAddresses.validSubstrate},-50`,
    ].join('\n');

    setMockCsvContent(csvContent);
    const result = await validator.validateCSV('mock-file.csv');

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Line 2: Invalid amount format: -50');
  });

  test('should detect duplicate addresses', async () => {
    const csvContent = [
      `${testAddresses.validAutonomys},100.5`,
      `${testAddresses.validAutonomys},250.0`,
    ].join('\n');

    setMockCsvContent(csvContent);
    const result = await validator.validateCSV('mock-file.csv');

    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].address).toBe(testAddresses.validAutonomys);
    expect(result.duplicates[0].indices).toEqual([1, 2]);
  });

  test('should handle empty CSV file', async () => {
    setMockCsvContent('');
    const result = await validator.validateCSV('mock-file.csv');

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('No valid records found in CSV file');
  });

  test('should handle missing CSV file', async () => {
    // Mock pathExists to return false for this test
    (fs.pathExists as jest.Mock).mockResolvedValueOnce(false);

    await expect(validator.validateCSV('nonexistent.csv')).rejects.toThrow(
      'CSV file does not exist'
    );
  });

  test('should warn about large amounts', async () => {
    const csvContent = `${testAddresses.validAutonomys},2000000`;

    setMockCsvContent(csvContent);
    const result = await validator.validateCSV('mock-file.csv');

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain(
      'Line 1: Large amount (2000000) - please verify this is correct'
    );
  });

  test('should warn about very small amounts in Shannon units', async () => {
    const csvContent = `${testAddresses.validAutonomys},0.000000000000000005`; // 5 Shannon

    setMockCsvContent(csvContent);
    const result = await validator.validateCSV('mock-file.csv');

    expect(result.isValid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('Shannon') && w.includes('verify precision'))).toBe(
      true
    );
  });

  test('should warn about amounts below existential deposit', async () => {
    const csvContent = `${testAddresses.validAutonomys},0.0000000000000005`; // 500 Shannon (below ED)

    setMockCsvContent(csvContent);
    const result = await validator.validateCSV('mock-file.csv');

    expect(result.isValid).toBe(true); // Valid but with warnings
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('below existential deposit'))).toBe(true);
  });

  test('should accept amounts at existential deposit threshold', async () => {
    const csvContent = `${testAddresses.validAutonomys},0.000001`; // Exactly ED

    setMockCsvContent(csvContent);
    const result = await validator.validateCSV('mock-file.csv');

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.totalAmount).toBe(1000000000000n); // ED in Shannon
  });

  test('should parse validated CSV correctly', async () => {
    const csvContent = [
      `${testAddresses.validAutonomys},100.5`,
      `${testAddresses.validSubstrate},250.0`,
    ].join('\n');

    setMockCsvContent(csvContent);
    const records = await validator.parseValidatedCSV('mock-file.csv');

    expect(records).toHaveLength(2);
    expect(records[0].address).toBe(testAddresses.validAutonomys);
    expect(records[0].amount).toBe(ai3ToShannons('100.5'));
    expect(records[0].status).toBe('pending');
    expect(records[1].address).toBe(testAddresses.validSubstrate);
    expect(records[1].amount).toBe(ai3ToShannons('250.0'));
  });
});

describe('Individual Record Validation', () => {
  let validator: CSVValidator;

  beforeEach(() => {
    validator = new CSVValidator(mockLogger);
  });

  test('should validate correct individual records', () => {
    const result = validator.validateRecord(testAddresses.validAutonomys, '100.5');
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should reject invalid individual records', () => {
    const result = validator.validateRecord('invalid_address', '-50');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Invalid SS58 address format');
    expect(result.errors).toContain('Invalid amount format');
  });

  test('should handle empty fields in individual validation', () => {
    const result = validator.validateRecord('', '');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Address is required');
    expect(result.errors).toContain('Amount is required');
  });
});
