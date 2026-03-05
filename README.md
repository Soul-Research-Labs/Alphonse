# Alphonse

Permissionless, non-custodial wallet with everyday UX and native privacy.

## Overview

One identity, two pools:

- **Public (Checking):** Standard EVM balance tied to public address(es).
- **Private (Vault):** Shielded balance via privacy layer (Aztec for v1).

Core principles: non-custodial always, one seed / one wallet identity, local-first, encrypted at rest, user-sovereign (SRP + encrypted snapshot = complete restore).

**v1 scope:** One EVM network, ETH + up to 2 ERC-20s, shield/private-send/unshield. No swaps, bridges, ramps, dapp connectivity, or cards.

## Architecture

```
alphonse/
├── packages/
│   ├── core/        ← Key management, signing, vault store, address checker, metadata CRUD
│   ├── evm/         ← viem EVM client, tx building, fee estimation, ERC-20 utilities
│   ├── privacy/     ← Privacy protocol abstraction layer + Aztec adapter types (v1)
│   └── storage/     ← Encrypted storage adapters, forensic wipe, snapshot backup
├── apps/
│   └── mobile/      ← React Native (Expo 55 + Uniwind) mobile app
├── AGENTS.md        ← Detailed project constraints and specifications
└── README.md        ← This file
```

### Dependency graph

```
@alphonse/core          ← No internal dependencies. Pure crypto + types.
    ↑
@alphonse/evm           ← Depends on core (types only). Uses viem.
@alphonse/storage       ← Depends on core (types + CryptoProvider).
@alphonse/privacy       ← Depends on core (types only). No implementation yet.
    ↑
@alphonse/mobile        ← Depends on core, evm, storage. Full app.
```

All shared packages are **platform-agnostic** — no browser or mobile-specific APIs.

## Security

**Vault Store:** Holds SRP, signing authority, privacy state, recovery data. Encrypted by a Vault Key derived from SRP via HKDF. Device Unlock Keys (Argon2id) wrap the Vault Key locally. Each device has its own unlock method.

**Key separation:** Independent keys derived from SRP via domain separation (signing, encryption, sync, pairing). One-way from SRP; cannot derive each other.

**Signing:** Wallet must be unlocked + explicit user approval for every transaction. Never auto-sign. Nothing that identifies the user unlocks the wallet. Nothing that unlocks the wallet lives off-device.

**Hardware wallets:** Ledger/Trezor via official libraries — signing only, no key import/export, approval on device screen.

**Address checker:** Local-first similarity + blocklist check on every send/paste. Warning UI before confirm. Offline-capable with periodic blocklist updates.

**Duress modes (optional, off by default):** Decoy wallet (second PIN → separate pre-funded wallet, real vault stays encrypted) and forensic wipe (third PIN → immediate data destruction). All PINs authenticate with indistinguishable timing.

**Forensic cleanup:** On uninstall/wipe — delete all preferences, caches, files. Overwrite Vault Store if platform allows.

## Privacy routing

Opt-in only. Default is direct connection. When enabled, failure blocks and notifies — never silently falls back to direct.

- **Proxy (v1):** SOCKS5/HTTP toggle for RPC and sync. Covers Tor (Orbot), NymVPN, SSH tunnels.
- **Nym mixnet (future):** Built-in `@nymproject/sdk` (`mixFetch`) for RPC routing without external apps.

## Encryption & sync

**Post-quantum readiness:** All user data encryption is abstraction-based and replaceable. Current: AES-GCM or XChaCha20-Poly1305. Designed for hybrid PQ upgrade. PQC applies to data/sync only, not blockchain signing.

**State sync:** All sync is E2EE. Synced data (contacts, labels, notes, budgets, receipts, vault metadata) is ciphertext only. Sync key derived locally.

**Storage:** Fully functional without remote storage. Remote is optional, provider-agnostic, pluggable (S3, WebDAV, file export, IPFS, Filecoin). All remote data is E2EE client-side. Providers never access plaintext or derive keys. If Alphonse disappears, users recover from SRP + encrypted snapshots.

## UX rules

Default sending is Public. Private-to-private requires a private receive identifier, not a raw address. Private-to-public warns: "This transfer is public."

## Future

- **Agent Vault:** Reserved derivation path for CLI/desktop agents. Same adapter interface and key model. Domain-separated keys from SRP.
- **Tap-to-pay (v2+):** NFC payments from Public pool only. Evaluating Numo protocol (`numopay.org`). QR fallback. Opt-in, never auto-sign.

## Getting started

### Prerequisites

- [Bun](https://bun.sh) v1.x (package manager and runtime)
- [Node.js](https://nodejs.org) v18+ (for Expo/React Native tooling)
- iOS Simulator (macOS) or Android Emulator for mobile testing

### Installation

```bash
# Clone and install all workspace dependencies
git clone <repo-url> && cd alphonse
bun install
```

### Running

```bash
# Run tests across all packages
bun run test

# Start mobile development server
bun run dev:mobile

# Lint and format check
bun run check
```

### Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Dev across all workspace packages |
| `bun run dev:mobile` | Expo dev server (QR + Expo Go) |
| `bun run build` | Build all projects |
| `bun run test` | Run vitest across all workspace packages |
| `bun run lint` | Lint entire repository with ESLint |
| `bun run format` | Format all files with Prettier |
| `bun run fix` | Format + lint fix in one command |
| `bun run check` | Prettier check + lint (CI-friendly, read-only) |

### Running individual package tests

```bash
cd packages/core && npx vitest run      # 110 tests
cd packages/evm && npx vitest run       # 31 tests
cd packages/storage && npx vitest run   # 25 tests
```

## Structure

| Path | Package | Description |
| --- | --- | --- |
| `packages/core/` | `@alphonse/core` | Key management, SRP, vault store, wallet manager, address checker, metadata CRUD, tx enrichment, CSV export |
| `packages/evm/` | `@alphonse/evm` | viem-based EVM client, EIP-1559 fee estimation, ERC-20 utilities, tx history tracker, RPC endpoint rotation |
| `packages/privacy/` | `@alphonse/privacy` | Privacy protocol abstraction layer. Aztec adapter types for v1. No implementation yet. |
| `packages/storage/` | `@alphonse/storage` | Encrypted storage adapters, forensic wipe, snapshot export/import, in-memory adapter for tests |
| `apps/mobile/` | `@alphonse/mobile` | React Native (Expo 55 + Uniwind) mobile app with file-based routing |

Each package has its own README with API documentation. See:

- [packages/core/README.md](packages/core/README.md)
- [packages/evm/README.md](packages/evm/README.md)
- [packages/privacy/README.md](packages/privacy/README.md)
- [packages/storage/README.md](packages/storage/README.md)
- [apps/mobile/README.md](apps/mobile/README.md)

## Tech stack

| Layer | Technology |
| --- | --- |
| Runtime | Bun 1.x |
| Language | TypeScript 5.7 (strict mode, ES2022 target) |
| Mobile | React Native 0.83 · Expo 55 · Expo Router |
| Styling | Tailwind CSS 4 · Uniwind |
| EVM | viem 2.x |
| Crypto | @noble/ciphers · @noble/curves · @noble/hashes · @scure/bip32 · @scure/bip39 |
| Testing | vitest 3.x |
| Linting | ESLint 9 · Prettier 3 |

## Coding standards

- TypeScript **strict mode** — `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`.
- **`Result<T, E>` pattern** — No thrown exceptions for expected errors. All fallible operations return discriminated `{ ok: true, value: T } | { ok: false, error: E }`.
- **Branded types** — Opaque wrappers (`Address`, `TxHash`, `SRP`, `VaultKey`, etc.) to prevent accidental misuse of primitives.
- **Factory functions** — `createXxx()` pattern for all service instantiation. No classes with `new`.
- **Platform-agnostic packages** — `packages/*` must never import browser or mobile APIs. Platform adapters live in `apps/`.
- **Tests for all core logic** — Unit tests for every new feature in shared packages.

## Roadmap

| Milestone | Scope | Status |
| --- | --- | --- |
| 1 | Mobile public wallet — create/import, send/receive, tx history, address checker | ✅ Complete |
| 2 | Neobank UX — labels, notes, budgets, unified feed, pool badges, CSV export | ✅ Complete |
| 3 | Vault integration — shield, private send, unshield, state tracking (Aztec) | Planned |
| 4 | Hardware wallet (Ledger/Trezor), Tor/proxy, forensic cleanup | Planned |
| 5 | Agent Vault, NFC tap-to-pay | Future |
| 6 | Additional privacy chains (future evaluation) | Future |

## Contributing

1. Follow the coding standards above.
2. All PRs must pass `bun run check` and `bun run test`.
3. Keep platform-specific code out of `packages/*`.
4. When in doubt, prefer the safest non-custodial design and the smallest scope.

See [AGENTS.md](AGENTS.md) for detailed constraints and specifications.

## License

Private
