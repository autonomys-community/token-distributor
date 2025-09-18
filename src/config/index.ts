import dotenv from 'dotenv';
import { AppConfig, LogLevel } from '../types';
import { validateNetworkName } from './networks';

// Load environment variables
dotenv.config();

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (!value && !defaultValue) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value || defaultValue!;
}

function getEnvVarAsNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }
  return num;
}

function getEnvVarAsBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

export function loadConfig(): AppConfig {
  const network = getEnvVar('NETWORK', 'chronos');

  if (!validateNetworkName(network)) {
    throw new Error(`Invalid network: ${network}. Must be one of: mainnet, chronos`);
  }

  const logLevel = getEnvVar('LOG_LEVEL', 'info') as LogLevel;
  const validLogLevels: LogLevel[] = ['error', 'warn', 'info', 'verbose', 'debug'];
  if (!validLogLevels.includes(logLevel)) {
    throw new Error(`Invalid log level: ${logLevel}. Must be one of: ${validLogLevels.join(', ')}`);
  }

  return {
    network,
    distributorPrivateKey: getEnvVar('DISTRIBUTOR_PRIVATE_KEY'),
    rpcEndpoint: process.env.RPC_ENDPOINT,
    logLevel,
    logToFile: getEnvVarAsBoolean('LOG_TO_FILE', true),
    confirmationBlocks: getEnvVarAsNumber('CONFIRMATION_BLOCKS', 2),
    batchSize: getEnvVarAsNumber('BATCH_SIZE', 10),
  };
}

export function validateConfig(config: AppConfig): void {
  if (!config.distributorPrivateKey) {
    throw new Error('DISTRIBUTOR_PRIVATE_KEY is required');
  }

  // Basic private key validation (should be 64 hex characters, optionally prefixed with 0x)
  const privateKey = config.distributorPrivateKey.trim();
  const hexPattern = /^(0x)?[0-9a-fA-F]{64}$/;
  if (!hexPattern.test(privateKey)) {
    throw new Error(
      'DISTRIBUTOR_PRIVATE_KEY must be a valid 64-character hexadecimal private key (optionally prefixed with 0x)'
    );
  }

  if (config.confirmationBlocks < 1) {
    throw new Error('CONFIRMATION_BLOCKS must be at least 1');
  }

  if (config.batchSize < 1) {
    throw new Error('BATCH_SIZE must be at least 1');
  }
}
