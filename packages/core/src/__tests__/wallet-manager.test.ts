/**
 * Tests for the WalletManager lifecycle.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createCryptoProvider } from '../crypto/provider';
import { createSrpManager } from '../crypto/srp';
import { createKeyDerivation } from '../crypto/keys';
import { createVaultStoreManager, type VaultStoreEnvelopeLocal } from '../vault/store';
import { createWalletManager, type WalletPersistence } from '../wallet/manager';
import { Result } from '../types/common';

/**
 * In-memory persistence for testing.
 */
function createTestPersistence(): WalletPersistence & { data: VaultStoreEnvelopeLocal | null } {
  const store = { data: null as VaultStoreEnvelopeLocal | null };

  return {
    get data() {
      return store.data;
    },
    set data(v) {
      store.data = v;
    },
    loadEnvelope: async () => Result.ok(store.data),
    saveEnvelope: async (envelope) => {
      store.data = envelope;
      return Result.ok(undefined);
    },
    deleteAll: async () => {
      store.data = null;
      return Result.ok(undefined);
    },
  };
}

describe('WalletManager', () => {
  const crypto = createCryptoProvider();
  const srpManager = createSrpManager();
  const keyDerivation = createKeyDerivation(crypto, srpManager);
  const vaultStoreManager = createVaultStoreManager(crypto);

  let persistence: ReturnType<typeof createTestPersistence>;

  beforeEach(() => {
    persistence = createTestPersistence();
  });

  function createManager() {
    return createWalletManager(srpManager, keyDerivation, vaultStoreManager, persistence);
  }

  describe('create', () => {
    it('creates a new wallet and transitions to UNLOCKED', async () => {
      const manager = createManager();
      const password = new TextEncoder().encode('test-password');

      const result = await manager.create(password);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Should receive SRP and address
      expect(result.value.srp).toBeTruthy();
      const words = (result.value.srp as string).split(' ');
      expect(words.length).toBe(12);
      expect(result.value.address).toMatch(/^0x[0-9a-f]{40}$/);

      // State should be UNLOCKED
      const state = manager.getState();
      expect(state.status).toBe('UNLOCKED');
      expect(state.identity).not.toBeNull();

      // Public account should be available
      const account = manager.getPublicAccount();
      expect(account).not.toBeNull();
      expect(account!.address).toBe(result.value.address);

      // Signing key pair should be available
      const kp = manager.getSigningKeyPair();
      expect(kp).not.toBeNull();
      expect(kp!.privateKey.length).toBe(32);

      // Envelope should be persisted
      expect(persistence.data).not.toBeNull();
    });

    it('rejects creating if wallet already exists', async () => {
      const manager = createManager();
      const password = new TextEncoder().encode('test-password');

      // Create first wallet
      await manager.create(password);

      // Try creating another
      const result = await manager.create(password);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('WALLET_ALREADY_EXISTS');
      }
    });
  });

  describe('lock / unlock', () => {
    it('lock zeros secrets and transitions to LOCKED', async () => {
      const manager = createManager();
      const password = new TextEncoder().encode('test-password');

      await manager.create(password);
      expect(manager.getState().status).toBe('UNLOCKED');

      manager.lock();

      expect(manager.getState().status).toBe('LOCKED');
      expect(manager.getPublicAccount()).toBeNull();
      expect(manager.getSigningKeyPair()).toBeNull();
    });

    it('unlock with correct password transitions to UNLOCKED', async () => {
      const manager = createManager();
      const password = new TextEncoder().encode('test-password');

      const createResult = await manager.create(password);
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const address = createResult.value.address;

      manager.lock();
      expect(manager.getState().status).toBe('LOCKED');

      const unlockResult = await manager.unlock(password);
      expect(unlockResult.ok).toBe(true);
      expect(manager.getState().status).toBe('UNLOCKED');

      // Should recover the same address
      const account = manager.getPublicAccount();
      expect(account).not.toBeNull();
      expect(account!.address).toBe(address);
    });

    it('unlock with wrong password fails', async () => {
      const manager = createManager();
      const password = new TextEncoder().encode('test-password');

      await manager.create(password);
      manager.lock();

      const wrongPassword = new TextEncoder().encode('wrong-password');
      const result = await manager.unlock(wrongPassword);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNLOCK_FAILED');
      }
    });
  });

  describe('import', () => {
    it('imports an existing SRP and derives correct keys', async () => {
      const manager = createManager();
      const password = new TextEncoder().encode('test-password');

      // Generate an SRP externally
      const srp = srpManager.generate(12);
      const expectedAddress = keyDerivation.deriveSigningKeyPair(srp).address;

      const result = await manager.import(srp, password);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.address).toBe(expectedAddress);
      expect(manager.getState().status).toBe('UNLOCKED');
    });

    it('rejects invalid SRP', async () => {
      const manager = createManager();
      const password = new TextEncoder().encode('test-password');

      const result = await manager.import('invalid words here' as any, password);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_SRP');
      }
    });
  });

  describe('changePassword', () => {
    it('changes password and allows unlock with new password', async () => {
      const manager = createManager();
      const oldPassword = new TextEncoder().encode('old-password');
      const newPassword = new TextEncoder().encode('new-password');

      await manager.create(oldPassword);

      const changeResult = await manager.changePassword(oldPassword, newPassword);
      expect(changeResult.ok).toBe(true);

      // Lock and try new password
      manager.lock();
      const unlockResult = await manager.unlock(newPassword);
      expect(unlockResult.ok).toBe(true);
    });
  });

  describe('wipe', () => {
    it('wipes all data and transitions to UNINITIALIZED', async () => {
      const manager = createManager();
      const password = new TextEncoder().encode('test-password');

      await manager.create(password);
      expect(manager.getState().status).toBe('UNLOCKED');

      const wipeResult = await manager.wipe();
      expect(wipeResult.ok).toBe(true);

      expect(manager.getState().status).toBe('UNINITIALIZED');
      expect(persistence.data).toBeNull();
      expect(manager.getPublicAccount()).toBeNull();
    });
  });
});
