/**
 * ERC-20 token types.
 *
 * v1 supports ETH + up to 2 ERC-20 tokens.
 */

import type { Address, BigIntString, Timestamp } from '@alphonse/core';

// ---------------------------------------------------------------------------
// Token metadata
// ---------------------------------------------------------------------------

export interface TokenInfo {
  /** Contract address. */
  readonly address: Address;
  /** Token name (e.g. "USD Coin"). */
  readonly name: string;
  /** Token symbol (e.g. "USDC"). */
  readonly symbol: string;
  /** Decimal places. */
  readonly decimals: number;
  /** Logo URL (optional, for UI display). */
  readonly logoUrl?: string;
}

// ---------------------------------------------------------------------------
// Token balance
// ---------------------------------------------------------------------------

export interface TokenBalance {
  readonly token: TokenInfo;
  /** Raw balance in smallest unit. */
  readonly balance: BigIntString;
  /** Human-readable formatted balance. */
  readonly formatted: string;
  readonly updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Token allowance (needed for shield operations)
// ---------------------------------------------------------------------------

export interface TokenAllowance {
  readonly token: TokenInfo;
  /** Spender address (e.g. privacy contract). */
  readonly spender: Address;
  /** Approved amount in smallest unit. */
  readonly allowance: BigIntString;
}
