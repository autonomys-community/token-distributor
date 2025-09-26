import fs from 'fs-extra';
import path from 'path';
import { DistributionRecord } from '../types';
import { shannonsToAi3 } from '@autonomys/auto-utils';

// Explorer base URLs for different networks
const EXPLORER_URLS = {
  mainnet: 'https://autonomys.subscan.io',
  chronos: 'https://autonomys-chronos.subscan.io'
} as const;

type NetworkName = keyof typeof EXPLORER_URLS;

export class CSVTransactionLogger {
  private logFilePath: string;
  private isInitialized: boolean = false;
  private networkName: string;

  constructor(sourceFilename: string, networkName: string) {
    this.networkName = networkName.toLowerCase();
    
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
    const header = 'SourceFileRowNumber,Address,Amount,Status,TransactionHash,ExplorerLink\n';
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
    const explorerLink = this.generateExplorerLink(transactionHash);

    // Escape any commas or quotes in the data
    const address = this.escapeCSVField(record.address);
    const status = this.escapeCSVField(record.status);
    const hash = this.escapeCSVField(transactionHash);
    const link = this.escapeCSVField(explorerLink);

    const csvLine = `${rowNumber},${address},${amount},${status},${hash},${link}\n`;

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

  /**
   * Generate explorer link for a transaction hash
   * @param transactionHash - The transaction hash
   * @returns Explorer URL or empty string if no hash or unsupported network
   */
  private generateExplorerLink(transactionHash: string): string {
    if (!transactionHash || transactionHash === 'unknown') {
      return '';
    }

    const networkKey = this.networkName as NetworkName;
    const baseUrl = EXPLORER_URLS[networkKey];
    
    if (!baseUrl) {
      // Return empty string for unsupported networks rather than throwing
      return '';
    }

    return `${baseUrl}/extrinsic/${transactionHash}`;
  }

  getLogFilePath(): string {
    return this.logFilePath;
  }
}
