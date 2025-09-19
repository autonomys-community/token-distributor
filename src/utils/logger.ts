import winston from 'winston';
import path from 'path';
import fs from 'fs-extra';
import { AppConfig } from '../types';

class Logger {
  private winston!: winston.Logger;
  private logDir: string;

  constructor(config: AppConfig) {
    this.logDir = path.join(process.cwd(), 'logs');
    this.setupLogger(config);
  }

  private setupLogger(config: AppConfig): void {
    // Ensure logs directory exists synchronously if needed
    if (config.logToFile) {
      try {
        fs.ensureDirSync(this.logDir);
      } catch (error) {
        console.warn(`Warning: Could not create logs directory: ${error}`);
        // Fall back to console-only logging
        config = { ...config, logToFile: false };
      }
    }

    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
          })
        ),
      }),
    ];

    if (config.logToFile) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      // General application log
      transports.push(
        new winston.transports.File({
          filename: path.join(this.logDir, `distribution-${timestamp}.log`),
          format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        })
      );

      // Transaction-specific log for easier analysis
      transports.push(
        new winston.transports.File({
          filename: path.join(this.logDir, `transactions-${timestamp}.log`),
          level: 'info',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
            winston.format(info => {
              // Only log transaction-related entries
              if (info.transaction || info.distribution || info.summary) {
                return info;
              }
              return false;
            })()
          ),
        })
      );

      // Error log
      transports.push(
        new winston.transports.File({
          filename: path.join(this.logDir, `errors-${timestamp}.log`),
          level: 'error',
          format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        })
      );
    }

    this.winston = winston.createLogger({
      level: config.logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports,
    });
  }

  info(message: string, meta?: any): void {
    this.winston.info(message, meta);
  }

  error(message: string, error?: Error | any): void {
    if (error) {
      this.winston.error(message, { 
        error: error?.message || error, 
        stack: error?.stack 
      });
    } else {
      this.winston.error(message);
    }
  }

  warn(message: string, meta?: any): void {
    this.winston.warn(message, meta);
  }

  debug(message: string, meta?: any): void {
    this.winston.debug(message, meta);
  }

  verbose(message: string, meta?: any): void {
    this.winston.verbose(message, meta);
  }

  // Specialized logging methods for distribution events
  logTransactionStart(address: string, amount: bigint, index: number): void {
    this.info('Starting transaction', {
      transaction: {
        address,
        amount: amount.toString(),
        index,
        status: 'starting',
        timestamp: new Date().toISOString(),
      },
    });
  }

  logTransactionSuccess(
    address: string,
    amount: bigint,
    transactionHash: string,
    blockNumber?: number,
    blockHash?: string
  ): void {
    this.info('Transaction successful', {
      transaction: {
        address,
        amount: amount.toString(),
        transactionHash,
        blockNumber,
        blockHash,
        status: 'success',
        timestamp: new Date().toISOString(),
      },
    });
  }

  logTransactionFailure(address: string, amount: bigint, error: string, attempt: number): void {
    this.error('Transaction failed', {
      transaction: {
        address,
        amount: amount.toString(),
        error,
        attempt,
        status: 'failed',
        timestamp: new Date().toISOString(),
      },
    });
  }

  logDistributionStart(totalRecords: number, totalAmount: bigint): void {
    this.info('Distribution started', {
      distribution: {
        totalRecords,
        totalAmount: totalAmount.toString(),
        status: 'started',
        timestamp: new Date().toISOString(),
      },
    });
  }

  logDistributionComplete(summary: any): void {
    this.info('Distribution completed', {
      summary: {
        ...summary,
        status: 'completed',
        timestamp: new Date().toISOString(),
      },
    });
  }

  logDistributionPaused(lastProcessedIndex: number, reason: string): void {
    this.warn('Distribution paused', {
      distribution: {
        lastProcessedIndex,
        reason,
        status: 'paused',
        timestamp: new Date().toISOString(),
      },
    });
  }

  logDistributionResumed(fromIndex: number): void {
    this.info('Distribution resumed', {
      distribution: {
        fromIndex,
        status: 'resumed',
        timestamp: new Date().toISOString(),
      },
    });
  }

  logValidationResults(results: any): void {
    this.info('CSV validation completed', {
      validation: {
        ...results,
        timestamp: new Date().toISOString(),
      },
    });
  }

  logNetworkConnection(network: string, endpoint: string): void {
    this.info('Connected to network', {
      network: {
        name: network,
        endpoint,
        timestamp: new Date().toISOString(),
      },
    });
  }

  logAccountInfo(address: string, balance: string): void {
    this.info('Distributor account info', {
      account: {
        address,
        balance,
        timestamp: new Date().toISOString(),
      },
    });
  }

  getLogDir(): string {
    return this.logDir;
  }
}

export default Logger;
