# Alphonse

Permissionless, non-custodial wallet with everyday UX and native privacy.

## Overview

One identity, two pools:

- **Public (Checking):** Standard EVM balance tied to public address(es).
- **Private (Vault):** Shielded balance via privacy layer (Aztec for v1).

Core principles: non-custodial always, one seed / one wallet identity, local-first, encrypted at rest, user-sovereign (SRP + encrypted snapshot = complete restore).

**v1 scope:** One EVM network, ETH + up to 2 ERC-20s, shield/private-send/unshield. No swaps, bridges, ramps, dapp connectivity, or cards.

## Security

**Vault Store:** Holds SRP, signing authority, privacy state, recovery data. Encrypted by a Vault Key derived from SRP via HKDF. Device Unlock Keys (Argon2id) wrap the Vault Key locally. Each device has its own unlock method.

**Key separation:** Independent keys derived from SRP via domain separation (signing, encryption, sync, pairing). One-way from SRP; cannot derive each other.

**Signing:** Wallet must be unlocked + explicit user approval for every transaction. Never auto-sign. Nothing that identifies the user unlocks the wallet. Nothing that unlocks the wallet lives off-device.

**Hardware wallets:** Ledger/Trezor via official libraries — signing only, no key import/export, approval on device screen.

**Address checker:** Local-first similarity + blocklist check on every send/paste. Warning UI before confirm. Offline-capable.

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

Default sending is Public. Private-to-private requires a private receive identifier, not a raw address. Private-to-public warns: “This transfer is public.”

## Future

- **Agent Vault:** Reserved derivation path for CLI/desktop agents. Same adapter interface and key model. Domain-separated keys from SRP.
- **Tap-to-pay (v2+):** NFC payments from Public pool only. Evaluating Numo protocol (`numopay.org`). QR fallback. Opt-in, never auto-sign.

## Getting started

```bash
bun install
bun run dev
```

| Command              | Description                        |
| -------------------- | ---------------------------------- |
| `bun run dev`        | Dev across all workspace packages  |
| `bun run dev:mobile` | Expo dev server (QR + Expo Go)     |
| `bun run build`      | Build all projects                 |
| `bun run test`       | Test across all workspace packages |
| `bun run lint`       | Lint repository                    |
| `bun run format`     | Format with Prettier               |
| `bun run fix`        | Format + lint fix                  |
| `bun run check`      | Prettier check + lint              |

## Structure

```
packages/core/       Key management, signing, account model, address checker
packages/evm/        viem EVM client, tx building, fee estimation, ERC-20
packages/privacy/    Privacy abstraction + Aztec adapter (v1)
packages/storage/    Encrypted storage, platform adapters, forensic cleanup
apps/mobile/         React Native (Expo & Uniwind)
```

## Roadmap

| M   | Scope                                                                           |
| --- | ------------------------------------------------------------------------------- |
| 1   | Mobile public wallet — create/import, send/receive, tx history, address checker |
| 2   | Neobank UX — labels, notes, budgets, unified feed, CSV export                   |
| 3   | Vault integration — shield, private send, unshield, state tracking (Aztec)      |
| 4   | Hardware wallet (Ledger/Trezor), Tor/proxy, forensic cleanup                    |
| 5   | Agent Vault, NFC tap-to-pay (future)                                            |
| 6   | Additional privacy chains (future evaluation)                                   |

See [AGENTS.md](AGENTS.md) for detailed constraints.

## Tech

Bun · TypeScript (strict) · React Native (Expo & Uniwind) · viem · Vitest

## License

Private
