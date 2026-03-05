/**
 * ERC-20 ABI fragments and encoding helpers.
 *
 * Minimal set needed for balance queries & transfers.
 */

import { encodeFunctionData, decodeFunctionResult, type Hex } from 'viem';
import type { Address } from '@alphonse/core';

// ---------------------------------------------------------------------------
// ABI fragments
// ---------------------------------------------------------------------------

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

export function encodeBalanceOf(account: Address): Hex {
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account as `0x${string}`],
  });
}

export function decodeBalanceOf(data: Hex): bigint {
  return decodeFunctionResult({
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    data,
  }) as bigint;
}

export function encodeTransfer(to: Address, amount: bigint): Hex {
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [to as `0x${string}`, amount],
  });
}

export function encodeApprove(spender: Address, amount: bigint): Hex {
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender as `0x${string}`, amount],
  });
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Format a raw token amount with decimals (e.g. 1000000n, 6 → "1.0"). */
export function formatTokenAmount(raw: bigint, decimals: number, maxDecimals = 6): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;

  if (remainder === 0n) return whole.toString();

  const fracStr = remainder.toString().padStart(decimals, '0');
  const trimmed = fracStr.slice(0, maxDecimals).replace(/0+$/, '');
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole.toString();
}

/** Parse a human-readable amount to raw (e.g. "1.5", 18 → 1500000000000000000n). */
export function parseTokenAmount(amount: string, decimals: number): bigint {
  const [whole = '0', frac = ''] = amount.split('.');
  const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(paddedFrac);
}
