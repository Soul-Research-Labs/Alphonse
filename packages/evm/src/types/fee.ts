/**
 * Fee estimation types.
 *
 * Supports EIP-1559 fee estimation with multiple speed tiers.
 */

import type { BigIntString } from '@alphonse/core';

// ---------------------------------------------------------------------------
// Fee estimation
// ---------------------------------------------------------------------------

export const FeeSpeed = {
  SLOW: 'SLOW',
  STANDARD: 'STANDARD',
  FAST: 'FAST',
} as const;

export type FeeSpeed = (typeof FeeSpeed)[keyof typeof FeeSpeed];

export interface FeeEstimate {
  readonly speed: FeeSpeed;
  /** EIP-1559 max fee per gas (wei). */
  readonly maxFeePerGas: BigIntString;
  /** EIP-1559 max priority fee per gas (wei). */
  readonly maxPriorityFeePerGas: BigIntString;
  /** Estimated gas limit for the transaction. */
  readonly gasLimit: BigIntString;
  /** Total estimated cost in wei (gasLimit * maxFeePerGas). */
  readonly estimatedCost: BigIntString;
  /** Human-readable estimated cost. */
  readonly estimatedCostFormatted: string;
}

/** Fee estimates for all speed tiers. */
export interface FeeEstimates {
  readonly slow: FeeEstimate;
  readonly standard: FeeEstimate;
  readonly fast: FeeEstimate;
  /** Base fee of the latest block (wei). */
  readonly baseFee: BigIntString;
}
