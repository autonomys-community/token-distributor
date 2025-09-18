import { NetworkConfig } from '../types';

export const NETWORKS: Record<string, NetworkConfig> = {
  mainnet: {
    name: 'Autonomys Mainnet',
    rpcEndpoint: 'wss://rpc.mainnet.autonomys.xyz/ws',
  },
  chronos: {
    name: 'Chronos Testnet',
    rpcEndpoint: 'wss://rpc.chronos.autonomys.xyz/ws',
  },
};

export function getNetworkConfig(networkName: string): NetworkConfig {
  const config = NETWORKS[networkName.toLowerCase()];
  if (!config) {
    throw new Error(
      `Unknown network: ${networkName}. Available networks: ${Object.keys(NETWORKS).join(', ')}`
    );
  }
  return config;
}

export function validateNetworkName(networkName: string): boolean {
  return Object.keys(NETWORKS).includes(networkName.toLowerCase());
}
