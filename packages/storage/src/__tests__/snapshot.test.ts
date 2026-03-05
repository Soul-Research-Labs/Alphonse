/**
 * Tests for snapshot export/import.
 */

import { describe, it, expect } from 'vitest';
import { createCryptoProvider } from '@alphonse/core';
import { createInMemoryStorageAdapter } from '../adapters/memory';
import { exportSnapshot, importSnapshot } from '../snapshot';
import type { StorageNamespace } from '../types/adapter';

describe('Snapshot export/import', () => {
  const crypto = createCryptoProvider();
  const encryptionKey = crypto.randomBytes(32);

  it('round-trips data through export and import', async () => {
    const source = createInMemoryStorageAdapter();

    // Populate with test data
    const data1 = new TextEncoder().encode('{"key":"value1"}');
    const data2 = new TextEncoder().encode('{"key":"value2"}');
    await source.set('METADATA' as StorageNamespace, 'contact:001', data1);
    await source.set('METADATA' as StorageNamespace, 'note:001', data2);
    await source.set('PREFERENCES' as StorageNamespace, 'theme', new TextEncoder().encode('dark'));

    // Export
    const exportResult = await exportSnapshot(source, crypto, encryptionKey);
    expect(exportResult.ok).toBe(true);
    if (!exportResult.ok) return;

    const snapshot = exportResult.value;
    expect(snapshot.version).toBe(1);
    expect(snapshot.sections.length).toBeGreaterThanOrEqual(2);
    expect(snapshot.checksum).toBeTruthy();
    expect(snapshot.id).toBeTruthy();

    // Import into fresh storage
    const target = createInMemoryStorageAdapter();
    const importResult = await importSnapshot(snapshot, target, crypto, encryptionKey);
    expect(importResult.ok).toBe(true);
    if (!importResult.ok) return;

    expect(importResult.value.success).toBe(true);
    expect(importResult.value.recordsRestored).toBe(3);
    expect(importResult.value.sectionsImported).toContain('METADATA');
    expect(importResult.value.sectionsImported).toContain('PREFERENCES');
    expect(importResult.value.errors).toHaveLength(0);

    // Verify restored data matches
    const r1 = await target.get('METADATA' as StorageNamespace, 'contact:001');
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(new TextDecoder().decode(r1.value!)).toBe('{"key":"value1"}');

    const r2 = await target.get('PREFERENCES' as StorageNamespace, 'theme');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(new TextDecoder().decode(r2.value!)).toBe('dark');
  });

  it('detects tampered snapshot (checksum mismatch)', async () => {
    const source = createInMemoryStorageAdapter();
    await source.set('METADATA' as StorageNamespace, 'test', new TextEncoder().encode('data'));

    const exportResult = await exportSnapshot(source, crypto, encryptionKey);
    expect(exportResult.ok).toBe(true);
    if (!exportResult.ok) return;

    // Tamper with the checksum
    const tampered = { ...exportResult.value, checksum: 'deadbeef' };

    const target = createInMemoryStorageAdapter();
    const importResult = await importSnapshot(tampered, target, crypto, encryptionKey);
    expect(importResult.ok).toBe(false);
    if (importResult.ok) return;
    expect(importResult.error.code).toBe('SNAPSHOT_INTEGRITY_FAILED');
  });

  it('rejects wrong decryption key', async () => {
    const source = createInMemoryStorageAdapter();
    await source.set('METADATA' as StorageNamespace, 'test', new TextEncoder().encode('secret'));

    const exportResult = await exportSnapshot(source, crypto, encryptionKey);
    expect(exportResult.ok).toBe(true);
    if (!exportResult.ok) return;

    const wrongKey = crypto.randomBytes(32);
    const target = createInMemoryStorageAdapter();
    const importResult = await importSnapshot(exportResult.value, target, crypto, wrongKey);

    // Should fail — either checksum mismatch or decryption failure
    expect(importResult.ok).toBe(false);
  });

  it('rejects unsupported version', async () => {
    const source = createInMemoryStorageAdapter();
    await source.set('METADATA' as StorageNamespace, 'test', new TextEncoder().encode('data'));

    const exportResult = await exportSnapshot(source, crypto, encryptionKey);
    expect(exportResult.ok).toBe(true);
    if (!exportResult.ok) return;

    const futureVersion = { ...exportResult.value, version: 99 };
    const target = createInMemoryStorageAdapter();
    const importResult = await importSnapshot(futureVersion, target, crypto, encryptionKey);
    expect(importResult.ok).toBe(false);
    if (importResult.ok) return;
    expect(importResult.error.code).toBe('SNAPSHOT_VERSION_UNSUPPORTED');
  });

  it('handles empty storage gracefully', async () => {
    const source = createInMemoryStorageAdapter();

    const exportResult = await exportSnapshot(source, crypto, encryptionKey);
    expect(exportResult.ok).toBe(true);
    if (!exportResult.ok) return;
    expect(exportResult.value.sections).toHaveLength(0);

    const target = createInMemoryStorageAdapter();
    const importResult = await importSnapshot(exportResult.value, target, crypto, encryptionKey);
    expect(importResult.ok).toBe(true);
    if (!importResult.ok) return;
    expect(importResult.value.success).toBe(true);
    expect(importResult.value.recordsRestored).toBe(0);
  });
});
