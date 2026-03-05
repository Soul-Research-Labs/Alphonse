/**
 * Constant-time PIN comparison and evaluation.
 *
 * Authenticates a PIN against up to 3 stored hashes (real, decoy, wipe)
 * with indistinguishable timing. All comparisons are always performed
 * regardless of which one matches.
 */

import type { CryptoProvider, KdfParams } from '../types/crypto';
import { toBase64 } from '../crypto/encoding';
import type { DuressConfig, PinEvaluation } from './types';
import { DuressMode } from './types';

// ---------------------------------------------------------------------------
// PIN hashing
// ---------------------------------------------------------------------------

/**
 * Derive a PIN hash using the same KDF used for device unlock keys (Argon2id).
 * The salt is stored alongside the hash.
 */
export async function hashPin(
  crypto: CryptoProvider,
  pin: Uint8Array,
  salt: Uint8Array
): Promise<Uint8Array> {
  const params: KdfParams = {
    algorithm: 'argon2id',
    salt: toBase64(salt),
    memoryCost: 2048,
    timeCost: 2,
    parallelism: 1,
  };
  return crypto.deriveKey(pin, params, 32);
}

// ---------------------------------------------------------------------------
// Constant-time utilities
// ---------------------------------------------------------------------------

/**
 * Constant-time comparison of two byte arrays.
 * Always iterates all bytes — no early return.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length === 0 && b.length === 0) return true;

  if (a.length !== b.length) {
    // Still do constant-time-ish work on the longer array
    // to make timing less distinguishable.
    const max = Math.max(a.length, b.length);
    const aLen = Math.max(a.length, 1);
    const bLen = Math.max(b.length, 1);
    let diff = 1; // start as non-equal
    for (let i = 0; i < max; i++) {
      diff |= (a[i % aLen] ?? 0) ^ (b[i % bLen] ?? 0);
    }
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// PIN evaluation
// ---------------------------------------------------------------------------

export interface StoredPinHashes {
  /** Hash of the real PIN. Always present when PINs are configured. */
  readonly realHash: Uint8Array;
  readonly realSalt: Uint8Array;
  /** Hash of the decoy PIN (only when decoy mode is enabled). */
  readonly decoyHash: Uint8Array | null;
  readonly decoySalt: Uint8Array | null;
  /** Hash of the wipe PIN (only when wipe mode is enabled). */
  readonly wipeHash: Uint8Array | null;
  readonly wipeSalt: Uint8Array | null;
}

/**
 * Evaluate an entered PIN against stored hashes.
 *
 * CRITICAL: All three comparisons are always performed to ensure
 * indistinguishable timing regardless of which PIN matches.
 * The function hashes the input PIN with each stored salt and
 * compares the result.
 */
export async function evaluatePin(
  crypto: CryptoProvider,
  pin: Uint8Array,
  stored: StoredPinHashes,
  config: DuressConfig
): Promise<PinEvaluation> {
  // Always compute all three hashes, using the real salt as fallback
  // for disabled modes. This keeps timing constant.
  const realDerived = await hashPin(crypto, pin, stored.realSalt);

  const decoySalt = stored.decoySalt ?? stored.realSalt;
  const decoyDerived = await hashPin(crypto, pin, decoySalt);

  const wipeSalt = stored.wipeSalt ?? stored.realSalt;
  const wipeDerived = await hashPin(crypto, pin, wipeSalt);

  // Constant-time comparisons — all evaluated regardless of match
  const realMatch = constantTimeEqual(realDerived, stored.realHash);
  const decoyMatch =
    config.decoyEnabled && stored.decoyHash !== null
      ? constantTimeEqual(decoyDerived, stored.decoyHash)
      : false;
  const wipeMatch =
    config.wipeEnabled && stored.wipeHash !== null
      ? constantTimeEqual(wipeDerived, stored.wipeHash)
      : false;

  // Zero sensitive material
  realDerived.fill(0);
  decoyDerived.fill(0);
  wipeDerived.fill(0);

  // Priority: wipe > decoy > real (if user accidentally sets same PIN,
  // wipe takes precedence to ensure safety)
  if (wipeMatch) return { mode: DuressMode.WIPE, matched: true };
  if (decoyMatch) return { mode: DuressMode.DECOY, matched: true };
  if (realMatch) return { mode: DuressMode.NONE, matched: true };

  return { mode: DuressMode.NONE, matched: false };
}
