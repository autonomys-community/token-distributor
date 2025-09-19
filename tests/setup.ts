// Test setup file
import { cryptoWaitReady } from '@polkadot/util-crypto';

// Mock dotenv globally to prevent any test from loading real .env file
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

// Initialize crypto before running tests
beforeAll(async () => {
  await cryptoWaitReady();
});

// Global test timeout
jest.setTimeout(10000);
