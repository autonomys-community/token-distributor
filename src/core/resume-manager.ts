import fs from 'fs-extra';
import path from 'path';
import { DistributionRecord, DistributionSummary, ResumeData } from '../types';
import Logger from '../utils/logger';
import { stringifyWithBigInt, convertDistributionStringsToBigInt } from '../utils/bigint-json';

export class ResumeManager {
  private resumeDir: string;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.resumeDir = path.join(process.cwd(), '.resume');
  }

  async saveState(
    records: DistributionRecord[],
    summary: DistributionSummary,
    lastProcessedIndex: number,
    sourceFilename?: string
  ): Promise<void> {
    try {
      await fs.ensureDir(this.resumeDir);

      const resumeData: ResumeData = {
        records,
        summary,
        lastProcessedIndex,
        timestamp: new Date(),
        sourceFilename,
      };

      const filename = this.generateResumeFilename();
      const filepath = path.join(this.resumeDir, filename);

      // Use centralized BigInt serialization
      const serializedData = stringifyWithBigInt(resumeData, 2);
      await fs.writeFile(filepath, serializedData);

      this.logger.debug('Resume state saved', {
        filepath,
        lastProcessedIndex,
        totalRecords: records.length,
      });
    } catch (error) {
      this.logger.error('Failed to save resume state', error);
    }
  }

  async loadLatestState(): Promise<ResumeData | null> {
    try {
      if (!(await fs.pathExists(this.resumeDir))) {
        return null;
      }

      const files = await fs.readdir(this.resumeDir);
      const resumeFiles = files
        .filter(file => file.startsWith('resume-') && file.endsWith('.json'))
        .sort()
        .reverse(); // Get latest first

      if (resumeFiles.length === 0) {
        return null;
      }

      const latestFile = resumeFiles[0];
      const filepath = path.join(this.resumeDir, latestFile);

      const resumeData = (await fs.readJSON(filepath)) as ResumeData;

      // Convert timestamp back to Date object and BigInt strings back to BigInt
      resumeData.timestamp = new Date(resumeData.timestamp);
      convertDistributionStringsToBigInt(resumeData);

      this.logger.info('Resume state loaded', {
        filepath,
        lastProcessedIndex: resumeData.lastProcessedIndex,
        totalRecords: resumeData.records.length,
        timestamp: resumeData.timestamp,
      });

      return resumeData;
    } catch (error) {
      this.logger.error('Failed to load resume state', error);
      return null;
    }
  }

  async listResumeFiles(): Promise<string[]> {
    try {
      if (!(await fs.pathExists(this.resumeDir))) {
        return [];
      }

      const files = await fs.readdir(this.resumeDir);
      return files
        .filter(file => file.startsWith('resume-') && file.endsWith('.json'))
        .sort()
        .reverse();
    } catch (error) {
      this.logger.error('Failed to list resume files', error);
      return [];
    }
  }

  async loadSpecificState(filename: string): Promise<ResumeData | null> {
    try {
      const filepath = path.join(this.resumeDir, filename);

      if (!(await fs.pathExists(filepath))) {
        return null;
      }

      const resumeData = (await fs.readJSON(filepath)) as ResumeData;
      resumeData.timestamp = new Date(resumeData.timestamp);
      convertDistributionStringsToBigInt(resumeData);

      return resumeData;
    } catch (error) {
      this.logger.error('Failed to load specific resume state', error);
      return null;
    }
  }

  async clearState(): Promise<void> {
    try {
      if (await fs.pathExists(this.resumeDir)) {
        await fs.remove(this.resumeDir);
        this.logger.info('Resume state cleared');
      }
    } catch (error) {
      this.logger.error('Failed to clear resume state', error);
    }
  }

  async clearOldStates(keepCount: number = 5): Promise<void> {
    try {
      const files = await this.listResumeFiles();

      if (files.length <= keepCount) {
        return;
      }

      const filesToDelete = files.slice(keepCount);

      for (const file of filesToDelete) {
        const filepath = path.join(this.resumeDir, file);
        await fs.remove(filepath);
      }

      this.logger.info('Old resume states cleaned up', {
        deletedCount: filesToDelete.length,
        kept: keepCount,
      });
    } catch (error) {
      this.logger.error('Failed to clean up old resume states', error);
    }
  }

  private generateResumeFilename(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `resume-${timestamp}.json`;
  }

  getResumeDir(): string {
    return this.resumeDir;
  }

  async getResumeStats(): Promise<{
    hasResumeData: boolean;
    resumeFileCount: number;
    latestTimestamp?: Date;
    totalSize: number;
  }> {
    try {
      const files = await this.listResumeFiles();

      if (files.length === 0) {
        return {
          hasResumeData: false,
          resumeFileCount: 0,
          totalSize: 0,
        };
      }

      let totalSize = 0;
      for (const file of files) {
        const filepath = path.join(this.resumeDir, file);
        const stats = await fs.stat(filepath);
        totalSize += stats.size;
      }

      const latestResumeData = await this.loadLatestState();

      return {
        hasResumeData: true,
        resumeFileCount: files.length,
        latestTimestamp: latestResumeData?.timestamp,
        totalSize,
      };
    } catch (error) {
      this.logger.error('Failed to get resume stats', error);
      return {
        hasResumeData: false,
        resumeFileCount: 0,
        totalSize: 0,
      };
    }
  }

  // Helper method to analyze distribution progress from resume data
  analyzeProgress(resumeData: ResumeData): {
    completed: number;
    failed: number;
    pending: number;
    completionPercentage: number;
    failureRate: number;
  } {
    const completed = resumeData.records.filter(r => r.status === 'completed').length;
    const failed = resumeData.records.filter(r => r.status === 'failed').length;
    const pending = resumeData.records.filter(r => r.status === 'pending').length;
    const total = resumeData.records.length;

    return {
      completed,
      failed,
      pending,
      completionPercentage: total > 0 ? (completed / total) * 100 : 0,
      failureRate: completed + failed > 0 ? (failed / (completed + failed)) * 100 : 0,
    };
  }

  // Export resume data for external analysis
  async exportResumeData(outputPath: string): Promise<void> {
    try {
      const resumeData = await this.loadLatestState();

      if (!resumeData) {
        throw new Error('No resume data available');
      }

      const analysis = this.analyzeProgress(resumeData);

      const exportData = {
        metadata: {
          exportedAt: new Date(),
          originalTimestamp: resumeData.timestamp,
          lastProcessedIndex: resumeData.lastProcessedIndex,
        },
        summary: resumeData.summary,
        analysis,
        records: resumeData.records,
      };

      // Use centralized BigInt serialization
      const serializedData = stringifyWithBigInt(exportData, 2);
      await fs.writeFile(outputPath, serializedData);

      this.logger.info('Resume data exported', {
        outputPath,
        recordCount: resumeData.records.length,
      });
    } catch (error) {
      this.logger.error('Failed to export resume data', error);
      throw error;
    }
  }
}
