# @alphonse/core

Core wallet primitives — key management, cryptography, signing, vault store, address checker, and metadata CRUD.

This package has **zero platform-specific dependencies** and can be used in any JavaScript/TypeScript environment.

## Installation

```bash
bun add @alphonse/core
```

## Modules

### Crypto (`crypto/`)

Encryption, key derivation, and random byte generation backed by `@noble/ciphers` and `@noble/hashes`.

```ts
import { createCryptoProvider } from '@alphonse/core';

const crypto = createCryptoProvider();

// AES-256-GCM encryption
const payload = await crypto.encrypt(plaintext, key, 'aes-256-gcm');
const decrypted = await crypto.decrypt(payload, key);

// HKDF key derivation with domain separation
const derived = await crypto.deriveKey(ikm, salt, info, length, 'hkdf-sha256');

// Argon2id password hashing
const duk = await crypto.deriveKey(password, salt, '', 32, 'argon2id');

// HMAC
const mac = await crypto.hmac(key, data);

// Cryptographically secure random bytes
const nonce = crypto.randomBytes(12);
```

**`CryptoProvider` interface:**

| Method                                          | Description                                    |
| ----------------------------------------------- | ---------------------------------------------- |
| `encrypt(data, key, algorithm?)`                | Encrypt with AES-256-GCM or XChaCha20-Poly1305 |
| `decrypt(payload, key)`                         | Decrypt an `EncryptedPayload`                  |
| `deriveKey(ikm, salt, info, length, algorithm)` | HKDF-SHA256 or Argon2id key derivation         |
| `hmac(key, data)`                               | HMAC-SHA256                                    |
| `randomBytes(length)`                           | Cryptographically secure random bytes          |

**Supported algorithms:**

- `aes-256-gcm` — AES-256-GCM (default)
- `xchacha20-poly1305` — XChaCha20-Poly1305
- `hkdf-sha256` — HKDF with SHA-256
- `argon2id` — Argon2id password hashing

### SRP Manager (`crypto/srp.ts`)

BIP-39 mnemonic generation and validation.

```ts
import { createSrpManager } from '@alphonse/core';

const srp = createSrpManager();

// Generate a new 12-word mnemonic
const mnemonic = srp.generate(12); // SRP branded type

// Validate a mnemonic
const valid = srp.validate(mnemonic); // boolean

// Convert to seed bytes (BIP-39)
const seed = srp.toSeed(mnemonic);
```

### Key Derivation (`crypto/keys.ts`)

Domain-separated key derivation from SRP.

```ts
import { createKeyDerivation, createCryptoProvider, createSrpManager } from '@alphonse/core';

const keys = createKeyDerivation(createCryptoProvider(), createSrpManager());

// Derive the Vault Key (for encrypting the Vault Store)
const vaultKey = await keys.deriveVaultKey(srp);

// Derive the signing key pair (secp256k1)
const { privateKey, publicKey, address } = await keys.deriveSigningKeyPair(srp);

// Derive a Device Unlock Key from password
const duk = await keys.deriveDeviceUnlockKey(password, salt);
```

**Key domains** (all derived independently from SRP):

| Domain        | Purpose                                         |
| ------------- | ----------------------------------------------- |
| `SIGNING`     | secp256k1 signing key pair (Ethereum addresses) |
| `VAULT_STORE` | Vault Key for encrypting the Vault Store        |
| `SYNC`        | Sync encryption key (future)                    |
| `PAIRING`     | Device pairing key (future)                     |

### Vault Store (`vault/`)

Two-layer encrypted store for sensitive wallet data.

```ts
import { createVaultStoreManager, createCryptoProvider } from '@alphonse/core';

const vault = createVaultStoreManager(createCryptoProvider());

// Create a new vault store
const envelope = await vault.create(password, vaultContents);

// Unlock with password (Layer 1 → Device Unlock Key → Vault Key)
const contents = await vault.unlock(envelope, password);

// Unlock directly with known Vault Key (recovery from SRP)
const contents2 = await vault.unlockWithVaultKey(envelope, vaultKey);

// Re-wrap with new password (change password without re-encrypting contents)
const newEnvelope = await vault.rewrap(envelope, oldPassword, newPassword);
```

**Encryption layers:**

1. **Layer 1 (outer):** Device Unlock Key (Argon2id from password) wraps the Vault Key
2. **Layer 2 (inner):** Vault Key encrypts the actual wallet contents

### Wallet Manager (`wallet/`)

High-level wallet lifecycle management.

```ts
import { createWalletManager /* ...deps... */ } from '@alphonse/core';

const wallet = createWalletManager(srpManager, keyDerivation, vaultStoreManager, persistence);

// Create a new wallet
const result = await wallet.create(password);
// result.value = { srp, address }

// Import from recovery phrase
const result2 = await wallet.import(srp, password);

// Lock / unlock
wallet.lock();
const unlocked = await wallet.unlock(password);

// Get current state
wallet.getState(); // 'UNINITIALIZED' | 'LOCKED' | 'UNLOCKED'

// Get public account info
const account = wallet.getPublicAccount();
// { address, pool: 'PUBLIC' }

// Get signing key pair (only when unlocked)
const keys = wallet.getSigningKeyPair();

// Change password
await wallet.changePassword(oldPassword, newPassword);

// Wipe all data
await wallet.wipe();
```

### Address Checker (`address/`)

Multi-layered address validation and risk detection.

```ts
import { createAddressChecker } from '@alphonse/core';

const checker = createAddressChecker();

// Run all local checks
const result = checker.check(address, {
  ownAddresses: [myAddress],
  knownAddresses: [contact1, contact2],
});

console.log(result.valid); // format is correct
console.log(result.safe); // no risks detected
console.log(result.risky); // at least one risk detected
console.log(result.checks); // individual check details

// Update blocklist
checker.updateBlocklist([scamAddress1, scamAddress2]);

// Run async checks (includes external providers)
const asyncResult = await checker.checkAsync(address, context);
```

**Check types:**

| Check       | Description                                                           |
| ----------- | --------------------------------------------------------------------- |
| `FORMAT`    | EVM address format + EIP-55 checksum validation                       |
| `BLOCKLIST` | Known scam/phishing address lookup                                    |
| `PHISHING`  | Similarity-based address poisoning detection (prefix/suffix matching) |
| `SELF_SEND` | Warning when sending to own address                                   |
| `UNKNOWN`   | Informational: address has never been seen before                     |

### Metadata (`metadata/`)

Encrypted CRUD for contacts, labels, notes, and budgets. All data is stored via the `MetadataStore` interface.

```ts
import { createMetadataStore, createMetadataManager, createCryptoProvider } from '@alphonse/core';

// Bridge a StorageAdapter to a MetadataStore
const store = createMetadataStore(storageAdapter, 'METADATA');
const crypto = createCryptoProvider();
const metadata = createMetadataManager(store, crypto.randomBytes);

// Contacts
const contact = await metadata.contacts.create({ name: 'Alice', address: '0x...' });
const found = await metadata.contacts.findByAddress('0x...');

// Labels & Categories
const category = await metadata.labels.createCategory({ name: 'DeFi', color: '#3B82F6' });
const label = await metadata.labels.createLabel({ name: 'Swap', categoryId: category.value.id });

// Notes
const note = await metadata.notes.create({ txRef: '0xabc...', content: 'Payment for services' });

// Budgets
const budget = await metadata.budgets.create({
  name: 'Monthly Spending',
  limit: '1000000000000000000' as BigIntString, // 1 ETH
  period: 'MONTHLY',
  categoryId: category.value.id,
});
await metadata.budgets.addSpending(budget.value.id, '500000000000000000' as BigIntString);
const status = await metadata.budgets.checkLimit(budget.value.id);
// { exceeded: false, remaining: '500000000000000000' }
```

### Transaction Enrichment (`metadata/tx-enrichment.ts`)

Merge transaction history entries with metadata for rich UI display.

```ts
import { enrichTransactions } from '@alphonse/core';

const enriched = enrichTransactions(
  txEntries, // from TransactionTracker
  labelsMap, // Map<string, Label>
  notesMap, // Map<string, Note>
  contactsByAddress, // Map<string, Contact> (lowercase address keys)
  ownAddress // optional, for counterparty resolution
);

// Each enriched entry has:
// - labels: string[] (resolved label names)
// - noteContent?: string
// - contactName?: string
```

### CSV Export (`metadata/export.ts`)

Export enriched transactions to CSV format.

```ts
import { exportToCsv } from '@alphonse/core';

const csv = exportToCsv(enrichedTransactions);
// Returns: Date,Hash,Direction,Status,Pool,From,To,Amount,Asset,Fee,Contact,Labels,Note
```

## Types

All types are exported from the package root:

```ts
import type {
  // Common
  Address,
  TxHash,
  Hex,
  BigIntString,
  Timestamp,
  SRP,
  Result,
  AsyncResult,
  AlphonseError,
  ErrorCode,

  // Wallet
  WalletId,
  WalletIdentity,
  WalletStatus,
  WalletState,
  WalletConfig,
  WalletManager,
  WalletPersistence,

  // Account
  Pool,
  PublicAccount,
  UnifiedAssetBalance,

  // Auth
  VaultKey,
  DeviceUnlockKey,
  AutoLockPolicy,
  UnlockMethod,
  UnlockRequest,
  UnlockResult,

  // Crypto
  CryptoProvider,
  CipherAlgorithm,
  EncryptedPayload,
  KdfParams,

  // Signing
  SigningKeyPair,
  SigningRequest,
  SigningResult,

  // Metadata
  Contact,
  ContactId,
  Label,
  LabelId,
  Category,
  CategoryId,
  Note,
  NoteId,
  Budget,
  BudgetId,
  BudgetPeriod,

  // Address
  AddressChecker,
  AddressCheckResult,
  AddressCheckDetail,
} from '@alphonse/core';
```

### Result pattern

All fallible operations return `Result<T, E>` instead of throwing:

```ts
const result = await wallet.create(password);

if (result.ok) {
  console.log(result.value.address);
} else {
  console.error(result.error.code, result.error.message);
}
```

The `Result` namespace provides factory helpers:

```ts
import { Result } from '@alphonse/core';

Result.ok(value); // { ok: true, value }
Result.err({ code, message }); // { ok: false, error }
```

### Branded types

Branded types prevent accidentally passing the wrong string/number to a function:

```ts
type Address = Brand<string, 'Address'>; // Not assignable from plain string
type VaultKey = Brand<Uint8Array, 'VaultKey'>; // Not assignable from plain Uint8Array
```

## Testing

```bash
cd packages/core
npx vitest run        # Run all 110 tests
npx vitest --watch    # Watch mode
```

| Test File                 | Tests | Coverage                                                            |
| ------------------------- | ----- | ------------------------------------------------------------------- |
| `srp.test.ts`             | 14    | SRP generation, validation, seed derivation                         |
| `keys.test.ts`            | 16    | Key derivation, domain separation, determinism                      |
| `crypto-provider.test.ts` | 13    | Encrypt/decrypt, HKDF, Argon2id, HMAC                               |
| `vault-store.test.ts`     | 5     | Create, unlock, wrong password, rewrap                              |
| `wallet-manager.test.ts`  | 9     | Full lifecycle: create, import, lock, unlock, change password, wipe |
| `address-checker.test.ts` | 27    | Format, blocklist, phishing, self-send, async providers             |
| `metadata.test.ts`        | 26    | Contacts, labels, notes, budgets, enrichment, CSV export            |

## Dependencies

| Package          | Purpose                                  |
| ---------------- | ---------------------------------------- |
| `@noble/ciphers` | AES-GCM, XChaCha20-Poly1305              |
| `@noble/curves`  | secp256k1 (Ethereum signing)             |
| `@noble/hashes`  | SHA-256, HMAC, HKDF, Argon2id, keccak256 |
| `@scure/bip32`   | HD key derivation (BIP-32)               |
| `@scure/bip39`   | Mnemonic generation/validation (BIP-39)  |

All cryptographic dependencies are audited, pure-JS implementations from the [@noble](https://paulmillr.com/noble/) and [@scure](https://paulmillr.com/noble/) families.
