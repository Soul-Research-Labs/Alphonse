/**
 * Common types, branded primitives, and error handling.
 *
 * These are the foundational types used across all @alphonse packages.
 * Branded types prevent accidental misuse of raw strings where
 * domain-specific semantics are required.
 */

// ---------------------------------------------------------------------------
// Branded type utility
// ---------------------------------------------------------------------------

/** Brands a base type `T` with a unique tag `TBrand` to prevent accidental misuse. */
declare const __brand: unique symbol;
export type Brand<T, TBrand extends string> = T & { readonly [__brand]: TBrand };

// ---------------------------------------------------------------------------
// Hex & Address primitives
// ---------------------------------------------------------------------------

/** A `0x`-prefixed hex string. */
export type Hex = Brand<string, 'Hex'>;

/** A `0x`-prefixed, 20-byte EVM address (checksum or lowercase). */
export type Address = Brand<string, 'Address'>;

/** A `0x`-prefixed, 32-byte transaction hash. */
export type TxHash = Brand<string, 'TxHash'>;

// ---------------------------------------------------------------------------
// Result type (discriminated union — no exceptions for expected errors)
// ---------------------------------------------------------------------------

export type Result<T, TError = AlphonseError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: TError };

export type AsyncResult<T, TError = AlphonseError> = Promise<Result<T, TError>>;

/** Convenience constructors. */
export const Result = {
  ok: <T>(value: T): Result<T, never> => ({ ok: true, value }),
  err: <TError>(error: TError): Result<never, TError> => ({ ok: false, error }),
} as const;

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

export const ErrorCode = {
  // General
  UNKNOWN: 'UNKNOWN',
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  TIMEOUT: 'TIMEOUT',
  OPERATION_CANCELLED: 'OPERATION_CANCELLED',

  // Wallet / auth
  WALLET_LOCKED: 'WALLET_LOCKED',
  WALLET_ALREADY_EXISTS: 'WALLET_ALREADY_EXISTS',
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  INVALID_SRP: 'INVALID_SRP',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  UNLOCK_FAILED: 'UNLOCK_FAILED',

  // Signing
  SIGNING_REJECTED: 'SIGNING_REJECTED',
  SIGNING_FAILED: 'SIGNING_FAILED',

  // Network / RPC
  RPC_ERROR: 'RPC_ERROR',
  NETWORK_UNREACHABLE: 'NETWORK_UNREACHABLE',
  ALL_ENDPOINTS_EXHAUSTED: 'ALL_ENDPOINTS_EXHAUSTED',

  // Storage
  STORAGE_READ_FAILED: 'STORAGE_READ_FAILED',
  STORAGE_WRITE_FAILED: 'STORAGE_WRITE_FAILED',
  DECRYPTION_FAILED: 'DECRYPTION_FAILED',
  ENCRYPTION_FAILED: 'ENCRYPTION_FAILED',

  // Privacy / Vault
  SHIELD_FAILED: 'SHIELD_FAILED',
  UNSHIELD_FAILED: 'UNSHIELD_FAILED',
  PRIVATE_SEND_FAILED: 'PRIVATE_SEND_FAILED',
  VAULT_SYNC_FAILED: 'VAULT_SYNC_FAILED',
  INSUFFICIENT_VAULT_BALANCE: 'INSUFFICIENT_VAULT_BALANCE',

  // Transaction
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  TX_FAILED: 'TX_FAILED',
  TX_REJECTED: 'TX_REJECTED',

  // Snapshot / export-import
  SNAPSHOT_INTEGRITY_FAILED: 'SNAPSHOT_INTEGRITY_FAILED',
  SNAPSHOT_VERSION_UNSUPPORTED: 'SNAPSHOT_VERSION_UNSUPPORTED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface AlphonseError {
  readonly code: ErrorCode;
  readonly message: string;
  /** Optional underlying cause for debugging (never logged in production). */
  readonly cause?: unknown;
}

// ---------------------------------------------------------------------------
// Misc utility types
// ---------------------------------------------------------------------------

/** Unix timestamp in milliseconds. */
export type Timestamp = Brand<number, 'Timestamp'>;

/** Represents a value in the smallest unit (e.g. wei for ETH). */
export type BigIntString = Brand<string, 'BigIntString'>;
