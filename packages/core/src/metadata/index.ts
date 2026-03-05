/**
 * Metadata manager — unified factory for contacts, labels, notes, budgets.
 *
 * Creates a MetadataStore bound to a specific StorageAdapter + namespace,
 * then instantiates all four CRUD managers.
 */

import type { AsyncResult } from '../types/common';
import type { MetadataStore } from './contacts';
import { createContactsManager, type ContactsManager } from './contacts';
import { createLabelsManager, type LabelsManager } from './labels';
import { createNotesManager, type NotesManager } from './notes';
import { createBudgetsManager, type BudgetsManager } from './budgets';

export { type MetadataStore } from './contacts';
export { type ContactsManager } from './contacts';
export { type LabelsManager } from './labels';
export { type NotesManager } from './notes';
export { type BudgetsManager } from './budgets';
export { currentPeriodStart } from './budgets';
export {
  enrichTransactions,
  type EnrichedTransaction,
  type TransactionEntry,
} from './tx-enrichment';
export { exportToCsv } from './export';

export interface MetadataManager {
  readonly contacts: ContactsManager;
  readonly labels: LabelsManager;
  readonly notes: NotesManager;
  readonly budgets: BudgetsManager;
}

/**
 * Create a MetadataStore backed by a storage adapter + namespace.
 *
 * This bridges the storage layer to the metadata CRUD modules without
 * importing @alphonse/storage directly (keeping packages/core platform-agnostic).
 *
 * The `adapter` parameter accepts any object with the required methods.
 * Callers pass their StorageAdapter bound to the METADATA namespace.
 */
export function createMetadataStore(
  adapter: {
    get: (ns: string, key: string) => AsyncResult<Uint8Array | null>;
    set: (ns: string, key: string, value: Uint8Array) => AsyncResult<void>;
    delete: (ns: string, key: string) => AsyncResult<void>;
    keys: (ns: string) => AsyncResult<string[]>;
  },
  namespace: string
): MetadataStore {
  return {
    get: (key: string) => adapter.get(namespace, key),
    set: (key: string, value: Uint8Array) => adapter.set(namespace, key, value),
    delete: (key: string) => adapter.delete(namespace, key),
    keys: () => adapter.keys(namespace),
  };
}

/**
 * Create the full MetadataManager from a MetadataStore and crypto randomBytes.
 */
export function createMetadataManager(
  store: MetadataStore,
  randomBytes: (len: number) => Uint8Array
): MetadataManager {
  return {
    contacts: createContactsManager(store, randomBytes),
    labels: createLabelsManager(store, randomBytes),
    notes: createNotesManager(store, randomBytes),
    budgets: createBudgetsManager(store, randomBytes),
  };
}
