import fs from 'fs-extra';
import csv from 'csv-parser';
import Joi from 'joi';
import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import { isAddress } from '@autonomys/auto-utils';
import { DistributionRecord, ValidationResult } from '../types';
import Logger from './logger';

export class ValidationError extends Error {
  constructor(
    message: string,
    public _details: string[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Address validation using Autonomys SDK
 */
interface AddressValidationResult {
  isValid: boolean;
  networkType?: 'autonomys' | 'substrate';
  error?: string;
}

/**
 * Primary address validation function using Autonomys SDK
 * Validates both Autonomys (prefix 6094, "su") and Substrate (prefix 42, "5") addresses
 * This is the centralized function for all address validation in the application
 */
function validateAddress(address: string): AddressValidationResult {
  if (address === null || address === undefined || typeof address !== 'string') {
    return { isValid: false, error: 'Address is required and must be a string' };
  }

  // Trim whitespace
  address = address.trim();

  if (address.length === 0) {
    return { isValid: false, error: 'Address cannot be empty' };
  }

  try {
    // Use Autonomys SDK for primary validation - it handles both formats
    const isValidFormat = isAddress(address);
    
    if (!isValidFormat) {
      return { isValid: false, error: 'Invalid SS58 address format' };
    }

    // Determine network type for informational purposes
    const networkInfo = getAddressNetworkInfo(address);
    
    return { 
      isValid: true, 
      networkType: networkInfo?.network.toLowerCase() as 'autonomys' | 'substrate'
    };
  } catch (error) {
    return { 
      isValid: false, 
      error: `Address validation failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

/**
 * Simple boolean validation function for backward compatibility
 * Uses the enhanced validateAddress function internally
 */
function isValidAutonomysAddress(address: string): boolean {
  const result = validateAddress(address);
  return result.isValid;
}

// Get address network prefix for informational purposes
function getAddressNetworkInfo(address: string): { prefix: number; network: string } | null {
  try {
    const decoded = decodeAddress(address);

    // Check which prefix matches
    if (encodeAddress(decoded, 6094) === address) {
      return { prefix: 6094, network: 'Autonomys' };
    } else if (encodeAddress(decoded, 42) === address) {
      return { prefix: 42, network: 'Substrate' };
    }

    return null;
  } catch (error) {
    return null;
  }
}

function isValidAmount(amount: string): boolean {
  if (!amount || typeof amount !== 'string') {
    return false;
  }

  amount = amount.trim();

  // Check if it's a valid decimal number
  const numberRegex = /^\d+(\.\d+)?$/;
  if (!numberRegex.test(amount)) {
    return false;
  }

  // Validate that it represents a positive number
  // Check for zero (all zeros with optional decimal point and trailing zeros)
  if (/^0+(\.0+)?$/.test(amount)) {
    return false; // Zero is not valid
  }
  
  // For valid non-zero numbers, the regex already ensures it's a valid decimal format
  return true;
}

/**
 * Shannon utility functions for Autonomys AI3 token precision
 * 1 AI3 = 10^18 Shannon (similar to how 1 ETH = 10^18 wei)
 */

// Constants for Shannon precision
const SHANNON_DECIMALS = 18;
const SHANNON_MULTIPLIER = BigInt(10) ** BigInt(SHANNON_DECIMALS);

/**
 * Convert AI3 amount (decimal string) to Shannon (smallest unit)
 * @param ai3Amount - Amount in AI3 (e.g., "1.5" or "0.000000000000000001")
 * @returns Shannon amount as bigint
 */
function ai3ToShannon(ai3Amount: string): bigint {
  const trimmed = ai3Amount.trim();
  
  // Validate format - must be a valid decimal number (no scientific notation)
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid AI3 amount format: ${ai3Amount}`);
  }
  
  // Handle decimal places by splitting on decimal point
  const [wholePart = '0', decimalPart = ''] = trimmed.split('.');
  
  // Pad or truncate decimal part to exactly 18 digits
  const paddedDecimal = decimalPart.padEnd(SHANNON_DECIMALS, '0').slice(0, SHANNON_DECIMALS);
  
  // Convert to BigInt Shannon
  const wholeShannon = BigInt(wholePart) * SHANNON_MULTIPLIER;
  const decimalShannon = BigInt(paddedDecimal);
  
  return wholeShannon + decimalShannon;
}

/**
 * Convert Shannon amount to AI3 (decimal format)
 * @param shannonAmount - Amount in Shannon (smallest units)
 * @returns AI3 amount as decimal string
 */
function shannonToAi3(shannonAmount: bigint): string {
  const shannon = shannonAmount;
  const wholePart = shannon / SHANNON_MULTIPLIER;
  const decimalPart = shannon % SHANNON_MULTIPLIER;
  
  if (decimalPart === 0n) {
    return wholePart.toString();
  }
  
  // Format decimal part with trailing zeros removed
  const decimalStr = decimalPart.toString().padStart(SHANNON_DECIMALS, '0');
  const trimmedDecimal = decimalStr.replace(/0+$/, '');
  
  return `${wholePart.toString()}.${trimmedDecimal}`;
}

/**
 * Normalize amount from AI3 to Shannon for internal processing
 * @param amount - AI3 amount as string
 * @returns Shannon amount as bigint
 */
function normalizeAmount(amount: string): bigint {
  return ai3ToShannon(amount);
}

/**
 * Format Shannon amount back to human-readable AI3
 * @param shannonAmount - Shannon amount as bigint
 * @returns Formatted AI3 amount
 */
function formatAi3Amount(shannonAmount: bigint): string {
  return shannonToAi3(shannonAmount);
}

/**
 * Convert Shannon bigint to string for Auto SDK transfer function
 * @param shannonAmount - Shannon amount as bigint
 * @returns Shannon amount as string for Auto SDK
 */
function shannonToString(shannonAmount: bigint): string {
  return shannonAmount.toString();
}

export class CSVValidator {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async validateCSV(filePath: string): Promise<ValidationResult> {
    this.logger.info('Starting CSV validation', { filePath });

    if (!(await fs.pathExists(filePath))) {
      throw new ValidationError('CSV file does not exist', [filePath]);
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const records: DistributionRecord[] = [];
    const addressMap = new Map<string, number[]>();
    let totalAmountShannon = BigInt(0);
    let currentLineNumber = 0;
    let autonomysCount = 0;
    let substrateCount = 0;

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath).pipe(
        csv({
          headers: ['address', 'amount'],
        })
      );

      stream.on('data', (row: any) => {
        currentLineNumber++;

        try {
          const address = row.address?.trim();
          const amount = row.amount?.trim();

          // Validate required fields
          if (!address) {
            errors.push(`Line ${currentLineNumber}: Address is required`);
            return;
          }

          if (!amount) {
            errors.push(`Line ${currentLineNumber}: Amount is required`);
            return;
          }

          // Validate address format with detailed validation
          if (!isValidAutonomysAddress(address)) {
            errors.push(`Line ${currentLineNumber}: Invalid SS58 address format: ${address}`);
            return;
          }

          // Get network info and track address types
          const networkInfo = getAddressNetworkInfo(address);
          if (networkInfo) {
            if (networkInfo.network === 'Autonomys') {
              autonomysCount++;
            } else if (networkInfo.network === 'Substrate') {
              substrateCount++;
            }
          }

          // Validate amount format
          if (!isValidAmount(amount)) {
            errors.push(`Line ${currentLineNumber}: Invalid amount format: ${amount}`);
            return;
          }

          // Convert to Shannon for precise arithmetic
          const shannonAmount = normalizeAmount(amount);

          // Check for very small amounts (less than 1000 Shannon)
          if (shannonAmount < 1000n) {
            warnings.push(
              `Line ${currentLineNumber}: Very small amount (${amount} AI3 = ${shannonAmount} Shannon) - verify precision`
            );
          }

          // Check for very large amounts (> 1M AI3 in Shannon)
          const millionAI3InShannon = normalizeAmount('1000000');
          if (shannonAmount > millionAI3InShannon) {
            warnings.push(
              `Line ${currentLineNumber}: Large amount (${amount}) - please verify this is correct`
            );
          }

          // Track duplicate addresses
          if (addressMap.has(address)) {
            addressMap.get(address)!.push(currentLineNumber);
          } else {
            addressMap.set(address, [currentLineNumber]);
          }

          // Add to records
          records.push({
            address,
            amount: shannonAmount,
            status: 'pending',
          });

          totalAmountShannon += shannonAmount;
        } catch (error) {
          errors.push(`Line ${currentLineNumber}: Parsing error - ${error}`);
        }
      });

      stream.on('end', () => {
        // Check for duplicate addresses
        const duplicates: { address: string; indices: number[] }[] = [];
        for (const [address, indices] of addressMap.entries()) {
          if (indices.length > 1) {
            duplicates.push({ address, indices });
            warnings.push(`Duplicate address found: ${address} on lines ${indices.join(', ')}`);
          }
        }

        // Additional validations
        if (records.length === 0) {
          errors.push('No valid records found in CSV file');
        }

        if (totalAmountShannon === 0n) {
          errors.push('Total distribution amount is zero');
        }

        const result: ValidationResult = {
          isValid: errors.length === 0,
          errors,
          warnings,
          duplicates,
          totalAmount: totalAmountShannon,
          recordCount: records.length,
          addressStats: {
            autonomysCount,
            substrateCount,
          },
        };

        this.logger.logValidationResults(result);

        if (result.isValid) {
          this.logger.info('CSV validation passed', {
            recordCount: result.recordCount,
            totalAmount: totalAmountShannon,
            warningCount: warnings.length,
          });
        } else {
          this.logger.error('CSV validation failed', {
            errorCount: errors.length,
            errors: errors.slice(0, 10), // Log first 10 errors
          });
        }

        resolve(result);
      });

      stream.on('error', error => {
        this.logger.error('Error reading CSV file', error);
        reject(new ValidationError('Failed to read CSV file', [error.message]));
      });
    });
  }

  async parseValidatedCSV(filePath: string): Promise<DistributionRecord[]> {
    this.logger.info('Parsing validated CSV file', { filePath });

    const records: DistributionRecord[] = [];

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath).pipe(
        csv({
          headers: ['address', 'amount'],
        })
      );

      stream.on('data', (row: any) => {
        const address = row.address?.trim();
        const amount = row.amount?.trim();

        if (address && amount && isValidAutonomysAddress(address) && isValidAmount(amount)) {
          records.push({
            address,
            amount: normalizeAmount(amount),
            status: 'pending',
          });
        }
      });

      stream.on('end', () => {
        this.logger.info('CSV parsing completed', { recordCount: records.length });
        resolve(records);
      });

      stream.on('error', error => {
        this.logger.error('Error parsing CSV file', error);
        reject(error);
      });
    });
  }

  // Validate individual record (useful for interactive corrections)
  validateRecord(address: string, amount: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!address?.trim()) {
      errors.push('Address is required');
    } else {
      const addressValidation = validateAddress(address.trim());
      if (!addressValidation.isValid) {
        errors.push(addressValidation.error || 'Invalid address format');
      }
    }

    if (!amount?.trim()) {
      errors.push('Amount is required');
    } else if (!isValidAmount(amount.trim())) {
      errors.push('Invalid amount format');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// Schema for validating distribution configuration
export const distributionConfigSchema = Joi.object({
  csvFilePath: Joi.string().required(),
  dryRun: Joi.boolean().default(false),
  batchSize: Joi.number().integer().min(1).max(100).default(10),
  confirmationBlocks: Joi.number().integer().min(1).max(100).default(2),
});

export { 
  validateAddress, 
  isValidAutonomysAddress, 
  isValidAmount, 
  normalizeAmount, 
  ai3ToShannon,
  shannonToAi3,
  formatAi3Amount,
  shannonToString,
  getAddressNetworkInfo, 
  AddressValidationResult 
};
