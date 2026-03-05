/**
 * Duress mode types.
 *
 * Two user-configurable duress modes (both disabled by default):
 *
 * Mode 1 — Decoy wallet:
 *   A second PIN unlocks a separate, pre-funded wallet derived from
 *   the same SRP via an alternate derivation path. Real vault data
 *   remains encrypted and inaccessible.
 *
 * Mode 2 — Forensic wipe:
 *   A third PIN triggers immediate data destruction — overwrites
 *   local storage, keychain entries, and caches. App resets to
 *   fresh install state.
 *
 * All PINs authenticate with indistinguishable timing (constant-time
 * comparison + identical work performed regardless of which PIN matches).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const DuressMode = {
  NONE: 'NONE',
  DECOY: 'DECOY',
  WIPE: 'WIPE',
} as const;

export type DuressMode = (typeof DuressMode)[keyof typeof DuressMode];

export interface DuressConfig {
  /** Whether decoy mode (Mode 1) is enabled. */
  readonly decoyEnabled: boolean;
  /** Whether wipe mode (Mode 2) is enabled. */
  readonly wipeEnabled: boolean;
}

/** Result of evaluating which PIN was entered. */
export interface PinEvaluation {
  /** Which mode the PIN activated. */
  readonly mode: DuressMode;
  /** Whether any PIN matched at all. */
  readonly matched: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Decoy wallet uses account index 1 instead of 0.
 * Real wallet: m/44'/60'/0'/0/0
 * Decoy:       m/44'/60'/1'/0/0
 */
export const DECOY_ETH_PATH = "m/44'/60'/1'/0/0";

/** Default duress config — both disabled. */
export const DEFAULT_DURESS_CONFIG: DuressConfig = {
  decoyEnabled: false,
  wipeEnabled: false,
};
