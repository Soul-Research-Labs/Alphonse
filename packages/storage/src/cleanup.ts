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
export async function forensicWipe(storage: StorageAdapter): AsyncResult<{
  namespacesWiped: number;
  keysWiped: number;
}> {
  let keysWiped = 0;
  let namespacesWiped = 0;

  try {
    for (const ns of WIPE_ORDER) {
      const keysResult = await storage.keys(ns);
      if (!keysResult.ok) continue;

      for (const key of keysResult.value) {
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
      }

      await storage.clear(ns);
      namespacesWiped++;
    }

    // Final clearAll as belt-and-suspenders
    await storage.clearAll();

    return Result.ok({ namespacesWiped, keysWiped });
  } catch (cause) {
    return Result.err({
      code: 'STORAGE_WRITE_FAILED' as const,
      message: 'Forensic wipe failed',
      cause,
    });
  }
}
