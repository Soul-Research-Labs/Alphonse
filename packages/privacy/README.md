# @alphonse/privacy

Privacy protocol abstraction layer for Alphonse. Defines the interface that all privacy adapters must implement.

**Status:** Types only. No implementation yet. The Aztec adapter is planned for Milestone 3.

## Purpose

This package provides:

1. **`PrivacyAdapter` interface** — the contract any privacy protocol must satisfy
2. **Operation types** — shield, unshield, private send request/result types
3. **State types** — vault balance, private notes, state snapshots

The interface is designed to support Aztec (v1) and future privacy protocols without breaking changes.

## Installation

```bash
bun add @alphonse/privacy
```

## Interface

### PrivacyAdapter

The core interface that each privacy protocol must implement:

```ts
import type { PrivacyAdapter } from '@alphonse/privacy';

interface PrivacyAdapter {
  /** Protocol metadata. */
  readonly info: PrivacyProtocolInfo;

  /** Shield: move funds from Public → Vault. */
  shield(request: ShieldRequest): AsyncResult<ShieldResult>;

  /** Unshield: move funds from Vault → Public. */
  unshield(request: UnshieldRequest): AsyncResult<UnshieldResult>;

  /** Private send: Vault → Vault transfer. */
  privateSend(request: PrivateSendRequest): AsyncResult<PrivateSendResult>;

  /** Get the current Vault balance for an asset. */
  getVaultBalance(assetId: string): AsyncResult<VaultBalance>;

  /** Resync private state (re-scan for notes, recompute balances). */
  resyncState(): AsyncResult<PrivateStateSnapshot>;
}
```

### Operations

```ts
import type {
  ShieldRequest, // Public → Vault deposit
  ShieldResult,
  UnshieldRequest, // Vault → Public withdrawal
  UnshieldResult,
  PrivateSendRequest, // Vault → Vault private transfer
  PrivateSendResult,
  ChunkingOptions, // Optional: split large transfers for privacy
} from '@alphonse/privacy';
```

**Shield (Public → Vault):**

- User sends ETH/ERC-20 from public wallet into the privacy layer
- The adapter creates the shielded note and returns a reference

**Unshield (Vault → Public):**

- User withdraws from Vault back to a public address
- Shows warning: "This transfer is public"
- Optional chunking/delay for enhanced privacy

**Private Send (Vault → Vault):**

- Transfer between two Vault holders
- Requires a private receive identifier (not a raw `0x` address)
- Fully shielded — no on-chain link between sender and recipient

### State

```ts
import type {
  VaultBalance, // Shielded balance for an asset
  PrivateNote, // Individual private UTXO/note
  PrivateNoteId, // Unique note identifier
  NoteStatus, // 'UNSPENT' | 'SPENT' | 'PENDING_SPEND'
  PrivateStateSnapshot, // Full state for backup/restore
} from '@alphonse/privacy';
```

## Planned: Aztec Adapter (Milestone 3)

The first implementation will wrap the Aztec SDK to provide:

- Note discovery and balance computation
- Shield/unshield via Aztec rollup
- Private transfers between Aztec accounts
- State sync and resync for recovery

The adapter will satisfy the `PrivacyAdapter` interface without changing it.

## Architecture notes

- The adapter interface is **stable** — new privacy protocols implement it without changing consumers.
- All operations return `AsyncResult<T>` for consistent error handling.
- Private state (notes, balances) is tracked locally. The adapter is responsible for syncing with the privacy protocol's state.
- The `resyncState()` method enables recovery: re-scan from the privacy layer and rebuild local state.

## Dependencies

| Package          | Purpose                                                 |
| ---------------- | ------------------------------------------------------- |
| `@alphonse/core` | Shared types (`Address`, `Result`, `AsyncResult`, etc.) |
