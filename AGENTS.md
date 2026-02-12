# Copilot / Agent Instructions — Project ALPHONSE (Non-Custodial Dual-Pool Wallet)

You are working on **ALPHONSE**, a **non-custodial wallet** with a neobank-style UX and two pools of funds:

- **Public (Checking):** normal EVM wallet balance tied to a public address.
- **Private (Vault):** Shielded/private balance tracked via privacy layer (Aztec for v1). Additional privacy networks (Zcash, Monero, etc.) are future evaluation only — out of scope for v1 and v2.

## Primary Objective

Build a browser extension wallet (Chrome + Firefox) first. Mobile (React Native) comes after, reusing the same TypeScript core.

## Hard Constraints (Non-Negotiable)

1. **Non-custodial always**
   - Never store or transmit seed phrases/private keys to any backend.
   - Never sign transactions on the server.
   - Never implement “send on behalf of users”.
   - If a backend exists, it must be read-only helper: metadata/prices/indexing/notifications only.

2. **One seed / one wallet identity**
   - The app shows two pools (Public and Private) but uses a single wallet seed.
   - Private pool is not “another address balance”; it is tracked via Aztec private state (notes/commitments/nullifiers or Aztec’s current model).
   - Do not introduce “two separate accounts” in UX unless explicitly specified; use “Checking” and “Vault”.

3. **Extension-first**
   - Primary target: Chrome MV3 + Firefox WebExtensions.
   - Must use `webextension-polyfill` and avoid Chrome-only APIs in shared code.
   - Dapp connectivity is required: implement an EIP-1193 provider bridge.

4. **Keep v1 scope tight**
   - Support **one EVM network** only (configurable, but ship with one).
   - Assets: ETH + up to 2 ERC-20s max in v1.
   - No swaps, no bridges, no fiat ramps, no cards in v1.
   - Vault features in v1: Shield (Public→Vault), Private Send (Vault→Vault), Unshield/Withdraw (Vault→Public).

5. **Security**
   - Secrets must be encrypted at rest; decrypted key material must live only in memory when unlocked.
   - Extension storage: encrypted blob in IndexedDB or extension storage; never plaintext.
   - Mobile storage: OS keychain/keystore + encrypted DB for metadata.
   - Never log sensitive user data (seeds, private notes, raw secrets).

6. **Backend Privacy Boundary**
   - Backend must be read-only helper only: metadata, prices, indexing, notifications.
   - No transaction signing on the server.
   - No custody of user funds or keys.
   - No plaintext financial metadata storage — all stored data must be ciphertext.
   - No behavioral analytics tied to wallet addresses by default.
   - All notifications and subscription data must be encrypted if stored server-side.
   - No telemetry that can fingerprint user financial behavior unless explicitly opt-in and privacy-reviewed.

## Post-Quantum Readiness (Data & Sync Only)

- All encrypted user data (contacts, notes, labels, subscriptions, metadata) must be designed to support future migration to post-quantum cryptography.
- Encryption modules must be abstraction-based and replaceable — never hardcode crypto primitives deep into business logic.
- Use modern encryption (AES-GCM or XChaCha20-Poly1305) but design for hybrid PQ upgrade later.
- Wallet signing (EVM keys) remains classical for now and follows chain standards. PQC applies to data/state encryption and sync — not blockchain signing.
- Sync encryption must be designed so hybrid PQ (classical + PQ) can be added without breaking stored data.

## Encrypted State Sync & Multi-Device Model

- Sync must always be end-to-end encrypted.
- Backend must never have plaintext access to: contacts, labels, notes, budgets, subscriptions, receipts, or vault metadata.
- Backend stores ciphertext only. Decryption only happens on user devices.
- Seed phrase and private keys must NEVER sync to backend.
- Sync key must be derived locally or be user-controlled.
- Support future device pairing or encrypted cloud sync.
- No analytics or telemetry that can link wallet identity unless explicitly opt-in.

## Product UX Rules

- Default sending is **Public** unless the recipient explicitly supports private receive.
- Private-to-private requires a **private receive identifier** (e.g., private payment code / QR / contact capability), not a raw `0x...` address.
- Private-to-public is allowed via withdraw/unshield and must show a clear warning: “This transfer is public.”
- Chunking/delay for private→public is OPTIONAL and OFF by default. Offer as “Extra unlinkability” toggles.

## Repo Architecture (Target)

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
  - private state sync + resync APIs (critical)
  - Adapters MUST expose a stable interface:
    `shield()`, `sendPrivate()`, `withdrawPublic()`, `sync()`, `resync()`, `getPrivateBalance()`, `getPrivateActivity()`
  - Adapters must not leak protocol-specific logic into UI or EVM modules
- `packages/storage`:
  - encrypted storage interface and platform adapters
- `apps/extension`:
  - React UI (Vite), TanStack Router + Query
  - background service worker, content scripts, provider injection
- `apps/mobile`:
  - React Native (Expo optional)
  - React Navigation or Expo Router (mobile only)

Shared packages must remain platform-agnostic and contain no browser, mobile, or backend-specific APIs.

## Implementation Priorities (Milestones)

### Milestone 1: Extension Public Wallet

- Create/import wallet, password-based encryption, lock/unlock
- Public balance, send/receive, tx history
- EIP-1193 provider bridge: connect, sign, send tx

### Milestone 2: Neobank UX Layer

- Labels/notes/categories + budgets/pockets (encrypted locally)
- Unified feed with pool badge: PUBLIC/PRIVATE (private can be empty initially)
- CSV export

### Milestone 3: Vault Integration (Aztec)

- Shield (Public→Vault)
- Private send (Vault→Vault) to private payment identifiers
- Unshield/Withdraw (Vault→Public)
- Private state tracking: discover notes, track spent/unspent, compute Vault balance
- Manual "Resync Vault" action + clear recovery UX
- Design privacy adapter interface for future chains

### Milestone 4: Firefox Parity

- Ensure all flows work in Firefox
- Fix MV3/MV2 differences without rewriting core logic

### Milestone 5: Mobile App

- Reuse `packages/*` core
- Implement secure storage + encrypted metadata DB
- Public wallet parity first, then Vault

### Milestone 6: Additional Privacy Chains (Future Evaluation Only)

- Out of scope for v1 and v2.
- Additional privacy networks (Zcash, Monero, etc.) may require separate key/address models and must not complicate the initial architecture.
- Evaluate only after Aztec integration is stable and the privacy adapter interface is proven.

## Coding Standards

- TypeScript strict mode.
- Use `zod` (or similar) for message schemas between UI/background/content scripts.
- Keep platform-specific code out of `packages/*` where possible.
- Every new feature must include tests for core logic (unit tests) and at least one integration test for extension messaging when feasible.

## “What to do when unsure”

- Prefer the safest non-custodial design.
- Prefer shipping smaller scope over adding features.
- If a feature increases custodial risk or regulatory surface (swaps, ramps, relayers), do NOT implement it unless explicitly requested by the project owner.

## Output Expectations for Agent Work

When implementing, always provide:

- what files changed (paths)
- why the change is needed (1–2 lines)
- any security implications
- how to test (exact commands / steps)

End.
