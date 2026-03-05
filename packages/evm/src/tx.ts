/**
 * Transaction building, signing, and sending.
 *
 * Separation of concerns:
 * - buildTransaction(): creates unsigned EIP-1559 tx
 * - signTransaction(): signs with secp256k1 private key
 * - sendTransaction(): complete flow (build → sign → send)
 *
 * Signing happens locally using the wallet's private key.
 * Never imports keys from external sources.
 */

import { serializeTransaction, keccak256, type TransactionSerializableEIP1559 } from 'viem';
import { Result } from '@alphonse/core';
import type { Address, AsyncResult, Hex, TxHash } from '@alphonse/core';
import type { FeeSpeed } from './types/fee';
import type { EvmClient } from './client';
import { estimateFees } from './fee';
import { encodeTransfer } from './erc20';
import { secp256k1 } from '@alphonse/core/src/crypto/deps';

// ---------------------------------------------------------------------------
// Transaction signer interface
// ---------------------------------------------------------------------------

/**
 * Abstraction for transaction signing.
 * Decouples the EVM package from core's key management.
 * Hardware wallets can implement this interface too.
 */
export interface TransactionSigner {
  /** The signer's EVM address. */
  readonly address: Address;
  /** Sign a 32-byte hash (keccak256 of unsigned serialized tx). */
  sign: (hash: Uint8Array) => Promise<{ r: bigint; s: bigint; yParity: number }>;
}

// ---------------------------------------------------------------------------
// Create signer from raw private key
// ---------------------------------------------------------------------------

/**
 * Create a TransactionSigner from a secp256k1 private key.
 * The private key must be 32 bytes. It stays in memory only.
 */
export function createSigner(privateKey: Uint8Array, address: Address): TransactionSigner {
  // Lazily import secp256k1 to avoid top-level dependency
  let secp: typeof import('viem/accounts') | null = null;

  return {
    address,
    async sign(hash: Uint8Array): Promise<{ r: bigint; s: bigint; yParity: number }> {
      // Use noble/curves secp256k1 for signing (already available via @alphonse/core deps)
      const sig = secp256k1.sign(hash, privateKey);
      return {
        r: sig.r,
        s: sig.s,
        yParity: sig.recovery,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Build unsigned transaction
// ---------------------------------------------------------------------------

export interface BuildTransactionParams {
  from: Address;
  to: Address;
  /** Value in wei (for native transfers). */
  value?: bigint;
  /** Calldata (for contract calls). */
  data?: Hex;
  chainId: number;
  nonce: number;
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

/**
 * Serialize an unsigned EIP-1559 transaction and return its hash.
 * Returns both the serialized bytes and the signing hash (keccak256).
 */
export function buildTransaction(params: BuildTransactionParams): {
  serialized: Hex;
  hash: Uint8Array;
} {
  const tx: TransactionSerializableEIP1559 = {
    type: 'eip1559',
    chainId: params.chainId,
    nonce: params.nonce,
    to: params.to as `0x${string}`,
    value: params.value ?? 0n,
    data: (params.data as `0x${string}`) ?? undefined,
    gas: params.gasLimit,
    maxFeePerGas: params.maxFeePerGas,
    maxPriorityFeePerGas: params.maxPriorityFeePerGas,
  };

  const serialized = serializeTransaction(tx);
  const hashHex = keccak256(serialized);

  // Convert hex hash to Uint8Array for signing
  const hashBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    hashBytes[i] = parseInt(hashHex.slice(2 + i * 2, 4 + i * 2), 16);
  }

  return { serialized: serialized as Hex, hash: hashBytes };
}

/**
 * Sign a pre-built transaction and produce the signed serialized bytes.
 */
export async function signTransaction(
  params: BuildTransactionParams,
  signer: TransactionSigner
): Promise<Hex> {
  const tx: TransactionSerializableEIP1559 = {
    type: 'eip1559',
    chainId: params.chainId,
    nonce: params.nonce,
    to: params.to as `0x${string}`,
    value: params.value ?? 0n,
    data: (params.data as `0x${string}`) ?? undefined,
    gas: params.gasLimit,
    maxFeePerGas: params.maxFeePerGas,
    maxPriorityFeePerGas: params.maxPriorityFeePerGas,
  };

  // Hash the unsigned transaction
  const unsignedSerialized = serializeTransaction(tx);
  const hashHex = keccak256(unsignedSerialized);
  const hashBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    hashBytes[i] = parseInt(hashHex.slice(2 + i * 2, 4 + i * 2), 16);
  }

  // Sign the hash
  const sig = await signer.sign(hashBytes);

  // Serialize with signature
  const signedSerialized = serializeTransaction(tx, {
    r: `0x${sig.r.toString(16).padStart(64, '0')}` as `0x${string}`,
    s: `0x${sig.s.toString(16).padStart(64, '0')}` as `0x${string}`,
    yParity: sig.yParity,
  });

  return signedSerialized as Hex;
}

// ---------------------------------------------------------------------------
// High-level send transaction
// ---------------------------------------------------------------------------

export interface SendTransactionParams {
  /** Sender/signer address. */
  from: Address;
  /** Recipient address. */
  to: Address;
  /** Value in wei (for ETH transfers). */
  value?: bigint;
  /** For ERC-20: token contract address + amount (auto-encodes transfer calldata). */
  token?: { address: Address; amount: bigint };
  /** Fee speed tier (defaults to STANDARD). */
  feeSpeed?: FeeSpeed;
  /** If provided, skips fee estimation and uses these values. */
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasLimit?: bigint;
}

/**
 * Complete transaction flow: estimate → build → sign → send.
 *
 * This is the primary high-level API for sending transactions.
 * Returns the tx hash. Caller is responsible for receipt polling/tracking.
 */
export async function sendTransaction(
  client: EvmClient,
  signer: TransactionSigner,
  params: SendTransactionParams
): AsyncResult<TxHash> {
  try {
    // 1. Determine calldata and destination
    let to = params.to;
    let value = params.value ?? 0n;
    let data: Hex | undefined;

    if (params.token) {
      // ERC-20 transfer: to=contract, data=transfer(recipient, amount)
      to = params.token.address;
      value = 0n;
      data = encodeTransfer(params.to, params.token.amount);
    }

    // 2. Get nonce
    const nonceResult = await client.getNonce(params.from);
    if (!nonceResult.ok) return nonceResult;

    // 3. Estimate fees (if not provided)
    let maxFeePerGas = params.maxFeePerGas;
    let maxPriorityFeePerGas = params.maxPriorityFeePerGas;
    let gasLimit = params.gasLimit;

    if (!maxFeePerGas || !maxPriorityFeePerGas || !gasLimit) {
      const speed = params.feeSpeed ?? 'STANDARD';
      const feeResult = await estimateFees(client, {
        from: params.from,
        to,
        value,
        data,
        gasLimit,
      });
      if (!feeResult.ok) return feeResult;

      const tier =
        speed === 'SLOW'
          ? feeResult.value.slow
          : speed === 'FAST'
            ? feeResult.value.fast
            : feeResult.value.standard;

      maxFeePerGas = maxFeePerGas ?? BigInt(tier.maxFeePerGas);
      maxPriorityFeePerGas = maxPriorityFeePerGas ?? BigInt(tier.maxPriorityFeePerGas);
      gasLimit = gasLimit ?? BigInt(tier.gasLimit);
    }

    // 4. Build and sign
    const signedTx = await signTransaction(
      {
        from: params.from,
        to,
        value,
        data,
        chainId: client.getChainId(),
        nonce: nonceResult.value,
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
      },
      signer
    );

    // 5. Broadcast
    return client.sendRawTransaction(signedTx);
  } catch (cause) {
    return Result.err({
      code: 'TX_FAILED' as const,
      message: 'Failed to send transaction',
      cause,
    });
  }
}
