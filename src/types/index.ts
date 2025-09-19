export interface DistributionRecord {
  address: string;
  amount: bigint; // Shannon amount as bigint for internal processing
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
  totalAmount: bigint; // Shannon amount as bigint
  distributedAmount: bigint; // Shannon amount as bigint
  failedAmount: bigint; // Shannon amount as bigint
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
  gasBufferAi3: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  duplicates: { address: string; indices: number[] }[];
  totalAmount: bigint; // Shannon amount as bigint
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

export interface TransactionFailureHandler {
  handleFailure(
    _record: DistributionRecord,
    _index: number,
    _error: any,
    _attempts: number
  ): Promise<'retry' | 'skip' | 'pause' | 'abort'>;
}
