/**
 * Two-layer encrypted Vault Store.
 * L1: DUK (Argon2id from password) wraps VaultKey.
 * L2: VaultKey (HKDF from SRP) encrypts contents.
 */

import type { CryptoProvider, CipherAlgorithm, KdfParams, EncryptedPayload } from '../types/crypto';
import type { VaultKey } from '../types/auth';
import type { AsyncResult, Timestamp } from '../types/common';
import { Result, ErrorCode } from '../types/common';
import { toBase64 } from '../crypto/encoding';
import { DEFAULT_ARGON2_PARAMS } from '../crypto/keys';

export interface VaultStoreEnvelopeLocal {
  readonly version: number;
  readonly unlockKdfParams: KdfParams;
  readonly wrappedVaultKey: EncryptedPayload;
  readonly encryptedContents: EncryptedPayload;
  readonly updatedAt: Timestamp;
}

export interface VaultStoreContents {
  readonly srp: string;
  readonly walletId: string;
}

export interface VaultStoreManager {
  create: (
    srp: string,
    walletId: string,
    password: Uint8Array,
    vaultKey: VaultKey
  ) => AsyncResult<VaultStoreEnvelopeLocal>;
  unlock: (
    envelope: VaultStoreEnvelopeLocal,
    password: Uint8Array
  ) => AsyncResult<{ contents: VaultStoreContents; vaultKey: VaultKey }>;
  unlockWithVaultKey: (
    envelope: VaultStoreEnvelopeLocal,
    vaultKey: VaultKey
  ) => AsyncResult<VaultStoreContents>;
  rewrap: (
    envelope: VaultStoreEnvelopeLocal,
    oldPassword: Uint8Array,
    newPassword: Uint8Array
  ) => AsyncResult<VaultStoreEnvelopeLocal>;
}

const CIPHER: CipherAlgorithm = 'aes-256-gcm';

function argon2Params(salt: Uint8Array): KdfParams {
  return { algorithm: 'argon2id', salt: toBase64(salt), ...DEFAULT_ARGON2_PARAMS };
}

export function createVaultStoreManager(crypto: CryptoProvider): VaultStoreManager {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  async function create(
    srp: string,
    walletId: string,
    password: Uint8Array,
    vaultKey: VaultKey
  ): AsyncResult<VaultStoreEnvelopeLocal> {
    try {
      const unlockKdfParams = argon2Params(crypto.randomBytes(32));
      const duk = await crypto.deriveKey(password, unlockKdfParams, 32);
      const vkBytes = vaultKey as unknown as Uint8Array;

      const wrappedVaultKey = await crypto.encrypt(vkBytes, duk, CIPHER);
      const encryptedContents = await crypto.encrypt(
        encoder.encode(JSON.stringify({ srp, walletId } satisfies VaultStoreContents)),
        vkBytes,
        CIPHER
      );

      return Result.ok({
        version: 1,
        unlockKdfParams,
        wrappedVaultKey,
        encryptedContents,
        updatedAt: Date.now() as Timestamp,
      });
    } catch (cause) {
      return Result.err({
        code: ErrorCode.ENCRYPTION_FAILED,
        message: 'Failed to create Vault Store.',
        cause,
      });
    }
  }

  async function unlock(
    envelope: VaultStoreEnvelopeLocal,
    password: Uint8Array
  ): AsyncResult<{ contents: VaultStoreContents; vaultKey: VaultKey }> {
    try {
      const duk = await crypto.deriveKey(password, envelope.unlockKdfParams, 32);

      let vaultKeyBytes: Uint8Array;
      try {
        vaultKeyBytes = await crypto.decrypt(envelope.wrappedVaultKey, duk);
      } catch {
        return Result.err({ code: ErrorCode.UNLOCK_FAILED, message: 'Invalid password.' });
      }

      const contentsBytes = await crypto.decrypt(envelope.encryptedContents, vaultKeyBytes);
      const contents = JSON.parse(decoder.decode(contentsBytes)) as VaultStoreContents;
      return Result.ok({ contents, vaultKey: vaultKeyBytes as unknown as VaultKey });
    } catch (cause) {
      return Result.err({
        code: ErrorCode.UNLOCK_FAILED,
        message: 'Failed to unlock Vault Store.',
        cause,
      });
    }
  }

  async function unlockWithVaultKey(
    envelope: VaultStoreEnvelopeLocal,
    vaultKey: VaultKey
  ): AsyncResult<VaultStoreContents> {
    try {
      const bytes = await crypto.decrypt(
        envelope.encryptedContents,
        vaultKey as unknown as Uint8Array
      );
      return Result.ok(JSON.parse(decoder.decode(bytes)) as VaultStoreContents);
    } catch (cause) {
      return Result.err({
        code: ErrorCode.DECRYPTION_FAILED,
        message: 'Failed to decrypt Vault Store.',
        cause,
      });
    }
  }

  async function rewrap(
    envelope: VaultStoreEnvelopeLocal,
    oldPassword: Uint8Array,
    newPassword: Uint8Array
  ): AsyncResult<VaultStoreEnvelopeLocal> {
    const unlockResult = await unlock(envelope, oldPassword);
    if (!unlockResult.ok) return unlockResult as typeof unlockResult & { ok: false };

    try {
      const newKdfParams = argon2Params(crypto.randomBytes(32));
      const newDuk = await crypto.deriveKey(newPassword, newKdfParams, 32);
      const newWrappedVaultKey = await crypto.encrypt(
        unlockResult.value.vaultKey as unknown as Uint8Array,
        newDuk,
        CIPHER
      );

      return Result.ok({
        ...envelope,
        unlockKdfParams: newKdfParams,
        wrappedVaultKey: newWrappedVaultKey,
        updatedAt: Date.now() as Timestamp,
      });
    } catch (cause) {
      return Result.err({
        code: ErrorCode.ENCRYPTION_FAILED,
        message: 'Failed to re-wrap Vault Store.',
        cause,
      });
    }
  }

  return { create, unlock, unlockWithVaultKey, rewrap };
}
