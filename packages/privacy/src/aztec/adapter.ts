/**
 * Aztec privacy adapter — implements PrivacyAdapter interface.
 *
 * This is the v1 privacy protocol adapter for ALPHONSE, using Aztec's
 * Private eXecution Environment (PXE) for shielded operations.
 *
 * Operations:
 * - Shield (Public → Vault): deposit public funds into Aztec private state
 * - Unshield (Vault → Public): withdraw private funds to public address
 * - Private Send (Vault → Vault): transfer between private recipients
 * - getVaultBalance: compute balance from discovered notes
 * - resyncState: full note discovery and state rebuild
 *
 * All operations return Result<T> — never throw.
 */

import {
  type Address,
  type BigIntString,
  type Timestamp,
  type TxHash,
  type AsyncResult,
  type AlphonseError,
  Result,
  ErrorCode,
} from '@alphonse/core';

import type { PrivacyAdapter, PrivacyProtocolInfo } from '../types/adapter';
import type {
  ShieldRequest,
  ShieldResult,
  UnshieldRequest,
  UnshieldResult,
  PrivateSendRequest,
  PrivateSendResult,
  ProofId,
} from '../types/operations';
import type {
  VaultBalance,
  PrivateNote,
  PrivateStateSnapshot,
  PrivateNoteId,
} from '../types/state';
import { NoteStatus } from '../types/state';

import type { PxeClient, AztecNote } from './client';
import type { AztecAccount } from './account';

// ---------------------------------------------------------------------------
// Adapter configuration
// ---------------------------------------------------------------------------

export interface AztecAdapterConfig {
  /** PXE client for all protocol operations. */
  readonly pxe: PxeClient;
  /** Aztec account (derived and optionally registered). */
  readonly account: AztecAccount;
  /** Known asset symbols by contract address. null key = native asset. */
  readonly assetSymbols?: ReadonlyMap<string | null, string>;
}

// ---------------------------------------------------------------------------
// Protocol info
// ---------------------------------------------------------------------------

const PROTOCOL_INFO: PrivacyProtocolInfo = {
  name: 'aztec',
  version: '0.1.0',
  ready: false, // Set to true once account is registered
};

// ---------------------------------------------------------------------------
// Aztec adapter implementation
// ---------------------------------------------------------------------------

export function createAztecAdapter(config: AztecAdapterConfig): PrivacyAdapter {
  const { pxe, account, assetSymbols } = config;

  function getAssetSymbol(assetContract: Address | null): string {
    return assetSymbols?.get(assetContract) ?? (assetContract === null ? 'ETH' : 'TOKEN');
  }

  function now(): Timestamp {
    return Date.now() as Timestamp;
  }

  // --- Shield (Public → Vault) ---

  async function shield(request: ShieldRequest): AsyncResult<ShieldResult> {
    if (!account.registered) {
      return Result.err(
        adapterError(ErrorCode.SHIELD_FAILED, 'Aztec account not registered with PXE')
      );
    }

    // Generate a secret hash for the shielded note.
    // In production, this comes from the Aztec SDK's note encryption.
    const secretHash = new Uint8Array(32);
    globalThis.crypto.getRandomValues(secretHash);

    const result = await pxe.shield({
      from: request.from,
      amount: request.amount,
      assetContract: request.assetContract,
      secretHash,
    });

    if (!result.ok) {
      return Result.err(adapterError(ErrorCode.SHIELD_FAILED, result.error.message, result.error));
    }

    // Wait for the transaction to be mined
    const receipt = await pxe.waitForTx(result.value.txHash);
    if (!receipt.ok) {
      return Result.err(
        adapterError(
          ErrorCode.SHIELD_FAILED,
          `Shield tx not confirmed: ${receipt.error.message}`,
          receipt.error
        )
      );
    }

    if (receipt.value.status === 'failed') {
      return Result.err(
        adapterError(
          ErrorCode.SHIELD_FAILED,
          `Shield tx failed: ${receipt.value.error ?? 'unknown'}`
        )
      );
    }

    return Result.ok({
      txHash: receipt.value.txHash as unknown as TxHash,
      amountShielded: request.amount,
      timestamp: now(),
    });
  }

  // --- Unshield (Vault → Public) ---

  async function unshield(request: UnshieldRequest): AsyncResult<UnshieldResult> {
    if (!account.registered) {
      return Result.err(
        adapterError(ErrorCode.UNSHIELD_FAILED, 'Aztec account not registered with PXE')
      );
    }

    // Handle chunking if requested
    if (request.chunkingOptions) {
      return unshieldChunked(request);
    }

    const result = await pxe.unshield({
      to: request.to,
      amount: request.amount,
      assetContract: request.assetContract,
      owner: account.address,
    });

    if (!result.ok) {
      return Result.err(
        adapterError(ErrorCode.UNSHIELD_FAILED, result.error.message, result.error)
      );
    }

    const receipt = await pxe.waitForTx(result.value.txHash);
    if (!receipt.ok) {
      return Result.err(
        adapterError(
          ErrorCode.UNSHIELD_FAILED,
          `Unshield tx not confirmed: ${receipt.error.message}`,
          receipt.error
        )
      );
    }

    if (receipt.value.status === 'failed') {
      return Result.err(
        adapterError(
          ErrorCode.UNSHIELD_FAILED,
          `Unshield tx failed: ${receipt.value.error ?? 'unknown'}`
        )
      );
    }

    return Result.ok({
      txHashes: [receipt.value.txHash as unknown as TxHash],
      amountUnshielded: request.amount,
      timestamp: now(),
    });
  }

  async function unshieldChunked(request: UnshieldRequest): AsyncResult<UnshieldResult> {
    const opts = request.chunkingOptions!;
    const totalAmount = BigInt(request.amount);
    const chunkSize = totalAmount / BigInt(opts.chunks);
    const remainder = totalAmount % BigInt(opts.chunks);
    const txHashes: TxHash[] = [];

    for (let i = 0; i < opts.chunks; i++) {
      // Last chunk gets the remainder
      const amount = i === opts.chunks - 1 ? chunkSize + remainder : chunkSize;

      const result = await pxe.unshield({
        to: request.to,
        amount: String(amount),
        assetContract: request.assetContract,
        owner: account.address,
      });

      if (!result.ok) {
        return Result.err(
          adapterError(
            ErrorCode.UNSHIELD_FAILED,
            `Unshield chunk ${i + 1}/${opts.chunks} failed: ${result.error.message}`,
            result.error
          )
        );
      }

      const receipt = await pxe.waitForTx(result.value.txHash);
      if (!receipt.ok || receipt.value.status === 'failed') {
        return Result.err(
          adapterError(
            ErrorCode.UNSHIELD_FAILED,
            `Unshield chunk ${i + 1}/${opts.chunks} not confirmed`
          )
        );
      }

      txHashes.push(receipt.value.txHash as unknown as TxHash);

      // Delay between chunks (except after the last one)
      if (i < opts.chunks - 1) {
        const delay = opts.minDelayMs + Math.random() * (opts.maxDelayMs - opts.minDelayMs);
        await sleep(delay);
      }
    }

    return Result.ok({
      txHashes,
      amountUnshielded: request.amount,
      timestamp: now(),
    });
  }

  // --- Private Send (Vault → Vault) ---

  async function privateSend(request: PrivateSendRequest): AsyncResult<PrivateSendResult> {
    if (!account.registered) {
      return Result.err(
        adapterError(ErrorCode.PRIVATE_SEND_FAILED, 'Aztec account not registered with PXE')
      );
    }

    // PrivateReceiveId maps to an Aztec address
    // In production, this mapping is handled by the Aztec SDK's
    // address book or the recipient's public key registration
    const recipientAddress = String(request.to);

    const result = await pxe.privateSend({
      to: recipientAddress,
      amount: request.amount,
      assetContract: request.assetContract,
      owner: account.address,
    });

    if (!result.ok) {
      return Result.err(
        adapterError(ErrorCode.PRIVATE_SEND_FAILED, result.error.message, result.error)
      );
    }

    const receipt = await pxe.waitForTx(result.value.txHash);
    if (!receipt.ok) {
      return Result.err(
        adapterError(
          ErrorCode.PRIVATE_SEND_FAILED,
          `Private send tx not confirmed: ${receipt.error.message}`,
          receipt.error
        )
      );
    }

    if (receipt.value.status === 'failed') {
      return Result.err(
        adapterError(
          ErrorCode.PRIVATE_SEND_FAILED,
          `Private send tx failed: ${receipt.value.error ?? 'unknown'}`
        )
      );
    }

    return Result.ok({
      proofId: receipt.value.txHash as unknown as ProofId,
      amountSent: request.amount,
      timestamp: now(),
    });
  }

  // --- Vault Balance ---

  async function getVaultBalance(
    _owner: Address,
    assetContract?: Address
  ): AsyncResult<ReadonlyArray<VaultBalance>> {
    const notesResult = await pxe.getNotes(account.address, assetContract ?? undefined);

    if (!notesResult.ok) {
      return Result.err(
        adapterError(
          ErrorCode.VAULT_SYNC_FAILED,
          `Failed to get notes: ${notesResult.error.message}`,
          notesResult.error
        )
      );
    }

    return Result.ok(computeBalances(notesResult.value));
  }

  // --- Resync State ---

  async function resyncState(_owner: Address): AsyncResult<PrivateStateSnapshot> {
    const notesResult = await pxe.getNotes(account.address);

    if (!notesResult.ok) {
      return Result.err(
        adapterError(
          ErrorCode.VAULT_SYNC_FAILED,
          `Resync failed: ${notesResult.error.message}`,
          notesResult.error
        )
      );
    }

    const blockResult = await pxe.getBlockNumber();
    const syncedToBlock = blockResult.ok ? BigInt(blockResult.value) : undefined;

    const notes: PrivateNote[] = notesResult.value.map(aztecNoteToPrivateNote);
    const balances = computeBalances(notesResult.value);

    return Result.ok({
      notes,
      balances,
      syncedAt: now(),
      syncedToBlock,
    });
  }

  // --- Internal helpers ---

  function aztecNoteToPrivateNote(note: AztecNote): PrivateNote {
    return {
      noteId: note.noteHash as unknown as PrivateNoteId,
      status: note.nullified ? NoteStatus.SPENT : NoteStatus.UNSPENT,
      assetContract: (note.contractAddress || null) as Address | null,
      value: note.value as BigIntString,
      createdAt: now(), // PXE doesn't always provide creation time
      spentAt: note.nullified ? now() : undefined,
    };
  }

  function computeBalances(notes: AztecNote[]): VaultBalance[] {
    // Group notes by asset contract and sum values
    const balanceMap = new Map<string | null, { available: bigint; pending: bigint }>();

    for (const note of notes) {
      const key = note.contractAddress || null;
      const existing = balanceMap.get(key) ?? { available: 0n, pending: 0n };

      if (!note.nullified) {
        existing.available += BigInt(note.value);
      }

      balanceMap.set(key, existing);
    }

    const ts = now();
    const balances: VaultBalance[] = [];

    for (const [contract, amounts] of balanceMap) {
      balances.push({
        assetContract: (contract ?? null) as Address | null,
        assetSymbol: getAssetSymbol((contract ?? null) as Address | null),
        available: String(amounts.available) as BigIntString,
        pending: String(amounts.pending) as BigIntString,
        computedAt: ts,
      });
    }

    // If no notes at all, return a default ETH zero balance
    if (balances.length === 0) {
      balances.push({
        assetContract: null,
        assetSymbol: 'ETH',
        available: '0' as BigIntString,
        pending: '0' as BigIntString,
        computedAt: ts,
      });
    }

    return balances;
  }

  // --- Build the adapter object ---

  const info: PrivacyProtocolInfo = {
    ...PROTOCOL_INFO,
    ready: account.registered,
  };

  return {
    info,
    shield,
    unshield,
    privateSend,
    getVaultBalance,
    resyncState,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function adapterError(code: ErrorCode, message: string, cause?: unknown): AlphonseError {
  return { code, message, cause };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
