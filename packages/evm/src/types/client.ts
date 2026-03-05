/**
 * EVM client configuration types.
 *
 * The EVM client is viem-based and connects to a single network at a time.
 * It handles RPC communication, account resolution, and chain state queries.
 */

import type { NetworkConfig, RpcConfig } from './network';

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

export interface EvmClientConfig {
  /** Network to connect to. */
  readonly network: NetworkConfig;
  /** RPC endpoint rotation config. */
  readonly rpc: RpcConfig;
}

// ---------------------------------------------------------------------------
// Block reference
// ---------------------------------------------------------------------------

export type BlockTag = 'latest' | 'pending' | 'earliest' | 'safe' | 'finalized';

export interface BlockReference {
  /** Block number (if known). */
  readonly number?: bigint;
  /** Block tag for RPC calls. */
  readonly tag: BlockTag;
}
