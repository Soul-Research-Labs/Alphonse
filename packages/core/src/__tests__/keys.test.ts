/**
 * Tests for key derivation (domain separation, Vault Key, signing keys).
 */

import { describe, it, expect } from 'vitest';
import { createCryptoProvider } from '../crypto/provider';
import { createSrpManager } from '../crypto/srp';
import { createKeyDerivation } from '../crypto/keys';

describe('KeyDerivation', () => {
  const crypto = createCryptoProvider();
  const srpManager = createSrpManager();
  const keyDerivation = createKeyDerivation(crypto, srpManager);

  // Use a fixed mnemonic for deterministic tests
  const TEST_SRP = srpManager.generate(12);

  describe('deriveVaultKey', () => {
    it('returns a 32-byte key', async () => {
      const vaultKey = await keyDerivation.deriveVaultKey(TEST_SRP);
      const bytes = vaultKey as unknown as Uint8Array;
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(32);
    });

    it('is deterministic for same SRP', async () => {
      const key1 = await keyDerivation.deriveVaultKey(TEST_SRP);
      const key2 = await keyDerivation.deriveVaultKey(TEST_SRP);
      expect(key1).toEqual(key2);
    });

    it('different SRP produces different Vault Key', async () => {
      const otherSrp = srpManager.generate(12);
      const key1 = await keyDerivation.deriveVaultKey(TEST_SRP);
      const key2 = await keyDerivation.deriveVaultKey(otherSrp);
      expect(key1).not.toEqual(key2);
    });
  });

  describe('deriveDomainKey (key separation)', () => {
    it('produces independent keys for each domain', async () => {
      const signingKey = await keyDerivation.deriveDomainKey(TEST_SRP, 'SIGNING');
      const vaultStoreKey = await keyDerivation.deriveDomainKey(TEST_SRP, 'VAULT_STORE');
      const syncKey = await keyDerivation.deriveDomainKey(TEST_SRP, 'SYNC');
      const pairingKey = await keyDerivation.deriveDomainKey(TEST_SRP, 'PAIRING');

      // All keys must be different
      const keys = [signingKey, vaultStoreKey, syncKey, pairingKey];
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          expect(keys[i]).not.toEqual(keys[j]);
        }
      }
    });

    it('each key is 32 bytes', async () => {
      for (const domain of ['SIGNING', 'VAULT_STORE', 'SYNC', 'PAIRING'] as const) {
        const key = await keyDerivation.deriveDomainKey(TEST_SRP, domain);
        expect(key.length).toBe(32);
      }
    });
  });

  describe('deriveDeviceUnlockKey', () => {
    it('derives key from password + salt', async () => {
      const password = new TextEncoder().encode('testpassword');
      const salt = crypto.randomBytes(32);

      const duk = await keyDerivation.deriveDeviceUnlockKey(password, salt);
      const bytes = duk as unknown as Uint8Array;
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(32);
    });

    it('same password + salt = same key', async () => {
      const password = new TextEncoder().encode('testpassword');
      const salt = crypto.randomBytes(32);

      const duk1 = await keyDerivation.deriveDeviceUnlockKey(password, salt);
      const duk2 = await keyDerivation.deriveDeviceUnlockKey(password, salt);
      expect(duk1).toEqual(duk2);
    });

    it('different salts produce different keys', async () => {
      const password = new TextEncoder().encode('testpassword');
      const salt1 = crypto.randomBytes(32);
      const salt2 = crypto.randomBytes(32);

      const duk1 = await keyDerivation.deriveDeviceUnlockKey(password, salt1);
      const duk2 = await keyDerivation.deriveDeviceUnlockKey(password, salt2);
      expect(duk1).not.toEqual(duk2);
    });
  });

  describe('deriveSigningKeyPair', () => {
    it('derives a valid key pair with EVM address', () => {
      const kp = keyDerivation.deriveSigningKeyPair(TEST_SRP);

      expect(kp.privateKey).toBeInstanceOf(Uint8Array);
      expect(kp.privateKey.length).toBe(32);
      expect(kp.publicKey).toBeInstanceOf(Uint8Array);
      expect(kp.publicKey.length).toBe(33); // Compressed
      expect(kp.address).toMatch(/^0x[0-9a-f]{40}$/);
      expect(kp.derivationPath).toBe("m/44'/60'/0'/0/0");
    });

    it('is deterministic for same SRP', () => {
      const kp1 = keyDerivation.deriveSigningKeyPair(TEST_SRP);
      const kp2 = keyDerivation.deriveSigningKeyPair(TEST_SRP);

      expect(kp1.address).toBe(kp2.address);
      expect(kp1.privateKey).toEqual(kp2.privateKey);
    });

    it('different SRP produces different address', () => {
      const otherSrp = srpManager.generate(12);
      const kp1 = keyDerivation.deriveSigningKeyPair(TEST_SRP);
      const kp2 = keyDerivation.deriveSigningKeyPair(otherSrp);

      expect(kp1.address).not.toBe(kp2.address);
    });
  });

  describe('deriveWalletId', () => {
    it('produces a hex string', () => {
      const id = keyDerivation.deriveWalletId(TEST_SRP);
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    });

    it('is deterministic', () => {
      const id1 = keyDerivation.deriveWalletId(TEST_SRP);
      const id2 = keyDerivation.deriveWalletId(TEST_SRP);
      expect(id1).toBe(id2);
    });

    it('different SRP produces different wallet ID', () => {
      const otherSrp = srpManager.generate(12);
      const id1 = keyDerivation.deriveWalletId(TEST_SRP);
      const id2 = keyDerivation.deriveWalletId(otherSrp);
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateUnlockKdfParams', () => {
    it('generates valid Argon2id params', () => {
      const params = keyDerivation.generateUnlockKdfParams();

      expect(params.algorithm).toBe('argon2id');
      if (params.algorithm === 'argon2id') {
        expect(params.salt).toBeTruthy();
        expect(params.memoryCost).toBeGreaterThan(0);
        expect(params.timeCost).toBeGreaterThan(0);
        expect(params.parallelism).toBeGreaterThan(0);
      }
    });

    it('generates different salts each time', () => {
      const p1 = keyDerivation.generateUnlockKdfParams();
      const p2 = keyDerivation.generateUnlockKdfParams();
      expect(p1).not.toEqual(p2);
    });
  });
});
