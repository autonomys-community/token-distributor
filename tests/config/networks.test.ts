import { getNetworkConfig, validateNetworkName, NETWORKS } from '../../src/config/networks';

describe('Network Configuration', () => {
  describe('NETWORKS constant', () => {
    test('should contain required networks', () => {
      expect(NETWORKS).toHaveProperty('mainnet');
      expect(NETWORKS).toHaveProperty('chronos');

      expect(NETWORKS.mainnet.name).toBe('Autonomys Mainnet');
      expect(NETWORKS.mainnet.rpcEndpoint).toBe('wss://rpc.mainnet.autonomys.xyz/ws');

      expect(NETWORKS.chronos.name).toBe('Chronos Testnet');
      expect(NETWORKS.chronos.rpcEndpoint).toBe('wss://rpc.chronos.autonomys.xyz/ws');
    });
  });

  describe('getNetworkConfig', () => {
    test('should return correct config for valid networks', () => {
      const mainnetConfig = getNetworkConfig('mainnet');
      expect(mainnetConfig.name).toBe('Autonomys Mainnet');
      expect(mainnetConfig.rpcEndpoint).toBe('wss://rpc.mainnet.autonomys.xyz/ws');

      const chronosConfig = getNetworkConfig('chronos');
      expect(chronosConfig.name).toBe('Chronos Testnet');
      expect(chronosConfig.rpcEndpoint).toBe('wss://rpc.chronos.autonomys.xyz/ws');
    });

    test('should handle case insensitive network names', () => {
      expect(getNetworkConfig('MAINNET')).toEqual(NETWORKS.mainnet);
      expect(getNetworkConfig('Chronos')).toEqual(NETWORKS.chronos);
    });

    test('should throw error for invalid networks', () => {
      expect(() => getNetworkConfig('invalid')).toThrow('Unknown network: invalid');
      expect(() => getNetworkConfig('')).toThrow('Unknown network: ');
    });
  });

  describe('validateNetworkName', () => {
    test('should validate correct network names', () => {
      expect(validateNetworkName('mainnet')).toBe(true);
      expect(validateNetworkName('chronos')).toBe(true);
      expect(validateNetworkName('MAINNET')).toBe(true);
      expect(validateNetworkName('Chronos')).toBe(true);
    });

    test('should reject invalid network names', () => {
      expect(validateNetworkName('invalid')).toBe(false);
      expect(validateNetworkName('')).toBe(false);
      expect(validateNetworkName('taurus')).toBe(false); // Deprecated network
    });
  });
});
