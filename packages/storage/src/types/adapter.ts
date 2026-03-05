/**
 * Storage adapter interface.
 *
 * Platform-agnostic contract for encrypted storage backends.
 * Implementations provided by platform adapters:
 * - Mobile: OS keychain/keystore + encrypted DB
 * - Future: extension storage, IndexedDB, etc.
 *
 * All data stored via this interface MUST be ciphertext.
 * The adapter does NOT perform encryption — callers are responsible
 * for encrypting before write and decrypting after read.
 *
 * Storage is local-first; remote storage is optional and provider-agnostic.
 */

import type { AsyncResult } from '@alphonse/core';

// ---------------------------------------------------------------------------
// Storage namespaces
// ---------------------------------------------------------------------------

/**
 * Logical namespaces to separate different categories of stored data.
 * Prevents key collisions and enables selective export/wipe.
 */
export const StorageNamespace = {
  /** Vault Store — high-security material (encrypted SRP, signing state). */
  VAULT_STORE: 'VAULT_STORE',
  /** User metadata — contacts, labels, notes, budgets. */
  METADATA: 'METADATA',
  /** Application preferences — non-sensitive settings. */
  PREFERENCES: 'PREFERENCES',
  /** Transaction cache — cached tx history. */
  TX_CACHE: 'TX_CACHE',
  /** Sync state — E2EE sync bookmarks and cursors. */
  SYNC_STATE: 'SYNC_STATE',
} as const;

export type StorageNamespace = (typeof StorageNamespace)[keyof typeof StorageNamespace];

// ---------------------------------------------------------------------------
// Storage adapter interface
// ---------------------------------------------------------------------------

export interface StorageAdapter {
  /**
   * Read a value by key within a namespace.
   * Returns null if the key does not exist.
   */
  get: (namespace: StorageNamespace, key: string) => AsyncResult<Uint8Array | null>;

  /**
   * Write a value by key within a namespace.
   * Overwrites if the key already exists.
   */
  set: (namespace: StorageNamespace, key: string, value: Uint8Array) => AsyncResult<void>;

  /**
   * Delete a key within a namespace.
   * No-op if the key does not exist.
   */
  delete: (namespace: StorageNamespace, key: string) => AsyncResult<void>;

  /**
   * List all keys within a namespace.
   */
  keys: (namespace: StorageNamespace) => AsyncResult<Array<string>>;

  /**
   * Check if a key exists within a namespace.
   */
  has: (namespace: StorageNamespace, key: string) => AsyncResult<boolean>;

  /**
   * Delete all data within a namespace.
   */
  clear: (namespace: StorageNamespace) => AsyncResult<void>;

  /**
   * Delete ALL stored data across ALL namespaces.
   * ⚠️ Destructive — used for wallet wipe / factory reset.
   */
  clearAll: () => AsyncResult<void>;
}
