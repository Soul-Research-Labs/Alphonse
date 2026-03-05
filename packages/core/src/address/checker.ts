/**
 * Multi-layered address validation & risk detection.
 *
 * Architecture inspired by Unstoppable Wallet's defense system:
 *  - Multiple independent check types (format, blocklist, phishing, self-send)
 *  - Per-check status tracking (clear / detected / unavailable)
 *  - Pluggable async providers for future API-based checks
 *    (e.g. HashDit risk scoring, Chainalysis sanctions, on-chain USDT/USDC blacklists)
 *  - Synchronous local checks + async external checks
 *
 * Local checks run offline-first. Blocklist functions with last-known data.
 */

import type { Address } from '../types/common';

// ---------------------------------------------------------------------------
// Check types — inspired by Unstoppable's AddressCheckType
// ---------------------------------------------------------------------------

export const AddressCheckType = {
  /** EVM address format validation (hex, length, optional checksum). */
  FORMAT: 'FORMAT',
  /** Known scam/phishing blocklist lookup. */
  BLOCKLIST: 'BLOCKLIST',
  /** Similarity-based address poisoning detection (prefix/suffix matching). */
  PHISHING: 'PHISHING',
  /** Sending to own address warning. */
  SELF_SEND: 'SELF_SEND',
  /** Address has never been seen before (informational). */
  UNKNOWN: 'UNKNOWN',
} as const;

export type AddressCheckType = (typeof AddressCheckType)[keyof typeof AddressCheckType];

// ---------------------------------------------------------------------------
// Per-check status — inspired by Unstoppable's AddressCheckResult enum
// ---------------------------------------------------------------------------

export const AddressCheckStatus = {
  /** Check passed, no risk detected. */
  CLEAR: 'CLEAR',
  /** Risk detected — address flagged. */
  DETECTED: 'DETECTED',
  /** Check could not run (e.g. API unavailable, not supported for this token). */
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

export type AddressCheckStatus = (typeof AddressCheckStatus)[keyof typeof AddressCheckStatus];

// ---------------------------------------------------------------------------
// Check detail & result
// ---------------------------------------------------------------------------

export interface AddressCheckDetail {
  readonly type: AddressCheckType;
  readonly status: AddressCheckStatus;
  readonly message: string;
  readonly metadata?: {
    readonly similarTo?: Address;
    readonly similarity?: number;
  };
}

export interface AddressCheckResult {
  readonly address: Address;
  /** Format is valid EVM address. */
  readonly valid: boolean;
  /** No DETECTED results across all checks. */
  readonly safe: boolean;
  /** At least one DETECTED result (excluding UNKNOWN). */
  readonly risky: boolean;
  /** Individual check results, in order of severity. */
  readonly checks: ReadonlyArray<AddressCheckDetail>;
}

// ---------------------------------------------------------------------------
// Pluggable async provider — for future API-based validators
// (HashDit risk scoring, Chainalysis sanctions, on-chain blacklists)
// ---------------------------------------------------------------------------

export interface AddressCheckProvider {
  readonly type: string;
  supports: (address: Address) => boolean;
  check: (address: Address) => Promise<AddressCheckDetail>;
}

// ---------------------------------------------------------------------------
// Check context — what the caller knows about the user's wallet
// ---------------------------------------------------------------------------

export interface AddressCheckContext {
  /** Addresses the user has interacted with (contacts, recent recipients). */
  readonly knownAddresses?: ReadonlyArray<Address>;
  /** The user's own wallet addresses (for self-send detection). */
  readonly ownAddresses?: ReadonlyArray<Address>;
}

// ---------------------------------------------------------------------------
// Main interface
// ---------------------------------------------------------------------------

export interface AddressChecker {
  /** Run all local (synchronous) checks. */
  check: (address: Address, context?: AddressCheckContext) => AddressCheckResult;
  /** Run all checks including async providers. */
  checkAsync: (address: Address, context?: AddressCheckContext) => Promise<AddressCheckResult>;
  /** Validate EVM address format without running risk checks. */
  validateFormat: (raw: string) => boolean;
  /** Add addresses to the local blocklist. */
  updateBlocklist: (addresses: ReadonlyArray<Address>) => void;
  /** Register an external check provider (e.g. API-based). */
  addProvider: (provider: AddressCheckProvider) => void;
  /** Current blocklist size. */
  blocklistSize: () => number;
}

// ---------------------------------------------------------------------------
// EVM address format validation
// ---------------------------------------------------------------------------

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function isValidEvmAddress(raw: string): boolean {
  return EVM_ADDRESS_RE.test(raw);
}

/** EIP-55 mixed-case checksum validation (optional — lowercase and all-caps both pass). */
function isValidChecksum(address: string): boolean {
  // If all lowercase or all uppercase (after 0x), skip checksum — it's valid.
  const hex = address.slice(2);
  if (hex === hex.toLowerCase() || hex === hex.toUpperCase()) return true;

  // Otherwise, verify EIP-55 checksum using keccak256.
  // We import keccak lazily to avoid coupling when not needed.
  try {
    const { keccak_256 } = require('../crypto/deps') as {
      keccak_256: (data: Uint8Array) => Uint8Array;
    };
    const lower = hex.toLowerCase();
    const hash = Buffer.from(keccak_256(Buffer.from(lower, 'utf8'))).toString('hex');

    for (let i = 0; i < 40; i++) {
      const hashNibble = parseInt(hash[i], 16);
      if (hashNibble >= 8 && lower[i] !== hex[i].toLowerCase()) return false;
      if (hashNibble < 8 && lower[i] !== hex[i]) return false;
    }
    return true;
  } catch {
    // If deps not available, skip checksum validation.
    return true;
  }
}

// ---------------------------------------------------------------------------
// Similarity detection — prefix/suffix weighted scoring
// ---------------------------------------------------------------------------

const SIMILARITY_THRESHOLD = 0.5;

function computeSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  if (aLower === bLower) return 1.0;

  const aHex = aLower.startsWith('0x') ? aLower.slice(2) : aLower;
  const bHex = bLower.startsWith('0x') ? bLower.slice(2) : bLower;
  if (aHex.length !== 40 || bHex.length !== 40) return 0;

  let prefixMatch = 0;
  let prefixBroken = false;
  let totalMatch = 0;
  for (let i = 0; i < 40; i++) {
    if (aHex[i] === bHex[i]) {
      totalMatch++;
      if (!prefixBroken) prefixMatch++;
    } else prefixBroken = true;
  }

  let suffixMatch = 0;
  for (let i = 39; i >= 0; i--) {
    if (aHex[i] === bHex[i]) suffixMatch++;
    else break;
  }

  return (
    Math.min(prefixMatch / 4, 1.0) * 0.4 +
    Math.min(suffixMatch / 4, 1.0) * 0.4 +
    (totalMatch / 40) * 0.2
  );
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function createAddressChecker(): AddressChecker {
  const blocklist = new Set<string>();
  const providers: AddressCheckProvider[] = [];

  function validateFormat(raw: string): boolean {
    return isValidEvmAddress(raw) && isValidChecksum(raw);
  }

  /** Run all synchronous local checks. */
  function check(address: Address, context: AddressCheckContext = {}): AddressCheckResult {
    const checks: AddressCheckDetail[] = [];
    const addrStr = address as string;
    const addrLower = addrStr.toLowerCase();

    // 1. Format validation
    if (!isValidEvmAddress(addrStr)) {
      checks.push({
        type: AddressCheckType.FORMAT,
        status: AddressCheckStatus.DETECTED,
        message: 'Invalid EVM address format.',
      });
      return { address, valid: false, safe: false, risky: true, checks };
    }

    if (!isValidChecksum(addrStr)) {
      checks.push({
        type: AddressCheckType.FORMAT,
        status: AddressCheckStatus.DETECTED,
        message: 'Invalid EIP-55 checksum.',
      });
      return { address, valid: false, safe: false, risky: true, checks };
    }

    checks.push({
      type: AddressCheckType.FORMAT,
      status: AddressCheckStatus.CLEAR,
      message: 'Valid EVM address.',
    });

    // 2. Self-send detection
    const ownAddresses = context.ownAddresses ?? [];
    const isSelf = ownAddresses.some((a) => (a as string).toLowerCase() === addrLower);
    if (isSelf) {
      checks.push({
        type: AddressCheckType.SELF_SEND,
        status: AddressCheckStatus.DETECTED,
        message: 'This is your own address. Sending to yourself is not recommended.',
      });
    }

    // 3. Blocklist check
    if (blocklist.has(addrLower)) {
      checks.push({
        type: AddressCheckType.BLOCKLIST,
        status: AddressCheckStatus.DETECTED,
        message: 'This address is on a known scam/phishing blocklist. Do not send funds.',
      });
    } else {
      checks.push({
        type: AddressCheckType.BLOCKLIST,
        status: AddressCheckStatus.CLEAR,
        message: 'Address not found on blocklist.',
      });
    }

    // 4. Similarity check against known addresses (anti-poisoning)
    const knownAddresses = context.knownAddresses ?? [];
    let phishingDetected = false;

    for (const known of knownAddresses) {
      const knownLower = (known as string).toLowerCase();
      if (knownLower === addrLower) continue;
      const similarity = computeSimilarity(addrLower, knownLower);
      if (similarity >= SIMILARITY_THRESHOLD) {
        checks.push({
          type: AddressCheckType.PHISHING,
          status: AddressCheckStatus.DETECTED,
          message: `Suspiciously similar to a known address (${Math.round(similarity * 100)}% match). Possible address poisoning.`,
          metadata: { similarTo: known, similarity },
        });
        phishingDetected = true;
      }
    }

    if (!phishingDetected && knownAddresses.length > 0) {
      checks.push({
        type: AddressCheckType.PHISHING,
        status: AddressCheckStatus.CLEAR,
        message: 'No suspicious similarity to known addresses.',
      });
    }

    // 5. Unknown address check (informational)
    const isKnown = isSelf || knownAddresses.some((k) => (k as string).toLowerCase() === addrLower);
    if (!isKnown) {
      checks.push({
        type: AddressCheckType.UNKNOWN,
        status: AddressCheckStatus.DETECTED,
        message: 'This address has not been seen before. Double-check before sending.',
      });
    }

    // Derive aggregate flags
    const risky = checks.some(
      (c) => c.status === AddressCheckStatus.DETECTED && c.type !== AddressCheckType.UNKNOWN
    );
    const safe = !risky;

    return { address, valid: true, safe, risky, checks };
  }

  /** Run all checks including async external providers. */
  async function checkAsync(
    address: Address,
    context: AddressCheckContext = {}
  ): Promise<AddressCheckResult> {
    const localResult = check(address, context);
    if (!localResult.valid) return localResult;

    // Run external providers in parallel
    const applicable = providers.filter((p) => p.supports(address));
    if (applicable.length === 0) return localResult;

    const providerResults = await Promise.allSettled(
      applicable.map(async (p) => ({ type: p.type, detail: await p.check(address) }))
    );

    const allChecks = [...localResult.checks];
    for (const result of providerResults) {
      if (result.status === 'fulfilled') {
        allChecks.push(result.value.detail);
      } else {
        allChecks.push({
          type: 'EXTERNAL' as AddressCheckType,
          status: AddressCheckStatus.UNAVAILABLE,
          message: 'External check failed.',
        });
      }
    }

    const risky = allChecks.some(
      (c) => c.status === AddressCheckStatus.DETECTED && c.type !== AddressCheckType.UNKNOWN
    );

    return { address, valid: true, safe: !risky, risky, checks: allChecks };
  }

  function updateBlocklist(addresses: ReadonlyArray<Address>): void {
    for (const addr of addresses) blocklist.add((addr as string).toLowerCase());
  }

  function addProvider(provider: AddressCheckProvider): void {
    providers.push(provider);
  }

  return {
    check,
    checkAsync,
    validateFormat,
    updateBlocklist,
    addProvider,
    blocklistSize: () => blocklist.size,
  };
}
