/**
 * Tests for SRP (Secret Recovery Phrase) management.
 */

import { describe, it, expect } from 'vitest';
import { createSrpManager } from '../crypto/srp';

describe('SrpManager', () => {
  const srp = createSrpManager();

  describe('generate', () => {
    it('generates a 12-word mnemonic by default', () => {
      const mnemonic = srp.generate();
      const words = mnemonic.split(' ');
      expect(words.length).toBe(12);
    });

    it('generates a 24-word mnemonic when requested', () => {
      const mnemonic = srp.generate(24);
      const words = mnemonic.split(' ');
      expect(words.length).toBe(24);
    });

    it('generates valid mnemonics', () => {
      const mnemonic12 = srp.generate(12);
      const mnemonic24 = srp.generate(24);

      expect(srp.validate(mnemonic12)).toBe(true);
      expect(srp.validate(mnemonic24)).toBe(true);
    });

    it('generates different mnemonics each time', () => {
      const a = srp.generate();
      const b = srp.generate();
      expect(a).not.toBe(b);
    });
  });

  describe('validate', () => {
    it('accepts valid 12-word mnemonic', () => {
      const mnemonic = srp.generate(12);
      expect(srp.validate(mnemonic)).toBe(true);
    });

    it('rejects empty string', () => {
      expect(srp.validate('')).toBe(false);
    });

    it('rejects random words', () => {
      expect(srp.validate('not a valid mnemonic phrase at all dude what is this stuff')).toBe(
        false
      );
    });

    it('rejects mnemonic with wrong checksum', () => {
      // Take a valid mnemonic and alter one word
      const mnemonic = srp.generate(12);
      const words = mnemonic.split(' ');
      words[0] = words[0] === 'abandon' ? 'ability' : 'abandon';
      expect(srp.validate(words.join(' '))).toBe(false);
    });
  });

  describe('toSeed', () => {
    it('returns 64-byte seed', () => {
      const mnemonic = srp.generate(12);
      const seed = srp.toSeed(mnemonic);
      expect(seed).toBeInstanceOf(Uint8Array);
      expect(seed.length).toBe(64);
    });

    it('same mnemonic produces same seed', () => {
      const mnemonic = srp.generate(12);
      const seed1 = srp.toSeed(mnemonic);
      const seed2 = srp.toSeed(mnemonic);
      expect(seed1).toEqual(seed2);
    });

    it('different mnemonics produce different seeds', () => {
      const m1 = srp.generate(12);
      const m2 = srp.generate(12);
      const seed1 = srp.toSeed(m1);
      const seed2 = srp.toSeed(m2);
      expect(seed1).not.toEqual(seed2);
    });

    it('passphrase changes the seed', () => {
      const mnemonic = srp.generate(12);
      const seed1 = srp.toSeed(mnemonic);
      const seed2 = srp.toSeed(mnemonic, 'mypassphrase');
      expect(seed1).not.toEqual(seed2);
    });
  });

  describe('normalize', () => {
    it('normalizes valid mnemonic with extra whitespace', () => {
      const mnemonic = srp.generate(12);
      const messy = `  ${mnemonic.toUpperCase()}  `.replace(/ /g, '   ');
      const result = srp.normalize(messy);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(mnemonic);
      }
    });

    it('rejects invalid mnemonic', () => {
      const result = srp.normalize('invalid mnemonic words foo bar baz');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_SRP');
      }
    });
  });
});
