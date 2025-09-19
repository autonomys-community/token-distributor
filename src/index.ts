#!/usr/bin/env node

import { loadConfig, validateConfig } from './config';
import { CSVValidator, ai3NumberToShannon } from './utils/validation';
import { TokenDistributor } from './core/distributor';
import { ResumeManager } from './core/resume-manager';
import { UserPrompts } from './cli/prompts';
import { InteractiveFailureHandler } from './cli/failure-handler';
import Logger from './utils/logger';
import chalk from 'chalk';
import fs from 'fs-extra';

class TokenDistributorApp {
  private config: any;
  private logger: Logger;
  private validator: CSVValidator;
  private distributor: TokenDistributor;
  private resumeManager: ResumeManager;
  private prompts: UserPrompts;
  private failureHandler: InteractiveFailureHandler;

  constructor() {
    try {
      // Load and validate configuration
      this.config = loadConfig();
      validateConfig(this.config);

      // Initialize components
      this.logger = new Logger(this.config);
      this.validator = new CSVValidator(this.logger);
      this.prompts = new UserPrompts(this.logger);
      this.failureHandler = new InteractiveFailureHandler(this.prompts);
      this.distributor = new TokenDistributor(this.config, this.logger, this.failureHandler);
      this.resumeManager = new ResumeManager(this.logger);
    } catch (error) {
      console.error('❌ Configuration Error:', error instanceof Error ? error.message : error);
      console.error('\n💡 Please check your .env file and ensure all required values are set.');
      console.error('📖 See README.md for configuration instructions.');
      process.exit(1);
    }
  }

  async run(): Promise<void> {
    try {
      this.prompts.displayBanner();
      
      this.logger.info('Starting Autonomys Token Distributor');
      this.logger.info('Configuration loaded', {
        network: this.config.network,
        batchSize: this.config.batchSize,
        confirmationBlocks: this.config.confirmationBlocks
      });

      // Check for existing resume data
      const resumeStats = await this.resumeManager.getResumeStats();
      
      if (resumeStats.hasResumeData) {
        const resumeChoice = await this.prompts.askToResumeDistribution(this.resumeManager);
        
        if (resumeChoice.shouldResume && resumeChoice.resumeData) {
          await this.resumeDistribution(resumeChoice.resumeData);
          console.log(chalk.green('\n✅ Application completed successfully.'));
          process.exit(0);
        }
      }

      // Start new distribution
      await this.startNewDistribution();
      console.log(chalk.green('\n✅ Application completed successfully.'));
      process.exit(0);

    } catch (error) {
      this.logger.error('Application error', error);
      console.error(chalk.red('\n❌ Application Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  private async startNewDistribution(): Promise<void> {
    try {
      // Get CSV file path
      const csvPath = await this.prompts.askForCSVPath();

      if (!await fs.pathExists(csvPath)) {
        console.error(chalk.red(`CSV file not found: ${csvPath}`));
        return;
      }

      // Validate CSV
      console.log(chalk.blue('\n📋 Validating CSV file...'));
      const validation = await this.validator.validateCSV(csvPath);

      if (!validation.isValid) {
        const action = await this.prompts.handleValidationErrors(validation);
        if (action === 'retry') {
          await this.startNewDistribution();
          return;
        } else {
          console.log(chalk.yellow('Distribution aborted.'));
          return;
        }
      }

      // Ask for dry run
      const dryRun = await this.prompts.askForDryRun();

      // Initialize distributor
      console.log(chalk.blue('\n🔗 Connecting to Autonomys Network...'));
      await this.distributor.initialize();

      if (!this.distributor.distributorAddress) {
        throw new Error('Failed to get distributor address');
      }

      // Check balance
      const balanceValidation = await this.distributor.validateSufficientBalance(validation.totalAmount);

      if (!balanceValidation.sufficient) {
        const gasBuffer = ai3NumberToShannon(this.config.gasBufferAi3);
        const action = await this.prompts.askForInsufficientBalance(
          balanceValidation.requiredAmount,
          balanceValidation.currentBalance,
          balanceValidation.shortfall!,
          validation.totalAmount,
          gasBuffer
        );
        if (action === 'abort') {
          console.log(chalk.yellow('Distribution aborted due to insufficient balance.'));
          return;
        }
      }

      // Confirm distribution
      const confirmed = await this.prompts.confirmDistribution(
        validation,
        this.distributor.distributorAddress,
        this.distributor.networkName,
        balanceValidation
      );

      if (!confirmed) {
        console.log(chalk.yellow('Distribution cancelled by user.'));
        return;
      }

      // Parse records and execute distribution
      const records = await this.validator.parseValidatedCSV(csvPath);

      if (dryRun) {
        await this.executeDryRun(records);
      } else {
        await this.executeDistribution(records);
      }

    } catch (error) {
      this.logger.error('Distribution error', error);
      throw error;
    } finally {
      await this.distributor.disconnect();
    }
  }

  private async resumeDistribution(resumeData: any): Promise<void> {
    try {
      console.log(chalk.blue('\n🔗 Connecting to Autonomys Network...'));
      await this.distributor.initialize();

      this.logger.logDistributionResumed(resumeData.lastProcessedIndex);

      console.log(chalk.blue('\n▶️  Resuming distribution...'));
      
      const summary = await this.distributor.distribute(
        resumeData.records, 
        resumeData.lastProcessedIndex
      );

      await this.prompts.showDistributionComplete(summary);

    } catch (error) {
      this.logger.error('Resume distribution error', error);
      throw error;
    } finally {
      await this.distributor.disconnect();
    }
  }

  private async executeDryRun(records: any[]): Promise<void> {
    console.log(chalk.blue('\n🧪 Executing Dry Run...'));
    console.log(chalk.gray('(No actual transactions will be sent)\n'));

    for (let i = 0; i < Math.min(records.length, 5); i++) {
      const record = records[i];
      this.prompts.displayProgress(i + 1, Math.min(records.length, 5), record.address);
      
      // Simulate processing time
      await this.delay(1000);
      
      this.logger.info('Dry run transaction', {
        address: record.address,
        amount: record.amount.toString(),
        index: i
      });
    }

    console.log(chalk.green('\n✅ Dry run completed successfully!'));
    
    if (records.length > 5) {
      console.log(chalk.gray(`Note: Only processed first 5 records in dry run. Total: ${records.length}`));
    }

      const proceedWithReal = await this.prompts.confirmDistribution(
        { recordCount: records.length, totalAmount: 0n, isValid: true, errors: [], warnings: [], duplicates: [] },
        this.distributor.distributorAddress!,
        this.distributor.networkName
      );

      if (proceedWithReal) {
        await this.executeDistribution(records);
      }
  }

  private async executeDistribution(records: any[]): Promise<void> {
    console.log(chalk.blue('\n🚀 Starting token distribution...'));

    let lastProgress = 0;
    
    // Create a progress tracking wrapper
    const progressTracker = setInterval(() => {
      const completed = records.filter(r => r.status === 'completed').length;
      if (completed !== lastProgress) {
        this.prompts.displayProgress(completed, records.length);
        lastProgress = completed;
      }
    }, 1000);

    try {
      const summary = await this.distributor.distribute(records);
      
      clearInterval(progressTracker);
      console.log('\n'); // New line after progress bar
      
      await this.prompts.showDistributionComplete(summary);

    } catch (error) {
      clearInterval(progressTracker);
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n⏸️  Distribution interrupted by user.'));
  console.log(chalk.blue('Resume data has been saved. You can resume later by running the application again.'));
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n\n⏸️  Distribution terminated.'));
  process.exit(0);
});

// Main execution
if (require.main === module) {
  const app = new TokenDistributorApp();
  app.run().catch((error) => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}
