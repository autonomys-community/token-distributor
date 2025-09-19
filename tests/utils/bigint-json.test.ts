import {
  stringifyWithBigInt,
  parseWithBigInt,
  convertDistributionStringsToBigInt,
  bigIntReplacer
} from '../../src/utils/bigint-json';

describe('BigInt JSON Utilities', () => {
  describe('stringifyWithBigInt', () => {
    test('should serialize BigInt values as strings', () => {
      const obj = {
        normalValue: 123,
        bigIntValue: BigInt('123456789012345678901234567890'),
        nested: {
          anotherBigInt: BigInt('987654321')
        }
      };

      const result = stringifyWithBigInt(obj);
      const parsed = JSON.parse(result);

      expect(parsed.normalValue).toBe(123);
      expect(parsed.bigIntValue).toBe('123456789012345678901234567890');
      expect(parsed.nested.anotherBigInt).toBe('987654321');
    });

    test('should handle arrays with BigInt values', () => {
      const arr = [
        { amount: BigInt('1000000000000000000') },
        { amount: BigInt('2000000000000000000') }
      ];

      const result = stringifyWithBigInt(arr);
      const parsed = JSON.parse(result);

      expect(parsed[0].amount).toBe('1000000000000000000');
      expect(parsed[1].amount).toBe('2000000000000000000');
    });

    test('should format with proper spacing', () => {
      const obj = { bigIntValue: BigInt('123') };
      
      const result = stringifyWithBigInt(obj, 2);
      
      expect(result).toContain('\n');
      expect(result).toContain('  ');
    });
  });

  describe('bigIntReplacer', () => {
    test('should convert BigInt to string', () => {
      expect(bigIntReplacer('key', BigInt('123'))).toBe('123');
    });

    test('should leave other values unchanged', () => {
      expect(bigIntReplacer('key', 123)).toBe(123);
      expect(bigIntReplacer('key', 'string')).toBe('string');
      expect(bigIntReplacer('key', null)).toBe(null);
      expect(bigIntReplacer('key', { nested: 'object' })).toEqual({ nested: 'object' });
    });
  });

  describe('convertDistributionStringsToBigInt', () => {
    test('should convert record amounts from string to BigInt', () => {
      const record = {
        address: 'test-address',
        amount: '1000000000000000000',
        status: 'pending'
      };

      convertDistributionStringsToBigInt(record);

      expect(record.amount).toBe(BigInt('1000000000000000000'));
      expect(typeof record.amount).toBe('bigint');
    });

    test('should convert summary amounts from string to BigInt', () => {
      const summary = {
        totalRecords: 5,
        completed: 0,
        failed: 0,
        skipped: 0,
        totalAmount: '5000000000000000000',
        distributedAmount: '0',
        failedAmount: '0',
        startTime: new Date()
      };

      convertDistributionStringsToBigInt(summary);

      expect(summary.totalAmount).toBe(BigInt('5000000000000000000'));
      expect(summary.distributedAmount).toBe(BigInt('0'));
      expect(summary.failedAmount).toBe(BigInt('0'));
    });

    test('should handle arrays of records', () => {
      const records = [
        { address: 'addr1', amount: '1000000000000000000', status: 'pending' },
        { address: 'addr2', amount: '2000000000000000000', status: 'pending' }
      ];

      convertDistributionStringsToBigInt(records);

      expect(records[0].amount).toBe(BigInt('1000000000000000000'));
      expect(records[1].amount).toBe(BigInt('2000000000000000000'));
    });

    test('should handle nested distribution data structure', () => {
      const resumeData = {
        records: [
          { address: 'addr1', amount: '1000000000000000000', status: 'pending' }
        ],
        summary: {
          totalRecords: 1,
          completed: 0,
          failed: 0,
          skipped: 0,
          totalAmount: '1000000000000000000',
          distributedAmount: '0',
          failedAmount: '0',
          startTime: new Date()
        },
        lastProcessedIndex: 0,
        timestamp: new Date()
      };

      convertDistributionStringsToBigInt(resumeData);

      expect(resumeData.records[0].amount).toBe(BigInt('1000000000000000000'));
      expect(resumeData.summary.totalAmount).toBe(BigInt('1000000000000000000'));
      expect(resumeData.summary.distributedAmount).toBe(BigInt('0'));
      expect(resumeData.summary.failedAmount).toBe(BigInt('0'));
    });

    test('should leave non-string values unchanged', () => {
      const record = {
        address: 'test-address',
        amount: BigInt('1000000000000000000'), // Already BigInt
        status: 'pending'
      };

      convertDistributionStringsToBigInt(record);

      expect(record.amount).toBe(BigInt('1000000000000000000'));
      expect(typeof record.amount).toBe('bigint');
    });
  });

  describe('parseWithBigInt', () => {
    test('should parse JSON normally', () => {
      const jsonString = '{"value": 123, "text": "hello"}';
      const result = parseWithBigInt(jsonString);

      expect(result.value).toBe(123);
      expect(result.text).toBe('hello');
    });
  });

  describe('round-trip serialization', () => {
    test('should maintain BigInt values through serialize/deserialize cycle', () => {
      const original = {
        records: [
          { address: 'addr1', amount: BigInt('1000000000000000000'), status: 'pending' }
        ],
        summary: {
          totalAmount: BigInt('1000000000000000000'),
          distributedAmount: BigInt('500000000000000000'),
          failedAmount: BigInt('0')
        }
      };

      // Serialize
      const serialized = stringifyWithBigInt(original);
      
      // Parse back
      const parsed = parseWithBigInt(serialized);
      
      // Convert strings back to BigInt
      convertDistributionStringsToBigInt(parsed);

      expect(parsed.records[0].amount).toBe(BigInt('1000000000000000000'));
      expect(parsed.summary.totalAmount).toBe(BigInt('1000000000000000000'));
      expect(parsed.summary.distributedAmount).toBe(BigInt('500000000000000000'));
      expect(parsed.summary.failedAmount).toBe(BigInt('0'));
    });
  });
});
