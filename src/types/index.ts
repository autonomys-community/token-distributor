export interface DistributionRecord {
  address: string;
  amount: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  transactionHash?: string;
  blockHash?: string;
  blockNumber?: number;
  error?: string;
  attempts?: number;
  timestamp?: Date;
}

export interface DistributionSummary {
  totalRecords: number;
  completed: number;
  failed: number;
  skipped: number;
  totalAmount: string;
  distributedAmount: string;
  failedAmount: string;
  startTime: Date;
  endTime?: Date;
  resumedFrom?: number;
}

export interface NetworkConfig {
  name: string;
  rpcEndpoint: string;
  chainId?: string;
}

export interface AppConfig {
  network: string;
  distributorPrivateKey: string;
  rpcEndpoint?: string;
  logLevel: string;
  logToFile: boolean;
  confirmationBlocks: number;
  batchSize: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  duplicates: { address: string; indices: number[] }[];
  totalAmount: string;
  recordCount: number;
  addressStats?: {
    autonomysCount: number;
    substrateCount: number;
  };
}

export interface ResumeData {
  records: DistributionRecord[];
  summary: DistributionSummary;
  lastProcessedIndex: number;
  timestamp: Date;
}

export type LogLevel = 'error' | 'warn' | 'info' | 'verbose' | 'debug';

export interface TransactionResult {
  success: boolean;
  transactionHash?: string;
  blockHash?: string;
  blockNumber?: number;
  error?: string;
  gasUsed?: string;
}
