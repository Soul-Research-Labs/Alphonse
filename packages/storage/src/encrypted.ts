/**
 * Encrypted storage wrapper.
 *
 * Wraps any StorageAdapter with transparent encryption/decryption.
 * All data is encrypted client-side before storage and decrypted on read.
 *
 * Uses the CryptoProvider interface from @alphonse/core so the encryption
 * implementation is abstraction-based and replaceable (PQ-ready).
 */

import { Result } from '@alphonse/core';
import type { AsyncResult } from '@alphonse/core';
import type { CryptoProvider, CipherAlgorithm, EncryptedPayload } from '@alphonse/core';
import type { StorageAdapter, StorageNamespace } from './types/adapter';

/** Default cipher for storage encryption. */
const DEFAULT_CIPHER: CipherAlgorithm = 'aes-256-gcm';

/**
 * Create an encrypted storage adapter that wraps a raw adapter.
 *
 * The encryption key must be provided. It should be derived from the
 * Vault Key (for high-security data) or a domain-specific key.
 *
 * The wrapper:
 * - Encrypts values before set()
 * - Decrypts values after get()
 * - Passes through keys(), has(), delete(), clear(), clearAll() directly
 */
export function createEncryptedStorageAdapter(
  inner: StorageAdapter,
  crypto: CryptoProvider,
  encryptionKey: Uint8Array,
  algorithm: CipherAlgorithm = DEFAULT_CIPHER
): StorageAdapter {
  async function get(namespace: StorageNamespace, key: string): AsyncResult<Uint8Array | null> {
    const raw = await inner.get(namespace, key);
    if (!raw.ok) return raw;
    if (raw.value === null) return Result.ok(null);

    try {
      const payload: EncryptedPayload = JSON.parse(new TextDecoder().decode(raw.value));
      const plaintext = await crypto.decrypt(payload, encryptionKey);
      return Result.ok(plaintext);
    } catch (cause) {
      return Result.err({
        code: 'DECRYPTION_FAILED' as const,
        message: `Failed to decrypt ${namespace}/${key}`,
        cause,
      });
    }
  }

  async function set(
    namespace: StorageNamespace,
    key: string,
    value: Uint8Array
  ): AsyncResult<void> {
    try {
      const payload = await crypto.encrypt(value, encryptionKey, algorithm);
      const serialized = new TextEncoder().encode(JSON.stringify(payload));
      return inner.set(namespace, key, serialized);
    } catch (cause) {
      return Result.err({
        code: 'ENCRYPTION_FAILED' as const,
        message: `Failed to encrypt ${namespace}/${key}`,
        cause,
      });
    }
  }

  return {
    get,
    set,
    delete: inner.delete.bind(inner),
    keys: inner.keys.bind(inner),
    has: inner.has.bind(inner),
    clear: inner.clear.bind(inner),
    clearAll: inner.clearAll.bind(inner),
  };
}
