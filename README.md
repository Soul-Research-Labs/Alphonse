# Alphonse

Non-custodial wallet with neobank-style UX.

## Overview

Alphonse is a browser extension wallet with a neobank-style UX.

## Getting Started

```bash
bun install
bun run dev
```

## Scripts

| Command         | Description                       |
| --------------- | --------------------------------- |
| `bun run dev`   | Start extension UI dev server     |
| `bun run build` | Build extension UI for production |
| `bun run test`  | Run tests across all packages     |
| `bun run lint`  | Lint all packages                 |
| `bun run check` | Format + lint fix                 |

## Project Structure

```
alphonse/
├── packages/
│   ├── core/          # Key management, account model, contacts, labels
│   ├── evm/           # viem-based EVM client, tx building, ERC-20
│   ├── privacy/       # Privacy adapter placeholder
│   └── storage/       # Encrypted storage interface + platform adapters
├── apps/
│   └── extension/     # Chrome/Firefox extension (React + Vite)
│       ├── src/
│       │   ├── main.tsx           # Popup entry point
│       │   ├── routes/            # TanStack Router file-based routes
│       │   └── extension/         # MV3 background service worker
│       └── public/
│           └── manifest.json  # Chrome MV3 manifest (copied to dist/)
├── AGENTS.md          # Project specification
└── README.md
```

## Tech Stack

- **Runtime:** Bun
- **Framework:** React 19 + Vite
- **Routing:** TanStack Router (file-based)
- **Styling:** Tailwind CSS v4
- **Testing:** Vitest
- **Extension:** Chrome MV3 + webextension-polyfill

## Roadmap

See [AGENTS.md](AGENTS.md) for detailed milestones.

## License

Private
