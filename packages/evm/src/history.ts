/**
 * Local transaction tracker.
 *
 * Tracks transactions initiated by the app. For M1, we don't have
 * an indexer API, so we only track outgoing transactions locally
 * and poll for their receipt status.
 *
 * Incoming transactions are detected via balance-change polling.
 */

import { Result } from '@alphonse/core';
import type { Address, AsyncResult, TxHash, BigIntString, Timestamp } from '@alphonse/core';
import type { Pool } from '@alphonse/core';
import type {
  TransactionHistoryEntry,
  TransactionDirection,
  TransactionStatus,
} from './types/transaction';
import type { EvmClient } from './client';

// ---------------------------------------------------------------------------
// Tracker interface
// ---------------------------------------------------------------------------

export interface TransactionTracker {
  /** Record a new outgoing transaction. */
  track: (entry: TransactionHistoryEntry) => void;
  /** Get all tracked transactions, newest first. */
  getAll: () => readonly TransactionHistoryEntry[];
  /** Get transactions for a specific address. */
  getForAddress: (address: Address) => readonly TransactionHistoryEntry[];
  /** Update the status of a pending transaction. */
  updateStatus: (hash: TxHash, status: TransactionStatus, blockNumber?: bigint) => void;
  /** Poll all pending transactions and update their status. */
  refreshPending: (client: EvmClient) => AsyncResult<number>;
  /** Get count of pending transactions. */
  pendingCount: () => number;
  /** Clear all tracked transactions. */
  clear: () => void;
  /** Export all entries (for persistence). */
  export: () => readonly TransactionHistoryEntry[];
  /** Import entries (from persistence). */
  import: (entries: readonly TransactionHistoryEntry[]) => void;
}

// ---------------------------------------------------------------------------
// Create tracker
// ---------------------------------------------------------------------------

export function createTransactionTracker(): TransactionTracker {
  let entries: TransactionHistoryEntry[] = [];

  function track(entry: TransactionHistoryEntry): void {
    // Deduplicate by hash
    if (entries.some((e) => e.hash === entry.hash)) return;
    entries.unshift(entry); // Newest first
  }

  function getAll(): readonly TransactionHistoryEntry[] {
    return entries;
  }

  function getForAddress(address: Address): readonly TransactionHistoryEntry[] {
    const lower = (address as string).toLowerCase();
    return entries.filter(
      (e) => (e.from as string).toLowerCase() === lower || (e.to as string).toLowerCase() === lower
    );
  }

  function updateStatus(hash: TxHash, status: TransactionStatus, blockNumber?: bigint): void {
    const idx = entries.findIndex((e) => e.hash === hash);
    if (idx === -1) return;
    entries[idx] = {
      ...entries[idx],
      status,
    };
  }

  async function refreshPending(client: EvmClient): AsyncResult<number> {
    let updated = 0;
    const pending = entries.filter((e) => e.status === 'PENDING');

    for (const entry of pending) {
      const result = await client.getTransactionReceipt(entry.hash);
      if (!result.ok) continue;
      if (result.value === null) continue;

      const newStatus = result.value.status;
      updateStatus(entry.hash, newStatus, result.value.blockNumber);
      updated++;
    }

    return Result.ok(updated);
  }

  function pendingCount(): number {
    return entries.filter((e) => e.status === 'PENDING').length;
  }

  function clear(): void {
    entries = [];
  }

  return {
    track,
    getAll,
    getForAddress,
    updateStatus,
    refreshPending,
    pendingCount,
    clear,
    export: () => [...entries],
    import: (imported) => {
      // Merge, deduplicating by hash
      const existing = new Set(entries.map((e) => e.hash));
      for (const e of imported) {
        if (!existing.has(e.hash)) {
          entries.push(e);
          existing.add(e.hash);
        }
      }
      // Sort by timestamp descending
      entries.sort((a, b) => (b.timestamp as number) - (a.timestamp as number));
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: create a history entry for an outgoing ETH transfer
// ---------------------------------------------------------------------------

export function createEthTransferEntry(params: {
  hash: TxHash;
  from: Address;
  to: Address;
  value: bigint;
  fee?: string;
}): TransactionHistoryEntry {
  const { formatEther } = require('viem') as typeof import('viem');
  return {
    hash: params.hash,
    direction: 'OUTGOING' as TransactionDirection,
    status: 'PENDING' as TransactionStatus,
    pool: 'PUBLIC' as Pool,
    from: params.from,
    to: params.to,
    amount: formatEther(params.value),
    assetSymbol: 'ETH',
    fee: params.fee ?? '0',
    timestamp: Date.now() as Timestamp,
  };
}

/** Create a history entry for an outgoing ERC-20 transfer. */
export function createTokenTransferEntry(params: {
  hash: TxHash;
  from: Address;
  to: Address;
  amount: string;
  symbol: string;
  fee?: string;
}): TransactionHistoryEntry {
  return {
    hash: params.hash,
    direction: 'OUTGOING' as TransactionDirection,
    status: 'PENDING' as TransactionStatus,
    pool: 'PUBLIC' as Pool,
    from: params.from,
    to: params.to,
    amount: params.amount,
    assetSymbol: params.symbol,
    fee: params.fee ?? '0',
    timestamp: Date.now() as Timestamp,
  };
}
