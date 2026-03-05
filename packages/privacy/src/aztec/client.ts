/**
 * Aztec PXE (Private eXecution Environment) client abstraction.
 *
 * The PXE is the local service that manages private state, note
 * discovery, and transaction simulation for Aztec. This module
 * provides a minimal abstraction over the PXE JSON-RPC interface
 * so the adapter can be tested without the full Aztec SDK.
 *
 * In production, the PXE runs locally (sandbox or embedded).
 * The client communicates via JSON-RPC over HTTP.
 */

import { type AsyncResult, Result, type AlphonseError, ErrorCode } from '@alphonse/core';

// ---------------------------------------------------------------------------
// PXE types (protocol-specific, internal to aztec adapter)
// ---------------------------------------------------------------------------

/** Aztec address (protocol-specific identifier for an account). */
export type AztecAddress = string;

/** Aztec note commitment hash. */
export type NoteHash = string;

/** Aztec transaction hash. */
export type AztecTxHash = string;

/** Status of a registered Aztec account in the PXE. */
export interface AztecAccountInfo {
  readonly address: AztecAddress;
  readonly registered: boolean;
}

/** Raw note data returned by PXE note discovery. */
export interface AztecNote {
  readonly noteHash: NoteHash;
  /** Contract that owns this note. */
  readonly contractAddress: AztecAddress;
  /** Value stored in the note (serialized). */
  readonly value: string;
  /** Block number where note was created. */
  readonly blockNumber: number;
  /** Whether the note has been nullified (spent). */
  readonly nullified: boolean;
}

/** Transaction receipt from PXE/sequencer. */
export interface AztecTxReceipt {
  readonly txHash: AztecTxHash;
  readonly status: 'pending' | 'mined' | 'failed';
  readonly blockNumber?: number;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// PXE client interface
// ---------------------------------------------------------------------------

/**
 * Minimal PXE client contract.
 *
 * Implementations can wrap:
 * - Aztec SDK's PXE class (production)
 * - Direct JSON-RPC calls (lightweight)
 * - Mock/stub (testing)
 */
export interface PxeClient {
  /** Check if the PXE service is reachable and ready. */
  isReady: () => AsyncResult<boolean>;

  /** Get the current block number from the PXE. */
  getBlockNumber: () => AsyncResult<number>;

  /** Register an account with the PXE (required before note discovery). */
  registerAccount: (
    privateKey: Uint8Array,
    partialAddress: Uint8Array
  ) => AsyncResult<AztecAccountInfo>;

  /** Get registered account info. */
  getAccount: (address: AztecAddress) => AsyncResult<AztecAccountInfo | null>;

  /** Discover all notes owned by an account. */
  getNotes: (owner: AztecAddress, contractAddress?: AztecAddress) => AsyncResult<AztecNote[]>;

  /** Send a shield transaction (deposit public → private). */
  shield: (params: {
    from: string;
    amount: string;
    assetContract: string | null;
    secretHash: Uint8Array;
  }) => AsyncResult<AztecTxReceipt>;

  /** Send an unshield transaction (withdraw private → public). */
  unshield: (params: {
    to: string;
    amount: string;
    assetContract: string | null;
    owner: AztecAddress;
  }) => AsyncResult<AztecTxReceipt>;

  /** Send a private transfer. */
  privateSend: (params: {
    to: AztecAddress;
    amount: string;
    assetContract: string | null;
    owner: AztecAddress;
  }) => AsyncResult<AztecTxReceipt>;

  /** Wait for a transaction to be mined. */
  waitForTx: (txHash: AztecTxHash, timeoutMs?: number) => AsyncResult<AztecTxReceipt>;
}

// ---------------------------------------------------------------------------
// PXE client configuration
// ---------------------------------------------------------------------------

export interface PxeClientConfig {
  /** PXE JSON-RPC endpoint URL (e.g. http://localhost:8080). */
  readonly url: string;
  /** Request timeout in milliseconds. */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// JSON-RPC PXE client implementation
// ---------------------------------------------------------------------------

/**
 * Create a PXE client that communicates via JSON-RPC over HTTP.
 *
 * This is a thin wrapper — in production, consider using the
 * official Aztec SDK PXE client for full protocol support.
 */
export function createPxeClient(config: PxeClientConfig): PxeClient {
  const { url } = config;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function rpcCall<T>(method: string, params: unknown[] = []): AsyncResult<T> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        return Result.err(rpcError(`HTTP ${response.status}: ${response.statusText}`));
      }

      const json = (await response.json()) as { result?: T; error?: { message: string } };
      if (json.error) {
        return Result.err(rpcError(json.error.message));
      }

      return Result.ok(json.result as T);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        return Result.err({
          code: ErrorCode.TIMEOUT,
          message: `PXE request timed out after ${timeoutMs}ms`,
          cause,
        });
      }
      return Result.err(rpcError(String(cause), cause));
    }
  }

  return {
    async isReady() {
      const result = await rpcCall<string>('pxe_getNodeInfo');
      if (!result.ok) return Result.ok(false);
      return Result.ok(true);
    },

    async getBlockNumber() {
      return rpcCall<number>('pxe_getBlockNumber');
    },

    async registerAccount(privateKey, partialAddress) {
      return rpcCall<AztecAccountInfo>('pxe_registerAccount', [
        Array.from(privateKey),
        Array.from(partialAddress),
      ]);
    },

    async getAccount(address) {
      return rpcCall<AztecAccountInfo | null>('pxe_getRegisteredAccount', [address]);
    },

    async getNotes(owner, contractAddress) {
      const params: unknown[] = [owner];
      if (contractAddress) params.push(contractAddress);
      return rpcCall<AztecNote[]>('pxe_getNotes', params);
    },

    async shield(params) {
      return rpcCall<AztecTxReceipt>('pxe_shield', [params]);
    },

    async unshield(params) {
      return rpcCall<AztecTxReceipt>('pxe_unshield', [params]);
    },

    async privateSend(params) {
      return rpcCall<AztecTxReceipt>('pxe_privateSend', [params]);
    },

    async waitForTx(txHash, waitTimeoutMs) {
      return rpcCall<AztecTxReceipt>('pxe_waitForTx', [txHash, waitTimeoutMs ?? timeoutMs]);
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rpcError(message: string, cause?: unknown): AlphonseError {
  return { code: ErrorCode.RPC_ERROR, message: `PXE: ${message}`, cause };
}
