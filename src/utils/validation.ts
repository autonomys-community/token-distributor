import fs from 'fs-extra';
import csv from 'csv-parser';
import Joi from 'joi';
import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import { isAddress, ai3ToShannons, shannonsToAi3 } from '@autonomys/auto-utils';
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
      networkType: networkInfo?.network.toLowerCase() as 'autonomys' | 'substrate',
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Address validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

// TODO: This will be in the SDK soon.
/**
 * Check if amount is below existential deposit threshold
 * Note: Amounts below ED may fail for new accounts or accounts with insufficient balance,
 * but are valid for existing accounts with sufficient balance or contracts
 * @param amount - Amount in AI3 as string
 * @returns true if amount meets ED requirement
 */
function meetsExistentialDeposit(amount: string): boolean {
    return ai3ToShannons(amount) >= EXISTENTIAL_DEPOSIT_SHANNON;
}

// Existential Deposit: 0.000001 AI3 = 1,000,000,000,000 Shannon
const EXISTENTIAL_DEPOSIT_SHANNON = BigInt(1000000000000);

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

          // Warn about amounts below existential deposit
          if (!meetsExistentialDeposit(amount)) {
            warnings.push(
              `Line ${currentLineNumber}: Amount ${amount} AI3 is below existential deposit (${shannonsToAi3(EXISTENTIAL_DEPOSIT_SHANNON)} AI3). This may fail for new accounts or accounts with insufficient balance.`
            );
          }

          // Convert to Shannon for precise arithmetic
          const shannonAmount = ai3ToShannons(amount);

          // Check for very small amounts (less than 1000 Shannon)
          if (shannonAmount < 1000n) {
            warnings.push(
              `Line ${currentLineNumber}: Very small amount (${amount} AI3 = ${shannonAmount} Shannon) - verify precision`
            );
          }

          // Check for very large amounts (> 1M AI3 in Shannon)
          const millionAI3InShannon = ai3ToShannons('1000000');
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
    let currentRowNumber = 0;

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath).pipe(
        csv({
          headers: ['address', 'amount'],
        })
      );

      stream.on('data', (row: any) => {
        currentRowNumber++;
        const address = row.address?.trim();
        const amount = row.amount?.trim();

        if (address && amount && isValidAutonomysAddress(address) && isValidAmount(amount)) {
          records.push({
            address,
            amount: ai3ToShannons(amount),
            status: 'pending',
            sourceRowNumber: currentRowNumber,
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
  getAddressNetworkInfo,
  AddressValidationResult,
  meetsExistentialDeposit,
};
