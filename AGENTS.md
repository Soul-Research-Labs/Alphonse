# Instructions

**ALPHONSE** is a **permissionless, non-custodial wallet** with a neobank-style UX and two pools of funds:

- **Public:** Normal EVM wallet balance tied to public EVM address(es).
- **Private (Vault):** Shielded/private balance tracked via privacy layer (**Aztec for v1**). Additional privacy networks (Zcash, Monero, etc.) are future evaluation only — **out of scope for v1 and v2**.

## Hard constraints (non-negotiable)

1. **Non-custodial always**
   - Seed phrases and private keys must never leave the device.
   - All transaction signing happens locally on the client.
   - Never implement "send on behalf of users".

2. **One seed / one wallet identity**
   - The app shows two pools (Public and Private) but uses a **single SRP/seed** (one wallet identity).
   - Private pool is **not “another address balance”**; it is tracked via Aztec private state.
   - Do not introduce “two separate accounts” in UX unless explicitly specified; use **Checking** and **Vault**.

3. **Keep v1 scope tight**
   - Support **one EVM network** only (configurable, but ship with one).
   - Assets: ETH + up to **2 ERC-20s** max in v1.
   - No swaps, no bridges, and no fiat ramps.
   - No dapp connectivity in the current phase.
   - Vault features in v1:
     - Shield (Public→Vault)
     - Private Send (Vault→Vault)
     - Unshield/Withdraw (Vault→Public)

4. **No cards**
   - Cards are not part of ALPHONSE scope.

5. **Security**
   - Secrets must be encrypted at rest; decrypted key material must live **only in memory** when unlocked.
   - Local storage must be encrypted at rest; **never plaintext**.
   - Mobile storage: OS keychain/keystore + encrypted DB for metadata.
   - Never log sensitive user data (seeds, private notes, raw secrets).

6. **RPC**
   - RPC endpoint rotation is required to handle rate-limits and timeouts.
   - Support user-specified RPC URLs.

## Auth model (non-custodial boundary)

ALPHONSE has multiple “auth” concepts. **They MUST remain separated.**

### Vault store architecture

- Vault Store is the secure storage domain inside the application.
- Vault Store contains only high-security material, including SRP, signing authority, privacy protocol state, and recovery-critical data.
- Vault Store encryption at rest is mandatory.
- A Vault Key encrypts the Vault Store.
- The Vault Key must be deterministically derived from the SRP using HKDF (or an equivalent one-way KDF).
- SRP must never be used directly as a storage encryption key.
- Passwords/biometrics must derive Device Unlock Keys (Argon2id recommended) that wrap the Vault Key locally.
- Each device maintains its own unlock method; passwords are never shared or synced.
- Loss of all devices must not prevent Vault Store recovery if the SRP is known.
- Vault Store encryption must support future migration and re-wrapping without changing SRP.
- Vault Store is not the application database, the sync database, or UI/preference storage.

### Key separation

- Different security domains must derive independent keys from SRP using domain separation.
- Domains include signing key derivation, Vault Store encryption, sync encryption, and pairing/session keys.
- Derived keys must be one-way from SRP.
- Derived keys must not derive SRP.
- Derived keys must not derive each other.

### Recovery model

- SRP alone must restore wallet identity.
- SRP alone must restore signing capability.
- SRP alone must restore Vault Store decryption capability.
- Passwords/biometrics are device-local convenience layers only.
- No remote service is required for Vault Store recovery.

### Wallet unlock (local, primary)

- User creates/imports SRP locally.
- Vault Store decrypts into memory only while unlocked.
- Auto-lock on timeout, session-end, and manual lock.

### Signing authorization (local, explicit)

- Every sensitive action requires:
  - wallet is unlocked
  - explicit user approval UI (confirm screen)
- Never auto-sign.

### Non-negotiable rule

- Nothing that identifies the user must ever unlock the wallet.
- Nothing that unlocks the wallet must ever live off-device.

## Post-quantum readiness (data & sync only)

- All encrypted user data (contacts, notes, labels, metadata) must be designed to support future migration to post-quantum cryptography.
- Encryption modules must be abstraction-based and replaceable — never hardcode crypto primitives deep into business logic.
- Use modern encryption (AES-GCM or XChaCha20-Poly1305) but design for hybrid PQ upgrade later.
- Wallet signing (EVM keys) remains classical for now and follows chain standards.
- PQC applies to **data/state encryption and sync**, not blockchain signing.

## Encrypted state sync & multi-device model

- Sync must always be **end-to-end encrypted (E2EE)**.
- Synced data includes contacts, labels, notes, budgets, receipts, and vault metadata — all as ciphertext.
- Sync key must be derived locally or be user-controlled.
- Support future device pairing or encrypted cloud sync (ciphertext only).

## Storage & portability model (local-first, user-controlled)

- Vault Store and app metadata must function fully without any remote storage.
- Remote storage is optional and must never be required for wallet operation, signing, or recovery.

### User data sovereignty

- Users must always be able to:
  - export encrypted snapshots
  - migrate to another client
  - restore using SRP + encrypted data without relying on Alphonse infrastructure

### Remote storage philosophy

- Remote storage is a transport, not a dependency.
- Storage must be provider-agnostic and pluggable.
- Supported categories may include (examples, not v1 commitments):
  - user-provided S3 / S3-compatible buckets
  - WebDAV / self-hosted servers
  - encrypted file export/import
  - IPFS pinning
  - Filecoin snapshot storage
- Must not assume any specific storage provider exists.

### Encryption & authority

- All remote data must be:
  - end-to-end encrypted client-side
  - content-addressable where possible
  - non-actionable by storage providers
- Servers or storage providers must never:
  - access plaintext
  - derive keys
  - reconstruct SRP
  - initiate transactions

### User independence requirement

- If Alphonse infrastructure disappears, users must still recover from SRP + encrypted snapshots.
- Migration must not require:
  - Alphonse account
  - Alphonse-operated infrastructure or storage

## Product UX rules

- Default sending is **Public** unless recipient explicitly supports private receive.
- Private-to-private requires a **private receive identifier** (payment code / QR / contact capability), not a raw `0x...` address.
- Private-to-public is allowed via withdraw/unshield and must show a clear warning: “This transfer is public.”
- Chunking/delay for private→public is optional and off by default. Offer it as an “Extra unlinkability” control with a clear cost/latency warning.

## Repo architecture (target)

Monorepo with shared TS packages.

- `packages/core`:
  - key management interfaces, lock/unlock, account model
  - signing interface
  - contacts, labels, notes, budgets (metadata ledger)
- `packages/evm`:
  - viem-based EVM client, tx building, fee estimation, ERC-20 utilities
- `packages/privacy`:
  - Abstraction layer for privacy protocols
  - Aztec adapter (v1)
  - Future adapters are evaluation-only; must not complicate initial architecture
  - Vault logic: shield/private-send/unshield
  - Private state sync + resync APIs (critical)
  - Adapters should expose a stable, minimal contract that remains protocol-agnostic
  - Adapters must not leak protocol-specific logic into UI or EVM modules
- `packages/storage`:
  - encrypted storage interface and platform adapters
- `apps/mobile`:
  - React Native (Expo and Uniwind)

Shared packages must remain platform-agnostic and contain no browser or mobile-specific APIs.

## Implementation priorities (milestones)

### Milestone 1: Mobile public wallet

- Create/import wallet, password-based encryption, lock/unlock
- Public balance, send/receive, tx history
- Secure local storage and signing approval UX on mobile

### Milestone 2: Neobank UX layer

- Labels/notes/categories + budgets/pockets (encrypted locally)
- Unified feed with pool badge: PUBLIC/PRIVATE (private can be empty initially)
- CSV export

### Milestone 3: Vault integration (Aztec)

- Shield (Public→Vault)
- Private send (Vault→Vault) to private payment identifiers
- Unshield/Withdraw (Vault→Public)
- Private state tracking: discover notes, track spent/unspent, compute Vault balance
- Manual "Resync Vault" action + clear recovery UX
- Keep privacy adapter interface stable for future chains

### Milestone 4: Additional privacy chains (future evaluation only)

- Out of scope for v1 and v2.
- Additional privacy networks may require separate key/address models and must not complicate the initial architecture.
- Evaluate only after Aztec integration is stable and the privacy adapter interface is proven.

## Coding standards

- TypeScript strict mode.
- Keep platform-specific code out of `packages/*` where possible.
- Every new feature must include tests for core logic (unit tests).

## What to do when unsure

- Prefer the safest non-custodial design.
- Prefer shipping smaller scope over adding features.
- If a feature increases custodial risk or regulatory surface (swaps, ramps, relayers), do NOT implement it unless explicitly requested by the project owner.

## Output expectations for agent work

When implementing, always provide:

- what files changed (paths)
- why the change is needed (1–2 lines)
- any security implications
- how to test (exact commands / steps)
