/**
 * Cryptographic abstraction types.
 *
 * All encryption in ALPHONSE is abstraction-based and replaceable
 * to support future hybrid post-quantum upgrades. Crypto primitives
 * are NEVER hardcoded into business logic.
 *
 * Current recommendation: AES-256-GCM or XChaCha20-Poly1305.
 * PQ readiness: data/state encryption and sync, NOT blockchain signing.
 */

// ---------------------------------------------------------------------------
// Domain separation
// ---------------------------------------------------------------------------

/**
 * Security domains for key derivation from SRP.
 *
 * Each domain derives an independent key. Derived keys:
 * - Are one-way from SRP.
 * - Cannot derive SRP.
 * - Cannot derive each other.
 */
export const KeyDomain = {
  /** HD wallet signing keys (BIP-44 derivation). */
  SIGNING: 'SIGNING',
  /** Vault Store encryption key. */
  VAULT_STORE: 'VAULT_STORE',
  /** Encrypted sync payload key. */
  SYNC: 'SYNC',
  /** Device pairing / session keys. */
  PAIRING: 'PAIRING',
} as const;

export type KeyDomain = (typeof KeyDomain)[keyof typeof KeyDomain];

// ---------------------------------------------------------------------------
// Encrypted payload envelope
// ---------------------------------------------------------------------------

/** Algorithm identifier for the encryption scheme used. */
export type CipherAlgorithm = 'aes-256-gcm' | 'xchacha20-poly1305';

/**
 * Encrypted data envelope.
 *
 * All encrypted payloads in storage, sync, and snapshots use this format.
 * The envelope is self-describing so decryption code can select the
 * correct algorithm without external metadata.
 */
export interface EncryptedPayload {
  /** Algorithm used for encryption. */
  readonly algorithm: CipherAlgorithm;
  /** Initialization vector / nonce (base64). */
  readonly iv: string;
  /** Ciphertext (base64). */
  readonly ciphertext: string;
  /** Authentication tag (base64) — applicable for AEAD ciphers. */
  readonly tag: string;
  /** Version of the encryption envelope format (for migration). */
  readonly version: number;
}

// ---------------------------------------------------------------------------
// KDF parameters
// ---------------------------------------------------------------------------

/** Supported KDF algorithms. */
export type KdfAlgorithm = 'argon2id' | 'hkdf-sha256';

/**
 * Parameters for key derivation.
 * Stored alongside the encrypted payload so the key can be re-derived.
 */
export type KdfParams =
  | {
      readonly algorithm: 'argon2id';
      /** Salt (base64). */
      readonly salt: string;
      /** Memory cost in KiB. */
      readonly memoryCost: number;
      /** Time cost (iterations). */
      readonly timeCost: number;
      /** Parallelism. */
      readonly parallelism: number;
    }
  | {
      readonly algorithm: 'hkdf-sha256';
      /** Salt (base64). */
      readonly salt: string;
      /** Domain separation info string. */
      readonly info: string;
    };

// ---------------------------------------------------------------------------
// Crypto provider interface (abstraction boundary)
// ---------------------------------------------------------------------------

/**
 * Platform-agnostic interface for cryptographic operations.
 *
 * Implementations are provided by platform adapters (mobile, extension, etc.).
 * This interface is the ONLY surface through which business logic accesses
 * crypto primitives — enabling future PQ migration without touching callers.
 */
export interface CryptoProvider {
  /**
   * Encrypt plaintext bytes.
   * @returns EncryptedPayload envelope containing ciphertext + metadata.
   */
  encrypt: (
    plaintext: Uint8Array,
    key: Uint8Array,
    algorithm: CipherAlgorithm
  ) => Promise<EncryptedPayload>;

  /**
   * Decrypt an encrypted payload.
   * @returns Decrypted plaintext bytes.
   */
  decrypt: (payload: EncryptedPayload, key: Uint8Array) => Promise<Uint8Array>;

  /**
   * Derive a key from input material using the specified KDF.
   * @returns Derived key bytes.
   */
  deriveKey: (input: Uint8Array, params: KdfParams, keyLengthBytes: number) => Promise<Uint8Array>;

  /**
   * Generate cryptographically secure random bytes.
   */
  randomBytes: (length: number) => Uint8Array;

  /**
   * Compute HMAC over data using the given key.
   * Used for snapshot integrity checks and similar MACs.
   */
  hmac: (key: Uint8Array, data: Uint8Array) => Promise<Uint8Array>;
}
