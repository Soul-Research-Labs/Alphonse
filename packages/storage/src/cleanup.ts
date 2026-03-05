/**
 * Forensic cleanup utilities.
 *
 * Implements the "forensic cleanup on uninstall" requirement:
 * - Delete all preferences, caches, and files.
 * - Overwrite Vault Store data if platform allows.
 * - Zero byte arrays before deletion.
 *
 * Platform limitations are documented:
 * - Android: App data is removed on uninstall (system handles it).
 * - iOS: Keychain items may persist after uninstall.
 * - Both: We zero-fill before delete for defense-in-depth.
 */

import { Result } from '@alphonse/core';
import type { AsyncResult } from '@alphonse/core';
import type { StorageAdapter, StorageNamespace } from './types/adapter';

/** Ordered list of namespaces to wipe, most sensitive first. */
const WIPE_ORDER: StorageNamespace[] = [
  'VAULT_STORE',
  'SYNC_STATE',
  'METADATA',
  'TX_CACHE',
  'PREFERENCES',
];

export interface ForensicWipeNamespaceError {
  readonly namespace: StorageNamespace;
  readonly message: string;
}

export interface ForensicWipeReport {
  readonly namespacesWiped: number;
  readonly keysWiped: number;
  /** Namespaces that had non-fatal wipe errors. */
  readonly namespaceErrors: readonly ForensicWipeNamespaceError[];
  /** Platform limitation notes to surface in UX/docs. */
  readonly platformNotes: readonly string[];
}

export interface ForensicWipeOptions {
  readonly wipeOrder?: readonly StorageNamespace[];
  readonly platform?: 'ios' | 'android' | 'web' | 'unknown';
  /** Keep true for defense-in-depth belt-and-suspenders clear pass. */
  readonly clearAllAfter?: boolean;
}

export function getForensicCleanupNotes(
  platform: ForensicWipeOptions['platform'] = 'unknown'
): readonly string[] {
  const common = [
    'Flash storage wear-leveling may retain previous physical blocks after overwrite.',
  ];

  if (platform === 'ios') {
    return [
      'iOS keychain items can persist after uninstall unless explicitly deleted before uninstall.',
      ...common,
    ];
  }

  if (platform === 'android') {
    return ['Android app data is normally removed on uninstall by the OS.', ...common];
  }

  if (platform === 'web') {
    return [
      'Browser storage clearing behavior can vary by engine and private browsing mode.',
      ...common,
    ];
  }

  return common;
}

/**
 * Overwrite all stored values with zeros, then delete them.
 *
 * Steps per namespace:
 * 1. List all keys.
 * 2. For each key: read → overwrite with same-length zeros → delete.
 * 3. Clear the namespace.
 *
 * This provides defense-in-depth against data recovery, though
 * flash storage wear leveling may retain prior writes.
 */
export async function forensicWipe(
  storage: StorageAdapter,
  options: ForensicWipeOptions = {}
): AsyncResult<ForensicWipeReport> {
  const wipeOrder = options.wipeOrder ?? WIPE_ORDER;
  const clearAllAfter = options.clearAllAfter ?? true;

  let keysWiped = 0;
  let namespacesWiped = 0;
  const namespaceErrors: ForensicWipeNamespaceError[] = [];

  try {
    for (const ns of wipeOrder) {
      const keysResult = await storage.keys(ns);
      if (!keysResult.ok) {
        namespaceErrors.push({ namespace: ns, message: keysResult.error.message });
        continue;
      }

      for (const key of keysResult.value) {
        try {
          // Read current value to get length
          const readResult = await storage.get(ns, key);
          if (readResult.ok && readResult.value !== null) {
            // Overwrite with zeros of same length
            const zeros = new Uint8Array(readResult.value.length);
            await storage.set(ns, key, zeros);
          }

          // Delete the key
          await storage.delete(ns, key);
          keysWiped++;
        } catch (cause) {
          namespaceErrors.push({
            namespace: ns,
            message: `Failed to wipe key "${key}": ${String(cause)}`,
          });
        }
      }

      const clearResult = await storage.clear(ns);
      if (!clearResult.ok) {
        namespaceErrors.push({ namespace: ns, message: clearResult.error.message });
      }
      namespacesWiped++;
    }

    if (clearAllAfter) {
      // Final clearAll as belt-and-suspenders
      const finalClear = await storage.clearAll();
      if (!finalClear.ok) {
        return finalClear;
      }
    }

    return Result.ok({
      namespacesWiped,
      keysWiped,
      namespaceErrors,
      platformNotes: getForensicCleanupNotes(options.platform),
    });
  } catch (cause) {
    return Result.err({
      code: 'STORAGE_WRITE_FAILED' as const,
      message: 'Forensic wipe failed',
      cause,
    });
  }
}
