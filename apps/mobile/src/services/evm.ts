/**
 * EVM client service — creates and manages the EVM client instance.
 */

import {
  createEvmClient,
  createProxiedFetch,
  createTransactionTracker,
  DEFAULT_NETWORK,
  DEFAULT_RPC_ENDPOINTS,
} from '@alphonse/evm';
import type { EvmClient, TransactionTracker, ProxiedFetch } from '@alphonse/evm';
import type { NetworkConfig, RpcEndpoint } from '@alphonse/evm';

export interface EvmServices {
  readonly client: EvmClient;
  readonly tracker: TransactionTracker;
  readonly network: NetworkConfig;
}

/**
 * Initialize EVM services.
 *
 * Creates an EVM client connected to the configured network
 * and a transaction tracker for local history.
 */
export function initEvmServices(options?: {
  network?: NetworkConfig;
  userRpcUrls?: string[];
  proxyFetch?: ProxiedFetch;
  tracker?: TransactionTracker;
}): EvmServices {
  const network = options?.network ?? DEFAULT_NETWORK;

  // Build endpoint list: user-provided first, then defaults
  const defaultEndpoints = DEFAULT_RPC_ENDPOINTS[network.chainId as number] ?? [];
  const userEndpoints: RpcEndpoint[] = (options?.userRpcUrls ?? []).map((url) => ({
    url,
    isUserProvided: true,
    status: 'HEALTHY' as const,
    lastCheckedAt: null,
    failureCount: 0,
  }));

  const endpoints = [...userEndpoints, ...defaultEndpoints];

  const client = createEvmClient({
    network,
    rpcEndpoints: endpoints.length > 0 ? endpoints : undefined,
    proxyFetch: options?.proxyFetch,
  });

  const tracker = options?.tracker ?? createTransactionTracker();

  return { client, tracker, network };
}
