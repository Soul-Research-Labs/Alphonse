/**
 * Secure storage adapter for React Native.
 *
 * Uses expo-secure-store (OS keychain/keystore) for all namespaced data.
 * Binary Uint8Array values are base64-encoded before storage.
 *
 * This satisfies AGENTS.md requirement:
 * "Mobile storage: OS keychain/keystore + encrypted DB for metadata."
 */

import * as SecureStore from 'expo-secure-store';
import { Result } from '@alphonse/core';
import type { AsyncResult } from '@alphonse/core';
import type { StorageAdapter, StorageNamespace } from '@alphonse/storage';

/**
 * Separator between namespace and key in the secure store.
 * expo-secure-store keys only allow alphanumeric, '.', '-', and '_'.
 */
const SEP = '.';

/** Suffix used to store the key index for each namespace. */
const INDEX_SUFFIX = '._keys_index';

function storeKey(namespace: StorageNamespace, key: string): string {
  return `${namespace}${SEP}${key}`;
}

function indexKey(namespace: StorageNamespace): string {
  return `${namespace}${INDEX_SUFFIX}`;
}

/** Load the key index for a namespace. */
async function loadIndex(namespace: StorageNamespace): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(indexKey(namespace));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Save the key index for a namespace. */
async function saveIndex(namespace: StorageNamespace, keys: string[]): Promise<void> {
  await SecureStore.setItemAsync(indexKey(namespace), JSON.stringify(keys));
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Create a StorageAdapter backed by expo-secure-store.
 *
 * All data is stored in the OS keychain (iOS) or EncryptedSharedPreferences (Android).
 * This provides hardware-backed encryption at rest.
 */
export function createSecureStorageAdapter(): StorageAdapter {
  return {
    async get(namespace, key): AsyncResult<Uint8Array | null> {
      try {
        const raw = await SecureStore.getItemAsync(storeKey(namespace, key));
        if (raw === null) return Result.ok(null);
        return Result.ok(fromBase64(raw));
      } catch (cause) {
        return Result.err({
          code: 'STORAGE_READ_FAILED' as const,
          message: `SecureStore read failed: ${namespace}/${key}`,
          cause,
        });
      }
    },

    async set(namespace, key, value): AsyncResult<void> {
      try {
        await SecureStore.setItemAsync(storeKey(namespace, key), toBase64(value));
        // Update index
        const keys = await loadIndex(namespace);
        if (!keys.includes(key)) {
          keys.push(key);
          await saveIndex(namespace, keys);
        }
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({
          code: 'STORAGE_WRITE_FAILED' as const,
          message: `SecureStore write failed: ${namespace}/${key}`,
          cause,
        });
      }
    },

    async delete(namespace, key): AsyncResult<void> {
      try {
        await SecureStore.deleteItemAsync(storeKey(namespace, key));
        const keys = await loadIndex(namespace);
        const idx = keys.indexOf(key);
        if (idx !== -1) {
          keys.splice(idx, 1);
          await saveIndex(namespace, keys);
        }
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({
          code: 'STORAGE_WRITE_FAILED' as const,
          message: `SecureStore delete failed: ${namespace}/${key}`,
          cause,
        });
      }
    },

    async keys(namespace): AsyncResult<string[]> {
      try {
        return Result.ok(await loadIndex(namespace));
      } catch (cause) {
        return Result.err({
          code: 'STORAGE_READ_FAILED' as const,
          message: `SecureStore keys failed: ${namespace}`,
          cause,
        });
      }
    },

    async has(namespace, key): AsyncResult<boolean> {
      try {
        const raw = await SecureStore.getItemAsync(storeKey(namespace, key));
        return Result.ok(raw !== null);
      } catch (cause) {
        return Result.err({
          code: 'STORAGE_READ_FAILED' as const,
          message: `SecureStore has failed: ${namespace}/${key}`,
          cause,
        });
      }
    },

    async clear(namespace): AsyncResult<void> {
      try {
        const keys = await loadIndex(namespace);
        for (const key of keys) {
          await SecureStore.deleteItemAsync(storeKey(namespace, key));
        }
        await SecureStore.deleteItemAsync(indexKey(namespace));
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({
          code: 'STORAGE_WRITE_FAILED' as const,
          message: `SecureStore clear failed: ${namespace}`,
          cause,
        });
      }
    },

    async clearAll(): AsyncResult<void> {
      try {
        const namespaces: StorageNamespace[] = [
          'VAULT_STORE',
          'METADATA',
          'PREFERENCES',
          'TX_CACHE',
          'SYNC_STATE',
        ];
        for (const ns of namespaces) {
          const keys = await loadIndex(ns);
          for (const key of keys) {
            await SecureStore.deleteItemAsync(storeKey(ns, key));
          }
          await SecureStore.deleteItemAsync(indexKey(ns));
        }
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({
          code: 'STORAGE_WRITE_FAILED' as const,
          message: 'SecureStore clearAll failed',
          cause,
        });
      }
    },
  };
}
