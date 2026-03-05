/**
 * Tests for the in-memory StorageAdapter.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryStorageAdapter } from '../adapters/memory';
import type { StorageAdapter, StorageNamespace } from '../types/adapter';

describe('InMemoryStorageAdapter', () => {
  let adapter: StorageAdapter;

  beforeEach(() => {
    adapter = createInMemoryStorageAdapter();
  });

  const NS = 'VAULT_STORE' as StorageNamespace;
  const NS2 = 'METADATA' as StorageNamespace;

  describe('get / set', () => {
    it('returns null for non-existent keys', async () => {
      const result = await adapter.get(NS, 'missing');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });

    it('stores and retrieves data', async () => {
      const data = new TextEncoder().encode('hello');
      await adapter.set(NS, 'key1', data);

      const result = await adapter.get(NS, 'key1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(data);
      }
    });

    it('returns a copy (not the same reference)', async () => {
      const data = new TextEncoder().encode('hello');
      await adapter.set(NS, 'key1', data);

      const result = await adapter.get(NS, 'key1');
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value).not.toBe(data);
        expect(result.value).toEqual(data);
      }
    });

    it('overwrites existing keys', async () => {
      const data1 = new TextEncoder().encode('v1');
      const data2 = new TextEncoder().encode('v2');

      await adapter.set(NS, 'key1', data1);
      await adapter.set(NS, 'key1', data2);

      const result = await adapter.get(NS, 'key1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(data2);
      }
    });

    it('keeps namespaces separate', async () => {
      const data1 = new TextEncoder().encode('ns1');
      const data2 = new TextEncoder().encode('ns2');

      await adapter.set(NS, 'key', data1);
      await adapter.set(NS2, 'key', data2);

      const r1 = await adapter.get(NS, 'key');
      const r2 = await adapter.get(NS2, 'key');

      expect(r1.ok && r1.value).toEqual(data1);
      expect(r2.ok && r2.value).toEqual(data2);
    });
  });

  describe('delete', () => {
    it('deletes existing keys', async () => {
      await adapter.set(NS, 'key1', new TextEncoder().encode('data'));
      await adapter.delete(NS, 'key1');

      const result = await adapter.get(NS, 'key1');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });

    it('no-op for non-existent keys', async () => {
      const result = await adapter.delete(NS, 'missing');
      expect(result.ok).toBe(true);
    });
  });

  describe('has', () => {
    it('returns false for non-existent keys', async () => {
      const result = await adapter.has(NS, 'missing');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(false);
    });

    it('returns true for existing keys', async () => {
      await adapter.set(NS, 'key1', new TextEncoder().encode('data'));
      const result = await adapter.has(NS, 'key1');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(true);
    });
  });

  describe('keys', () => {
    it('returns empty array for empty namespace', async () => {
      const result = await adapter.keys(NS);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual([]);
    });

    it('returns all keys in namespace', async () => {
      await adapter.set(NS, 'a', new Uint8Array([1]));
      await adapter.set(NS, 'b', new Uint8Array([2]));
      await adapter.set(NS, 'c', new Uint8Array([3]));

      const result = await adapter.keys(NS);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sort()).toEqual(['a', 'b', 'c']);
      }
    });
  });

  describe('clear', () => {
    it('clears all keys in a namespace', async () => {
      await adapter.set(NS, 'a', new Uint8Array([1]));
      await adapter.set(NS, 'b', new Uint8Array([2]));
      await adapter.set(NS2, 'c', new Uint8Array([3]));

      await adapter.clear(NS);

      const keysNs = await adapter.keys(NS);
      const keysNs2 = await adapter.keys(NS2);

      expect(keysNs.ok && keysNs.value).toEqual([]);
      expect(keysNs2.ok && keysNs2.value).toEqual(['c']);
    });
  });

  describe('clearAll', () => {
    it('clears all namespaces', async () => {
      await adapter.set(NS, 'a', new Uint8Array([1]));
      await adapter.set(NS2, 'b', new Uint8Array([2]));

      await adapter.clearAll();

      const r1 = await adapter.keys(NS);
      const r2 = await adapter.keys(NS2);

      expect(r1.ok && r1.value).toEqual([]);
      expect(r2.ok && r2.value).toEqual([]);
    });
  });
});
