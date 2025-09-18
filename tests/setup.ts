// Test setup file
import { cryptoWaitReady } from '@polkadot/util-crypto';

// Initialize crypto before running tests
beforeAll(async () => {
  await cryptoWaitReady();
});

// Global test timeout
jest.setTimeout(10000);
