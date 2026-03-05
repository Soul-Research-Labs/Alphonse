/**
 * EVM network configuration and RPC endpoint rotation.
 *
 * Constraints from AGENTS.md:
 * - v1 supports ONE EVM network (configurable).
 * - RPC endpoint rotation is required for rate-limits and timeouts.
 * - Support user-specified RPC URLs.
 */

import type { Brand, Timestamp } from '@alphonse/core';

// ---------------------------------------------------------------------------
// Chain / Network
// ---------------------------------------------------------------------------

/** EVM chain ID (e.g. 1 for mainnet, 11155111 for Sepolia). */
export type ChainId = Brand<number, 'ChainId'>;

export interface NetworkConfig {
  /** Chain ID for this network. */
  readonly chainId: ChainId;
  /** Human-readable network name (e.g. "Ethereum Mainnet"). */
  readonly name: string;
  /** Native asset symbol (e.g. "ETH"). */
  readonly nativeCurrency: {
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
  };
  /** Block explorer URL (optional). */
  readonly explorerUrl?: string;
}

// ---------------------------------------------------------------------------
// RPC endpoint rotation
// ---------------------------------------------------------------------------

export const RpcEndpointStatus = {
  HEALTHY: 'HEALTHY',
  RATE_LIMITED: 'RATE_LIMITED',
  UNREACHABLE: 'UNREACHABLE',
} as const;

export type RpcEndpointStatus = (typeof RpcEndpointStatus)[keyof typeof RpcEndpointStatus];

export interface RpcEndpoint {
  /** RPC URL. */
  readonly url: string;
  /** Whether this endpoint was provided by the user. */
  readonly isUserProvided: boolean;
  /** Current health status. */
  readonly status: RpcEndpointStatus;
  /** When the status was last checked. */
  readonly lastCheckedAt: Timestamp | null;
  /** Consecutive failure count (used for backoff). */
  readonly failureCount: number;
}

export interface RpcConfig {
  /** Ordered list of RPC endpoints (tried in order, rotated on failure). */
  readonly endpoints: readonly [RpcEndpoint, ...Array<RpcEndpoint>];
  /** Request timeout in milliseconds. */
  readonly requestTimeoutMs: number;
  /** Max retries before marking an endpoint as unreachable. */
  readonly maxRetries: number;
  /** Back-off base delay in milliseconds between retries. */
  readonly retryBackoffMs: number;
}
