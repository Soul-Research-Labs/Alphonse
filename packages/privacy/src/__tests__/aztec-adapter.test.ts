/**
 * Tests for the Aztec privacy adapter.
 *
 * Uses a mock PXE client to test all adapter operations
 * without requiring a real Aztec sandbox.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result, type Address, type BigIntString } from '@alphonse/core';
import type { PrivateReceiveId } from '@alphonse/core';

import type { PxeClient, AztecNote, AztecTxReceipt } from '../aztec/client';
import type { AztecAccount } from '../aztec/account';
import { createAztecAdapter } from '../aztec/adapter';
import { restoreAztecAccount } from '../aztec/account';
import { NoteStatus } from '../types/state';

// ---------------------------------------------------------------------------
// Mock PXE client factory
// ---------------------------------------------------------------------------

function createMockPxe(overrides: Partial<PxeClient> = {}): PxeClient {
  return {
    isReady: vi.fn().mockResolvedValue(Result.ok(true)),
    getBlockNumber: vi.fn().mockResolvedValue(Result.ok(100)),
    registerAccount: vi
      .fn()
      .mockResolvedValue(Result.ok({ address: '0xaztec123', registered: true })),
    getAccount: vi.fn().mockResolvedValue(Result.ok(null)),
    getNotes: vi.fn().mockResolvedValue(Result.ok([])),
    shield: vi
      .fn()
      .mockResolvedValue(Result.ok({ txHash: '0xshield_tx', status: 'mined' } as AztecTxReceipt)),
    unshield: vi
      .fn()
      .mockResolvedValue(Result.ok({ txHash: '0xunshield_tx', status: 'mined' } as AztecTxReceipt)),
    privateSend: vi
      .fn()
      .mockResolvedValue(Result.ok({ txHash: '0xprivate_tx', status: 'mined' } as AztecTxReceipt)),
    waitForTx: vi
      .fn()
      .mockResolvedValue(
        Result.ok({ txHash: '0xtx', status: 'mined', blockNumber: 101 } as AztecTxReceipt)
      ),
    ...overrides,
  };
}

function createTestAccount(registered = true): AztecAccount {
  const signingKey = new Uint8Array(32);
  signingKey.fill(0xab);
  const restored = restoreAztecAccount(signingKey);
  return { ...restored, registered };
}

function createTestNotes(): AztecNote[] {
  return [
    {
      noteHash: 'note1',
      contractAddress: '',
      value: '1000000000000000000', // 1 ETH in wei
      blockNumber: 50,
      nullified: false,
    },
    {
      noteHash: 'note2',
      contractAddress: '',
      value: '500000000000000000', // 0.5 ETH in wei
      blockNumber: 60,
      nullified: false,
    },
    {
      noteHash: 'note3',
      contractAddress: '',
      value: '200000000000000000', // 0.2 ETH spent
      blockNumber: 40,
      nullified: true,
    },
    {
      noteHash: 'note4',
      contractAddress: '0xUSDC',
      value: '1000000', // 1 USDC
      blockNumber: 70,
      nullified: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AztecAdapter', () => {
  let pxe: PxeClient;
  let account: AztecAccount;

  beforeEach(() => {
    pxe = createMockPxe();
    account = createTestAccount();
  });

  describe('info', () => {
    it('reports protocol info with ready=true when registered', () => {
      const adapter = createAztecAdapter({ pxe, account });
      expect(adapter.info.name).toBe('aztec');
      expect(adapter.info.version).toBe('0.1.0');
      expect(adapter.info.ready).toBe(true);
    });

    it('reports ready=false when account not registered', () => {
      const unregistered = createTestAccount(false);
      const adapter = createAztecAdapter({ pxe, account: unregistered });
      expect(adapter.info.ready).toBe(false);
    });
  });

  describe('shield', () => {
    it('shields funds successfully', async () => {
      const adapter = createAztecAdapter({ pxe, account });

      const result = await adapter.shield({
        from: '0xSender' as Address,
        assetContract: null,
        amount: '1000000000000000000' as BigIntString,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.amountShielded).toBe('1000000000000000000');
        expect(result.value.txHash).toBeDefined();
        expect(result.value.timestamp).toBeGreaterThan(0);
      }

      expect(pxe.shield).toHaveBeenCalledOnce();
      expect(pxe.waitForTx).toHaveBeenCalledOnce();
    });

    it('fails when account not registered', async () => {
      const unregistered = createTestAccount(false);
      const adapter = createAztecAdapter({ pxe, account: unregistered });

      const result = await adapter.shield({
        from: '0xSender' as Address,
        assetContract: null,
        amount: '1000' as BigIntString,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SHIELD_FAILED');
      }
    });

    it('fails when PXE shield call fails', async () => {
      pxe = createMockPxe({
        shield: vi.fn().mockResolvedValue(
          Result.err({
            code: 'RPC_ERROR',
            message: 'PXE unreachable',
          })
        ),
      });
      const adapter = createAztecAdapter({ pxe, account });

      const result = await adapter.shield({
        from: '0xSender' as Address,
        assetContract: null,
        amount: '1000' as BigIntString,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SHIELD_FAILED');
      }
    });

    it('fails when transaction is not confirmed', async () => {
      pxe = createMockPxe({
        waitForTx: vi
          .fn()
          .mockResolvedValue(
            Result.ok({ txHash: '0xfail', status: 'failed', error: 'out of gas' } as AztecTxReceipt)
          ),
      });
      const adapter = createAztecAdapter({ pxe, account });

      const result = await adapter.shield({
        from: '0xSender' as Address,
        assetContract: null,
        amount: '1000' as BigIntString,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('failed');
      }
    });
  });

  describe('unshield', () => {
    it('unshields funds successfully', async () => {
      const adapter = createAztecAdapter({ pxe, account });

      const result = await adapter.unshield({
        to: '0xRecipient' as Address,
        assetContract: null,
        amount: '500000000000000000' as BigIntString,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.amountUnshielded).toBe('500000000000000000');
        expect(result.value.txHashes).toHaveLength(1);
        expect(result.value.timestamp).toBeGreaterThan(0);
      }
    });

    it('fails when account not registered', async () => {
      const unregistered = createTestAccount(false);
      const adapter = createAztecAdapter({ pxe, account: unregistered });

      const result = await adapter.unshield({
        to: '0xRecipient' as Address,
        assetContract: null,
        amount: '1000' as BigIntString,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNSHIELD_FAILED');
      }
    });

    it('supports chunked unshield', async () => {
      let callCount = 0;
      pxe = createMockPxe({
        unshield: vi.fn().mockImplementation(async () => {
          callCount++;
          return Result.ok({ txHash: `0xchunk_${callCount}`, status: 'mined' } as AztecTxReceipt);
        }),
        waitForTx: vi.fn().mockImplementation(async (txHash: string) => {
          return Result.ok({
            txHash,
            status: 'mined',
            blockNumber: 100 + callCount,
          } as AztecTxReceipt);
        }),
      });
      const adapter = createAztecAdapter({ pxe, account });

      const result = await adapter.unshield({
        to: '0xRecipient' as Address,
        assetContract: null,
        amount: '3000' as BigIntString,
        chunkingOptions: { chunks: 3, minDelayMs: 0, maxDelayMs: 1 },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.txHashes).toHaveLength(3);
        expect(result.value.amountUnshielded).toBe('3000');
      }

      expect(pxe.unshield).toHaveBeenCalledTimes(3);
    });

    it('fails mid-chunk if PXE errors', async () => {
      let callCount = 0;
      pxe = createMockPxe({
        unshield: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 2) {
            return Result.err({ code: 'RPC_ERROR', message: 'PXE down' });
          }
          return Result.ok({ txHash: `0xchunk_${callCount}`, status: 'mined' } as AztecTxReceipt);
        }),
        waitForTx: vi.fn().mockImplementation(async (txHash: string) => {
          return Result.ok({ txHash, status: 'mined' } as AztecTxReceipt);
        }),
      });
      const adapter = createAztecAdapter({ pxe, account });

      const result = await adapter.unshield({
        to: '0xRecipient' as Address,
        assetContract: null,
        amount: '3000' as BigIntString,
        chunkingOptions: { chunks: 3, minDelayMs: 0, maxDelayMs: 1 },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('chunk 2/3');
      }
    });
  });

  describe('privateSend', () => {
    it('sends privately', async () => {
      const adapter = createAztecAdapter({ pxe, account });

      const result = await adapter.privateSend({
        to: 'aztec_recipient_id' as PrivateReceiveId,
        assetContract: null,
        amount: '1000000000' as BigIntString,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.amountSent).toBe('1000000000');
        expect(result.value.proofId).toBeDefined();
        expect(result.value.timestamp).toBeGreaterThan(0);
      }

      expect(pxe.privateSend).toHaveBeenCalledOnce();
    });

    it('fails when account not registered', async () => {
      const unregistered = createTestAccount(false);
      const adapter = createAztecAdapter({ pxe, account: unregistered });

      const result = await adapter.privateSend({
        to: 'recipient' as PrivateReceiveId,
        assetContract: null,
        amount: '1000' as BigIntString,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PRIVATE_SEND_FAILED');
      }
    });

    it('fails when PXE private send fails', async () => {
      pxe = createMockPxe({
        privateSend: vi
          .fn()
          .mockResolvedValue(Result.err({ code: 'RPC_ERROR', message: 'insufficient notes' })),
      });
      const adapter = createAztecAdapter({ pxe, account });

      const result = await adapter.privateSend({
        to: 'recipient' as PrivateReceiveId,
        assetContract: null,
        amount: '999999999' as BigIntString,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PRIVATE_SEND_FAILED');
      }
    });
  });

  describe('getVaultBalance', () => {
    it('returns zero balance when no notes exist', async () => {
      const adapter = createAztecAdapter({ pxe, account });

      const result = await adapter.getVaultBalance('0xOwner' as Address);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].assetSymbol).toBe('ETH');
        expect(result.value[0].available).toBe('0');
        expect(result.value[0].pending).toBe('0');
      }
    });

    it('computes balance from unspent notes', async () => {
      pxe = createMockPxe({
        getNotes: vi.fn().mockResolvedValue(Result.ok(createTestNotes())),
      });
      const adapter = createAztecAdapter({ pxe, account });

      const result = await adapter.getVaultBalance('0xOwner' as Address);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should have ETH and USDC balances
        expect(result.value.length).toBe(2);

        const ethBalance = result.value.find(
          (b) => b.assetContract === null || b.assetContract === ('' as Address)
        );
        expect(ethBalance).toBeDefined();
        // 1 ETH + 0.5 ETH (spent note excluded)
        expect(ethBalance!.available).toBe('1500000000000000000');

        const usdcBalance = result.value.find((b) => b.assetContract === '0xUSDC');
        expect(usdcBalance).toBeDefined();
        expect(usdcBalance!.available).toBe('1000000');
      }
    });

    it('uses custom asset symbols', async () => {
      pxe = createMockPxe({
        getNotes: vi.fn().mockResolvedValue(
          Result.ok([
            {
              noteHash: 'n1',
              contractAddress: '0xUSDC',
              value: '1000000',
              blockNumber: 50,
              nullified: false,
            },
          ])
        ),
      });
      const symbols = new Map<string | null, string>([['0xUSDC', 'USDC']]);
      const adapter = createAztecAdapter({ pxe, account, assetSymbols: symbols });

      const result = await adapter.getVaultBalance('0xOwner' as Address);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].assetSymbol).toBe('USDC');
      }
    });

    it('fails when PXE getNotes fails', async () => {
      pxe = createMockPxe({
        getNotes: vi.fn().mockResolvedValue(
          Result.err({
            code: 'RPC_ERROR',
            message: 'PXE disconnected',
          })
        ),
      });
      const adapter = createAztecAdapter({ pxe, account });

      const result = await adapter.getVaultBalance('0xOwner' as Address);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VAULT_SYNC_FAILED');
      }
    });
  });

  describe('resyncState', () => {
    it('returns full state snapshot', async () => {
      pxe = createMockPxe({
        getNotes: vi.fn().mockResolvedValue(Result.ok(createTestNotes())),
        getBlockNumber: vi.fn().mockResolvedValue(Result.ok(200)),
      });
      const adapter = createAztecAdapter({ pxe, account });

      const result = await adapter.resyncState('0xOwner' as Address);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const snapshot = result.value;
        expect(snapshot.notes).toHaveLength(4);
        expect(snapshot.balances.length).toBeGreaterThanOrEqual(1);
        expect(snapshot.syncedAt).toBeGreaterThan(0);
        expect(snapshot.syncedToBlock).toBe(200n);
      }
    });

    it('maps note statuses correctly', async () => {
      pxe = createMockPxe({
        getNotes: vi.fn().mockResolvedValue(Result.ok(createTestNotes())),
      });
      const adapter = createAztecAdapter({ pxe, account });

      const result = await adapter.resyncState('0xOwner' as Address);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const unspent = result.value.notes.filter((n) => n.status === NoteStatus.UNSPENT);
        const spent = result.value.notes.filter((n) => n.status === NoteStatus.SPENT);
        expect(unspent).toHaveLength(3); // note1, note2, note4
        expect(spent).toHaveLength(1); // note3
      }
    });

    it('handles block number fetch failure gracefully', async () => {
      pxe = createMockPxe({
        getNotes: vi.fn().mockResolvedValue(Result.ok([])),
        getBlockNumber: vi.fn().mockResolvedValue(
          Result.err({
            code: 'RPC_ERROR',
            message: 'block fetch failed',
          })
        ),
      });
      const adapter = createAztecAdapter({ pxe, account });

      const result = await adapter.resyncState('0xOwner' as Address);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.syncedToBlock).toBeUndefined();
      }
    });

    it('fails when PXE getNotes fails', async () => {
      pxe = createMockPxe({
        getNotes: vi.fn().mockResolvedValue(
          Result.err({
            code: 'RPC_ERROR',
            message: 'note discovery failed',
          })
        ),
      });
      const adapter = createAztecAdapter({ pxe, account });

      const result = await adapter.resyncState('0xOwner' as Address);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VAULT_SYNC_FAILED');
      }
    });
  });
});

describe('AztecAccount', () => {
  it('restores account deterministically from signing key', () => {
    const key = new Uint8Array(32);
    key.fill(0xcd);

    const account1 = restoreAztecAccount(key);
    const account2 = restoreAztecAccount(key);

    expect(account1.address).toBe(account2.address);
    expect(account1.registered).toBe(false);
  });

  it('produces different addresses for different keys', () => {
    const key1 = new Uint8Array(32).fill(0x01);
    const key2 = new Uint8Array(32).fill(0x02);

    const a1 = restoreAztecAccount(key1);
    const a2 = restoreAztecAccount(key2);

    expect(a1.address).not.toBe(a2.address);
  });
});
