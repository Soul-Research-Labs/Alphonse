/**
 * Transaction building types.
 *
 * Covers EVM transaction construction for:
 * - Native asset (ETH) transfers
 * - ERC-20 token transfers
 *
 * All transaction signing happens locally via @alphonse/core signing interface.
 */

import type {
  Address,
  BigIntString,
  Hex,
  LabelId,
  NoteId,
  Pool,
  Timestamp,
  TxHash,
} from '@alphonse/core';
import type { ChainId } from './network';

// ---------------------------------------------------------------------------
// Transaction request (pre-signing)
// ---------------------------------------------------------------------------

export interface TransactionRequest {
  /** Sender address. */
  readonly from: Address;
  /**
   * Recipient address.
   * `null` for contract-creation transactions (no `to` field in EIP-2718).
   */
  readonly to: Address | null;
  /** Value in wei (for native transfers). */
  readonly value?: BigIntString;
  /** Calldata (for contract interactions like ERC-20 transfer). */
  readonly data?: Hex;
  /** Chain ID. */
  readonly chainId: ChainId;
  /** Gas limit. */
  readonly gasLimit?: BigIntString;
  /** EIP-1559: max fee per gas. */
  readonly maxFeePerGas?: BigIntString;
  /** EIP-1559: max priority fee per gas. */
  readonly maxPriorityFeePerGas?: BigIntString;
  /** Nonce (auto-determined if omitted). */
  readonly nonce?: number;
}

// ---------------------------------------------------------------------------
// Transaction receipt (post-submission)
// ---------------------------------------------------------------------------

export const TransactionStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  FAILED: 'FAILED',
} as const;

export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];

export interface TransactionReceipt {
  readonly hash: TxHash;
  readonly status: TransactionStatus;
  readonly from: Address;
  /** Null for contract creation transactions. */
  readonly to: Address | null;
  readonly value: BigIntString;
  readonly gasUsed: BigIntString;
  readonly effectiveGasPrice: BigIntString;
  readonly blockNumber?: bigint;
  readonly timestamp?: Timestamp;
}

// ---------------------------------------------------------------------------
// Transaction history entry (UI-facing)
// ---------------------------------------------------------------------------

export const TransactionDirection = {
  INCOMING: 'INCOMING',
  OUTGOING: 'OUTGOING',
  /** Self-transfer or contract interaction. */
  SELF: 'SELF',
} as const;

export type TransactionDirection = (typeof TransactionDirection)[keyof typeof TransactionDirection];

export interface TransactionHistoryEntry {
  readonly hash: TxHash;
  readonly direction: TransactionDirection;
  readonly status: TransactionStatus;
  readonly pool: Pool;
  readonly from: Address;
  readonly to: Address;
  /** Human-readable amount (formatted with decimals). */
  readonly amount: string;
  readonly assetSymbol: string;
  /** Fee paid in native currency (human-readable). */
  readonly fee: string;
  readonly timestamp: Timestamp;
  /** User-attached note ID (if any). */
  readonly noteId?: NoteId;
  /** User-attached label IDs (if any). */
  readonly labelIds?: ReadonlyArray<LabelId>;
}
