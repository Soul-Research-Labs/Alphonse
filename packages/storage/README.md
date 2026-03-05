# @alphonse/storage

Encrypted storage adapters, forensic wipe, and snapshot export/import for Alphonse.

Platform-agnostic — the actual storage backend is provided by the app (e.g., `expo-secure-store` on mobile).

## Installation

```bash
bun add @alphonse/storage
```

## Modules

### StorageAdapter Interface (`types/adapter.ts`)

The core interface that all storage backends must implement:

```ts
interface StorageAdapter {
  get(namespace: StorageNamespace, key: string): AsyncResult<Uint8Array | null>;
  set(namespace: StorageNamespace, key: string, value: Uint8Array): AsyncResult<void>;
  delete(namespace: StorageNamespace, key: string): AsyncResult<void>;
  keys(namespace: StorageNamespace): AsyncResult<string[]>;
  has(namespace: StorageNamespace, key: string): AsyncResult<boolean>;
  clear(namespace: StorageNamespace): AsyncResult<void>;
  clearAll(): AsyncResult<void>;
}
```

**Storage namespaces:**

| Namespace     | Purpose                                                  |
| ------------- | -------------------------------------------------------- |
| `VAULT_STORE` | Encrypted wallet envelope (SRP, signing keys, vault key) |
| `METADATA`    | Contacts, labels, notes, budgets                         |
| `PREFERENCES` | User settings and configuration                          |
| `TX_CACHE`    | Cached transaction history                               |
| `SYNC_STATE`  | Sync status and device pairing data                      |

### In-Memory Adapter (`adapters/memory.ts`)

`Map`-based adapter for unit tests and development.

```ts
import { createInMemoryStorageAdapter } from '@alphonse/storage';

const storage = createInMemoryStorageAdapter();

// Use like any StorageAdapter
await storage.set('METADATA', 'key', new Uint8Array([1, 2, 3]));
const result = await storage.get('METADATA', 'key');
```

### Encrypted Storage Adapter (`encrypted.ts`)

Transparent encryption wrapper — encrypts values before writing, decrypts on read.

```ts
import { createEncryptedStorageAdapter } from '@alphonse/storage';
import { createCryptoProvider } from '@alphonse/core';

const inner = createInMemoryStorageAdapter(); // or any StorageAdapter
const crypto = createCryptoProvider();
const encryptionKey = crypto.randomBytes(32);

const encrypted = createEncryptedStorageAdapter(inner, crypto, encryptionKey);

// All writes are transparently encrypted with AES-256-GCM
await encrypted.set('METADATA', 'key', plaintext);

// All reads are transparently decrypted
const result = await encrypted.get('METADATA', 'key');
// result.value === plaintext (decrypted)
```

### Forensic Wipe (`cleanup.ts`)

Secure data destruction that overwrites before deleting.

```ts
import { forensicWipe } from '@alphonse/storage';

// Wipes ALL namespaces — zero-fills data, then deletes
// VAULT_STORE is wiped first (highest sensitivity)
const result = await forensicWipe(storage);
```

**Wipe process:**

1. Enumerate all keys in each namespace
2. Overwrite each value with zero bytes of the same length
3. Delete each key
4. Clear the namespace index
5. Repeat for all namespaces (VAULT_STORE first)

### Snapshot Export/Import (`snapshot.ts`)

Encrypted backup and restore for wallet migration and disaster recovery.

```ts
import { exportSnapshot, importSnapshot } from '@alphonse/storage';
import { createCryptoProvider } from '@alphonse/core';

const crypto = createCryptoProvider();
const backupKey = deriveBackupKey(srp); // user-controlled key

// Export all storage to encrypted snapshot
const snapshot = await exportSnapshot(storage, crypto, backupKey);
// snapshot: EncryptedSnapshot (JSON-serializable)

// Import snapshot to a new device
const result = await importSnapshot(snapshot, newStorage, crypto, backupKey);
// result.value: { sectionsRestored: number, keysRestored: number, errors: [] }
```

**Snapshot format:**

```ts
interface EncryptedSnapshot {
  version: number; // Schema version (currently 1)
  id: string; // Random snapshot ID
  createdAt: Timestamp; // Creation timestamp
  sections: SnapshotSection[]; // One per namespace
  checksum: string; // HMAC over all sections
}

interface SnapshotSection {
  namespace: StorageNamespace; // Which namespace
  payload: EncryptedPayload; // AES-256-GCM encrypted
}
```

**Security properties:**

- Each namespace is encrypted independently
- HMAC checksum detects tampering
- Wrong key produces a decryption error, not corrupted data
- Version field allows future schema migrations
- Snapshots are portable — JSON-serializable for file export or cloud upload

## Types

```ts
import type {
  StorageAdapter,
  StorageNamespace,
  EncryptedSnapshot,
  SnapshotSection,
  SnapshotImportResult,
  SnapshotImportError,
  VaultStoreEnvelope,
  SecureRecord,
} from '@alphonse/storage';
```

## Testing

```bash
cd packages/storage
npx vitest run        # Run all 25 tests
npx vitest --watch    # Watch mode
```

| Test File                | Tests | Coverage                                                                            |
| ------------------------ | ----- | ----------------------------------------------------------------------------------- |
| `memory-adapter.test.ts` | 13    | Full StorageAdapter contract: get/set/delete/keys/has/clear/clearAll                |
| `storage.test.ts`        | 7     | Encrypted adapter: encrypt/decrypt round-trip, key isolation                        |
| `snapshot.test.ts`       | 5     | Export/import round-trip, tamper detection, wrong key, version check, empty storage |

## Platform adapters

This package defines the interface. Platform-specific implementations live in `apps/`:

| Platform             | Adapter                               | Backend                                    |
| -------------------- | ------------------------------------- | ------------------------------------------ |
| Mobile (iOS/Android) | `apps/mobile/src/services/storage.ts` | `expo-secure-store` (OS keychain/keystore) |
| Testing              | `createInMemoryStorageAdapter()`      | In-memory `Map`                            |

To create a new platform adapter, implement the `StorageAdapter` interface:

```ts
import type { StorageAdapter } from '@alphonse/storage';

function createMyStorageAdapter(): StorageAdapter {
  return {
    async get(namespace, key) {
      /* ... */
    },
    async set(namespace, key, value) {
      /* ... */
    },
    async delete(namespace, key) {
      /* ... */
    },
    async keys(namespace) {
      /* ... */
    },
    async has(namespace, key) {
      /* ... */
    },
    async clear(namespace) {
      /* ... */
    },
    async clearAll() {
      /* ... */
    },
  };
}
```

## Dependencies

| Package          | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `@alphonse/core` | `CryptoProvider` for encryption, shared types (`Result`, `AsyncResult`) |
