/**
 * Forensic wipe duress action.
 *
 * When the wipe PIN is entered, all local storage is destroyed:
 * - Overwrites Vault Store, metadata, caches, and preferences with zeros.
 * - Deletes all keys from all namespaces.
 * - App resets to fresh-install state.
 *
 * This delegates to the storage package's forensicWipe() for the actual
 * data destruction, adding duress-specific concerns (immediate execution,
 * no confirmation UI).
 */

import { Result } from '../types/common';
import type { AsyncResult } from '../types/common';

/** Interface matching the storage package's forensicWipe result. */
export interface WipeResult {
  readonly namespacesWiped: number;
  readonly keysWiped: number;
}

/**
 * A function that performs the actual forensic wipe.
 * Injected by the caller so the duress module stays storage-agnostic.
 */
export type ForensicWipeFn = () => AsyncResult<WipeResult>;

/**
 * Execute the forensic wipe duress action.
 *
 * This is the entry point called when a wipe PIN is detected.
 * It invokes the provided wipe function and returns the result.
 *
 * The caller is responsible for:
 * 1. Resetting the app to fresh-install state after a successful wipe.
 * 2. Clearing any in-memory state (keys, sessions, etc.).
 */
export async function executeDuressWipe(wipeFn: ForensicWipeFn): AsyncResult<WipeResult> {
  try {
    const result = await wipeFn();
    return result;
  } catch (cause) {
    return Result.err({
      code: 'STORAGE_WRITE_FAILED' as const,
      message: 'Duress wipe failed',
      cause,
    });
  }
}
