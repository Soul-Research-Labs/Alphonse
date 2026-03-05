/**
 * Tests for the CryptoProvider implementation.
 */

import { describe, it, expect } from 'vitest';
import { createCryptoProvider } from '../crypto/provider';
import type { CipherAlgorithm, EncryptedPayload } from '../types/crypto';

describe('CryptoProvider', () => {
  const crypto = createCryptoProvider();

  describe('randomBytes', () => {
    it('should generate bytes of requested length', () => {
      const bytes16 = crypto.randomBytes(16);
      const bytes32 = crypto.randomBytes(32);

      expect(bytes16).toBeInstanceOf(Uint8Array);
      expect(bytes16.length).toBe(16);
      expect(bytes32.length).toBe(32);
    });

    it('should generate different values each call', () => {
      const a = crypto.randomBytes(32);
      const b = crypto.randomBytes(32);
      expect(a).not.toEqual(b);
    });
  });

  describe('encrypt / decrypt', () => {
    const key = crypto.randomBytes(32);
    const plaintext = new TextEncoder().encode('Hello, Alphonse!');

    it.each<CipherAlgorithm>(['aes-256-gcm', 'xchacha20-poly1305'])(
      'round-trips with %s',
      async (algorithm) => {
        const encrypted = await crypto.encrypt(plaintext, key, algorithm);

        expect(encrypted.algorithm).toBe(algorithm);
        expect(encrypted.version).toBe(1);
        expect(encrypted.iv).toBeTruthy();
        expect(encrypted.ciphertext).toBeTruthy();
        expect(encrypted.tag).toBeTruthy();

        const decrypted = await crypto.decrypt(encrypted, key);
        expect(decrypted).toEqual(plaintext);
      }
    );

    it('decryption fails with wrong key', async () => {
      const encrypted = await crypto.encrypt(plaintext, key, 'aes-256-gcm');
      const wrongKey = crypto.randomBytes(32);

      await expect(crypto.decrypt(encrypted, wrongKey)).rejects.toThrow();
    });

    it('decryption fails with tampered ciphertext', async () => {
      const encrypted = await crypto.encrypt(plaintext, key, 'aes-256-gcm');

      // Decode, tamper, re-encode
      const ciphertextBytes = Buffer.from(encrypted.ciphertext, 'base64');
      ciphertextBytes[0] ^= 0xff;
      const tampered: EncryptedPayload = {
        ...encrypted,
        ciphertext: ciphertextBytes.toString('base64'),
      };

      await expect(crypto.decrypt(tampered, key)).rejects.toThrow();
    });

    it('produces different ciphertexts for same plaintext (random IV)', async () => {
      const enc1 = await crypto.encrypt(plaintext, key, 'aes-256-gcm');
      const enc2 = await crypto.encrypt(plaintext, key, 'aes-256-gcm');
      expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
      expect(enc1.iv).not.toBe(enc2.iv);
    });
  });

  describe('deriveKey', () => {
    it('derives consistent key with HKDF-SHA256', async () => {
      const input = new TextEncoder().encode('test input');
      const salt = Buffer.from(crypto.randomBytes(32)).toString('base64');

      const key1 = await crypto.deriveKey(
        input,
        { algorithm: 'hkdf-sha256', salt, info: 'test.info' },
        32
      );
      const key2 = await crypto.deriveKey(
        input,
        { algorithm: 'hkdf-sha256', salt, info: 'test.info' },
        32
      );

      expect(key1).toEqual(key2);
      expect(key1.length).toBe(32);
    });

    it('derives different keys for different domains', async () => {
      const input = new TextEncoder().encode('test input');
      const salt = Buffer.from(crypto.randomBytes(32)).toString('base64');

      const key1 = await crypto.deriveKey(
        input,
        { algorithm: 'hkdf-sha256', salt, info: 'domain.a' },
        32
      );
      const key2 = await crypto.deriveKey(
        input,
        { algorithm: 'hkdf-sha256', salt, info: 'domain.b' },
        32
      );

      expect(key1).not.toEqual(key2);
    });

    it('derives key with Argon2id', async () => {
      const password = new TextEncoder().encode('password123');
      const salt = Buffer.from(crypto.randomBytes(16)).toString('base64');

      const key = await crypto.deriveKey(
        password,
        {
          algorithm: 'argon2id',
          salt,
          memoryCost: 1024, // Low for tests
          timeCost: 1,
          parallelism: 1,
        },
        32
      );

      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it('Argon2id is deterministic for same params', async () => {
      const password = new TextEncoder().encode('mypassword');
      const salt = Buffer.from(crypto.randomBytes(16)).toString('base64');
      const params = {
        algorithm: 'argon2id' as const,
        salt,
        memoryCost: 1024,
        timeCost: 1,
        parallelism: 1,
      };

      const key1 = await crypto.deriveKey(password, params, 32);
      const key2 = await crypto.deriveKey(password, params, 32);

      expect(key1).toEqual(key2);
    });
  });

  describe('hmac', () => {
    it('produces consistent MAC', async () => {
      const key = crypto.randomBytes(32);
      const data = new TextEncoder().encode('some data');

      const mac1 = await crypto.hmac(key, data);
      const mac2 = await crypto.hmac(key, data);

      expect(mac1).toEqual(mac2);
      expect(mac1.length).toBe(32); // SHA-256 produces 32 bytes
    });

    it('different keys produce different MACs', async () => {
      const key1 = crypto.randomBytes(32);
      const key2 = crypto.randomBytes(32);
      const data = new TextEncoder().encode('some data');

      const mac1 = await crypto.hmac(key1, data);
      const mac2 = await crypto.hmac(key2, data);

      expect(mac1).not.toEqual(mac2);
    });
  });
});
