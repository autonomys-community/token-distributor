import { activate, signAndSendTx, disconnect } from '@autonomys/auto-utils';
import { transfer, account as getAccount, balance } from '@autonomys/auto-consensus';
import { ApiPromise } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { KeyringPair } from '@polkadot/keyring/types';
import { DistributionRecord, DistributionSummary, TransactionResult, AppConfig, TransactionFailureHandler } from '../types';
import { getNetworkConfig } from '../config/networks';
import Logger from '../utils/logger';
import { ResumeManager } from './resume-manager';

export class TokenDistributor {
  private api?: ApiPromise;
  private account?: KeyringPair;
  private config: AppConfig;
  private logger: Logger;
  private resumeManager: ResumeManager;
  private failureHandler?: TransactionFailureHandler;
  private isConnected = false;

  constructor(config: AppConfig, logger: Logger, failureHandler?: TransactionFailureHandler) {
    this.config = config;
    this.logger = logger;
    this.failureHandler = failureHandler;
    this.resumeManager = new ResumeManager(logger);
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing token distributor');

      const networkConfig = getNetworkConfig(this.config.network);
      const rpcEndpoint = this.config.rpcEndpoint || networkConfig.rpcEndpoint;

      this.logger.info('Connecting to network', {
        network: this.config.network,
        endpoint: rpcEndpoint,
      });

      // Wait for crypto to be ready
      await cryptoWaitReady();

      // Initialize API connection
      const api = await activate({
        networkId: this.config.network,
        ...(this.config.rpcEndpoint && { rpcUrl: this.config.rpcEndpoint }),
      });

      // Initialize keyring and add account from private key
      const keyring = new Keyring({ type: 'sr25519' });

      // Clean private key (remove 0x prefix if present)
      const cleanPrivateKey = this.config.distributorPrivateKey.replace(/^0x/, '');

      // Add account from private key
      const account = keyring.addFromUri(`0x${cleanPrivateKey}`);

      this.api = api;
      this.account = account;
      this.isConnected = true;

      this.logger.logNetworkConnection(this.config.network, rpcEndpoint);

      // Get account information (for future use)
      await getAccount(this.api, this.account.address);
      const balanceInfo = await balance(this.api, this.account.address);

      this.logger.logAccountInfo(this.account.address, balanceInfo.free.toString());

      this.logger.info('Token distributor initialized successfully', {
        distributorAddress: this.account.address,
        network: this.config.network,
        balance: balanceInfo.free.toString(),
      });
    } catch (error) {
      this.logger.error('Failed to initialize token distributor', error);
      throw error;
    }
  }

  async distribute(
    records: DistributionRecord[],
    resumeFromIndex: number = 0
  ): Promise<DistributionSummary> {
    if (!this.isConnected || !this.api || !this.account) {
      throw new Error('Distributor not initialized. Call initialize() first.');
    }

    const summary: DistributionSummary = {
      totalRecords: records.length,
      completed: 0,
      failed: 0,
      skipped: 0,
      totalAmount: records.reduce(
        (sum, record) => (BigInt(sum) + BigInt(record.amount)).toString(),
        '0'
      ),
      distributedAmount: '0',
      failedAmount: '0',
      startTime: new Date(),
      resumedFrom: resumeFromIndex > 0 ? resumeFromIndex : undefined,
    };

    this.logger.logDistributionStart(summary.totalRecords, summary.totalAmount);

    // Save initial state for resume capability
    await this.resumeManager.saveState(records, summary, resumeFromIndex);

    try {
      for (let i = resumeFromIndex; i < records.length; i++) {
        const record = records[i];

        if (record.status === 'completed') {
          summary.skipped++;
          continue;
        }

        this.logger.logTransactionStart(record.address, record.amount, i);

        try {
          // Update record status
          record.status = 'processing';
          record.timestamp = new Date();

          // Execute transfer
          const result = await this.executeTransfer(record);

          if (result.success) {
            record.status = 'completed';
            record.transactionHash = result.transactionHash;
            record.blockHash = result.blockHash;
            record.blockNumber = result.blockNumber;

            summary.completed++;
            summary.distributedAmount = (
              BigInt(summary.distributedAmount) + BigInt(record.amount)
            ).toString();

            this.logger.logTransactionSuccess(
              record.address,
              record.amount,
              result.transactionHash!,
              result.blockNumber,
              result.blockHash
            );
          } else {
            throw new Error(result.error || 'Transaction failed');
          }
        } catch (error) {
          record.status = 'failed';
          record.error = error instanceof Error ? error.message : String(error);
          record.attempts = (record.attempts || 0) + 1;

          summary.failed++;
          summary.failedAmount = (BigInt(summary.failedAmount) + BigInt(record.amount)).toString();

          this.logger.logTransactionFailure(
            record.address,
            record.amount,
            record.error,
            record.attempts
          );

          // Ask user what to do with failed transaction
          const action = await this.handleTransactionFailure(record, i, error, record.attempts || 1);

          switch (action) {
            case 'retry':
              i--; // Retry current transaction
              break;
            case 'skip':
              break; // Continue with next transaction
            case 'pause':
              await this.pauseDistribution(records, summary, i);
              return summary;
            case 'abort':
              throw new Error('Distribution aborted by user');
          }
        }

        // Update resume state periodically
        if (i % this.config.batchSize === 0) {
          await this.resumeManager.saveState(records, summary, i + 1);
        }

        // Add small delay between transactions to avoid overwhelming the network
        await this.delay(1000);
      }

      summary.endTime = new Date();
      this.logger.logDistributionComplete(summary);

      // Clean up resume state on successful completion
      await this.resumeManager.clearState();

      return summary;
    } catch (error) {
      this.logger.error('Distribution failed', error);
      throw error;
    }
  }

  private async executeTransfer(record: DistributionRecord): Promise<TransactionResult> {
    if (!this.api || !this.account) {
      throw new Error('API or account not initialized');
    }

    try {
      // Create transfer transaction
      const tx = await transfer(this.api, record.address, record.amount);

      // Sign and send transaction
      const result = await signAndSendTx(this.account, tx);

      // Wait for confirmation
      await this.waitForConfirmation(result.identifier || 'unknown');

      return {
        success: true,
        transactionHash: result.identifier || 'unknown',
        blockHash: result.receipt.status.isInBlock
          ? result.receipt.status.asInBlock.toString()
          : undefined,
        blockNumber: result.receipt.blockNumber ? result.receipt.blockNumber.toNumber() : undefined,
      };
    } catch (error) {
      this.logger.error('Transaction execution failed', {
        address: record.address,
        amount: record.amount,
        error,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async waitForConfirmation(txHash: string): Promise<void> {
    if (!this.api) {
      throw new Error('API not initialized');
    }

    let confirmations = 0;
    const targetConfirmations = this.config.confirmationBlocks;

    this.logger.debug(`Waiting for ${targetConfirmations} confirmations for tx ${txHash}`);

    return new Promise((resolve, reject) => {
      this.api!.rpc.chain.subscribeNewHeads(async _header => {
        try {
          confirmations++;

          if (confirmations >= targetConfirmations) {
            resolve();
          }
        } catch (error) {
          reject(error);
        }
      })
        .then(unsubscribe => {
          // Timeout after 5 minutes
          setTimeout(() => {
            unsubscribe();
            reject(new Error('Transaction confirmation timeout'));
          }, 300000);
        })
        .catch(reject);
    });
  }

  private async handleTransactionFailure(
    record: DistributionRecord,
    index: number,
    error: any,
    attempts: number
  ): Promise<'retry' | 'skip' | 'pause' | 'abort'> {
    // Use injected failure handler if available
    if (this.failureHandler) {
      return await this.failureHandler.handleFailure(record, index, error, attempts);
    }

    // Fallback to default strategy
    this.logger.warn('Transaction failed, using default retry strategy', {
      address: record.address,
      amount: record.amount,
      error: error.message,
      attempts,
    });

    if (attempts < 3) {
      return 'retry';
    } else {
      return 'skip';
    }
  }

  private async pauseDistribution(
    records: DistributionRecord[],
    summary: DistributionSummary,
    lastIndex: number
  ): Promise<void> {
    this.logger.logDistributionPaused(lastIndex, 'User requested pause');
    await this.resumeManager.saveState(records, summary, lastIndex);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async checkDistributorBalance(): Promise<string> {
    if (!this.api || !this.account) {
      throw new Error('Distributor not initialized');
    }

    const balanceInfo = await balance(this.api, this.account.address);
    return balanceInfo.free.toString();
  }

  async validateSufficientBalance(totalAmount: string): Promise<{
    sufficient: boolean;
    currentBalance: string;
    requiredAmount: string;
    shortfall?: string;
  }> {
    const currentBalance = await this.checkDistributorBalance();

    // Add 1 token (in wei) for gas fees
    const gasBuffer = (1 * Math.pow(10, 18)).toString();
    const requiredAmount = (BigInt(totalAmount) + BigInt(gasBuffer)).toString();

    const sufficient = BigInt(currentBalance) >= BigInt(requiredAmount);

    const result = {
      sufficient,
      currentBalance,
      requiredAmount,
      ...(sufficient
        ? {}
        : { shortfall: (BigInt(requiredAmount) - BigInt(currentBalance)).toString() }),
    };

    this.logger.info('Balance validation completed', {
      currentBalance,
      totalDistributionAmount: totalAmount,
      gasBuffer,
      requiredAmount,
      sufficient,
      ...(result.shortfall && { shortfall: result.shortfall }),
    });

    return result;
  }

  async disconnect(): Promise<void> {
    if (this.api && this.isConnected) {
      await disconnect(this.api);
      this.isConnected = false;
      this.logger.info('Disconnected from network');
    }
  }

  // Getters
  get distributorAddress(): string | undefined {
    return this.account?.address;
  }

  get networkName(): string {
    return this.config.network;
  }

  get isInitialized(): boolean {
    return this.isConnected && !!this.api && !!this.account;
  }
}
