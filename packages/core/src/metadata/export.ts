/**
 * CSV export for transaction history.
 *
 * Generates a CSV string from enriched transactions.
 * No external library needed — simple string builder.
 */

import type { EnrichedTransaction } from './tx-enrichment';

const HEADERS = [
  'Date',
  'Hash',
  'Direction',
  'Status',
  'Pool',
  'From',
  'To',
  'Amount',
  'Asset',
  'Fee',
  'Contact',
  'Labels',
  'Note',
] as const;

function escapeField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Export enriched transactions to CSV format.
 */
export function exportToCsv(entries: ReadonlyArray<EnrichedTransaction>): string {
  const rows: string[] = [HEADERS.join(',')];

  for (const tx of entries) {
    const row = [
      formatDate(tx.timestamp),
      tx.hash,
      tx.direction,
      tx.status,
      tx.pool,
      tx.from,
      tx.to,
      tx.amount,
      tx.assetSymbol,
      tx.fee,
      escapeField(tx.contactName ?? ''),
      escapeField(tx.labels.join('; ')),
      escapeField(tx.noteContent ?? ''),
    ];
    rows.push(row.join(','));
  }

  return rows.join('\n');
}
