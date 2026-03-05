/**
 * Authentication, lock/unlock, and key wrapping types.
 *
 * Auth model invariants (from AGENTS.md):
 * - Nothing that identifies the user must ever unlock the wallet.
 * - Nothing that unlocks the wallet must ever live off-device.
 * - Passwords/biometrics derive Device Unlock Keys that wrap the Vault Key locally.
 * - Loss of all devices must not prevent recovery if SRP is known.
 * - SRP alone restores wallet identity, signing, and Vault Store decryption.
 */

import type { Brand, Timestamp } from './common';
import type { EncryptedPayload, KdfParams } from './crypto';

// ---------------------------------------------------------------------------
// Key types (branded — these are opaque byte-array wrappers)
// ---------------------------------------------------------------------------

/**
 * Vault Key — encrypts the Vault Store.
 * Deterministically derived from SRP via HKDF (domain-separated).
 * Lives in memory ONLY while wallet is unlocked.
 */
export type VaultKey = Brand<Uint8Array, 'VaultKey'>;

/**
 * Device Unlock Key — derived from password or biometrics via Argon2id.
 * Used to wrap (encrypt) the Vault Key for at-rest storage on this device.
 * Device-local; never synced.
 */
export type DeviceUnlockKey = Brand<Uint8Array, 'DeviceUnlockKey'>;

// ---------------------------------------------------------------------------
// Persisted wrapper (encrypted Vault Key at rest)
// ---------------------------------------------------------------------------

/**
 * The Vault Key encrypted by the Device Unlock Key.
 * This is what's stored on disk — the actual Vault Key only exists
 * in memory after successful unlock.
 */
export interface WrappedVaultKey {
  /** The encrypted Vault Key. */
  readonly payload: EncryptedPayload;
  /** KDF params used to derive the Device Unlock Key from password/biometric. */
  readonly kdfParams: KdfParams;
}

// ---------------------------------------------------------------------------
// Unlock request / result
// ---------------------------------------------------------------------------

export const UnlockMethod = {
  PASSWORD: 'PASSWORD',
  BIOMETRIC: 'BIOMETRIC',
  /** Direct SRP entry — used during recovery or first-time setup. */
  SRP_DIRECT: 'SRP_DIRECT',
} as const;

export type UnlockMethod = (typeof UnlockMethod)[keyof typeof UnlockMethod];

export interface UnlockRequest {
  readonly method: UnlockMethod;
  /** Unlock material; callers must zero this after use. */
  readonly credential: Uint8Array;
}

/** Result of a successful unlock. */
export interface UnlockResult {
  /** Timestamp when the wallet was unlocked. */
  readonly unlockedAt: Timestamp;
  /** Session timeout in milliseconds (from AutoLockPolicy). */
  readonly sessionTimeoutMs: number;
}

// ---------------------------------------------------------------------------
// Auto-lock policy
// ---------------------------------------------------------------------------

export interface AutoLockPolicy {
  /** Lock after N milliseconds of inactivity (0 = disabled). */
  readonly inactivityTimeoutMs: number;
  /** Lock when app goes to background. */
  readonly lockOnBackground: boolean;
  /** Lock on session end / app termination. */
  readonly lockOnSessionEnd: boolean;
}
