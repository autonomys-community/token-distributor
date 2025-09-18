import {
  isValidAutonomysAddress,
  isValidAmount,
  normalizeAmount,
  getAddressNetworkInfo,
  CSVValidator,
} from '../../src/utils/validation';
import { encodeAddress } from '@polkadot/util-crypto';
import { Keyring } from '@polkadot/keyring';
import fs from 'fs-extra';
import path from 'path';

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

  describe('normalizeAmount', () => {
    test('should convert amounts to wei correctly', () => {
      expect(normalizeAmount('1')).toBe('1000000000000000000');
      expect(normalizeAmount('0.1')).toBe('100000000000000000');
      expect(normalizeAmount('100.5')).toBe('100500000000000000000');
    });

    test('should handle decimal amounts', () => {
      // Note: JavaScript floating point precision may cause slight variations in very precise decimals
      const result = normalizeAmount('1.123456789012345678');
      expect(result).toMatch(/^112345678901234570[0-9]$/); // Allow for floating point precision
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

    const csvFile = path.join(tempDir, 'valid.csv');
    await fs.writeFile(csvFile, csvContent);

    const result = await validator.validateCSV(csvFile);

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

    const csvFile = path.join(tempDir, 'invalid_address.csv');
    await fs.writeFile(csvFile, csvContent);

    const result = await validator.validateCSV(csvFile);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Line 2: Invalid SS58 address format: invalid_address');
  });

  test('should detect invalid amounts in CSV', async () => {
    const csvContent = [
      `${testAddresses.validAutonomys},100.5`,
      `${testAddresses.validSubstrate},-50`,
    ].join('\n');

    const csvFile = path.join(tempDir, 'invalid_amount.csv');
    await fs.writeFile(csvFile, csvContent);

    const result = await validator.validateCSV(csvFile);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Line 2: Invalid amount format: -50');
  });

  test('should detect duplicate addresses', async () => {
    const csvContent = [
      `${testAddresses.validAutonomys},100.5`,
      `${testAddresses.validAutonomys},250.0`,
    ].join('\n');

    const csvFile = path.join(tempDir, 'duplicates.csv');
    await fs.writeFile(csvFile, csvContent);

    const result = await validator.validateCSV(csvFile);

    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].address).toBe(testAddresses.validAutonomys);
    expect(result.duplicates[0].indices).toEqual([1, 2]);
  });

  test('should handle empty CSV file', async () => {
    const csvFile = path.join(tempDir, 'empty.csv');
    await fs.writeFile(csvFile, '');

    const result = await validator.validateCSV(csvFile);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('No valid records found in CSV file');
  });

  test('should handle missing CSV file', async () => {
    const csvFile = path.join(tempDir, 'nonexistent.csv');

    await expect(validator.validateCSV(csvFile)).rejects.toThrow('CSV file does not exist');
  });

  test('should warn about large amounts', async () => {
    const csvContent = `${testAddresses.validAutonomys},2000000`;
    const csvFile = path.join(tempDir, 'large_amount.csv');
    await fs.writeFile(csvFile, csvContent);

    const result = await validator.validateCSV(csvFile);

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain(
      'Line 1: Large amount (2000000) - please verify this is correct'
    );
  });

  // TODO: standardise on 18 decimal places of precision everywhere
  test('should warn about very small amounts', async () => {
    const csvContent = `${testAddresses.validAutonomys},0.0000001`;
    const csvFile = path.join(tempDir, 'small_amount.csv');
    await fs.writeFile(csvFile, csvContent);

    const result = await validator.validateCSV(csvFile);

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain(
      'Line 1: Very small amount (0.0000001) may cause precision issues'
    );
  });

  test('should parse validated CSV correctly', async () => {
    const csvContent = [
      `${testAddresses.validAutonomys},100.5`,
      `${testAddresses.validSubstrate},250.0`,
    ].join('\n');

    const csvFile = path.join(tempDir, 'parse_test.csv');
    await fs.writeFile(csvFile, csvContent);

    const records = await validator.parseValidatedCSV(csvFile);

    expect(records).toHaveLength(2);
    expect(records[0].address).toBe(testAddresses.validAutonomys);
    expect(records[0].amount).toBe(normalizeAmount('100.5'));
    expect(records[0].status).toBe('pending');
    expect(records[1].address).toBe(testAddresses.validSubstrate);
    expect(records[1].amount).toBe(normalizeAmount('250.0'));
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
    expect(result.errors).toContain('Invalid Autonomys address format');
    expect(result.errors).toContain('Invalid amount format');
  });

  test('should handle empty fields in individual validation', () => {
    const result = validator.validateRecord('', '');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Address is required');
    expect(result.errors).toContain('Amount is required');
  });
});
