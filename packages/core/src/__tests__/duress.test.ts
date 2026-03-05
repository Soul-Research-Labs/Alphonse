/**
 * Tests for duress modes: constant-time comparison, PIN evaluation,
 * decoy wallet derivation, and forensic wipe action.
 */

import { describe, it, expect, vi } from 'vitest';
import { constantTimeEqual, hashPin, evaluatePin, type StoredPinHashes } from '../duress/pin';
import { deriveDecoyKeyPair, DECOY_ETH_PATH } from '../duress/index';
import { executeDuressWipe } from '../duress/wipe';
import { DEFAULT_DURESS_CONFIG, DuressMode, type DuressConfig } from '../duress/types';
import { Result } from '../types/common';
import { createCryptoProvider } from '../crypto/provider';
import { createSrpManager } from '../crypto/srp';
import { createKeyDerivation } from '../crypto/keys';
import type { SRP } from '../types/wallet';

// ---------------------------------------------------------------------------
// Test crypto provider (uses real implementation)
// ---------------------------------------------------------------------------

const crypto = createCryptoProvider();
const srpManager = createSrpManager(crypto);

// A fixed test mnemonic
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// ---------------------------------------------------------------------------
// constantTimeEqual
// ---------------------------------------------------------------------------

describe('constantTimeEqual', () => {
  it('should return true for identical arrays', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(constantTimeEqual(a, b)).toBe(true);
  });

  it('should return false for different arrays', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 5]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it('should return false for different length arrays', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it('should return true for empty arrays', () => {
    const a = new Uint8Array([]);
    const b = new Uint8Array([]);
    expect(constantTimeEqual(a, b)).toBe(true);
  });

  it('should return true for 32-byte zero arrays', () => {
    const a = new Uint8Array(32);
    const b = new Uint8Array(32);
    expect(constantTimeEqual(a, b)).toBe(true);
  });

  it('should detect single bit difference', () => {
    const a = new Uint8Array(32);
    const b = new Uint8Array(32);
    b[16] = 1;
    expect(constantTimeEqual(a, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hashPin
// ---------------------------------------------------------------------------

describe('hashPin', () => {
  it('should produce a 32-byte hash', async () => {
    const pin = new TextEncoder().encode('1234');
    const salt = crypto.randomBytes(16);
    const hash = await hashPin(crypto, pin, salt);
    expect(hash).toBeInstanceOf(Uint8Array);
    expect(hash.length).toBe(32);
  });

  it('should produce different hashes for different pins', async () => {
    const salt = crypto.randomBytes(16);
    const hash1 = await hashPin(crypto, new TextEncoder().encode('1234'), salt);
    const hash2 = await hashPin(crypto, new TextEncoder().encode('5678'), salt);
    expect(constantTimeEqual(hash1, hash2)).toBe(false);
  });

  it('should produce different hashes for different salts', async () => {
    const pin = new TextEncoder().encode('1234');
    const hash1 = await hashPin(crypto, pin, crypto.randomBytes(16));
    const hash2 = await hashPin(crypto, pin, crypto.randomBytes(16));
    expect(constantTimeEqual(hash1, hash2)).toBe(false);
  });

  it('should be deterministic with same pin and salt', async () => {
    const pin = new TextEncoder().encode('1234');
    const salt = new Uint8Array(16).fill(42);
    const hash1 = await hashPin(crypto, pin, salt);
    const hash2 = await hashPin(crypto, pin, salt);
    expect(constantTimeEqual(hash1, hash2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// evaluatePin
// ---------------------------------------------------------------------------

describe('evaluatePin', () => {
  async function setupPins() {
    const realSalt = crypto.randomBytes(16);
    const decoySalt = crypto.randomBytes(16);
    const wipeSalt = crypto.randomBytes(16);

    const realPin = new TextEncoder().encode('1111');
    const decoyPin = new TextEncoder().encode('2222');
    const wipePin = new TextEncoder().encode('3333');

    const realHash = await hashPin(crypto, realPin, realSalt);
    const decoyHash = await hashPin(crypto, decoyPin, decoySalt);
    const wipeHash = await hashPin(crypto, wipePin, wipeSalt);

    const stored: StoredPinHashes = {
      realHash,
      realSalt,
      decoyHash,
      decoySalt,
      wipeHash,
      wipeSalt,
    };

    return { stored, realPin, decoyPin, wipePin };
  }

  it('should match real PIN → NONE mode', async () => {
    const { stored, realPin } = await setupPins();
    const config: DuressConfig = { decoyEnabled: true, wipeEnabled: true };
    const result = await evaluatePin(crypto, realPin, stored, config);
    expect(result.matched).toBe(true);
    expect(result.mode).toBe(DuressMode.NONE);
  });

  it('should match decoy PIN → DECOY mode', async () => {
    const { stored, decoyPin } = await setupPins();
    const config: DuressConfig = { decoyEnabled: true, wipeEnabled: true };
    const result = await evaluatePin(crypto, decoyPin, stored, config);
    expect(result.matched).toBe(true);
    expect(result.mode).toBe(DuressMode.DECOY);
  });

  it('should match wipe PIN → WIPE mode', async () => {
    const { stored, wipePin } = await setupPins();
    const config: DuressConfig = { decoyEnabled: true, wipeEnabled: true };
    const result = await evaluatePin(crypto, wipePin, stored, config);
    expect(result.matched).toBe(true);
    expect(result.mode).toBe(DuressMode.WIPE);
  });

  it('should not match incorrect PIN', async () => {
    const { stored } = await setupPins();
    const config: DuressConfig = { decoyEnabled: true, wipeEnabled: true };
    const wrongPin = new TextEncoder().encode('9999');
    const result = await evaluatePin(crypto, wrongPin, stored, config);
    expect(result.matched).toBe(false);
    expect(result.mode).toBe(DuressMode.NONE);
  });

  it('should ignore decoy PIN when decoy is disabled', async () => {
    const { stored, decoyPin } = await setupPins();
    const config: DuressConfig = { decoyEnabled: false, wipeEnabled: true };
    const result = await evaluatePin(crypto, decoyPin, stored, config);
    // The hash still gets computed but the match is suppressed
    expect(result.matched).toBe(false);
  });

  it('should ignore wipe PIN when wipe is disabled', async () => {
    const { stored, wipePin } = await setupPins();
    const config: DuressConfig = { decoyEnabled: true, wipeEnabled: false };
    const result = await evaluatePin(crypto, wipePin, stored, config);
    expect(result.matched).toBe(false);
  });

  it('should work with null decoy/wipe hashes', async () => {
    const realSalt = crypto.randomBytes(16);
    const realPin = new TextEncoder().encode('1111');
    const realHash = await hashPin(crypto, realPin, realSalt);

    const stored: StoredPinHashes = {
      realHash,
      realSalt,
      decoyHash: null,
      decoySalt: null,
      wipeHash: null,
      wipeSalt: null,
    };

    const result = await evaluatePin(crypto, realPin, stored, DEFAULT_DURESS_CONFIG);
    expect(result.matched).toBe(true);
    expect(result.mode).toBe(DuressMode.NONE);
  });
});

// ---------------------------------------------------------------------------
// deriveDecoyKeyPair
// ---------------------------------------------------------------------------

describe('deriveDecoyKeyPair', () => {
  it('should derive a valid key pair with the decoy path', () => {
    const kp = deriveDecoyKeyPair(srpManager, TEST_MNEMONIC as SRP);
    expect(kp.derivationPath).toBe(DECOY_ETH_PATH);
    expect(kp.address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(kp.privateKey.length).toBe(32);
    expect(kp.publicKey.length).toBe(33);
  });

  it('should produce a different address than the real wallet', () => {
    const decoy = deriveDecoyKeyPair(srpManager, TEST_MNEMONIC as SRP);
    const kd = createKeyDerivation(crypto, srpManager);
    const real = kd.deriveSigningKeyPair(TEST_MNEMONIC as SRP);

    expect(decoy.address).not.toBe(real.address);
  });

  it('should be deterministic for the same SRP', () => {
    const kp1 = deriveDecoyKeyPair(srpManager, TEST_MNEMONIC as SRP);
    const kp2 = deriveDecoyKeyPair(srpManager, TEST_MNEMONIC as SRP);
    expect(kp1.address).toBe(kp2.address);
  });
});

// ---------------------------------------------------------------------------
// executeDuressWipe
// ---------------------------------------------------------------------------

describe('executeDuressWipe', () => {
  it('should invoke the wipe function and return result', async () => {
    const wipeFn = vi.fn().mockResolvedValue(Result.ok({ namespacesWiped: 5, keysWiped: 42 }));

    const result = await executeDuressWipe(wipeFn);
    expect(wipeFn).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.namespacesWiped).toBe(5);
      expect(result.value.keysWiped).toBe(42);
    }
  });

  it('should return error if wipe function throws', async () => {
    const wipeFn = vi.fn().mockRejectedValue(new Error('Disk error'));

    const result = await executeDuressWipe(wipeFn);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Duress wipe failed');
    }
  });

  it('should propagate wipe function error results', async () => {
    const wipeFn = vi
      .fn()
      .mockResolvedValue(
        Result.err({ code: 'STORAGE_WRITE_FAILED' as const, message: 'Partial failure' })
      );

    const result = await executeDuressWipe(wipeFn);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_DURESS_CONFIG
// ---------------------------------------------------------------------------

describe('DEFAULT_DURESS_CONFIG', () => {
  it('should have both modes disabled', () => {
    expect(DEFAULT_DURESS_CONFIG.decoyEnabled).toBe(false);
    expect(DEFAULT_DURESS_CONFIG.wipeEnabled).toBe(false);
  });
});
