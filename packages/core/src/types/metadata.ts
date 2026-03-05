/**
 * Metadata ledger types: contacts, labels, notes, budgets.
 *
 * All metadata is encrypted at rest and synced as ciphertext.
 * This data enriches the neobank UX (Milestone 2) but the types
 * are defined early so the storage layer can accommodate them.
 */

import type { Address, BigIntString, Brand, Timestamp, TxHash } from './common';

/** Opaque private receive identifier (not a raw `0x` address). */
export type PrivateReceiveId = Brand<string, 'PrivateReceiveId'>;

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export type ContactId = Brand<string, 'ContactId'>;
export type LabelId = Brand<string, 'LabelId'>;
export type NoteId = Brand<string, 'NoteId'>;
export type BudgetId = Brand<string, 'BudgetId'>;
export type CategoryId = Brand<string, 'CategoryId'>;

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export interface Contact {
  readonly id: ContactId;
  readonly name: string;
  /** Public EVM address(es) for this contact. */
  readonly addresses: ReadonlyArray<Address>;
  /** Private receive identifier (payment code / QR capability). */
  readonly privateReceiveId?: PrivateReceiveId;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Labels & Categories
// ---------------------------------------------------------------------------

export interface Category {
  readonly id: CategoryId;
  readonly name: string;
  /** Emoji or icon identifier. */
  readonly icon?: string;
  readonly color?: string;
}

export interface Label {
  readonly id: LabelId;
  readonly categoryId: CategoryId;
  readonly name: string;
  readonly createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Notes (attached to transactions)
// ---------------------------------------------------------------------------

export interface Note {
  readonly id: NoteId;
  /** Transaction hash this note is attached to (if any). */
  readonly txRef?: TxHash;
  readonly content: string;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Budgets / Pockets
// ---------------------------------------------------------------------------

export interface Budget {
  readonly id: BudgetId;
  readonly name: string;
  readonly categoryId?: CategoryId;
  /** Budget cap in the smallest unit of the denominating asset. */
  readonly capAmount: BigIntString;
  /** Asset symbol for the budget denomination. */
  readonly assetSymbol: string;
  /** Current spend against this budget (computed from tx labels). */
  readonly spentAmount: BigIntString;
  /** Budget period start (for current window). */
  readonly periodStart: Timestamp;
  /** Budget period. */
  readonly period: BudgetPeriod;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export const BudgetPeriod = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
} as const;

export type BudgetPeriod = (typeof BudgetPeriod)[keyof typeof BudgetPeriod];
