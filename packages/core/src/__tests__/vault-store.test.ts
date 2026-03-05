/**
 * Tests for the Vault Store manager (two-layer encryption).
 */

import { describe, it, expect } from 'vitest';
import { createCryptoProvider } from '../crypto/provider';
import { createSrpManager } from '../crypto/srp';
import { createKeyDerivation } from '../crypto/keys';
import { createVaultStoreManager } from '../vault/store';

describe('VaultStoreManager', () => {
  const crypto = createCryptoProvider();
  const srpManager = createSrpManager();
  const keyDerivation = createKeyDerivation(crypto, srpManager);
  const vsm = createVaultStoreManager(crypto);

  const TEST_SRP = srpManager.generate(12);
  const TEST_PASSWORD = new TextEncoder().encode('test-password-123');

  describe('create and unlock', () => {
    it('creates an envelope and unlocks with correct password', async () => {
      const vaultKey = await keyDerivation.deriveVaultKey(TEST_SRP);
      const walletId = keyDerivation.deriveWalletId(TEST_SRP);

      // Create
      const createResult = await vsm.create(TEST_SRP as string, walletId, TEST_PASSWORD, vaultKey);
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const envelope = createResult.value;
      expect(envelope.version).toBe(1);
      expect(envelope.unlockKdfParams.algorithm).toBe('argon2id');

      // Unlock
      const unlockResult = await vsm.unlock(envelope, TEST_PASSWORD);
      expect(unlockResult.ok).toBe(true);
      if (!unlockResult.ok) return;

      expect(unlockResult.value.contents.srp).toBe(TEST_SRP);
      expect(unlockResult.value.contents.walletId).toBe(walletId);
    });

    it('fails to unlock with wrong password', async () => {
      const vaultKey = await keyDerivation.deriveVaultKey(TEST_SRP);
      const walletId = keyDerivation.deriveWalletId(TEST_SRP);

      const createResult = await vsm.create(TEST_SRP as string, walletId, TEST_PASSWORD, vaultKey);
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const wrongPassword = new TextEncoder().encode('wrong-password');
      const unlockResult = await vsm.unlock(createResult.value, wrongPassword);
      expect(unlockResult.ok).toBe(false);
      if (!unlockResult.ok) {
        expect(unlockResult.error.code).toBe('UNLOCK_FAILED');
      }
    });
  });

  describe('unlockWithVaultKey', () => {
    it('decrypts contents with known Vault Key', async () => {
      const vaultKey = await keyDerivation.deriveVaultKey(TEST_SRP);
      const walletId = keyDerivation.deriveWalletId(TEST_SRP);

      const createResult = await vsm.create(TEST_SRP as string, walletId, TEST_PASSWORD, vaultKey);
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      // Unlock directly with Vault Key (simulates SRP recovery)
      const result = await vsm.unlockWithVaultKey(createResult.value, vaultKey);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.srp).toBe(TEST_SRP);
    });
  });

  describe('rewrap (password change)', () => {
    it('re-encrypts Layer 1 with new password', async () => {
      const vaultKey = await keyDerivation.deriveVaultKey(TEST_SRP);
      const walletId = keyDerivation.deriveWalletId(TEST_SRP);

      const createResult = await vsm.create(TEST_SRP as string, walletId, TEST_PASSWORD, vaultKey);
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      // Re-wrap with new password
      const newPassword = new TextEncoder().encode('new-password-456');
      const rewrapResult = await vsm.rewrap(createResult.value, TEST_PASSWORD, newPassword);
      expect(rewrapResult.ok).toBe(true);
      if (!rewrapResult.ok) return;

      // Old password should now fail
      const oldUnlock = await vsm.unlock(rewrapResult.value, TEST_PASSWORD);
      expect(oldUnlock.ok).toBe(false);

      // New password should succeed
      const newUnlock = await vsm.unlock(rewrapResult.value, newPassword);
      expect(newUnlock.ok).toBe(true);
      if (!newUnlock.ok) return;
      expect(newUnlock.value.contents.srp).toBe(TEST_SRP);
    });

    it('Layer 2 (encryptedContents) stays unchanged after rewrap', async () => {
      const vaultKey = await keyDerivation.deriveVaultKey(TEST_SRP);
      const walletId = keyDerivation.deriveWalletId(TEST_SRP);

      const createResult = await vsm.create(TEST_SRP as string, walletId, TEST_PASSWORD, vaultKey);
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const newPassword = new TextEncoder().encode('new-password');
      const rewrapResult = await vsm.rewrap(createResult.value, TEST_PASSWORD, newPassword);
      expect(rewrapResult.ok).toBe(true);
      if (!rewrapResult.ok) return;

      // Layer 2 should be identical
      expect(rewrapResult.value.encryptedContents).toEqual(createResult.value.encryptedContents);
      // Layer 1 should differ
      expect(rewrapResult.value.wrappedVaultKey).not.toEqual(createResult.value.wrappedVaultKey);
    });
  });
});
