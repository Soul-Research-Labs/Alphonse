# Instructions

You are working on **ALPHONSE**, a **permissionless, non-custodial wallet** with a neobank-style UX and two pools of funds:

- **Public:** Normal EVM wallet balance tied to public EVM address(es).
- **Private (Vault):** Shielded/private balance tracked via privacy layer (**Aztec for v1**). Additional privacy networks (Zcash, Monero, etc.) are future evaluation only — **out of scope for v1 and v2**.

## Primary objective

Build a **browser extension wallet** first (**Chrome + Firefox**). Mobile (React Native) comes after, reusing the same TypeScript core.

## Hard constraints (non-negotiable)

1. **Non-custodial always**
   - Never store or transmit seed phrases/private keys to any backend.
   - Never sign transactions on the server.
   - Never implement “send on behalf of users”.
   - If a backend exists, it must be a **read-only helper**: metadata/prices/indexing/notifications only.

2. **One seed / one wallet identity**
   - The app shows two pools (Public and Private) but uses a **single SRP/seed** (one wallet identity).
   - Private pool is **not “another address balance”**; it is tracked via Aztec private state.
   - Do not introduce “two separate accounts” in UX unless explicitly specified; use **Checking** and **Vault**.

3. **Extension-first**
   - Primary target: **Chrome MV3 + Firefox WebExtensions**.
   - Must use `webextension-polyfill` and avoid Chrome-only APIs in shared code.
   - Dapp connectivity is required (EIP-1193 and EIP-6963 support).

4. **Keep v1 scope tight**
   - Support **one EVM network** only (configurable, but ship with one).
   - Assets: ETH + up to **2 ERC-20s** max in v1.
   - No swaps, no bridges, and no fiat ramps.
   - Vault features in v1:
     - Shield (Public→Vault)
     - Private Send (Vault→Vault)
     - Unshield/Withdraw (Vault→Public)

5. **No cards**
   - Cards are not part of ALPHONSE scope.

6. **Security**
   - Secrets must be encrypted at rest; decrypted key material must live **only in memory** when unlocked.
   - Extension storage: encrypted blob in IndexedDB or extension storage; **never plaintext**.
   - Mobile storage: OS keychain/keystore + encrypted DB for metadata.
   - Never log sensitive user data (seeds, private notes, raw secrets).

7. **Backend privacy boundary**
   - Backend is read-only helper only: metadata, prices, indexing, notifications.
   - No plaintext financial metadata storage — all stored data must be **ciphertext**.
   - No behavioral analytics tied to wallet addresses by default.
   - All notifications and subscription data must be encrypted if stored server-side.
   - No telemetry that can fingerprint user financial behavior unless explicitly opt-in and privacy-reviewed.

8. **RPC**
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
- Vault Store is local-first and must not depend on server availability.
- Loss of all devices must not prevent Vault Store recovery if the SRP is known.
- Vault Store encryption must support future migration and re-wrapping without changing SRP.
- Vault Store is not the application database, the sync database, a server-side store, or UI/preference storage.

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
- Backend must never be required for Vault Store recovery.

### 1. Wallet unlock (local, primary)

- User creates/imports SRP locally.
- Vault Store decrypts into memory only while unlocked; key material exists only in memory.
- Auto-lock on timeout, session-end, and manual lock.

### 2. Signing authorization (local, explicit)

- Every sensitive action requires:
  - wallet is unlocked
  - explicit user approval UI (confirm screen)
- Never auto-sign.
- Never sign on server.
- Never “send on behalf of user”.

### 3. Dapp permissions (EIP-1193, per origin)

- Dapps do **not** “log in” users.
- Maintain per-origin permissions:
  - connect/disconnect
  - account exposure
  - request signatures / send tx must be gated by explicit user approval
- Permissions are capability-based, not identity-based.

### 4. Backend / cloud sync auth (optional, ciphertext only)

- Any “account/session” here is **only** for retrieving and storing ciphertext.
- Backend must never decrypt user data.
- **Seed phrase and private keys must NEVER sync** to backend.

### Non-negotiable rule

- Nothing that identifies the user must ever unlock the wallet.
- Nothing that unlocks the wallet must ever live off-device.

## Post-quantum readiness (data & sync only)

- All encrypted user data (contacts, notes, labels, subscriptions, metadata) must be designed to support future migration to post-quantum cryptography.
- Encryption modules must be abstraction-based and replaceable — never hardcode crypto primitives deep into business logic.
- Use modern encryption (AES-GCM or XChaCha20-Poly1305) but design for hybrid PQ upgrade later.
- Wallet signing (EVM keys) remains classical for now and follows chain standards.
- PQC applies to **data/state encryption and sync**, not blockchain signing.

## Encrypted state sync & multi-device model

- Sync must always be **end-to-end encrypted (E2EE)**.
- Backend must never have plaintext access to: contacts, labels, notes, budgets, subscriptions, receipts, or vault metadata.
- Backend stores ciphertext only. Decryption happens only on user devices.
- Sync key must be derived locally or be user-controlled.
- Support future device pairing or encrypted cloud sync (ciphertext only).
- No analytics or telemetry that can link wallet identity unless explicitly opt-in.

## Dapp connectivity requirements

- Support both legacy and modern wallet discovery patterns used by EVM dapps.
- Preserve explicit consent: never auto-connect a dapp without user approval.
- Treat account exposure and signing as separate permissions.
- Keep permissioning per-origin and revocable.
- Session isolation is required: per-origin account/chain selection, with optional per-tab isolation to prevent cross-site confusion.
- Keep shared packages platform-agnostic; extension-specific bridge logic stays in extension app layers.

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
  - permissions model (per origin)
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
- `apps/extension`:
  - React UI (Vite), TanStack Router + Query
  - Background service worker, content scripts, provider injection
- `apps/mobile`:
  - React Native (Expo optional)
  - React Navigation or Expo Router (mobile only)

Shared packages must remain platform-agnostic and contain no browser, mobile, or backend-specific APIs.

## Implementation priorities (milestones)

### Milestone 1: Extension public wallet

- Create/import wallet, password-based encryption, lock/unlock
- Public balance, send/receive, tx history
- Dapp connectivity with explicit permissions and local signing approval

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

### Milestone 4: Firefox parity

- Ensure all flows work in Firefox
- Fix MV3/MV2 differences without rewriting core logic

### Milestone 5: Mobile app

- Reuse `packages/*` core
- Implement secure storage + encrypted metadata DB
- Public wallet parity first, then Vault

### Milestone 6: Additional privacy chains (future evaluation only)

- Out of scope for v1 and v2.
- Additional privacy networks may require separate key/address models and must not complicate the initial architecture.
- Evaluate only after Aztec integration is stable and the privacy adapter interface is proven.

## Coding standards

- TypeScript strict mode.
- Use `zod` for message schemas between UI/background/content scripts.
- Keep platform-specific code out of `packages/*` where possible.
- Every new feature must include tests for core logic (unit tests) and at least one integration test for extension messaging when feasible.

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
