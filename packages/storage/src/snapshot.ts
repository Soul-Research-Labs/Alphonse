/**
 * Snapshot export/import — encrypted backup.
 *
 * Exports all storage namespaces into a portable, encrypted snapshot.
 * The snapshot is self-contained: each section is independently encrypted
 * and an HMAC checksum provides tamper detection.
 *
 * Usage:
 *   const snapshot = await exportSnapshot(storage, crypto, key);
 *   // ... transfer snapshot to new device ...
 *   const result = await importSnapshot(snapshot, storage, crypto, key);
 */

import { Result } from '@alphonse/core';
import type { AsyncResult, Timestamp } from '@alphonse/core';
import type { CryptoProvider, CipherAlgorithm } from '@alphonse/core';
import type { StorageAdapter, StorageNamespace } from './types/adapter';
import type { EncryptedSnapshot, SnapshotSection, SnapshotImportResult } from './types/snapshot';

const SNAPSHOT_VERSION = 1;
const DEFAULT_CIPHER: CipherAlgorithm = 'aes-256-gcm';

/** All namespaces to include in snapshots, ordered by priority. */
const SNAPSHOT_NAMESPACES: StorageNamespace[] = [
  'VAULT_STORE',
  'METADATA',
  'PREFERENCES',
  'TX_CACHE',
  'SYNC_STATE',
];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Serialize all key-value pairs in a namespace to a single JSON blob.
 */
async function serializeNamespace(
  storage: StorageAdapter,
  namespace: StorageNamespace
): AsyncResult<Uint8Array | null> {
  const keysResult = await storage.keys(namespace);
  if (!keysResult.ok) return keysResult as typeof keysResult & { ok: false };

  if (keysResult.value.length === 0) return Result.ok(null);

  const entries: Record<string, string> = {};
  for (const key of keysResult.value) {
    const val = await storage.get(namespace, key);
    if (!val.ok) return val as typeof val & { ok: false };
    if (val.value !== null) {
      // Base64-encode the raw bytes for JSON safety
      entries[key] = bytesToBase64(val.value);
    }
  }

  return Result.ok(encoder.encode(JSON.stringify(entries)));
}

/**
 * Restore key-value pairs from a deserialized namespace blob.
 */
async function restoreNamespace(
  storage: StorageAdapter,
  namespace: StorageNamespace,
  data: Uint8Array
): AsyncResult<number> {
  const entries: Record<string, string> = JSON.parse(decoder.decode(data));
  let count = 0;

  for (const [key, b64Value] of Object.entries(entries)) {
    const bytes = base64ToBytes(b64Value);
    const w = await storage.set(namespace, key, bytes);
    if (!w.ok) return w as typeof w & { ok: false };
    count++;
  }

  return Result.ok(count);
}

// ---------------------------------------------------------------------------
// Base64 helpers (no atob/btoa for platform-agnostic)
// ---------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Export all storage data into an encrypted snapshot.
 *
 * Each namespace is serialized, encrypted separately, and bundled.
 * An HMAC over all encrypted sections provides integrity verification.
 */
export async function exportSnapshot(
  storage: StorageAdapter,
  crypto: CryptoProvider,
  encryptionKey: Uint8Array,
  algorithm: CipherAlgorithm = DEFAULT_CIPHER
): AsyncResult<EncryptedSnapshot> {
  try {
    const sections: SnapshotSection[] = [];

    for (const ns of SNAPSHOT_NAMESPACES) {
      const serialized = await serializeNamespace(storage, ns);
      if (!serialized.ok) return serialized as typeof serialized & { ok: false };
      if (serialized.value === null) continue; // empty namespace — skip

      const payload = await crypto.encrypt(serialized.value, encryptionKey, algorithm);
      sections.push({ namespace: ns, payload });
    }

    // Compute HMAC over all section payloads for tamper detection
    const checksumInput = encoder.encode(
      sections.map((s) => `${s.namespace}:${s.payload.ciphertext}`).join('|')
    );
    const hmacBytes = await crypto.hmac(encryptionKey, checksumInput);
    let checksum = '';
    for (let i = 0; i < hmacBytes.length; i++) {
      checksum += hmacBytes[i].toString(16).padStart(2, '0');
    }

    const id = crypto.randomBytes(16);
    let snapshotId = '';
    for (let i = 0; i < id.length; i++) snapshotId += id[i].toString(16).padStart(2, '0');

    const snapshot: EncryptedSnapshot = {
      version: SNAPSHOT_VERSION,
      id: snapshotId,
      createdAt: Date.now() as Timestamp,
      sections,
      checksum,
    };

    return Result.ok(snapshot);
  } catch (cause) {
    return Result.err({
      code: 'ENCRYPTION_FAILED' as const,
      message: 'Failed to export snapshot',
      cause,
    });
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Import an encrypted snapshot into storage.
 *
 * Verifies the HMAC checksum before restoring any data.
 * Sections that fail to import are reported in the result but
 * do not prevent other sections from being restored.
 */
export async function importSnapshot(
  snapshot: EncryptedSnapshot,
  storage: StorageAdapter,
  crypto: CryptoProvider,
  encryptionKey: Uint8Array
): AsyncResult<SnapshotImportResult> {
  try {
    if (snapshot.version !== SNAPSHOT_VERSION) {
      return Result.err({
        code: 'SNAPSHOT_VERSION_UNSUPPORTED' as const,
        message: `Snapshot version ${snapshot.version} is not supported (expected ${SNAPSHOT_VERSION})`,
      });
    }

    // Verify HMAC checksum
    const checksumInput = encoder.encode(
      snapshot.sections.map((s) => `${s.namespace}:${s.payload.ciphertext}`).join('|')
    );
    const expectedHmac = await crypto.hmac(encryptionKey, checksumInput);
    let expectedChecksum = '';
    for (let i = 0; i < expectedHmac.length; i++) {
      expectedChecksum += expectedHmac[i].toString(16).padStart(2, '0');
    }

    if (expectedChecksum !== snapshot.checksum) {
      return Result.err({
        code: 'SNAPSHOT_INTEGRITY_FAILED' as const,
        message: 'Snapshot integrity check failed — checksum mismatch',
      });
    }

    // Restore each section
    const errors: Array<{ namespace: StorageNamespace; message: string }> = [];
    const sectionsImported: StorageNamespace[] = [];
    let recordsRestored = 0;

    for (const section of snapshot.sections) {
      try {
        const plaintext = await crypto.decrypt(section.payload, encryptionKey);
        const countResult = await restoreNamespace(storage, section.namespace, plaintext);
        if (countResult.ok) {
          recordsRestored += countResult.value;
          sectionsImported.push(section.namespace);
        } else {
          errors.push({ namespace: section.namespace, message: countResult.error.message });
        }
      } catch (cause) {
        errors.push({
          namespace: section.namespace,
          message: cause instanceof Error ? cause.message : 'Decryption failed',
        });
      }
    }

    return Result.ok({
      success: errors.length === 0,
      recordsRestored,
      sectionsImported,
      errors,
    });
  } catch (cause) {
    return Result.err({
      code: 'DECRYPTION_FAILED' as const,
      message: 'Failed to import snapshot',
      cause,
    });
  }
}
