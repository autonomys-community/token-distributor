/**
 * Utility functions for handling BigInt serialization/deserialization in JSON
 * This centralizes BigInt handling across the application
 */

/**
 * BigInt-aware JSON stringifier
 * Converts BigInt values to strings during serialization
 */
export function stringifyWithBigInt(obj: any, space?: number): string {
  return JSON.stringify(obj, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value, space);
}

/**
 * BigInt-aware JSON parser
 * This is a placeholder for potential future BigInt parsing needs
 * Currently, we handle BigInt conversion manually in specific contexts
 */
export function parseWithBigInt(jsonString: string): any {
  return JSON.parse(jsonString);
}

/**
 * Convert string representations back to BigInt in distribution-related objects
 * This handles the specific structure of our distribution data
 */
export function convertDistributionStringsToBigInt(obj: any): void {
  // Handle arrays of records
  if (Array.isArray(obj)) {
    obj.forEach(item => convertDistributionStringsToBigInt(item));
    return;
  }

  // Handle objects
  if (obj && typeof obj === 'object') {
    // Convert record amounts
    if (obj.amount && typeof obj.amount === 'string') {
      obj.amount = BigInt(obj.amount);
    }

    // Convert summary amounts
    if (obj.totalAmount && typeof obj.totalAmount === 'string') {
      obj.totalAmount = BigInt(obj.totalAmount);
    }
    if (obj.distributedAmount && typeof obj.distributedAmount === 'string') {
      obj.distributedAmount = BigInt(obj.distributedAmount);
    }
    if (obj.failedAmount && typeof obj.failedAmount === 'string') {
      obj.failedAmount = BigInt(obj.failedAmount);
    }

    // Recursively handle nested objects
    Object.values(obj).forEach(value => {
      if (value && typeof value === 'object') {
        convertDistributionStringsToBigInt(value);
      }
    });
  }
}

/**
 * BigInt replacer function for JSON.stringify
 * Can be used directly with JSON.stringify as the replacer parameter
 */
export const bigIntReplacer = (key: string, value: any): any =>
  typeof value === 'bigint' ? value.toString() : value;
