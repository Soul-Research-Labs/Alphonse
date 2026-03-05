/**
 * Vault state tracker — persists and manages private state.
 *
 * The tracker wraps a PrivacyAdapter and a StorageAdapter to:
 * - Persist PrivateStateSnapshot to SYNC_STATE namespace
 * - Provide cached vault balances without round-tripping to PXE
 * - Support polling-based periodic sync
 * - Support manual resync triggered by user ("Resync Vault")
 * - Auto-save state on every successful resync
 *
 * The tracker does NOT manage the adapter lifecycle — the caller
 * creates and owns the adapter and storage instances.
 */

import { type Address, type Timestamp, type AsyncResult, Result, ErrorCode } from '@alphonse/core';

import type { StorageAdapter, StorageNamespace } from '@alphonse/storage';

import type { PrivacyAdapter } from '../types/adapter';
import type { VaultBalance, PrivateStateSnapshot } from '../types/state';

// ---------------------------------------------------------------------------
// Tracker types
// ---------------------------------------------------------------------------

export interface VaultStateTracker {
  /** Get the last known vault balances (from cache, no network call). */
  getBalances: () => ReadonlyArray<VaultBalance>;

  /** Get the last synced state snapshot (from cache). */
  getSnapshot: () => PrivateStateSnapshot | null;

  /** Whether a sync is currently in progress. */
  isSyncing: () => boolean;

  /** When the last successful sync occurred. */
  lastSyncedAt: () => Timestamp | null;

  /**
   * Perform a full resync — calls adapter.resyncState(), persists result.
   * Returns the fresh snapshot.
   */
  resync: (owner: Address) => AsyncResult<PrivateStateSnapshot>;

  /**
   * Quick balance refresh — calls adapter.getVaultBalance(), updates cache.
   * Lighter than full resync (no note discovery).
   */
  refreshBalances: (owner: Address) => AsyncResult<ReadonlyArray<VaultBalance>>;

  /** Start polling for balance updates at the given interval. */
  startPolling: (owner: Address, intervalMs: number) => void;

  /** Stop polling. */
  stopPolling: () => void;

  /** Load persisted state from storage (call on startup). */
  loadPersistedState: () => AsyncResult<PrivateStateSnapshot | null>;
}

export interface VaultStateTrackerConfig {
  /** The privacy adapter to query. */
  readonly adapter: PrivacyAdapter;
  /** Storage adapter for persistence. */
  readonly storage: StorageAdapter;
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const SYNC_STATE_NS = 'SYNC_STATE' as StorageNamespace;
const SNAPSHOT_KEY = 'vault_state_snapshot';

// ---------------------------------------------------------------------------
// Tracker implementation
// ---------------------------------------------------------------------------

export function createVaultStateTracker(config: VaultStateTrackerConfig): VaultStateTracker {
  const { adapter, storage } = config;

  let currentSnapshot: PrivateStateSnapshot | null = null;
  let syncing = false;
  let pollingTimer: ReturnType<typeof setInterval> | null = null;

  // --- Persistence ---

  async function persistSnapshot(snapshot: PrivateStateSnapshot): AsyncResult<void> {
    const serialized = serializeSnapshot(snapshot);
    return storage.set(SYNC_STATE_NS, SNAPSHOT_KEY, serialized);
  }

  async function loadPersistedState(): AsyncResult<PrivateStateSnapshot | null> {
    const result = await storage.get(SYNC_STATE_NS, SNAPSHOT_KEY);
    if (!result.ok) return result;
    if (result.value === null) return Result.ok(null);

    try {
      const snapshot = deserializeSnapshot(result.value);
      currentSnapshot = snapshot;
      return Result.ok(snapshot);
    } catch (cause) {
      return Result.err({
        code: ErrorCode.STORAGE_READ_FAILED,
        message: 'Failed to deserialize vault state snapshot',
        cause,
      });
    }
  }

  // --- Resync ---

  async function resync(owner: Address): AsyncResult<PrivateStateSnapshot> {
    if (syncing) {
      return Result.err({
        code: ErrorCode.VAULT_SYNC_FAILED,
        message: 'A vault sync is already in progress',
      });
    }

    syncing = true;
    try {
      const result = await adapter.resyncState(owner);
      if (!result.ok) {
        return result;
      }

      currentSnapshot = result.value;

      // Persist in background — don't fail the resync if storage write fails
      await persistSnapshot(result.value);

      return Result.ok(result.value);
    } finally {
      syncing = false;
    }
  }

  // --- Quick balance refresh ---

  async function refreshBalances(owner: Address): AsyncResult<ReadonlyArray<VaultBalance>> {
    const result = await adapter.getVaultBalance(owner);
    if (!result.ok) return result;

    // Update cached balances in the current snapshot
    if (currentSnapshot) {
      currentSnapshot = {
        ...currentSnapshot,
        balances: result.value,
      };
      await persistSnapshot(currentSnapshot);
    }

    return result;
  }

  // --- Polling ---

  function startPolling(owner: Address, intervalMs: number): void {
    stopPolling();
    pollingTimer = setInterval(() => {
      // Fire and forget — errors are swallowed during polling
      refreshBalances(owner).catch(() => {});
    }, intervalMs);
  }

  function stopPolling(): void {
    if (pollingTimer !== null) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  // --- Accessors ---

  function getBalances(): ReadonlyArray<VaultBalance> {
    return currentSnapshot?.balances ?? [];
  }

  function getSnapshot(): PrivateStateSnapshot | null {
    return currentSnapshot;
  }

  function isSyncing(): boolean {
    return syncing;
  }

  function lastSyncedAt(): Timestamp | null {
    return currentSnapshot?.syncedAt ?? null;
  }

  return {
    getBalances,
    getSnapshot,
    isSyncing,
    lastSyncedAt,
    resync,
    refreshBalances,
    startPolling,
    stopPolling,
    loadPersistedState,
  };
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Serialize a PrivateStateSnapshot to bytes for storage.
 *
 * Uses JSON encoding with bigint → string conversion.
 * The syncedToBlock field is a bigint that needs special handling.
 */
function serializeSnapshot(snapshot: PrivateStateSnapshot): Uint8Array {
  const serializable = {
    ...snapshot,
    syncedToBlock:
      snapshot.syncedToBlock !== undefined ? String(snapshot.syncedToBlock) : undefined,
  };
  return new TextEncoder().encode(JSON.stringify(serializable));
}

function deserializeSnapshot(bytes: Uint8Array): PrivateStateSnapshot {
  const text = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text);
  return {
    ...parsed,
    syncedToBlock: parsed.syncedToBlock !== undefined ? BigInt(parsed.syncedToBlock) : undefined,
  };
}
