/**
 * Tests for the vault state tracker.
 *
 * Verifies persistence, caching, resync, and polling behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Result, type Address, type BigIntString, type Timestamp } from '@alphonse/core';
import { createInMemoryStorageAdapter } from '@alphonse/storage';

import type { PrivacyAdapter, PrivacyProtocolInfo } from '../types/adapter';
import type { VaultBalance, PrivateStateSnapshot } from '../types/state';
import { NoteStatus } from '../types/state';
import { createVaultStateTracker } from '../state/tracker';

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<PrivacyAdapter> = {}): PrivacyAdapter {
  const mockBalances: VaultBalance[] = [
    {
      assetContract: null,
      assetSymbol: 'ETH',
      available: '2000000000000000000' as BigIntString,
      pending: '0' as BigIntString,
      computedAt: Date.now() as Timestamp,
    },
  ];

  const mockSnapshot: PrivateStateSnapshot = {
    notes: [
      {
        noteId: 'note1' as any,
        status: NoteStatus.UNSPENT,
        assetContract: null,
        value: '2000000000000000000' as BigIntString,
        createdAt: Date.now() as Timestamp,
      },
    ],
    balances: mockBalances,
    syncedAt: Date.now() as Timestamp,
    syncedToBlock: 100n,
  };

  return {
    info: { name: 'aztec', version: '0.1.0', ready: true } as PrivacyProtocolInfo,
    shield: vi.fn(),
    unshield: vi.fn(),
    privateSend: vi.fn(),
    getVaultBalance: vi.fn().mockResolvedValue(Result.ok(mockBalances)),
    resyncState: vi.fn().mockResolvedValue(Result.ok(mockSnapshot)),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VaultStateTracker', () => {
  let adapter: PrivacyAdapter;

  beforeEach(() => {
    adapter = createMockAdapter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with empty state', () => {
    const storage = createInMemoryStorageAdapter();
    const tracker = createVaultStateTracker({ adapter, storage });

    expect(tracker.getBalances()).toEqual([]);
    expect(tracker.getSnapshot()).toBeNull();
    expect(tracker.isSyncing()).toBe(false);
    expect(tracker.lastSyncedAt()).toBeNull();
  });

  describe('resync', () => {
    it('performs full resync and caches result', async () => {
      const storage = createInMemoryStorageAdapter();
      const tracker = createVaultStateTracker({ adapter, storage });

      const result = await tracker.resync('0xOwner' as Address);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.notes).toHaveLength(1);
        expect(result.value.balances).toHaveLength(1);
        expect(result.value.syncedToBlock).toBe(100n);
      }

      // Cached
      expect(tracker.getSnapshot()).not.toBeNull();
      expect(tracker.getBalances()).toHaveLength(1);
      expect(tracker.lastSyncedAt()).toBeGreaterThan(0);

      expect(adapter.resyncState).toHaveBeenCalledOnce();
    });

    it('persists snapshot to storage', async () => {
      const storage = createInMemoryStorageAdapter();
      const tracker = createVaultStateTracker({ adapter, storage });

      await tracker.resync('0xOwner' as Address);

      // Verify persisted
      const stored = await storage.get('SYNC_STATE' as any, 'vault_state_snapshot');
      expect(stored.ok).toBe(true);
      if (stored.ok) {
        expect(stored.value).not.toBeNull();
        // Deserialize and verify
        const text = new TextDecoder().decode(stored.value!);
        const parsed = JSON.parse(text);
        expect(parsed.notes).toHaveLength(1);
      }
    });

    it('rejects concurrent syncs', async () => {
      const slowAdapter = createMockAdapter({
        resyncState: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 1000));
          return Result.ok({
            notes: [],
            balances: [],
            syncedAt: Date.now() as Timestamp,
          });
        }),
      });
      const storage = createInMemoryStorageAdapter();
      const tracker = createVaultStateTracker({ adapter: slowAdapter, storage });

      // Start first resync
      const promise1 = tracker.resync('0xOwner' as Address);

      // Try second immediately (should fail)
      const result2 = await tracker.resync('0xOwner' as Address);
      expect(result2.ok).toBe(false);
      if (!result2.ok) {
        expect(result2.error.code).toBe('VAULT_SYNC_FAILED');
        expect(result2.error.message).toContain('already in progress');
      }

      // Let first one complete
      vi.advanceTimersByTime(1100);
      await promise1;
    });

    it('handles adapter failure', async () => {
      const failAdapter = createMockAdapter({
        resyncState: vi.fn().mockResolvedValue(Result.err({
          code: 'VAULT_SYNC_FAILED', message: 'PXE unreachable',
        })),
      });
      const storage = createInMemoryStorageAdapter();
      const tracker = createVaultStateTracker({ adapter: failAdapter, storage });

      const result = await tracker.resync('0xOwner' as Address);

      expect(result.ok).toBe(false);
      expect(tracker.getSnapshot()).toBeNull();
    });
  });

  describe('refreshBalances', () => {
    it('updates cached balances without full resync', async () => {
      const storage = createInMemoryStorageAdapter();
      const tracker = createVaultStateTracker({ adapter, storage });

      // First do a full resync to populate snapshot
      await tracker.resync('0xOwner' as Address);

      // Update mock to return different balances
      const newBalances: VaultBalance[] = [
        {
          assetContract: null,
          assetSymbol: 'ETH',
          available: '5000000000000000000' as BigIntString,
          pending: '100000000000000000' as BigIntString,
          computedAt: Date.now() as Timestamp,
        },
      ];
      (adapter.getVaultBalance as ReturnType<typeof vi.fn>).mockResolvedValue(Result.ok(newBalances));

      const result = await tracker.refreshBalances('0xOwner' as Address);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].available).toBe('5000000000000000000');
      }

      // Cached balances should be updated
      expect(tracker.getBalances()[0].available).toBe('5000000000000000000');
    });
  });

  describe('loadPersistedState', () => {
    it('loads previously persisted snapshot', async () => {
      const storage = createInMemoryStorageAdapter();

      // First tracker: resync and persist
      const tracker1 = createVaultStateTracker({ adapter, storage });
      await tracker1.resync('0xOwner' as Address);

      // Second tracker: load from storage
      const tracker2 = createVaultStateTracker({ adapter, storage });
      const result = await tracker2.loadPersistedState();

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.notes).toHaveLength(1);
        expect(result.value.balances).toHaveLength(1);
      }

      // Cached balances available after load
      expect(tracker2.getBalances()).toHaveLength(1);
    });

    it('returns null when no persisted state exists', async () => {
      const storage = createInMemoryStorageAdapter();
      const tracker = createVaultStateTracker({ adapter, storage });

      const result = await tracker.loadPersistedState();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('polling', () => {
    it('calls refreshBalances at configured interval', async () => {
      vi.useRealTimers();
      vi.useFakeTimers();

      const storage = createInMemoryStorageAdapter();
      const tracker = createVaultStateTracker({ adapter, storage });

      tracker.startPolling('0xOwner' as Address, 5000);

      // No calls yet
      expect(adapter.getVaultBalance).not.toHaveBeenCalled();

      // Advance 5 seconds
      vi.advanceTimersByTime(5000);
      // Polling fires async, give it a tick
      await vi.advanceTimersByTimeAsync(10);

      expect(adapter.getVaultBalance).toHaveBeenCalledTimes(1);

      // Stop polling
      tracker.stopPolling();

      // Advance more — no additional calls
      vi.advanceTimersByTime(10000);
      expect(adapter.getVaultBalance).toHaveBeenCalledTimes(1);
    });

    it('stopPolling clears interval', () => {
      const storage = createInMemoryStorageAdapter();
      const tracker = createVaultStateTracker({ adapter, storage });

      tracker.startPolling('0xOwner' as Address, 1000);
      tracker.stopPolling();

      vi.advanceTimersByTime(5000);
      expect(adapter.getVaultBalance).not.toHaveBeenCalled();
    });

    it('restartPolling replaces previous interval', () => {
      const storage = createInMemoryStorageAdapter();
      const tracker = createVaultStateTracker({ adapter, storage });

      tracker.startPolling('0xOwner' as Address, 1000);
      tracker.startPolling('0xOwner' as Address, 2000);

      tracker.stopPolling();
      vi.advanceTimersByTime(5000);
      expect(adapter.getVaultBalance).not.toHaveBeenCalled();
    });
  });
});
