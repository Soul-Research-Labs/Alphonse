/** Wallet lifecycle state machine: UNINITIALIZED → LOCKED → UNLOCKED. */

import type { VaultKey, AutoLockPolicy, UnlockResult } from '../types/auth';
import type { AsyncResult, Address, Timestamp } from '../types/common';
import { Result, ErrorCode } from '../types/common';
import type { WalletStatus, WalletIdentity, WalletState, WalletConfig, SRP } from '../types/wallet';
import type { PublicAccount } from '../types/account';

import type { SrpManager } from '../crypto/srp';
import type { KeyDerivation, SigningKeyPair } from '../crypto/keys';
import type { VaultStoreManager, VaultStoreEnvelopeLocal } from '../vault/store';

export interface WalletManager {
  getState: () => WalletState;
  getConfig: () => WalletConfig;
  create: (password: Uint8Array) => AsyncResult<{ srp: SRP; address: Address }>;
  import: (srp: SRP, password: Uint8Array) => AsyncResult<{ address: Address }>;
  unlock: (password: Uint8Array) => AsyncResult<UnlockResult>;
  lock: () => void;
  getPublicAccount: () => PublicAccount | null;
  getSigningKeyPair: () => SigningKeyPair | null;
  changePassword: (oldPassword: Uint8Array, newPassword: Uint8Array) => AsyncResult<void>;
  exists: () => boolean;
  wipe: () => AsyncResult<void>;
}

export interface WalletPersistence {
  loadEnvelope: () => AsyncResult<VaultStoreEnvelopeLocal | null>;
  saveEnvelope: (envelope: VaultStoreEnvelopeLocal) => AsyncResult<void>;
  deleteAll: () => AsyncResult<void>;
}

const DEFAULT_AUTO_LOCK: AutoLockPolicy = {
  inactivityTimeoutMs: 5 * 60 * 1000,
  lockOnBackground: true,
  lockOnSessionEnd: true,
};

const DEFAULT_CONFIG: WalletConfig = {
  autoLock: DEFAULT_AUTO_LOCK,
  biometricEnabled: false,
};

export function createWalletManager(
  srpManager: SrpManager,
  keyDerivation: KeyDerivation,
  vaultStoreManager: VaultStoreManager,
  persistence: WalletPersistence
): WalletManager {
  let state: WalletState = {
    status: 'UNINITIALIZED' as WalletStatus,
    identity: null,
    lastUnlockedAt: null,
  };
  const config: WalletConfig = { ...DEFAULT_CONFIG };

  let activeVaultKey: VaultKey | null = null;
  let activeSigningKeyPair: SigningKeyPair | null = null;

  function zeroSecrets(): void {
    if (activeVaultKey) {
      (activeVaultKey as unknown as Uint8Array).fill(0);
      activeVaultKey = null;
    }
    if (activeSigningKeyPair) {
      activeSigningKeyPair.privateKey.fill(0);
      activeSigningKeyPair = null;
    }
  }

  function setLocked(identity: WalletIdentity): void {
    zeroSecrets();
    state = { status: 'LOCKED' as WalletStatus, identity, lastUnlockedAt: null };
  }

  function setUnlocked(identity: WalletIdentity): void {
    state = {
      status: 'UNLOCKED' as WalletStatus,
      identity,
      lastUnlockedAt: Date.now() as Timestamp,
    };
  }

  /** Shared setup for create and import: derive keys → build envelope → persist → unlock. */
  async function setupWallet(
    srp: SRP,
    password: Uint8Array
  ): AsyncResult<{ vaultKey: VaultKey; signingKp: SigningKeyPair; walletId: string }> {
    const existingResult = await persistence.loadEnvelope();
    if (existingResult.ok && existingResult.value !== null) {
      return Result.err({
        code: ErrorCode.WALLET_ALREADY_EXISTS,
        message: 'A wallet already exists on this device. Wipe first.',
      });
    }

    const vaultKey = await keyDerivation.deriveVaultKey(srp);
    const signingKp = keyDerivation.deriveSigningKeyPair(srp);
    const walletId = keyDerivation.deriveWalletId(srp);

    const envelopeResult = await vaultStoreManager.create(
      srp as string,
      walletId,
      password,
      vaultKey
    );
    if (!envelopeResult.ok) return envelopeResult as typeof envelopeResult & { ok: false };

    const saveResult = await persistence.saveEnvelope(envelopeResult.value);
    if (!saveResult.ok) return saveResult as typeof saveResult & { ok: false };

    const identity: WalletIdentity = { id: walletId as any, createdAt: Date.now() as Timestamp };
    activeVaultKey = vaultKey;
    activeSigningKeyPair = signingKp;
    setUnlocked(identity);

    return Result.ok({ vaultKey, signingKp, walletId });
  }

  async function create(password: Uint8Array): AsyncResult<{ srp: SRP; address: Address }> {
    try {
      const srp = srpManager.generate(12);
      const result = await setupWallet(srp, password);
      if (!result.ok) return result as typeof result & { ok: false };
      return Result.ok({ srp, address: result.value.signingKp.address });
    } catch (cause) {
      return Result.err({ code: ErrorCode.UNKNOWN, message: 'Failed to create wallet.', cause });
    }
  }

  async function importWallet(srp: SRP, password: Uint8Array): AsyncResult<{ address: Address }> {
    if (!srpManager.validate(srp)) {
      return Result.err({ code: ErrorCode.INVALID_SRP, message: 'Invalid recovery phrase.' });
    }
    try {
      const result = await setupWallet(srp, password);
      if (!result.ok) return result as typeof result & { ok: false };
      return Result.ok({ address: result.value.signingKp.address });
    } catch (cause) {
      return Result.err({ code: ErrorCode.UNKNOWN, message: 'Failed to import wallet.', cause });
    }
  }

  async function unlock(password: Uint8Array): AsyncResult<UnlockResult> {
    const envelopeResult = await persistence.loadEnvelope();
    if (!envelopeResult.ok) return envelopeResult as typeof envelopeResult & { ok: false };
    if (envelopeResult.value === null) {
      return Result.err({
        code: ErrorCode.WALLET_NOT_FOUND,
        message: 'No wallet found on this device.',
      });
    }

    const unlockResult = await vaultStoreManager.unlock(envelopeResult.value, password);
    if (!unlockResult.ok) return unlockResult as typeof unlockResult & { ok: false };

    const { contents, vaultKey } = unlockResult.value;
    const srpResult = srpManager.normalize(contents.srp);
    if (!srpResult.ok) {
      return Result.err({
        code: ErrorCode.DECRYPTION_FAILED,
        message: 'Corrupted SRP in Vault Store.',
      });
    }

    const signingKp = keyDerivation.deriveSigningKeyPair(srpResult.value);
    const identity: WalletIdentity = {
      id: contents.walletId as any,
      createdAt: Date.now() as Timestamp,
    };
    activeVaultKey = vaultKey;
    activeSigningKeyPair = signingKp;
    setUnlocked(identity);

    return Result.ok({
      unlockedAt: Date.now() as Timestamp,
      sessionTimeoutMs: config.autoLock.inactivityTimeoutMs,
    });
  }

  function lock(): void {
    if (state.identity) setLocked(state.identity);
    else {
      zeroSecrets();
      state = { status: 'LOCKED' as WalletStatus, identity: null, lastUnlockedAt: null };
    }
  }

  function getPublicAccount(): PublicAccount | null {
    if (!activeSigningKeyPair) return null;
    return {
      address: activeSigningKeyPair.address,
      derivationPath: activeSigningKeyPair.derivationPath,
    };
  }

  async function changePassword(
    oldPassword: Uint8Array,
    newPassword: Uint8Array
  ): AsyncResult<void> {
    const envelopeResult = await persistence.loadEnvelope();
    if (!envelopeResult.ok) return envelopeResult as typeof envelopeResult & { ok: false };
    if (envelopeResult.value === null) {
      return Result.err({ code: ErrorCode.WALLET_NOT_FOUND, message: 'No wallet found.' });
    }
    const rewrapResult = await vaultStoreManager.rewrap(
      envelopeResult.value,
      oldPassword,
      newPassword
    );
    if (!rewrapResult.ok) return rewrapResult as typeof rewrapResult & { ok: false };
    return persistence.saveEnvelope(rewrapResult.value);
  }

  async function wipe(): AsyncResult<void> {
    zeroSecrets();
    state = { status: 'UNINITIALIZED' as WalletStatus, identity: null, lastUnlockedAt: null };
    return persistence.deleteAll();
  }

  return {
    getState: () => state,
    getConfig: () => config,
    create,
    import: importWallet,
    unlock,
    lock,
    getPublicAccount,
    getSigningKeyPair: () => activeSigningKeyPair,
    changePassword,
    exists: () => state.status !== 'UNINITIALIZED',
    wipe,
  };
}

/** Bootstrap: check storage for existing wallet and return initial state. */
export async function initWalletManager(
  _manager: WalletManager,
  persistence: WalletPersistence
): AsyncResult<WalletState> {
  const result = await persistence.loadEnvelope();
  if (!result.ok) return result as typeof result & { ok: false };

  if (result.value !== null) {
    return Result.ok({
      status: 'LOCKED' as WalletStatus,
      identity: { id: '' as any, createdAt: result.value.updatedAt },
      lastUnlockedAt: null,
    });
  }

  return Result.ok({
    status: 'UNINITIALIZED' as WalletStatus,
    identity: null,
    lastUnlockedAt: null,
  });
}
