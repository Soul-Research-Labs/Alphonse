/**
 * EIP-1559 fee estimation with multi-tier speed options.
 *
 * Queries latest block base fee and priority fee to compute
 * slow / standard / fast estimates.
 */

import { formatEther } from 'viem';
import { Result } from '@alphonse/core';
import type { Address, AsyncResult, Hex, BigIntString } from '@alphonse/core';
import type { FeeEstimate, FeeEstimates, FeeSpeed } from './types/fee';
import type { EvmClient } from './client';

// ---------------------------------------------------------------------------
// Speed multipliers (applied to priority fee)
// ---------------------------------------------------------------------------

const PRIORITY_MULTIPLIER: Record<string, bigint> = {
  SLOW: 80n,
  STANDARD: 100n,
  FAST: 150n,
};

/** How much to pad the base fee to account for next-block increases. */
const BASE_FEE_PAD: Record<string, bigint> = {
  SLOW: 100n, // 1x (no pad)
  STANDARD: 112n, // 1.12x (one block increase)
  FAST: 125n, // 1.25x (two block increases)
};

const DEFAULT_PRIORITY_FEE = 1_500_000_000n; // 1.5 gwei
const MIN_PRIORITY_FEE = 1_000_000_000n; // 1 gwei
const DEFAULT_GAS_LIMIT = 21_000n; // ETH transfer

// ---------------------------------------------------------------------------
// Fee estimation
// ---------------------------------------------------------------------------

export interface EstimateFeesOptions {
  /** Override gas limit (defaults to eth_estimateGas or 21000). */
  gasLimit?: bigint;
  /** Transaction params for gas estimation. */
  from?: Address;
  to?: Address;
  value?: bigint;
  data?: Hex;
}

export async function estimateFees(
  client: EvmClient,
  options: EstimateFeesOptions = {}
): AsyncResult<FeeEstimates> {
  try {
    // Get base fee from latest block
    const blockResult = await client.getBlock('latest');
    if (!blockResult.ok) return blockResult;

    const baseFee = blockResult.value.baseFee;

    // Determine gas limit
    let gasLimit = options.gasLimit ?? DEFAULT_GAS_LIMIT;
    if (!options.gasLimit && options.from && options.to) {
      const gasResult = await client.estimateGas({
        from: options.from,
        to: options.to,
        value: options.value,
        data: options.data,
      });
      if (gasResult.ok) {
        // Add 20% buffer to estimated gas
        gasLimit = (gasResult.value * 120n) / 100n;
      }
    }

    // Get priority fee hint from the node
    let priorityFee = DEFAULT_PRIORITY_FEE;
    try {
      const viemClient = client.getViemClient();
      const maxPriorityFee = await (viemClient as any).request({
        method: 'eth_maxPriorityFeePerGas',
      });
      const parsed = BigInt(maxPriorityFee);
      if (parsed > MIN_PRIORITY_FEE) priorityFee = parsed;
    } catch {
      // Fall back to default priority fee
    }

    function buildEstimate(speed: string): FeeEstimate {
      const paddedBase = (baseFee * BASE_FEE_PAD[speed]) / 100n;
      const adjustedPriority = (priorityFee * PRIORITY_MULTIPLIER[speed]) / 100n;
      const maxFee = paddedBase + adjustedPriority;
      const estimatedCost = gasLimit * maxFee;

      return {
        speed: speed as FeeSpeed,
        maxFeePerGas: maxFee.toString() as BigIntString,
        maxPriorityFeePerGas: adjustedPriority.toString() as BigIntString,
        gasLimit: gasLimit.toString() as BigIntString,
        estimatedCost: estimatedCost.toString() as BigIntString,
        estimatedCostFormatted: formatEther(estimatedCost),
      };
    }

    return Result.ok({
      slow: buildEstimate('SLOW'),
      standard: buildEstimate('STANDARD'),
      fast: buildEstimate('FAST'),
      baseFee: baseFee.toString() as BigIntString,
    });
  } catch (cause) {
    return Result.err({
      code: 'RPC_ERROR' as const,
      message: 'Failed to estimate fees',
      cause,
    });
  }
}
