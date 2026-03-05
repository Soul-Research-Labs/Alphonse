import type { EncryptedPayload, Timestamp } from '@alphonse/core';
import type { StorageNamespace } from './adapter';

// ---------------------------------------------------------------------------
// Snapshot format
// ---------------------------------------------------------------------------

/** Encrypted snapshot used for export/backup. */
export interface EncryptedSnapshot {
  /** Snapshot format version (for future migration). */
  readonly version: number;
  /** Unique snapshot identifier. */
  readonly id: string;
  /** When this snapshot was created. */
  readonly createdAt: Timestamp;
  /**
   * Encrypted data sections.
   * Each section corresponds to a StorageNamespace.
   */
  readonly sections: ReadonlyArray<SnapshotSection>;
  /**
   * Integrity checksum over all sections (HMAC or hash).
   * Enables tamper detection on import.
   */
  readonly checksum: string;
}

export interface SnapshotSection {
  /** Namespace this section represents. */
  readonly namespace: StorageNamespace;
  /** Encrypted section contents. */
  readonly payload: EncryptedPayload;
}

// ---------------------------------------------------------------------------
// Import result
// ---------------------------------------------------------------------------

export interface SnapshotImportResult {
  /** Whether the import succeeded. */
  readonly success: boolean;
  /** Number of records restored. */
  readonly recordsRestored: number;
  /** Sections that were imported. */
  readonly sectionsImported: ReadonlyArray<StorageNamespace>;
  /** Any sections that failed to import. */
  readonly errors: ReadonlyArray<SnapshotImportError>;
}

export interface SnapshotImportError {
  readonly namespace: StorageNamespace;
  readonly message: string;
}
