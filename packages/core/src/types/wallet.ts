/**
 * Wallet identity and state types.
 *
 * ALPHONSE uses a single SRP (Secret Recovery Phrase) to derive
 * all keys. The wallet has two pools (Public & Vault) but one identity.
 *
 * Security invariants:
 * - SRP never leaves the device.
 * - SRP is never used directly as a storage encryption key.
 * - Decrypted key material lives only in memory while unlocked.
 */

import type { Brand, Timestamp } from './common';

// Re-export to keep the import graph simple for consumers.
import type { AutoLockPolicy } from './auth';

// ---------------------------------------------------------------------------
// SRP (Secret Recovery Phrase / BIP-39 mnemonic)
// ---------------------------------------------------------------------------

/**
 * A BIP-39 mnemonic phrase (12 or 24 words, space-separated).
 * Branded to prevent accidental use of arbitrary strings.
 *
 * NEVER persist in plaintext. NEVER log.
 */
export type SRP = Brand<string, 'SRP'>;

/** Supported mnemonic word counts. */
export type SRPWordCount = 12 | 24;

// ---------------------------------------------------------------------------
// Wallet identity
// ---------------------------------------------------------------------------

/** Unique identifier for a wallet instance (derived deterministically from SRP). */
export type WalletId = Brand<string, 'WalletId'>;

export interface WalletIdentity {
  /** Deterministic wallet identifier (e.g. hash of master public key). */
  readonly id: WalletId;
  /** Human-readable label (user-chosen, optional). */
  readonly label?: string;
  /** When the wallet was first created/imported on this device. */
  readonly createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Wallet state machine
// ---------------------------------------------------------------------------

export const WalletStatus = {
  /** No wallet exists on this device. */
  UNINITIALIZED: 'UNINITIALIZED',
  /** Wallet exists but is locked — secrets are encrypted at rest. */
  LOCKED: 'LOCKED',
  /** Wallet is unlocked — decrypted key material is in memory. */
  UNLOCKED: 'UNLOCKED',
} as const;

export type WalletStatus = (typeof WalletStatus)[keyof typeof WalletStatus];

export interface WalletState {
  readonly status: WalletStatus;
  readonly identity: WalletIdentity | null;
  /** Timestamp of last unlock (null if never unlocked this session). */
  readonly lastUnlockedAt: Timestamp | null;
}

// ---------------------------------------------------------------------------
// Wallet configuration
// ---------------------------------------------------------------------------

export interface WalletConfig {
  /** Auto-lock policy — governs when the wallet locks automatically. */
  readonly autoLock: AutoLockPolicy;
  /** Whether biometric unlock is enabled on this device. */
  readonly biometricEnabled: boolean;
}
export type { AutoLockPolicy };
