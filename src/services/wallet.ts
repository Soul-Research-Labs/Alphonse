/**
 * Wallet service — initializes and provides the core wallet manager.
 *
 * Wires together: CryptoProvider, SrpManager, KeyDerivation,
 * VaultStoreManager, and WalletPersistence (backed by secure storage).
 *
 * This is the single initialization point for all wallet operations.
 */

import {
  createCryptoProvider,
  createSrpManager,
  createKeyDerivation,
  createVaultStoreManager,
  createWalletManager,
  createAddressChecker,
  Result,
} from '@alphonse/core';
import type { AsyncResult } from '@alphonse/core';
import type { WalletManager, WalletPersistence } from '@alphonse/core';
import type { VaultStoreEnvelopeLocal } from '@alphonse/core';
import type { AddressChecker } from '@alphonse/core';
import type { StorageAdapter, StorageNamespace } from '@alphonse/storage';

const ENVELOPE_KEY = 'wallet_envelope';
const VAULT_NS = 'VAULT_STORE' as StorageNamespace;

/**
 * Create WalletPersistence backed by a StorageAdapter.
 *
 * The vault store envelope is serialized as JSON and stored
 * as a Uint8Array (text-encoded) in the VAULT_STORE namespace.
 */
function createWalletPersistence(storage: StorageAdapter): WalletPersistence {
  return {
    async loadEnvelope(): AsyncResult<VaultStoreEnvelopeLocal | null> {
      const result = await storage.get(VAULT_NS, ENVELOPE_KEY);
      if (!result.ok) return result;
      if (result.value === null) return Result.ok(null);

      try {
        const json = new TextDecoder().decode(result.value);
        return Result.ok(JSON.parse(json));
      } catch (cause) {
        return Result.err({
          code: 'STORAGE_READ_FAILED' as const,
          message: 'Failed to parse wallet envelope',
          cause,
        });
      }
    },

    async saveEnvelope(envelope: VaultStoreEnvelopeLocal): AsyncResult<void> {
      try {
        const bytes = new TextEncoder().encode(JSON.stringify(envelope));
        return storage.set(VAULT_NS, ENVELOPE_KEY, bytes);
      } catch (cause) {
        return Result.err({
          code: 'STORAGE_WRITE_FAILED' as const,
          message: 'Failed to save wallet envelope',
          cause,
        });
      }
    },

    async deleteAll(): AsyncResult<void> {
      return storage.clearAll();
    },
  };
}

/** All services created by initWalletService. */
export interface WalletServices {
  readonly walletManager: WalletManager;
  readonly addressChecker: AddressChecker;
  readonly persistence: WalletPersistence;
  readonly storage: StorageAdapter;
}

/**
 * Initialize all wallet services.
 *
 * Call once at app startup. Returns the wallet manager and address checker.
 */
export function initWalletServices(storage: StorageAdapter): WalletServices {
  const crypto = createCryptoProvider();
  const srpManager = createSrpManager();
  const keyDerivation = createKeyDerivation(crypto, srpManager);
  const vaultStoreManager = createVaultStoreManager(crypto);
  const persistence = createWalletPersistence(storage);

  const walletManager = createWalletManager(
    srpManager,
    keyDerivation,
    vaultStoreManager,
    persistence
  );
  const addressChecker = createAddressChecker();

  return { walletManager, addressChecker, persistence, storage };
}
