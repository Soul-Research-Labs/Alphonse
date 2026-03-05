/**
 * Vault operation types: shield, unshield, private send.
 *
 * These represent the three core vault operations in ALPHONSE.
 * Operations are protocol-agnostic — the adapter translates them
 * into protocol-specific calls (e.g. Aztec SDK).
 *
 * UX rules from AGENTS.md:
 * - Default sending is Public unless recipient supports private receive.
 * - Private-to-private requires a private receive identifier.
 * - Private-to-public (unshield) must warn: "This transfer is public."
 */

import type {
  Address,
  BigIntString,
  Brand,
  PrivateReceiveId,
  Timestamp,
  TxHash,
} from '@alphonse/core';

// PrivateReceiveId is defined in @alphonse/core so Contact can reference it
// without depending on @alphonse/privacy. Re-export from here for adapter consumers.
export type { PrivateReceiveId };

// ---------------------------------------------------------------------------
// Shield (Public → Vault)
// ---------------------------------------------------------------------------

export interface ShieldRequest {
  /** Public address to debit funds from. */
  readonly from: Address;
  /** Asset contract address (null = native asset). */
  readonly assetContract: Address | null;
  /** Amount in smallest unit. */
  readonly amount: BigIntString;
}

export interface ShieldResult {
  /** Transaction hash of the on-chain shield operation. */
  readonly txHash: TxHash;
  /** Amount actually shielded (after any fees). */
  readonly amountShielded: BigIntString;
  readonly timestamp: Timestamp;
}

// ---------------------------------------------------------------------------
// Unshield / Withdraw (Vault → Public)
// ---------------------------------------------------------------------------

export interface UnshieldRequest {
  /** Public address to credit funds to. */
  readonly to: Address;
  /** Asset contract address (null = native asset). */
  readonly assetContract: Address | null;
  /** Amount in smallest unit. */
  readonly amount: BigIntString;
  /**
   * Optional: enable chunking/delay for extra unlinkability.
   * Off by default. If enabled, the adapter splits the unshield
   * into smaller amounts with random delays.
   */
  readonly chunkingOptions?: ChunkingOptions;
}

export interface ChunkingOptions {
  /** Number of chunks to split the unshield into. */
  readonly chunks: number;
  /** Min delay between chunks in milliseconds. */
  readonly minDelayMs: number;
  /** Max delay between chunks in milliseconds. */
  readonly maxDelayMs: number;
}

export interface UnshieldResult {
  /** Transaction hash(es) — multiple if chunked. */
  readonly txHashes: ReadonlyArray<TxHash>;
  readonly amountUnshielded: BigIntString;
  readonly timestamp: Timestamp;
}

// ---------------------------------------------------------------------------
// Private Send (Vault → Vault)
// ---------------------------------------------------------------------------

export interface PrivateSendRequest {
  /** Private receive identifier of the recipient. */
  readonly to: PrivateReceiveId;
  /** Asset contract address (null = native asset). */
  readonly assetContract: Address | null;
  /** Amount in smallest unit. */
  readonly amount: BigIntString;
}

/** Branded proof identifier for private-send receipts. */
export type ProofId = Brand<string, 'ProofId'>;

export interface PrivateSendResult {
  /** Protocol-specific proof/receipt identifier. */
  readonly proofId: ProofId;
  readonly amountSent: BigIntString;
  readonly timestamp: Timestamp;
}
