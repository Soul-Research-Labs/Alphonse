/**
 * Transaction enrichment — merge tx history with metadata.
 *
 * Resolves label names, note content, and contact names for display
 * without modifying the immutable TransactionHistoryEntry type.
 */

import type { Contact, Label, Note } from '../types/metadata';

// ---------------------------------------------------------------------------
// Enriched transaction (UI-facing)
// ---------------------------------------------------------------------------

export interface EnrichedTransaction {
  /** Original pool badge. */
  readonly pool: string;
  readonly hash: string;
  readonly direction: string;
  readonly status: string;
  readonly from: string;
  readonly to: string;
  readonly amount: string;
  readonly assetSymbol: string;
  readonly fee: string;
  readonly timestamp: number;
  /** Resolved label names. */
  readonly labels: ReadonlyArray<string>;
  /** Resolved note content (if any). */
  readonly noteContent?: string;
  /** Resolved contact name for the counterparty (if any). */
  readonly contactName?: string;
}

export interface TransactionEntry {
  readonly hash: string;
  readonly direction: string;
  readonly status: string;
  readonly pool: string;
  readonly from: string;
  readonly to: string;
  readonly amount: string;
  readonly assetSymbol: string;
  readonly fee: string;
  readonly timestamp: number;
  readonly noteId?: string;
  readonly labelIds?: ReadonlyArray<string>;
}

/**
 * Enrich a list of transactions with metadata lookups.
 */
export function enrichTransactions(
  entries: ReadonlyArray<TransactionEntry>,
  labelsMap: ReadonlyMap<string, Label>,
  notesMap: ReadonlyMap<string, Note>,
  contactsByAddress: ReadonlyMap<string, Contact>,
  ownAddress?: string
): EnrichedTransaction[] {
  return entries.map((entry) => {
    // Resolve labels
    const labels: string[] = [];
    if (entry.labelIds) {
      for (const lid of entry.labelIds) {
        const label = labelsMap.get(lid);
        if (label) labels.push(label.name);
      }
    }

    // Resolve note
    let noteContent: string | undefined;
    if (entry.noteId) {
      const note = notesMap.get(entry.noteId);
      if (note) noteContent = note.content;
    }

    // Resolve contact — look up the counterparty address
    const counterparty =
      ownAddress && entry.from.toLowerCase() === ownAddress.toLowerCase() ? entry.to : entry.from;
    const contact = contactsByAddress.get(counterparty.toLowerCase());

    return {
      pool: entry.pool,
      hash: entry.hash,
      direction: entry.direction,
      status: entry.status,
      from: entry.from,
      to: entry.to,
      amount: entry.amount,
      assetSymbol: entry.assetSymbol,
      fee: entry.fee,
      timestamp: entry.timestamp,
      labels,
      noteContent,
      contactName: contact?.name,
    };
  });
}
