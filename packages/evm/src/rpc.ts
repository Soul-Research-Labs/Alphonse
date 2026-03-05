/**
 * RPC transport creation with fallback rotation.
 *
 * Uses viem's fallback + http transports to automatically rotate
 * between endpoints on failure/rate-limiting.
 */

import { http, fallback, type Transport } from 'viem';
import type { RpcConfig, RpcEndpoint } from './types/network';

/**
 * Create a viem Transport with automatic fallback rotation.
 *
 * Endpoints are tried in order. On failure, the next endpoint is used.
 * This implements the rotation requirement from AGENTS.md.
 */
export function createRpcTransport(config: RpcConfig): Transport {
  const transports = config.endpoints.map((ep: RpcEndpoint) =>
    http(ep.url, {
      timeout: config.requestTimeoutMs,
      retryCount: config.maxRetries,
      retryDelay: config.retryBackoffMs,
    })
  );

  return fallback(transports, { rank: true });
}

/** Default RPC config values. */
export const DEFAULT_RPC_CONFIG = {
  requestTimeoutMs: 15_000,
  maxRetries: 2,
  retryBackoffMs: 1_000,
} as const;
