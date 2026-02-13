# Alphonse

Non-custodial wallet with everyday UX and native privacy.

## Overview

Alphonse is a permissionless, non-custodial wallet with one identity and two balances:

- **Public:** standard transparent balance and transactions
- **Private (Vault):** shielded balance via privacy adapter (Aztec for v1)

Everything is built around strict non-custodial boundaries:

- One wallet identity (single SRP/seed phrase — root of all keys and vault encryption)
- Non-custodial always (no server-side signing or seed custody)
- Backend is a stateless helper for indexing, pricing, notifications, and encrypted data transport. It never holds keys, signs transactions, or accesses plaintext financial data.

Execution strategy:

- Browser extension is the MVP proof-of-concept
- After MVP validation, primary product focus shifts to mobile
- Shared TypeScript packages power both clients to keep behavior consistent

Detailed product/security rules live in `AGENTS.md`.

## Current status

Current codebase status:

- Monorepo scaffold with shared logic in `packages/*`
- Working extension app in `apps/extension` (active MVP surface)
- Multi-page extension UI (`popup.html` and `desktop.html`)

## Getting Started

```bash
bun install
bun run dev
```

## Build and load extension

```bash
bun run build:extension
```

Then load `apps/extension/dist` as an unpacked extension in your browser:

- Chrome/Brave: `chrome://extensions` → Enable Developer Mode → Load unpacked
- Firefox: `about:debugging` → This Firefox → Load Temporary Add-on

## Scripts

| Command                   | Description                                  |
| ------------------------- | -------------------------------------------- |
| `bun run dev`             | Start extension dev server                   |
| `bun run build`           | Build all workspace packages/apps            |
| `bun run build:extension` | Build extension app (`apps/extension/dist`)  |
| `bun run test`            | Run tests across all workspace packages/apps |
| `bun run lint`            | Lint repository                              |
| `bun run format`          | Format repository with Prettier              |
| `bun run check`           | Format + lint fix                            |

## Project Structure

```
alphonse/
├── packages/
│   ├── core/          # Key management, lock/unlock, permissions, account model
│   ├── evm/           # viem-based EVM client, tx building, ERC-20 utilities
│   ├── privacy/       # Privacy abstraction + Aztec adapter path (v1)
│   └── storage/       # Encrypted storage interfaces/adapters
├── apps/
│   └── extension/     # Chrome/Firefox extension (React + Vite)
│       ├── popup.html            # Popup page entry
│       ├── desktop.html          # Desktop/options page entry
│       ├── src/
│       │   ├── main.tsx          # App bootstrap
│       │   ├── routes/           # TanStack Router routes
│       │   └── extension/        # Extension background service worker
│       └── public/manifest.json  # Extension manifest (copied to dist/)
├── AGENTS.md          # Product/security constraints + milestones
└── README.md
```

## Tech Stack

- **Tooling/Package manager:** Bun
- **Language:** TypeScript (strict)
- **UI:** React 19 + Vite
- **Routing:** TanStack Router (file-based)
- **Styling:** Tailwind CSS v4
- **Validation:** Zod (for extension message schemas)
- **Testing:** Vitest
- **Extension APIs:** `webextension-polyfill` (Chrome + Firefox compatibility)

## Roadmap

See [AGENTS.md](AGENTS.md) for detailed milestones.

## License

Private
