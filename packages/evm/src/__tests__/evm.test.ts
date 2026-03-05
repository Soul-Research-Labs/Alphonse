/**
 * Tests for the EVM package — pure logic (no RPC calls).
 *
 * Tests cover: ERC-20 encoding/formatting, fee estimation logic,
 * transaction building, transaction tracker, network definitions.
 */

import { describe, it, expect } from 'vitest';
import type { Address, TxHash, BigIntString, Timestamp } from '@alphonse/core';
import type {
  TransactionHistoryEntry,
  TransactionDirection,
  TransactionStatus,
} from '../types/transaction';
import type { Pool } from '@alphonse/core';

// ---------------------------------------------------------------------------
// ERC-20 utilities
// ---------------------------------------------------------------------------

import {
  formatTokenAmount,
  parseTokenAmount,
  encodeTransfer,
  encodeBalanceOf,
  encodeApprove,
} from '../erc20';

describe('ERC-20 utilities', () => {
  const addr = (hex: string) => hex as Address;

  describe('formatTokenAmount', () => {
    it('formats whole numbers', () => {
      expect(formatTokenAmount(1000000n, 6)).toBe('1');
    });

    it('formats fractional amounts', () => {
      expect(formatTokenAmount(1500000n, 6)).toBe('1.5');
    });

    it('formats small amounts', () => {
      expect(formatTokenAmount(1n, 6)).toBe('0.000001');
    });

    it('formats zero', () => {
      expect(formatTokenAmount(0n, 6)).toBe('0');
    });

    it('formats 18-decimal (ETH-like) amounts', () => {
      expect(formatTokenAmount(1000000000000000000n, 18)).toBe('1');
      expect(formatTokenAmount(1500000000000000000n, 18)).toBe('1.5');
    });

    it('trims trailing zeros', () => {
      expect(formatTokenAmount(1100000n, 6)).toBe('1.1');
    });

    it('respects maxDecimals', () => {
      expect(formatTokenAmount(1234567n, 6, 2)).toBe('1.23');
    });
  });

  describe('parseTokenAmount', () => {
    it('parses whole numbers', () => {
      expect(parseTokenAmount('1', 6)).toBe(1000000n);
    });

    it('parses fractional amounts', () => {
      expect(parseTokenAmount('1.5', 6)).toBe(1500000n);
    });

    it('parses amounts with more decimals than token supports', () => {
      expect(parseTokenAmount('1.1234567', 6)).toBe(1123456n);
    });

    it('parses zero', () => {
      expect(parseTokenAmount('0', 6)).toBe(0n);
    });

    it('round-trips correctly', () => {
      const original = 1234567n;
      const formatted = formatTokenAmount(original, 6);
      expect(parseTokenAmount(formatted, 6)).toBe(original);
    });
  });

  describe('ABI encoding', () => {
    it('encodes balanceOf call', () => {
      const data = encodeBalanceOf(addr('0x1234567890123456789012345678901234567890'));
      expect(data).toMatch(/^0x70a08231/); // balanceOf selector
    });

    it('encodes transfer call', () => {
      const data = encodeTransfer(addr('0x1234567890123456789012345678901234567890'), 1000000n);
      expect(data).toMatch(/^0xa9059cbb/); // transfer selector
    });

    it('encodes approve call', () => {
      const data = encodeApprove(addr('0x1234567890123456789012345678901234567890'), 1000000n);
      expect(data).toMatch(/^0x095ea7b3/); // approve selector
    });
  });
});

// ---------------------------------------------------------------------------
// Transaction builder
// ---------------------------------------------------------------------------

import { buildTransaction } from '../tx';

describe('Transaction builder', () => {
  const addr = (hex: string) => hex as Address;

  it('builds an unsigned EIP-1559 transaction', () => {
    const result = buildTransaction({
      from: addr('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      to: addr('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
      value: 1000000000000000000n, // 1 ETH
      chainId: 11155111,
      nonce: 0,
      gasLimit: 21000n,
      maxFeePerGas: 20000000000n,
      maxPriorityFeePerGas: 1500000000n,
    });

    expect(result.serialized).toMatch(/^0x02/); // EIP-1559 type prefix
    expect(result.hash).toBeInstanceOf(Uint8Array);
    expect(result.hash.length).toBe(32);
  });

  it('includes data field for contract calls', () => {
    const data = encodeTransfer(addr('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), 1000000n);

    const result = buildTransaction({
      from: addr('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      to: addr('0xcccccccccccccccccccccccccccccccccccccccc'), // token contract
      data,
      chainId: 11155111,
      nonce: 1,
      gasLimit: 65000n,
      maxFeePerGas: 20000000000n,
      maxPriorityFeePerGas: 1500000000n,
    });

    expect(result.serialized).toMatch(/^0x02/);
    expect(result.hash.length).toBe(32);
  });

  it('produces different hashes for different transactions', () => {
    const base = {
      from: addr('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      to: addr('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
      chainId: 11155111,
      gasLimit: 21000n,
      maxFeePerGas: 20000000000n,
      maxPriorityFeePerGas: 1500000000n,
    };

    const tx1 = buildTransaction({ ...base, value: 1n, nonce: 0 });
    const tx2 = buildTransaction({ ...base, value: 2n, nonce: 0 });
    const tx3 = buildTransaction({ ...base, value: 1n, nonce: 1 });

    expect(Buffer.from(tx1.hash).toString('hex')).not.toBe(Buffer.from(tx2.hash).toString('hex'));
    expect(Buffer.from(tx1.hash).toString('hex')).not.toBe(Buffer.from(tx3.hash).toString('hex'));
  });
});

// ---------------------------------------------------------------------------
// Transaction tracker
// ---------------------------------------------------------------------------

import { createTransactionTracker } from '../history';

describe('TransactionTracker', () => {
  const addr = (hex: string) => hex as Address;
  const txHash = (hex: string) => hex as TxHash;

  function makeEntry(overrides: Partial<TransactionHistoryEntry> = {}): TransactionHistoryEntry {
    return {
      hash: txHash('0x' + '11'.repeat(32)),
      direction: 'OUTGOING' as TransactionDirection,
      status: 'PENDING' as TransactionStatus,
      pool: 'PUBLIC' as Pool,
      from: addr('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      to: addr('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
      amount: '1.0',
      assetSymbol: 'ETH',
      fee: '0.001',
      timestamp: Date.now() as Timestamp,
      ...overrides,
    };
  }

  it('tracks a transaction', () => {
    const tracker = createTransactionTracker();
    const entry = makeEntry();
    tracker.track(entry);

    expect(tracker.getAll()).toHaveLength(1);
    expect(tracker.getAll()[0].hash).toBe(entry.hash);
  });

  it('deduplicates by hash', () => {
    const tracker = createTransactionTracker();
    const entry = makeEntry();
    tracker.track(entry);
    tracker.track(entry);

    expect(tracker.getAll()).toHaveLength(1);
  });

  it('orders newest first', () => {
    const tracker = createTransactionTracker();
    const e1 = makeEntry({
      hash: txHash('0x' + '11'.repeat(32)),
      timestamp: 1000 as Timestamp,
    });
    const e2 = makeEntry({
      hash: txHash('0x' + '22'.repeat(32)),
      timestamp: 2000 as Timestamp,
    });

    tracker.track(e1);
    tracker.track(e2);

    // e2 was tracked second, so it's first (unshift)
    expect(tracker.getAll()[0].hash).toBe(e2.hash);
  });

  it('filters by address', () => {
    const tracker = createTransactionTracker();
    const alice = addr('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const bob = addr('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    const carol = addr('0xcccccccccccccccccccccccccccccccccccccccc');

    tracker.track(makeEntry({ hash: txHash('0x' + '11'.repeat(32)), from: alice, to: bob }));
    tracker.track(makeEntry({ hash: txHash('0x' + '22'.repeat(32)), from: bob, to: carol }));

    const aliceEntries = tracker.getForAddress(alice);
    expect(aliceEntries).toHaveLength(1);

    const bobEntries = tracker.getForAddress(bob);
    expect(bobEntries).toHaveLength(2);

    const carolEntries = tracker.getForAddress(carol);
    expect(carolEntries).toHaveLength(1);
  });

  it('updates transaction status', () => {
    const tracker = createTransactionTracker();
    const hash = txHash('0x' + '11'.repeat(32));
    tracker.track(makeEntry({ hash }));

    expect(tracker.pendingCount()).toBe(1);

    tracker.updateStatus(hash, 'CONFIRMED' as TransactionStatus);
    expect(tracker.pendingCount()).toBe(0);
    expect(tracker.getAll()[0].status).toBe('CONFIRMED');
  });

  it('exports and imports entries', () => {
    const tracker1 = createTransactionTracker();
    tracker1.track(makeEntry({ hash: txHash('0x' + '11'.repeat(32)) }));
    tracker1.track(makeEntry({ hash: txHash('0x' + '22'.repeat(32)) }));

    const exported = tracker1.export();

    const tracker2 = createTransactionTracker();
    tracker2.import(exported);

    expect(tracker2.getAll()).toHaveLength(2);
  });

  it('clears all entries', () => {
    const tracker = createTransactionTracker();
    tracker.track(makeEntry());
    tracker.clear();

    expect(tracker.getAll()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Network definitions
// ---------------------------------------------------------------------------

import {
  ETHEREUM_MAINNET,
  SEPOLIA_TESTNET,
  DEFAULT_NETWORK,
  CHAIN_ID,
  KNOWN_TOKENS,
} from '../networks';

describe('Network definitions', () => {
  it('has correct chain IDs', () => {
    expect(CHAIN_ID.ETHEREUM).toBe(1);
    expect(CHAIN_ID.SEPOLIA).toBe(11155111);
  });

  it('has valid mainnet config', () => {
    expect(ETHEREUM_MAINNET.name).toBe('Ethereum Mainnet');
    expect(ETHEREUM_MAINNET.nativeCurrency.symbol).toBe('ETH');
    expect(ETHEREUM_MAINNET.nativeCurrency.decimals).toBe(18);
  });

  it('has valid testnet config', () => {
    expect(SEPOLIA_TESTNET.name).toBe('Sepolia Testnet');
    expect(SEPOLIA_TESTNET.chainId).toBe(CHAIN_ID.SEPOLIA);
  });

  it('defaults to Sepolia for development', () => {
    expect(DEFAULT_NETWORK.chainId).toBe(CHAIN_ID.SEPOLIA);
  });

  it('has known tokens for mainnet', () => {
    const mainnetTokens = KNOWN_TOKENS[CHAIN_ID.ETHEREUM];
    expect(mainnetTokens).toBeDefined();
    expect(mainnetTokens!.length).toBe(2);
    expect(mainnetTokens!.map((t) => t.symbol)).toContain('USDC');
    expect(mainnetTokens!.map((t) => t.symbol)).toContain('USDT');
  });

  it('has known tokens for Sepolia', () => {
    const sepoliaTokens = KNOWN_TOKENS[CHAIN_ID.SEPOLIA];
    expect(sepoliaTokens).toBeDefined();
    expect(sepoliaTokens!.some((t) => t.symbol === 'USDC')).toBe(true);
  });
});
