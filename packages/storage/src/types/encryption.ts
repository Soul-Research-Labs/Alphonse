/**
 * Encryption envelope types for storage.
 *
 * These types describe how encrypted data is structured on disk.
 * The Vault Store uses these envelopes to wrap high-security material.
 *
 * Two-layer encryption model:
 *   Layer 1: Device Unlock Key (Argon2id from password/biometric) wraps the Vault Key.
 *   Layer 2: Vault Key (HKDF from SRP, domain-separated) encrypts the Vault Store contents.
 *
 * Key constraints:
 * - Vault Key is derived from SRP via HKDF (domain-separated).
 * - Device Unlock Key wraps Vault Key — NOT the store directly.
 * - Encryption must support future migration and re-wrapping without changing SRP.
 * - Re-wrapping (password change) only re-encrypts Layer 1 — Layer 2 stays unchanged.
 */

import type { EncryptedPayload, KdfParams, Timestamp } from '@alphonse/core';

// ---------------------------------------------------------------------------
// Vault Store envelope (two-layer encryption)
// ---------------------------------------------------------------------------

/**
 * The full encrypted Vault Store as persisted to disk.
 *
 * Contains both encryption layers:
 *   1. `wrappedVaultKey` — the Vault Key encrypted by the Device Unlock Key.
 *   2. `encryptedContents` — the store contents encrypted by the Vault Key.
 *
 * Unlock flow:
 *   password → Argon2id(password, unlockKdfParams) → DUK
 *   DUK → decrypt(wrappedVaultKey) → VaultKey (in memory only)
 *   VaultKey → decrypt(encryptedContents) → plaintext store
 */
export interface VaultStoreEnvelope {
  /** Envelope format version (for future migration / re-wrapping). */
  readonly version: number;
  /** KDF params for deriving the Device Unlock Key from password/biometrics. */
  readonly unlockKdfParams: KdfParams;
  /** Layer 1: Vault Key encrypted by the Device Unlock Key. */
  readonly wrappedVaultKey: EncryptedPayload;
  /** Layer 2: Store contents encrypted by the Vault Key. */
  readonly encryptedContents: EncryptedPayload;
  /** When this envelope was last written. */
  readonly updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Secure item (generic encrypted record)
// ---------------------------------------------------------------------------

/**
 * A generic encrypted record in storage.
 * Used for metadata items (contacts, notes, etc.) that are
 * encrypted individually before storage.
 */
export interface SecureRecord {
  /** Unique record key. */
  readonly key: string;
  /** Encrypted content. */
  readonly payload: EncryptedPayload;
  /**
   * Schema/type tag for the plaintext contents.
   * Enables safe future schema migrations without decrypting all records.
   */
  readonly schemaVersion: number;
  /** When this record was created. */
  readonly createdAt: Timestamp;
  /** When this record was last updated. */
  readonly updatedAt: Timestamp;
}
