# @alphonse/mobile

React Native mobile app for Alphonse — the non-custodial wallet with neobank UX.

Built with Expo 55, React Native 0.83, Expo Router (file-based routing), and Tailwind CSS 4 via Uniwind.

## Getting started

### Prerequisites

- [Bun](https://bun.sh) v1.x
- [Node.js](https://nodejs.org) v18+
- iOS Simulator (macOS) or Android Emulator
- [Expo Go](https://expo.dev/go) app on a physical device (optional)

### Running

```bash
# From the monorepo root
bun run dev:mobile

# Or from this directory
cd apps/mobile
bun dev
```

This starts the Expo development server. Scan the QR code with Expo Go or press `i` for iOS Simulator / `a` for Android Emulator.

## Screen structure

The app uses Expo Router's file-based routing:

```
app/
├── _layout.tsx              Root layout: SafeAreaProvider + WalletProvider + NavigationGuard
├── lock.tsx                 Lock screen (password unlock)
├── receive.tsx              Receive screen (QR code + address copy)
│
├── (onboarding)/            Onboarding flow (stack navigator)
│   ├── _layout.tsx          Stack config (slide-right transition)
│   ├── welcome.tsx          Welcome / entry screen
│   ├── create.tsx           Create new wallet (password entry)
│   ├── import.tsx           Import wallet from recovery phrase
│   └── backup.tsx           Backup screen (show SRP for copy)
│
├── (tabs)/                  Main app (tab navigator)
│   ├── _layout.tsx          Tab bar config (Home, Activity, Vault, Settings)
│   ├── index.tsx            Home — balance overview, quick actions
│   ├── activity.tsx         Unified activity feed with pool filter + enrichment
│   ├── vault.tsx            Vault pool view (placeholder for Milestone 3)
│   └── settings.tsx         Security, data management, network info, danger zone
│
└── send/                    Send flow (stack navigator)
    ├── _layout.tsx          Stack config
    ├── address.tsx          Enter/paste/scan recipient address (with address checker)
    ├── amount.tsx           Enter amount + asset selection
    ├── confirm.tsx          Review transaction details + approve
    └── result.tsx           Success/failure result screen
```

### Navigation guard

The root layout automatically redirects based on wallet state:

| Phase        | Redirects to           |
| ------------ | ---------------------- |
| `loading`    | Wait (splash)          |
| `onboarding` | `(onboarding)/welcome` |
| `locked`     | `lock`                 |
| `unlocked`   | `(tabs)/`              |

## Architecture

### WalletContext

Central state provider (`src/context/WalletContext.tsx`) that manages:

- **Wallet lifecycle** — create, import, lock, unlock, change password, wipe
- **Balance polling** — refreshes ETH + ERC-20 balances every 15 seconds when unlocked
- **EVM client** — viem-based client with RPC rotation
- **Transaction tracker** — local tx history with pending status refresh
- **Metadata manager** — contacts, labels, notes, budgets CRUD
- **Address checker** — format validation, blocklist, phishing detection
- **Auto-lock** — locks wallet after 5 minutes of app inactivity (background)
- **Blocklist updater** — periodic remote blocklist fetch with offline fallback

**Exposed values:**

```ts
interface WalletContextValue {
  state: WalletState; // phase, address, balance, tokenBalances, error, pendingSrp
  createWallet(password): Promise<boolean>;
  importWallet(srp, password): Promise<boolean>;
  unlock(password): Promise<boolean>;
  lock(): void;
  changePassword(oldPw, newPw): Promise<boolean>;
  wipe(): Promise<boolean>;
  refreshBalances(): Promise<void>;
  clearPendingSrp(): void;
  getSigningKeyPair(): SigningKeyPair | null;
  addressChecker: AddressChecker;
  evmClient: EvmClient;
  txTracker: TransactionTracker;
  metadataManager: MetadataManager;
}
```

### Services

| Service   | File                        | Purpose                                                             |
| --------- | --------------------------- | ------------------------------------------------------------------- |
| Wallet    | `src/services/wallet.ts`    | Initialize `WalletManager` + `AddressChecker` + `WalletPersistence` |
| EVM       | `src/services/evm.ts`       | Initialize `EvmClient` + `TransactionTracker` with network config   |
| Storage   | `src/services/storage.ts`   | `expo-secure-store` adapter implementing `StorageAdapter`           |
| Blocklist | `src/services/blocklist.ts` | Periodic remote blocklist fetch + apply to address checker          |

### Components

| Component     | File                             | Purpose                                                        |
| ------------- | -------------------------------- | -------------------------------------------------------------- |
| `Button`      | `src/components/Button.tsx`      | Primary/secondary/danger button with loading state             |
| `Input`       | `src/components/Input.tsx`       | Text input with label, error display, secure entry             |
| `SectionCard` | `src/components/SectionCard.tsx` | Card container with title and subtitle                         |
| `TxListItem`  | `src/components/TxListItem.tsx`  | Enriched transaction row with pool badge, labels, note preview |
| `Warning`     | `src/components/Warning.tsx`     | Info/danger/warning alert banner                               |

### Storage

The mobile app uses `expo-secure-store` for all persistent data:

- **iOS:** OS Keychain (hardware-backed encryption)
- **Android:** EncryptedSharedPreferences (hardware-backed)
- **Key format:** `NAMESPACE.key` (e.g., `VAULT_STORE.wallet_envelope`)
- **Binary data:** Base64-encoded before storage
- **Key index:** Per-namespace key list stored as JSON array

All data is encrypted at rest by the OS. The `METADATA` namespace holds contacts, labels, notes, and budgets — encrypted by the storage adapter.

## Features by milestone

### Milestone 1 (Complete)

- Create / import wallet from recovery phrase
- Password-based encryption with Argon2id
- Lock / unlock with auto-lock on background
- Public ETH balance + ERC-20 token balances
- Send flow with address validation and fee estimation
- Receive screen with QR code
- Transaction history with pending status tracking
- Address checker on every send/paste (format, blocklist, phishing, self-send)

### Milestone 2 (Complete)

- Unified activity feed with pool filter (ALL / PUBLIC / VAULT)
- Transaction enrichment with labels, notes, and contact names
- CSV export of enriched transactions via system share sheet
- Data management section in settings
- Auto-lock inactivity timer (5 minutes)
- Periodic blocklist updates with offline fallback
- Metadata CRUD (contacts, labels, notes, budgets) via `MetadataManager`

### Milestone 3 (Planned)

- Vault tab integration with Aztec
- Shield / unshield / private send UI
- Vault balance display

## Tech stack

| Technology              | Version | Purpose                                      |
| ----------------------- | ------- | -------------------------------------------- |
| Expo                    | 55      | React Native framework + development tooling |
| React Native            | 0.83.2  | Cross-platform mobile UI                     |
| React                   | 19.2    | UI framework                                 |
| Expo Router             | 5.x     | File-based navigation                        |
| Tailwind CSS            | 4       | Utility-first styling (via Uniwind)          |
| expo-secure-store       | —       | OS keychain/keystore access                  |
| expo-clipboard          | —       | Clipboard access for address copy            |
| expo-crypto             | —       | Crypto polyfills                             |
| react-native-qrcode-svg | —       | QR code generation for receive screen        |

## Configuration

- **App config:** `app.json` — name, slug, scheme (`alphonse`), orientation, plugins
- **Android package:** `com.alphonse.wallet`
- **Babel:** `babel.config.js` — Expo preset + Uniwind plugin
- **Metro:** `metro.config.js` — monorepo-aware bundler config
- **TypeScript:** `tsconfig.json` — extends root, path aliases for workspace packages
