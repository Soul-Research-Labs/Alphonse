/**
 * Privacy protocol adapter interface.
 *
 * This is the protocol-agnostic contract that all privacy adapters
 * (Aztec v1, future chains) must implement. The interface is intentionally
 * minimal and stable — adapters must NOT leak protocol-specific logic
 * into UI or EVM modules.
 *
 * v1 adapter: Aztec.
 * Future adapters are evaluation-only and must not complicate this interface.
 */

import type { Address, AsyncResult } from '@alphonse/core';

import type {
  PrivateSendRequest,
  PrivateSendResult,
  ShieldRequest,
  ShieldResult,
  UnshieldRequest,
  UnshieldResult,
} from './operations';

import type { PrivateStateSnapshot, VaultBalance } from './state';

// ---------------------------------------------------------------------------
// Adapter identity
// ---------------------------------------------------------------------------

/** Identifies the privacy protocol backing this adapter. */
export interface PrivacyProtocolInfo {
  /** Protocol name (e.g. "aztec"). */
  readonly name: string;
  /** Protocol version string. */
  readonly version: string;
  /** Whether the adapter is fully operational. */
  readonly ready: boolean;
}

// ---------------------------------------------------------------------------
// Privacy adapter interface
// ---------------------------------------------------------------------------

/**
 * Protocol-agnostic adapter for privacy/vault operations.
 *
 * Implementations handle:
 * - Shielding (Public → Vault)
 * - Private send (Vault → Vault)
 * - Unshielding (Vault → Public)
 * - Vault state tracking (balances, notes)
 * - State resync
 */
export interface PrivacyAdapter {
  /** Protocol metadata. */
  readonly info: PrivacyProtocolInfo;

  // --- Vault operations ---

  /**
   * Shield: move funds from Public pool to Vault (private).
   * This burns public tokens and creates private notes.
   */
  shield: (request: ShieldRequest) => AsyncResult<ShieldResult>;

  /**
   * Unshield / Withdraw: move funds from Vault back to Public.
   * This consumes private notes and mints public tokens.
   * This transfer is public; UI must warn the user.
   */
  unshield: (request: UnshieldRequest) => AsyncResult<UnshieldResult>;

  /**
   * Private send: transfer funds within Vault to another private recipient.
   * Requires a private receive identifier (not a raw 0x address).
   */
  privateSend: (request: PrivateSendRequest) => AsyncResult<PrivateSendResult>;

  // --- State queries ---

  /**
   * Get Vault balance for a specific asset (or all assets).
   */
  getVaultBalance: (
    owner: Address,
    assetContract?: Address
  ) => AsyncResult<ReadonlyArray<VaultBalance>>;

  /**
   * Full resync of private state from the protocol.
   * Discovers notes, tracks spent/unspent, recomputes Vault balance.
   * Triggered manually by user ("Resync Vault" action).
   */
  resyncState: (owner: Address) => AsyncResult<PrivateStateSnapshot>;
}
