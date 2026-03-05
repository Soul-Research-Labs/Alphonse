/**
 * Tests for the multi-layered address checker.
 *
 * Architecture inspired by Unstoppable Wallet's defense system:
 * - Per-check type statuses (FORMAT, BLOCKLIST, PHISHING, SELF_SEND, UNKNOWN)
 * - Pluggable async providers
 * - EVM address format + checksum validation
 * - Self-send detection
 */

import { describe, it, expect } from 'vitest';
import { createAddressChecker, AddressCheckType, AddressCheckStatus } from '../address/checker';
import type { AddressCheckProvider, AddressCheckDetail } from '../address/checker';
import type { Address } from '../types/common';

describe('AddressChecker', () => {
  function addr(hex: string): Address {
    return hex as Address;
  }

  // Valid EVM addresses for testing
  const VALID_ADDR = addr('0x1234567890abcdef1234567890abcdef12345678');
  const VALID_ADDR_2 = addr('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  const DEAD_ADDR = addr('0x000000000000000000000000000000000000dead');

  // ---------- Format validation ----------

  describe('format validation', () => {
    it('accepts a valid lowercase EVM address', () => {
      const checker = createAddressChecker();
      const result = checker.check(VALID_ADDR);
      expect(result.valid).toBe(true);
      const formatCheck = result.checks.find((c) => c.type === AddressCheckType.FORMAT);
      expect(formatCheck?.status).toBe(AddressCheckStatus.CLEAR);
    });

    it('rejects an address without 0x prefix', () => {
      const checker = createAddressChecker();
      const result = checker.check(addr('1234567890abcdef1234567890abcdef12345678'));
      expect(result.valid).toBe(false);
      expect(result.risky).toBe(true);
      const formatCheck = result.checks.find((c) => c.type === AddressCheckType.FORMAT);
      expect(formatCheck?.status).toBe(AddressCheckStatus.DETECTED);
    });

    it('rejects an address with wrong length', () => {
      const checker = createAddressChecker();
      const result = checker.check(addr('0x1234'));
      expect(result.valid).toBe(false);
    });

    it('rejects an address with non-hex characters', () => {
      const checker = createAddressChecker();
      const result = checker.check(addr('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG'));
      expect(result.valid).toBe(false);
    });

    it('validates EIP-55 checksummed addresses', () => {
      const checker = createAddressChecker();
      // This is a valid EIP-55 checksummed address
      expect(checker.validateFormat('0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B')).toBe(true);
    });

    it('accepts all-lowercase addresses (no checksum)', () => {
      const checker = createAddressChecker();
      expect(checker.validateFormat('0xab5801a7d398351b8be11c439e05c5b3259aec9b')).toBe(true);
    });

    it('accepts all-uppercase addresses (no checksum)', () => {
      const checker = createAddressChecker();
      expect(checker.validateFormat('0xAB5801A7D398351B8BE11C439E05C5B3259AEC9B')).toBe(true);
    });
  });

  // ---------- Blocklist ----------

  describe('blocklist', () => {
    it('flags blocklisted addresses', () => {
      const checker = createAddressChecker();
      checker.updateBlocklist([DEAD_ADDR]);

      const result = checker.check(DEAD_ADDR);
      expect(result.safe).toBe(false);
      expect(result.risky).toBe(true);

      const blockCheck = result.checks.find((c) => c.type === AddressCheckType.BLOCKLIST);
      expect(blockCheck?.status).toBe(AddressCheckStatus.DETECTED);
    });

    it('marks clear addresses as CLEAR for blocklist', () => {
      const checker = createAddressChecker();
      checker.updateBlocklist([DEAD_ADDR]);

      const result = checker.check(VALID_ADDR);
      const blockCheck = result.checks.find((c) => c.type === AddressCheckType.BLOCKLIST);
      expect(blockCheck?.status).toBe(AddressCheckStatus.CLEAR);
    });

    it('is case-insensitive for blocklist', () => {
      const checker = createAddressChecker();
      const lower = addr('0x000000000000000000000000000000000000dead');
      const upper = addr('0x000000000000000000000000000000000000DEAD');

      checker.updateBlocklist([lower]);

      const result = checker.check(upper);
      expect(result.risky).toBe(true);
    });

    it('reports correct blocklist size', () => {
      const checker = createAddressChecker();
      expect(checker.blocklistSize()).toBe(0);

      checker.updateBlocklist([
        addr('0x0000000000000000000000000000000000000001'),
        addr('0x0000000000000000000000000000000000000002'),
      ]);
      expect(checker.blocklistSize()).toBe(2);
    });
  });

  // ---------- Phishing / similarity detection ----------

  describe('phishing / similarity detection', () => {
    it('flags addresses with matching prefix and suffix (PHISHING DETECTED)', () => {
      const checker = createAddressChecker();
      const known = addr('0xabcdef1234000000000000000000000000005678');
      const poisoned = addr('0xabcdef12ff000000000000000000000000005678');

      const result = checker.check(poisoned, { knownAddresses: [known] });
      expect(result.risky).toBe(true);

      const phishCheck = result.checks.find((c) => c.type === AddressCheckType.PHISHING);
      expect(phishCheck?.status).toBe(AddressCheckStatus.DETECTED);
      expect(phishCheck?.metadata?.similarTo).toBe(known);
      expect(phishCheck?.metadata?.similarity).toBeGreaterThan(0);
    });

    it('does not flag completely different addresses', () => {
      const checker = createAddressChecker();
      const known = addr('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      const different = addr('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

      const result = checker.check(different, { knownAddresses: [known] });
      const phishChecks = result.checks.filter((c) => c.type === AddressCheckType.PHISHING);
      expect(phishChecks.every((c) => c.status !== AddressCheckStatus.DETECTED)).toBe(true);
    });

    it('does not flag exact match to known address', () => {
      const checker = createAddressChecker();
      const known = addr('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

      const result = checker.check(known, { knownAddresses: [known] });
      expect(result.safe).toBe(true);
      expect(result.checks.filter((c) => c.type === AddressCheckType.PHISHING).length).toBe(1);
    });
  });

  // ---------- Self-send detection ----------

  describe('self-send detection', () => {
    it('flags sending to own address', () => {
      const checker = createAddressChecker();
      const ownAddr = VALID_ADDR;

      const result = checker.check(ownAddr, { ownAddresses: [ownAddr] });
      expect(result.risky).toBe(true);

      const selfCheck = result.checks.find((c) => c.type === AddressCheckType.SELF_SEND);
      expect(selfCheck?.status).toBe(AddressCheckStatus.DETECTED);
    });

    it('does not flag when sending to a different address', () => {
      const checker = createAddressChecker();
      const result = checker.check(VALID_ADDR, { ownAddresses: [VALID_ADDR_2] });
      const selfCheck = result.checks.find((c) => c.type === AddressCheckType.SELF_SEND);
      expect(selfCheck).toBeUndefined();
    });

    it('is case-insensitive for self-send', () => {
      const checker = createAddressChecker();
      const lower = addr('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      const upper = addr('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

      const result = checker.check(lower, { ownAddresses: [upper] });
      const selfCheck = result.checks.find((c) => c.type === AddressCheckType.SELF_SEND);
      expect(selfCheck?.status).toBe(AddressCheckStatus.DETECTED);
    });
  });

  // ---------- Unknown address ----------

  describe('unknown address', () => {
    it('flags unknown addresses as DETECTED (informational)', () => {
      const checker = createAddressChecker();
      const result = checker.check(VALID_ADDR);

      const unknownCheck = result.checks.find((c) => c.type === AddressCheckType.UNKNOWN);
      expect(unknownCheck?.status).toBe(AddressCheckStatus.DETECTED);
      // UNKNOWN alone does NOT make it risky or unsafe
      expect(result.safe).toBe(true);
      expect(result.risky).toBe(false);
    });

    it('does not flag known addresses as unknown', () => {
      const checker = createAddressChecker();
      const result = checker.check(VALID_ADDR, { knownAddresses: [VALID_ADDR] });

      const unknownCheck = result.checks.find((c) => c.type === AddressCheckType.UNKNOWN);
      expect(unknownCheck).toBeUndefined();
    });

    it('does not flag own addresses as unknown', () => {
      const checker = createAddressChecker();
      const result = checker.check(VALID_ADDR, { ownAddresses: [VALID_ADDR] });

      const unknownCheck = result.checks.find((c) => c.type === AddressCheckType.UNKNOWN);
      expect(unknownCheck).toBeUndefined();
    });
  });

  // ---------- Aggregate flags ----------

  describe('aggregate result flags', () => {
    it('safe=true and risky=false for a valid known address with no issues', () => {
      const checker = createAddressChecker();
      const result = checker.check(VALID_ADDR, { knownAddresses: [VALID_ADDR] });
      expect(result.valid).toBe(true);
      expect(result.safe).toBe(true);
      expect(result.risky).toBe(false);
    });

    it('risky=true when blocklisted', () => {
      const checker = createAddressChecker();
      checker.updateBlocklist([VALID_ADDR]);
      const result = checker.check(VALID_ADDR, { knownAddresses: [VALID_ADDR] });
      expect(result.risky).toBe(true);
      expect(result.safe).toBe(false);
    });

    it('invalid format short-circuits — no further checks run', () => {
      const checker = createAddressChecker();
      const result = checker.check(addr('0xinvalid'));
      expect(result.valid).toBe(false);
      expect(result.checks.length).toBe(1);
      expect(result.checks[0].type).toBe(AddressCheckType.FORMAT);
    });
  });

  // ---------- Pluggable async providers ----------

  describe('async providers', () => {
    it('runs external providers via checkAsync', async () => {
      const checker = createAddressChecker();

      const mockProvider: AddressCheckProvider = {
        type: 'SANCTION',
        supports: () => true,
        check: async (address: Address): Promise<AddressCheckDetail> => ({
          type: 'SANCTION' as AddressCheckType,
          status: AddressCheckStatus.DETECTED,
          message: 'Sanctioned address detected.',
        }),
      };

      checker.addProvider(mockProvider);

      const result = await checker.checkAsync(VALID_ADDR);
      expect(result.risky).toBe(true);
      const sanctionCheck = result.checks.find((c) => c.type === ('SANCTION' as AddressCheckType));
      expect(sanctionCheck?.status).toBe(AddressCheckStatus.DETECTED);
    });

    it('handles provider failure gracefully (UNAVAILABLE)', async () => {
      const checker = createAddressChecker();

      const failingProvider: AddressCheckProvider = {
        type: 'HASHDIT',
        supports: () => true,
        check: async () => {
          throw new Error('API timeout');
        },
      };

      checker.addProvider(failingProvider);

      const result = await checker.checkAsync(VALID_ADDR);
      // Provider failure should not crash — should get UNAVAILABLE
      const externalCheck = result.checks.find((c) => c.status === AddressCheckStatus.UNAVAILABLE);
      expect(externalCheck).toBeDefined();
      // Local checks should still produce valid results
      expect(result.valid).toBe(true);
    });

    it('skips providers that do not support the address', async () => {
      const checker = createAddressChecker();

      const unsupportedProvider: AddressCheckProvider = {
        type: 'TRON_ONLY',
        supports: () => false,
        check: async (): Promise<AddressCheckDetail> => ({
          type: 'TRON_ONLY' as AddressCheckType,
          status: AddressCheckStatus.CLEAR,
          message: 'Clear.',
        }),
      };

      checker.addProvider(unsupportedProvider);

      const result = await checker.checkAsync(VALID_ADDR, { knownAddresses: [VALID_ADDR] });
      // The unsupported provider should not appear in checks
      expect(
        result.checks.find((c) => c.type === ('TRON_ONLY' as AddressCheckType))
      ).toBeUndefined();
    });

    it('checkAsync includes all local checks plus provider results', async () => {
      const checker = createAddressChecker();

      const clearProvider: AddressCheckProvider = {
        type: 'CHAINALYSIS',
        supports: () => true,
        check: async (address: Address): Promise<AddressCheckDetail> => ({
          type: 'CHAINALYSIS' as AddressCheckType,
          status: AddressCheckStatus.CLEAR,
          message: 'No sanctions found.',
        }),
      };

      checker.addProvider(clearProvider);

      const result = await checker.checkAsync(VALID_ADDR);
      // Should have FORMAT, BLOCKLIST, UNKNOWN (local) + CHAINALYSIS (provider)
      expect(result.checks.some((c) => c.type === AddressCheckType.FORMAT)).toBe(true);
      expect(result.checks.some((c) => c.type === AddressCheckType.BLOCKLIST)).toBe(true);
      expect(result.checks.some((c) => c.type === ('CHAINALYSIS' as AddressCheckType))).toBe(true);
    });
  });
});
