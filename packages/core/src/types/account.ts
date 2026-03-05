/**
 * Account model and pool types.
 *
 * ALPHONSE shows two pools to the user:
 * - Checking (Public): Normal EVM wallet balance.
 * - Vault (Private): Shielded balance tracked via privacy layer (Aztec v1).
 *
 * Both pools are controlled by the same wallet identity (single SRP).
 * The Vault is NOT "another address" — it is private state.
 */

import type { Address, BigIntString, Timestamp } from './common';

// ---------------------------------------------------------------------------
// Pool model
// ---------------------------------------------------------------------------

/** The two fund pools visible to the user. */
export const Pool = {
  /** Normal on-chain EVM balance (publicly visible). */
  PUBLIC: 'PUBLIC',
  /** Shielded balance tracked via privacy protocol (Aztec). */
  VAULT: 'VAULT',
} as const;

export type Pool = (typeof Pool)[keyof typeof Pool];

// ---------------------------------------------------------------------------
// Asset identifier
// ---------------------------------------------------------------------------

/** Identifies a supported asset. */
export interface AssetId {
  /** Token contract address, or `null` for the native asset (ETH). */
  readonly contractAddress: Address | null;
  /** Human-readable symbol (e.g. "ETH", "USDC"). */
  readonly symbol: string;
  /** Decimal places for the token. */
  readonly decimals: number;
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

/** Balance for a single asset within a single pool. */
export interface PoolAssetBalance {
  readonly pool: Pool;
  readonly asset: AssetId;
  /** Balance in the smallest unit (wei, satoshi-equivalent, etc.). */
  readonly amount: BigIntString;
  /** When this balance was last refreshed. */
  readonly updatedAt: Timestamp;
}

/** Unified view of an asset across both pools. */
export interface UnifiedAssetBalance {
  readonly asset: AssetId;
  readonly public: BigIntString;
  readonly vault: BigIntString;
  readonly total: BigIntString;
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

/** Represents the user's public account (EVM address). */
export interface PublicAccount {
  /** The user's primary EVM address (derived from SRP via BIP-44). */
  readonly address: Address;
  /** Derivation path used (e.g. "m/44'/60'/0'/0/0"). */
  readonly derivationPath: string;
}
