import fs from 'fs-extra';
import csv from 'csv-parser';
import Joi from 'joi';
import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';
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

// TODO: ensure we're using this function for all address validation
// Address validation for both Autonomys and Substrate formats using proper SS58 decoding
function isValidAutonomysAddress(address: string): boolean {
  // Validates SS58 addresses for both Autonomys (prefix 6094) and Substrate (prefix 42)
  if (!address || typeof address !== 'string') {
    return false;
  }

  // Remove whitespace
  address = address.trim();

  try {
    // Use Polkadot's decodeAddress to validate the address format
    const decoded = decodeAddress(address);

    // Try to encode with both prefixes to validate the address works with supported networks
    const autonomysReEncoded = encodeAddress(decoded, 6094); // Autonomys prefix
    const substrateReEncoded = encodeAddress(decoded, 42); // Standard Substrate prefix

    // Check if the address matches either format
    const isValidAutonomys = autonomysReEncoded === address;
    const isValidSubstrate = substrateReEncoded === address;

    return isValidAutonomys || isValidSubstrate;
  } catch (error) {
    // If decoding fails, the address is invalid
    return false;
  }
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

  const num = parseFloat(amount);
  return num > 0 && !isNaN(num) && isFinite(num);
}

function normalizeAmount(amount: string): string {
  // Convert to wei-like units (18 decimals for Autonomys)
  const num = parseFloat(amount.trim());
  const weiAmount = num * Math.pow(10, 18);
  return weiAmount.toString();
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
    let totalAmount = 0;
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

          const amountNumber = parseFloat(amount);

          // Check for very small amounts that might cause issues
          if (amountNumber < 0.000001) {
            warnings.push(
              `Line ${currentLineNumber}: Very small amount (${amount}) may cause precision issues`
            );
          }

          // Check for very large amounts
          if (amountNumber > 1000000) {
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
            amount: normalizeAmount(amount),
            status: 'pending',
          });

          totalAmount += amountNumber;
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

        if (totalAmount === 0) {
          errors.push('Total distribution amount is zero');
        }

        const result: ValidationResult = {
          isValid: errors.length === 0,
          errors,
          warnings,
          duplicates,
          totalAmount: normalizeAmount(totalAmount.toString()),
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
            totalAmount: totalAmount.toString(),
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
    } else if (!isValidAutonomysAddress(address.trim())) {
      errors.push('Invalid Autonomys address format');
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

export { isValidAutonomysAddress, isValidAmount, normalizeAmount, getAddressNetworkInfo };
