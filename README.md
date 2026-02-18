# Alphonse

Non-custodial wallet with everyday UX and native privacy.

## Overview

Alphonse is a permissionless, non-custodial wallet with one identity and two balances:

- **Public:** standard transparent balance and transactions
- **Private (Vault):** shielded balance via privacy adapter (Aztec for v1)

Everything is built around strict non-custodial boundaries:

- One wallet identity (single SRP/seed phrase — root of all keys and vault encryption)
- Non-custodial always (seed phrases and private keys never leave the device)
- Local-first (no remote service required for wallet operation, signing, or recovery)
- Remote storage is optional, user-controlled, and always end-to-end encrypted client-side

Execution strategy:

- Mobile is the primary product track
- Shared TypeScript packages power current and future clients

Detailed product/security rules live in `AGENTS.md`.

## Getting Started

```bash
bun install
bun run dev
```

## Scripts

| Command          | Description                             |
| ---------------- | --------------------------------------- |
| `bun run dev`    | Run dev across all workspace packages   |
| `bun run test`   | Run tests across all workspace packages |
| `bun run lint`   | Lint repository                         |
| `bun run format` | Format repository with Prettier         |
| `bun run check`  | Format + lint fix                       |

## Project Structure

```
alphonse/
├── packages/
│   ├── core/          # Key management, lock/unlock, permissions, account model
│   ├── evm/           # viem-based EVM client, tx building, ERC-20 utilities
│   ├── privacy/       # Privacy abstraction + Aztec adapter path (v1)
│   └── storage/       # Encrypted storage interfaces/adapters
├── apps/              # App clients
├── AGENTS.md          # Product/security constraints + milestones
└── README.md
```

## Tech Stack

- **Package manager:** Bun
- **Language:** TypeScript (strict)
- **Mobile:** React Native (Expo & Uniwind)
- **Testing:** Vitest

## Roadmap

See [AGENTS.md](AGENTS.md) for detailed milestones.

## License

Private
