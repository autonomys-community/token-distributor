import inquirer from 'inquirer';
import chalk from 'chalk';
import { DistributionRecord, ValidationResult, ResumeData } from '../types';
import { ResumeManager } from '../core/resume-manager';
import Logger from '../utils/logger';

export class UserPrompts {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async confirmDistribution(
    validation: ValidationResult,
    distributorAddress: string,
    network: string,
    balanceValidation?: { sufficient: boolean; currentBalance: string; requiredAmount: string }
  ): Promise<boolean> {
    console.log(chalk.blue('\n=== Distribution Summary ==='));
    console.log(chalk.white(`Network: ${chalk.cyan(network)}`));
    console.log(chalk.white(`Distributor Address: ${chalk.cyan(distributorAddress)}`));
    console.log(chalk.white(`Total Records: ${chalk.yellow(validation.recordCount)}`));
    console.log(
      chalk.white(
        `Distribution Amount: ${chalk.yellow(this.formatTokenAmount(validation.totalAmount))} tokens`
      )
    );

    if (validation.addressStats) {
      console.log(
        chalk.white(
          `Address Types: ${chalk.cyan(validation.addressStats.autonomysCount)} Autonomys, ${chalk.cyan(validation.addressStats.substrateCount)} Substrate`
        )
      );
    }

    if (balanceValidation) {
      console.log(
        chalk.white(
          `Account Balance: ${chalk.cyan(this.formatTokenAmount(balanceValidation.currentBalance))} tokens`
        )
      );
      console.log(
        chalk.white(
          `Required (incl. gas): ${chalk.yellow(this.formatTokenAmount(balanceValidation.requiredAmount))} tokens`
        )
      );

      if (balanceValidation.sufficient) {
        console.log(chalk.green(`✅ Sufficient balance for distribution`));
      } else {
        console.log(chalk.red(`⚠️  Insufficient balance - proceed with caution`));
      }
    }

    if (validation.warnings.length > 0) {
      console.log(chalk.yellow('\n⚠️  Warnings:'));
      validation.warnings.forEach(warning => {
        console.log(chalk.yellow(`   • ${warning}`));
      });
    }

    if (validation.duplicates.length > 0) {
      console.log(chalk.red('\n🔄 Duplicate Addresses Found:'));
      validation.duplicates.forEach(dup => {
        console.log(chalk.red(`   • ${dup.address} (lines: ${dup.indices.join(', ')})`));
      });
    }

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to proceed with this distribution?',
        default: false,
      },
    ]);

    return confirm;
  }

  async askForCSVPath(): Promise<string> {
    const { csvPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'csvPath',
        message: 'Enter the path to your CSV file:',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'CSV file path is required';
          }
          if (!input.endsWith('.csv')) {
            return 'File must have .csv extension';
          }
          return true;
        },
      },
    ]);

    return csvPath.trim();
  }

  async handleValidationErrors(validation: ValidationResult): Promise<'retry' | 'abort'> {
    console.log(chalk.red('\n❌ CSV Validation Failed'));
    console.log(chalk.red(`Found ${validation.errors.length} error(s):\n`));

    validation.errors.slice(0, 10).forEach(error => {
      console.log(chalk.red(`   • ${error}`));
    });

    if (validation.errors.length > 10) {
      console.log(chalk.red(`   ... and ${validation.errors.length - 10} more errors`));
    }

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Fix the CSV file and try again', value: 'retry' },
          { name: 'Abort the distribution', value: 'abort' },
        ],
      },
    ]);

    return action;
  }

  async handleTransactionFailure(
    record: DistributionRecord,
    index: number,
    error: any,
    attempt: number
  ): Promise<'retry' | 'skip' | 'pause' | 'abort'> {
    console.log(chalk.red('\n❌ Transaction Failed'));
    console.log(chalk.white(`Address: ${chalk.cyan(record.address)}`));
    console.log(chalk.white(`Amount: ${chalk.yellow(record.amount)}`));
    console.log(chalk.white(`Record: ${chalk.yellow(index + 1)}`));
    console.log(chalk.white(`Attempt: ${chalk.yellow(attempt)}`));
    console.log(chalk.red(`Error: ${error.message || error}`));

    const choices = [
      { name: 'Retry this transaction', value: 'retry' },
      { name: 'Skip this transaction and continue', value: 'skip' },
      { name: 'Pause distribution (can resume later)', value: 'pause' },
      { name: 'Abort entire distribution', value: 'abort' },
    ];

    // Remove retry option after 3 attempts
    if (attempt >= 3) {
      choices.shift();
    }

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices,
      },
    ]);

    return action;
  }

  async askForInsufficientBalance(
    required: string,
    available: string,
    shortfall: string,
    distributionAmount: string,
    gasBuffer: string
  ): Promise<'abort' | 'continue'> {
    console.log(chalk.red('\n💰 Insufficient Balance'));
    console.log(
      chalk.white(
        `Distribution Amount: ${chalk.cyan(this.formatTokenAmount(distributionAmount))} tokens`
      )
    );
    console.log(chalk.white(`Gas Buffer: ${chalk.cyan(this.formatTokenAmount(gasBuffer))} tokens`));
    console.log(
      chalk.white(`Total Required: ${chalk.yellow(this.formatTokenAmount(required))} tokens`)
    );
    console.log(
      chalk.white(`Available: ${chalk.yellow(this.formatTokenAmount(available))} tokens`)
    );
    console.log(chalk.red(`Shortfall: ${chalk.red(this.formatTokenAmount(shortfall))} tokens`));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Insufficient balance to complete distribution. What would you like to do?',
        choices: [
          { name: 'Abort distribution', value: 'abort' },
          { name: 'Continue anyway (transactions may fail)', value: 'continue' },
        ],
      },
    ]);

    return action;
  }

  private formatTokenAmount(weiAmount: string): string {
    // Convert wei to tokens (assuming 18 decimals)
    const tokens = Number(weiAmount) / Math.pow(10, 18);
    return tokens.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  async askToResumeDistribution(resumeManager: ResumeManager): Promise<{
    shouldResume: boolean;
    resumeData?: ResumeData;
  }> {
    const resumeData = await resumeManager.loadLatestState();

    if (!resumeData) {
      return { shouldResume: false };
    }

    const analysis = resumeManager.analyzeProgress(resumeData);

    console.log(chalk.blue('\n🔄 Previous Distribution Found'));
    console.log(chalk.white(`Timestamp: ${chalk.cyan(resumeData.timestamp.toLocaleString())}`));
    console.log(chalk.white(`Total Records: ${chalk.yellow(resumeData.records.length)}`));
    console.log(chalk.white(`Completed: ${chalk.green(analysis.completed)}`));
    console.log(chalk.white(`Failed: ${chalk.red(analysis.failed)}`));
    console.log(chalk.white(`Pending: ${chalk.yellow(analysis.pending)}`));
    console.log(chalk.white(`Progress: ${chalk.cyan(analysis.completionPercentage.toFixed(1))}%`));

    const { shouldResume } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldResume',
        message: 'Would you like to resume this distribution?',
        default: true,
      },
    ]);

    return { shouldResume, resumeData: shouldResume ? resumeData : undefined };
  }

  async askForDryRun(): Promise<boolean> {
    const { dryRun } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'dryRun',
        message: 'Would you like to run in dry-run mode first? (no actual transactions)',
        default: true,
      },
    ]);

    return dryRun;
  }

  async selectResumeFile(files: string[]): Promise<string | null> {
    if (files.length === 0) {
      console.log(chalk.yellow('No resume files found.'));
      return null;
    }

    const choices = files.map(file => ({
      name: file,
      value: file,
    }));

    choices.push({ name: 'Cancel', value: 'cancel' });

    const { selectedFile } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedFile',
        message: 'Select a resume file:',
        choices,
      },
    ]);

    return selectedFile === 'cancel' ? null : selectedFile;
  }

  async confirmOverwriteAddress(
    address: string,
    currentAmount: string,
    newAmount: string
  ): Promise<boolean> {
    console.log(chalk.yellow('\n⚠️  Duplicate Address Detected'));
    console.log(chalk.white(`Address: ${chalk.cyan(address)}`));
    console.log(chalk.white(`Current Amount: ${chalk.yellow(currentAmount)}`));
    console.log(chalk.white(`New Amount: ${chalk.yellow(newAmount)}`));

    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Do you want to overwrite the existing amount?',
        default: false,
      },
    ]);

    return overwrite;
  }

  async confirmClearResumeData(): Promise<boolean> {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to clear all resume data? This cannot be undone.',
        default: false,
      },
    ]);

    return confirm;
  }

  async showDistributionComplete(summary: any): Promise<void> {
    console.log(chalk.green('\n✅ Distribution Complete!'));
    console.log(chalk.white(`Total Records: ${chalk.yellow(summary.totalRecords)}`));
    console.log(chalk.white(`Completed: ${chalk.green(summary.completed)}`));
    console.log(chalk.white(`Failed: ${chalk.red(summary.failed)}`));
    console.log(chalk.white(`Skipped: ${chalk.yellow(summary.skipped)}`));
    console.log(
      chalk.white(`Duration: ${this.formatDuration(summary.startTime, summary.endTime)}`)
    );

    if (summary.failed > 0) {
      console.log(chalk.yellow('\n⚠️  Some transactions failed. Check the logs for details.'));
    }

    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: 'Press Enter to continue...',
      },
    ]);
  }

  private formatDuration(start: Date, end: Date): string {
    const duration = end.getTime() - start.getTime();
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  displayBanner(): void {
    console.log(
      chalk.blue(`
╔═══════════════════════════════════════════════════════════════╗
║                    Autonomys Token Distributor                ║
║                                                               ║
║  A robust tool for distributing tokens on Autonomys Network   ║
╚═══════════════════════════════════════════════════════════════╝
    `)
    );
  }

  displayProgress(completed: number, total: number, current?: string): void {
    const percentage = total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0';
    const bar = this.createProgressBar(completed, total, 40);

    process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Clear line
    process.stdout.write(
      `${bar} ${percentage}% (${completed}/${total})` + (current ? ` - ${current}` : '')
    );
  }

  private createProgressBar(current: number, total: number, width: number): string {
    const percentage = total > 0 ? current / total : 0;
    const filled = Math.floor(percentage * width);
    const empty = width - filled;

    return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }
}
