import fs from 'fs-extra';
import path from 'path';
import { DistributionRecord } from '../types';
import { shannonsToAi3 } from '@autonomys/auto-utils';

export class CSVTransactionLogger {
  private logFilePath: string;
  private isInitialized: boolean = false;

  constructor(sourceFilename: string) {
    // Extract base name from source file path
    const baseName = path.basename(sourceFilename, path.extname(sourceFilename));
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFileName = `${baseName}-transactions-${timestamp}.csv`;

    this.logFilePath = path.join('logs', logFileName);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Ensure logs directory exists
    await fs.ensureDir(path.dirname(this.logFilePath));

    // Write CSV header
    const header = 'SourceFileRowNumber,Address,Amount,Status,TransactionHash\n';
    await fs.writeFile(this.logFilePath, header);

    this.isInitialized = true;
  }

  async logTransaction(record: DistributionRecord): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('CSV logger not initialized. Call initialize() first.');
    }

    const rowNumber = record.sourceRowNumber || 0;
    const amount = shannonsToAi3(record.amount);
    const transactionHash = record.transactionHash || '';

    // Escape any commas or quotes in the data
    const address = this.escapeCSVField(record.address);
    const status = this.escapeCSVField(record.status);
    const hash = this.escapeCSVField(transactionHash);

    const csvLine = `${rowNumber},${address},${amount},${status},${hash}\n`;

    // Append to file
    await fs.appendFile(this.logFilePath, csvLine);
  }

  private escapeCSVField(field: string): string {
    // If field contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  getLogFilePath(): string {
    return this.logFilePath;
  }
}
