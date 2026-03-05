/**
 * Pre-configured network definitions.
 *
 * v1 ships with ONE EVM network (configurable).
 * Sepolia for development, Ethereum mainnet for production.
 */

import type { NetworkConfig, ChainId, RpcEndpoint } from './types/network';
import { RpcEndpointStatus } from './types/network';
import type { Address } from '@alphonse/core';

// ---------------------------------------------------------------------------
// Chain IDs
// ---------------------------------------------------------------------------

export const CHAIN_ID = {
  ETHEREUM: 1 as ChainId,
  SEPOLIA: 11155111 as ChainId,
} as const;

// ---------------------------------------------------------------------------
// Network configurations
// ---------------------------------------------------------------------------

export const ETHEREUM_MAINNET: NetworkConfig = {
  chainId: CHAIN_ID.ETHEREUM,
  name: 'Ethereum Mainnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  explorerUrl: 'https://etherscan.io',
};

export const SEPOLIA_TESTNET: NetworkConfig = {
  chainId: CHAIN_ID.SEPOLIA,
  name: 'Sepolia Testnet',
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  explorerUrl: 'https://sepolia.etherscan.io',
};

/** Default network for v1. */
export const DEFAULT_NETWORK = SEPOLIA_TESTNET;

// ---------------------------------------------------------------------------
// Default RPC endpoints
// ---------------------------------------------------------------------------

function endpoint(url: string, isUserProvided = false): RpcEndpoint {
  return {
    url,
    isUserProvided,
    status: RpcEndpointStatus.HEALTHY,
    lastCheckedAt: null,
    failureCount: 0,
  };
}

export const DEFAULT_RPC_ENDPOINTS: Record<number, readonly RpcEndpoint[]> = {
  [CHAIN_ID.ETHEREUM]: [
    endpoint('https://eth.llamarpc.com'),
    endpoint('https://rpc.ankr.com/eth'),
    endpoint('https://ethereum-rpc.publicnode.com'),
  ],
  [CHAIN_ID.SEPOLIA]: [
    endpoint('https://rpc.sepolia.org'),
    endpoint('https://rpc2.sepolia.org'),
    endpoint('https://ethereum-sepolia-rpc.publicnode.com'),
  ],
};

// ---------------------------------------------------------------------------
// Known ERC-20 tokens (v1: up to 2)
// ---------------------------------------------------------------------------

export interface KnownToken {
  readonly address: Address;
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly logoUrl?: string;
}

export const KNOWN_TOKENS: Record<number, readonly KnownToken[]> = {
  [CHAIN_ID.ETHEREUM]: [
    {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
    },
    {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address,
      name: 'Tether USD',
      symbol: 'USDT',
      decimals: 6,
    },
  ],
  [CHAIN_ID.SEPOLIA]: [
    {
      address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
    },
  ],
};
