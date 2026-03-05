/**
 * Private state tracking types.
 *
 * The Vault balance is NOT an on-chain balance query — it is computed
 * from private state (notes discovered, spent/unspent tracking).
 * The adapter manages note discovery and balance computation.
 *
 * Resync must be manually triggerable ("Resync Vault" action)
 * with clear recovery UX.
 */

import type { Address, BigIntString, Brand, Timestamp } from '@alphonse/core';

// ---------------------------------------------------------------------------
// Vault balance
// ---------------------------------------------------------------------------

/** Balance of a single asset in the Vault. */
export interface VaultBalance {
  /** Asset contract address (null = native asset). */
  readonly assetContract: Address | null;
  /** Asset symbol (e.g. "ETH"). */
  readonly assetSymbol: string;
  /** Total available (unspent) balance. */
  readonly available: BigIntString;
  /** Balance currently pending (in-flight operations). */
  readonly pending: BigIntString;
  /** When this balance was last computed. */
  readonly computedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Private note (internal tracking)
// ---------------------------------------------------------------------------

export const NoteStatus = {
  /** Note exists and is spendable. */
  UNSPENT: 'UNSPENT',
  /** Note has been consumed in a transaction. */
  SPENT: 'SPENT',
  /** Note is being consumed — tx not yet finalized. */
  PENDING_SPEND: 'PENDING_SPEND',
} as const;

export type NoteStatus = (typeof NoteStatus)[keyof typeof NoteStatus];

/** Protocol-specific note identifier. */
export type PrivateNoteId = Brand<string, 'PrivateNoteId'>;

/**
 * A private note tracked by the adapter.
 *
 * This is the fundamental unit of private balance —
 * Vault balance = sum of UNSPENT note values.
 */
export interface PrivateNote {
  readonly noteId: PrivateNoteId;
  readonly status: NoteStatus;
  readonly assetContract: Address | null;
  readonly value: BigIntString;
  readonly createdAt: Timestamp;
  /** When this note was spent (if SPENT). */
  readonly spentAt?: Timestamp;
}

// ---------------------------------------------------------------------------
// State snapshot (resync output)
// ---------------------------------------------------------------------------

/** Full snapshot of private state after a resync. */
export interface PrivateStateSnapshot {
  /** All discovered notes. */
  readonly notes: ReadonlyArray<PrivateNote>;
  /** Computed balances per asset. */
  readonly balances: ReadonlyArray<VaultBalance>;
  /** When the resync completed. */
  readonly syncedAt: Timestamp;
  /** Block height the sync covers up to (if applicable). */
  readonly syncedToBlock?: bigint;
}
