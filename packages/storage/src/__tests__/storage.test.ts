/**
 * Tests for encrypted storage wrapper and forensic cleanup.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createCryptoProvider } from '@alphonse/core';
import type { CryptoProvider } from '@alphonse/core';
import { createInMemoryStorageAdapter } from '../adapters/memory';
import { createEncryptedStorageAdapter } from '../encrypted';
import { forensicWipe } from '../cleanup';
import type { StorageAdapter, StorageNamespace } from '../types/adapter';

describe('EncryptedStorageAdapter', () => {
  let crypto: CryptoProvider;
  let inner: StorageAdapter;
  let key: Uint8Array;

  beforeEach(() => {
    crypto = createCryptoProvider();
    inner = createInMemoryStorageAdapter();
    key = crypto.randomBytes(32);
  });

  it('encrypts on write and decrypts on read', async () => {
    const encrypted = createEncryptedStorageAdapter(inner, crypto, key);
    const data = new TextEncoder().encode('secret data');

    const setResult = await encrypted.set('VAULT_STORE' as StorageNamespace, 'test', data);
    expect(setResult.ok).toBe(true);

    // Verify the inner store has encrypted (not plaintext) data
    const rawResult = await inner.get('VAULT_STORE' as StorageNamespace, 'test');
    expect(rawResult.ok).toBe(true);
    const rawStr = new TextDecoder().decode(rawResult.value!);
    expect(rawStr).not.toContain('secret data');
    expect(rawStr).toContain('"algorithm"'); // JSON envelope

    // Verify transparent decryption
    const getResult = await encrypted.get('VAULT_STORE' as StorageNamespace, 'test');
    expect(getResult.ok).toBe(true);
    expect(new TextDecoder().decode(getResult.value!)).toBe('secret data');
  });

  it('returns null for non-existent keys', async () => {
    const encrypted = createEncryptedStorageAdapter(inner, crypto, key);
    const result = await encrypted.get('VAULT_STORE' as StorageNamespace, 'missing');
    expect(result.ok).toBe(true);
    expect(result.value).toBeNull();
  });

  it('fails decryption with wrong key', async () => {
    const encrypted1 = createEncryptedStorageAdapter(inner, crypto, key);
    const data = new TextEncoder().encode('secret');

    await encrypted1.set('VAULT_STORE' as StorageNamespace, 'test', data);

    const wrongKey = crypto.randomBytes(32);
    const encrypted2 = createEncryptedStorageAdapter(inner, crypto, wrongKey);
    const result = await encrypted2.get('VAULT_STORE' as StorageNamespace, 'test');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DECRYPTION_FAILED');
    }
  });

  it('supports xchacha20-poly1305', async () => {
    const encrypted = createEncryptedStorageAdapter(inner, crypto, key, 'xchacha20-poly1305');
    const data = new TextEncoder().encode('xchacha test');

    await encrypted.set('METADATA' as StorageNamespace, 'x', data);
    const result = await encrypted.get('METADATA' as StorageNamespace, 'x');

    expect(result.ok).toBe(true);
    expect(new TextDecoder().decode(result.value!)).toBe('xchacha test');
  });

  it('passes through has/keys/delete/clear', async () => {
    const encrypted = createEncryptedStorageAdapter(inner, crypto, key);
    const ns = 'METADATA' as StorageNamespace;

    await encrypted.set(ns, 'a', new Uint8Array([1]));
    await encrypted.set(ns, 'b', new Uint8Array([2]));

    const hasResult = await encrypted.has(ns, 'a');
    expect(hasResult.ok && hasResult.value).toBe(true);

    const keysResult = await encrypted.keys(ns);
    expect(keysResult.ok && keysResult.value).toEqual(['a', 'b']);

    await encrypted.delete(ns, 'a');
    const hasMissing = await encrypted.has(ns, 'a');
    expect(hasMissing.ok && hasMissing.value).toBe(false);

    await encrypted.clear(ns);
    const keysAfter = await encrypted.keys(ns);
    expect(keysAfter.ok && keysAfter.value).toEqual([]);
  });
});

describe('forensicWipe', () => {
  let storage: StorageAdapter;

  beforeEach(async () => {
    storage = createInMemoryStorageAdapter();
    // Populate with test data across namespaces
    await storage.set('VAULT_STORE' as StorageNamespace, 'key1', new Uint8Array([1, 2, 3]));
    await storage.set('METADATA' as StorageNamespace, 'key2', new Uint8Array([4, 5, 6]));
    await storage.set('PREFERENCES' as StorageNamespace, 'key3', new Uint8Array([7, 8, 9]));
    await storage.set('TX_CACHE' as StorageNamespace, 'key4', new Uint8Array([10, 11, 12]));
  });

  it('wipes all data across all namespaces', async () => {
    const result = await forensicWipe(storage);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.keysWiped).toBeGreaterThanOrEqual(4);
    expect(result.value.namespacesWiped).toBe(5); // All 5 namespace wipe attempts

    // Verify everything is gone
    for (const ns of ['VAULT_STORE', 'METADATA', 'PREFERENCES', 'TX_CACHE'] as StorageNamespace[]) {
      const keys = await storage.keys(ns);
      expect(keys.ok && keys.value).toEqual([]);
    }
  });

  it('returns success even with empty namespaces', async () => {
    const emptyStorage = createInMemoryStorageAdapter();
    const result = await forensicWipe(emptyStorage);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.keysWiped).toBe(0);
    }
  });
});
