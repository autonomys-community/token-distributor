import { TokenDistributor } from '../../src/core/distributor';
import { AppConfig } from '../../src/types';
import Logger from '../../src/utils/logger';
import { ai3NumberToShannon } from '../../src/utils/validation';

// Mock the Auto SDK modules
jest.mock('@autonomys/auto-consensus', () => ({
  activate: jest.fn(),
  transfer: jest.fn(),
  balance: jest.fn(),
}));

jest.mock('@autonomys/auto-utils', () => ({
  activateWallet: jest.fn(),
}));

jest.mock('@polkadot/api', () => ({
  ApiPromise: {
    create: jest.fn(),
  },
}));

jest.mock('@polkadot/keyring', () => ({
  Keyring: jest.fn(() => ({
    addFromUri: jest.fn(() => ({
      address: 'su1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    })),
  })),
}));

jest.mock('@polkadot/util-crypto', () => ({
  cryptoWaitReady: jest.fn(),
}));

describe('TokenDistributor', () => {
  let distributor: TokenDistributor;
  let mockConfig: AppConfig;
  let mockLogger: Logger;

  beforeEach(() => {
    mockConfig = {
      network: 'chronos',
      distributorPrivateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      logLevel: 'info',
      logToFile: true,
      confirmationBlocks: 2,
      batchSize: 10,
      gasBufferAi3: 1, // Default 1 AI3 gas buffer
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      logNetworkConnection: jest.fn(),
      logTransactionStart: jest.fn(),
      logTransactionSuccess: jest.fn(),
      logTransactionFailure: jest.fn(),
      logDistributionStart: jest.fn(),
    } as any;

    distributor = new TokenDistributor(mockConfig, mockLogger);
  });

  describe('validateSufficientBalance', () => {
    beforeEach(() => {
      // Mock the checkDistributorBalance method
      jest.spyOn(distributor, 'checkDistributorBalance').mockImplementation(async () => '1000000000000000000000'); // 1000 AI3 in Shannon
    });

    test('should include gas buffer in balance calculation - sufficient balance', async () => {
      const distributionAmount = ai3NumberToShannon(100); // 100 AI3
      
      const result = await distributor.validateSufficientBalance(distributionAmount);

      expect(result.sufficient).toBe(true);
      expect(result.currentBalance).toBe(BigInt('1000000000000000000000')); // 1000 AI3
      expect(result.requiredAmount).toBe(distributionAmount + ai3NumberToShannon(1)); // 100 AI3 + 1 AI3 gas
      expect(result.shortfall).toBeUndefined();

      // Verify logger was called with correct information
      expect(mockLogger.info).toHaveBeenCalledWith('Balance validation completed', expect.objectContaining({
        currentBalance: '1000000000000000000000',
        totalDistributionAmount: distributionAmount.toString(),
        gasBuffer: ai3NumberToShannon(1).toString(),
        requiredAmount: (distributionAmount + ai3NumberToShannon(1)).toString(),
        sufficient: true,
      }));
    });

    test('should include gas buffer in balance calculation - insufficient balance', async () => {
      const distributionAmount = ai3NumberToShannon(999.5); // 999.5 AI3
      
      const result = await distributor.validateSufficientBalance(distributionAmount);

      expect(result.sufficient).toBe(false);
      expect(result.currentBalance).toBe(BigInt('1000000000000000000000')); // 1000 AI3
      expect(result.requiredAmount).toBe(distributionAmount + ai3NumberToShannon(1)); // 999.5 AI3 + 1 AI3 gas = 1000.5 AI3
      expect(result.shortfall).toBe(ai3NumberToShannon(0.5)); // Need 0.5 AI3 more

      // Verify logger was called with shortfall information
      expect(mockLogger.info).toHaveBeenCalledWith('Balance validation completed', expect.objectContaining({
        currentBalance: '1000000000000000000000',
        totalDistributionAmount: distributionAmount.toString(),
        gasBuffer: ai3NumberToShannon(1).toString(),
        requiredAmount: (distributionAmount + ai3NumberToShannon(1)).toString(),
        sufficient: false,
        shortfall: ai3NumberToShannon(0.5).toString(),
      }));
    });

    test('should use custom gas buffer from config', async () => {
      // Create distributor with custom gas buffer
      const customConfig = { ...mockConfig, gasBufferAi3: 5 }; // 5 AI3 gas buffer
      const customDistributor = new TokenDistributor(customConfig, mockLogger);
      jest.spyOn(customDistributor, 'checkDistributorBalance').mockImplementation(async () => '1000000000000000000000'); // 1000 AI3

      const distributionAmount = ai3NumberToShannon(100); // 100 AI3
      
      const result = await customDistributor.validateSufficientBalance(distributionAmount);

      expect(result.sufficient).toBe(true);
      expect(result.requiredAmount).toBe(distributionAmount + ai3NumberToShannon(5)); // 100 AI3 + 5 AI3 gas

      // Verify logger was called with correct gas buffer
      expect(mockLogger.info).toHaveBeenCalledWith('Balance validation completed', expect.objectContaining({
        gasBuffer: ai3NumberToShannon(5).toString(), // Should be 5 AI3, not 1 AI3
      }));
    });

    test('should handle edge case - exactly required amount', async () => {
      const distributionAmount = ai3NumberToShannon(999); // 999 AI3
      
      const result = await distributor.validateSufficientBalance(distributionAmount);

      expect(result.sufficient).toBe(true);
      expect(result.requiredAmount).toBe(distributionAmount + ai3NumberToShannon(1)); // 999 AI3 + 1 AI3 gas = 1000 AI3
      expect(result.shortfall).toBeUndefined();
    });

    test('should handle edge case - 1 Shannon short', async () => {
      // Mock balance to be exactly 1 Shannon less than required
      const distributionAmount = ai3NumberToShannon(999); // 999 AI3
      const requiredAmount = distributionAmount + ai3NumberToShannon(1); // 1000 AI3
      const availableBalance = requiredAmount - BigInt(1); // 1 Shannon short

      jest.spyOn(distributor, 'checkDistributorBalance').mockImplementation(async () => availableBalance.toString());
      
      const result = await distributor.validateSufficientBalance(distributionAmount);

      expect(result.sufficient).toBe(false);
      expect(result.shortfall).toBe(BigInt(1)); // Exactly 1 Shannon short
    });

    test('should handle very large distribution amounts', async () => {
      const distributionAmount = ai3NumberToShannon(1000000000); // 1 billion AI3
      // Mock a very large balance
      jest.spyOn(distributor, 'checkDistributorBalance').mockImplementation(async () => ai3NumberToShannon(2000000000).toString()); // 2 billion AI3
      
      const result = await distributor.validateSufficientBalance(distributionAmount);

      expect(result.sufficient).toBe(true);
      expect(result.requiredAmount).toBe(distributionAmount + ai3NumberToShannon(1)); // 1 billion AI3 + 1 AI3 gas
    });

    test('should handle very small distribution amounts', async () => {
      const distributionAmount = BigInt(1); // 1 Shannon
      
      const result = await distributor.validateSufficientBalance(distributionAmount);

      expect(result.sufficient).toBe(true);
      expect(result.requiredAmount).toBe(distributionAmount + ai3NumberToShannon(1)); // 1 Shannon + 1 AI3 gas
    });

    test('should handle zero gas buffer', async () => {
      // Create distributor with zero gas buffer
      const zeroGasConfig = { ...mockConfig, gasBufferAi3: 0 };
      const zeroGasDistributor = new TokenDistributor(zeroGasConfig, mockLogger);
      jest.spyOn(zeroGasDistributor, 'checkDistributorBalance').mockImplementation(async () => '1000000000000000000000'); // 1000 AI3

      const distributionAmount = ai3NumberToShannon(1000); // 1000 AI3
      
      const result = await zeroGasDistributor.validateSufficientBalance(distributionAmount);

      expect(result.sufficient).toBe(true);
      expect(result.requiredAmount).toBe(distributionAmount); // No gas buffer added
    });

    test('should handle fractional gas buffer', async () => {
      // Create distributor with fractional gas buffer
      const fractionalGasConfig = { ...mockConfig, gasBufferAi3: 0.5 }; // 0.5 AI3 gas buffer
      const fractionalGasDistributor = new TokenDistributor(fractionalGasConfig, mockLogger);
      jest.spyOn(fractionalGasDistributor, 'checkDistributorBalance').mockImplementation(async () => '1000000000000000000000'); // 1000 AI3

      const distributionAmount = ai3NumberToShannon(100); // 100 AI3
      
      const result = await fractionalGasDistributor.validateSufficientBalance(distributionAmount);

      expect(result.sufficient).toBe(true);
      expect(result.requiredAmount).toBe(distributionAmount + ai3NumberToShannon(0.5)); // 100 AI3 + 0.5 AI3 gas
    });
  });

  describe('user abort handling', () => {
    test('should handle user abort gracefully without throwing exception', async () => {
      // Create a mock failure handler that returns 'abort'
      const abortFailureHandler = {
        handleFailure: jest.fn().mockResolvedValue('abort')
      };

      const distributorWithAbort = new TokenDistributor(mockConfig, mockLogger, abortFailureHandler);
      
      // Mock the distribute method dependencies and set internal state
      jest.spyOn(distributorWithAbort, 'initialize').mockResolvedValue();
      jest.spyOn(distributorWithAbort, 'checkDistributorBalance').mockResolvedValue('1000000000000000000000');
      
      // Set internal connection state
      (distributorWithAbort as any).isConnected = true;
      (distributorWithAbort as any).api = {}; // Mock API
      (distributorWithAbort as any).account = {}; // Mock account
      
      // Mock executeTransfer to throw an error (to trigger failure handler)
      jest.spyOn(distributorWithAbort as any, 'executeTransfer').mockRejectedValue(new Error('Mock transaction error'));

      const records = [{
        address: 'test-address',
        amount: BigInt('1000000000000000000'),
        status: 'pending' as const
      }];

      // This should not throw an exception
      const result = await distributorWithAbort.distribute(records);

      expect(result.abortedByUser).toBe(true);
      expect(result.endTime).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith('Distribution aborted by user', expect.any(Object));
      
      // Verify the abort failure handler was called
      expect(abortFailureHandler.handleFailure).toHaveBeenCalled();
    });
  });
});
