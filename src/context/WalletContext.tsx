/**
 * Wallet context — provides wallet state and operations to the entire app.
 *
 * Handles:
 * - Wallet initialization check (does a wallet exist?)
 * - Create / import / lock / unlock state transitions
 * - EVM client and balance polling
 * - Address checker integration
 */

import { createContext, useContext, useEffect, useReducer, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import type { ReactNode } from 'react';
import type { AddressChecker, MetadataManager } from '@alphonse/core';
import type { Address, SRP, Timestamp } from '@alphonse/core';
import {
  createMetadataStore,
  createMetadataManager,
  createCryptoProvider,
  evaluatePin,
  hashPin,
  DuressMode,
  validateProxyConfig,
  toBase64,
  fromBase64,
  type StoredPinHashes,
} from '@alphonse/core';
import type { EvmClient, TransactionTracker, TokenBalance, ProxiedFetch } from '@alphonse/evm';
import { KNOWN_TOKENS, createProxiedFetch } from '@alphonse/evm';
import type { VaultBalance, VaultStateTracker, PrivacyAdapter } from '@alphonse/privacy';
import { createSecureStorageAdapter } from '../services/storage';
import { initWalletServices } from '../services/wallet';
import { initEvmServices } from '../services/evm';
import { initPrivacyServices, VAULT_POLL_INTERVAL_MS } from '../services/privacy';
import { createBlocklistUpdater } from '../services/blocklist';

const PREFS_NS = 'PREFERENCES' as const;
const PREFS_KEY = 'm4_settings_v1';

interface PersistedSettingsV1 {
  proxy: ProxySettings;
  duress: DuressSettings;
  hardwareWallet: HardwareWalletStatus;
  duressPins?: PersistedDuressPins;
}

interface PersistedDuressPins {
  realHash: string;
  realSalt: string;
  decoyHash: string | null;
  decoySalt: string | null;
  wipeHash: string | null;
  wipeSalt: string | null;
}

function serializeSettings(settings: PersistedSettingsV1): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(settings));
}

function deserializeSettings(bytes: Uint8Array): PersistedSettingsV1 | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<PersistedSettingsV1>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.proxy || !parsed.duress || !parsed.hardwareWallet) return null;
    return parsed as PersistedSettingsV1;
  } catch {
    return null;
  }
}

function encodeDuressPins(stored: StoredPinHashes | null): PersistedDuressPins | undefined {
  if (!stored) return undefined;
  return {
    realHash: toBase64(stored.realHash),
    realSalt: toBase64(stored.realSalt),
    decoyHash: stored.decoyHash ? toBase64(stored.decoyHash) : null,
    decoySalt: stored.decoySalt ? toBase64(stored.decoySalt) : null,
    wipeHash: stored.wipeHash ? toBase64(stored.wipeHash) : null,
    wipeSalt: stored.wipeSalt ? toBase64(stored.wipeSalt) : null,
  };
}

function decodeDuressPins(pins?: PersistedDuressPins): StoredPinHashes | null {
  if (!pins) return null;
  try {
    return {
      realHash: fromBase64(pins.realHash),
      realSalt: fromBase64(pins.realSalt),
      decoyHash: pins.decoyHash ? fromBase64(pins.decoyHash) : null,
      decoySalt: pins.decoySalt ? fromBase64(pins.decoySalt) : null,
      wipeHash: pins.wipeHash ? fromBase64(pins.wipeHash) : null,
      wipeSalt: pins.wipeSalt ? fromBase64(pins.wipeSalt) : null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type AppPhase = 'loading' | 'onboarding' | 'locked' | 'unlocked';
export type HardwareWalletType = 'LEDGER' | 'TREZOR';

export interface ProxySettings {
  enabled: boolean;
  type: 'SOCKS5' | 'HTTP';
  host: string;
  port: number;
}

export interface DuressSettings {
  decoyEnabled: boolean;
  wipeEnabled: boolean;
}

export interface HardwareWalletStatus {
  connected: boolean;
  type: HardwareWalletType | null;
}

export interface WalletState {
  phase: AppPhase;
  address: Address | null;
  /** ETH balance in wei. */
  balanceWei: bigint | null;
  /** ETH balance formatted. */
  balanceFormatted: string | null;
  /** ERC-20 token balances. */
  tokenBalances: TokenBalance[];
  /** Latest error message. */
  error: string | null;
  /** SRP shown during creation (cleared after backup). */
  pendingSrp: SRP | null;
  /** Vault balances from privacy adapter. */
  vaultBalances: VaultBalance[];
  /** Whether a vault sync is in progress. */
  vaultSyncing: boolean;
  /** When the vault was last synced. */
  lastVaultSync: Timestamp | null;
  /** Proxy routing preferences (user-configured, opt-in). */
  proxy: ProxySettings;
  /** Duress mode preferences (user-configured, disabled by default). */
  duress: DuressSettings;
  /** Hardware wallet connection status. */
  hardwareWallet: HardwareWalletStatus;
  /** Whether duress PINs have been configured by the user. */
  duressPinsConfigured: boolean;
}

const initialState: WalletState = {
  phase: 'loading',
  address: null,
  balanceWei: null,
  balanceFormatted: null,
  tokenBalances: [],
  error: null,
  pendingSrp: null,
  vaultBalances: [],
  vaultSyncing: false,
  lastVaultSync: null,
  proxy: {
    enabled: false,
    type: 'SOCKS5',
    host: '127.0.0.1',
    port: 9050,
  },
  duress: {
    decoyEnabled: false,
    wipeEnabled: false,
  },
  hardwareWallet: {
    connected: false,
    type: null,
  },
  duressPinsConfigured: false,
};

type Action =
  | { type: 'SET_PHASE'; phase: AppPhase }
  | { type: 'SET_ADDRESS'; address: Address }
  | { type: 'SET_BALANCE'; wei: bigint; formatted: string; tokens: TokenBalance[] }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_PENDING_SRP'; srp: SRP }
  | { type: 'CLEAR_PENDING_SRP' }
  | { type: 'SET_VAULT_BALANCES'; balances: VaultBalance[] }
  | { type: 'SET_VAULT_SYNCING'; syncing: boolean }
  | { type: 'SET_VAULT_SYNC_TIME'; time: Timestamp | null }
  | { type: 'SET_PROXY_SETTINGS'; proxy: ProxySettings }
  | { type: 'SET_DURESS_SETTINGS'; duress: DuressSettings }
  | { type: 'SET_HW_CONNECTED'; status: HardwareWalletStatus }
  | { type: 'SET_DURESS_PINS_CONFIGURED'; configured: boolean }
  | { type: 'RESET' };

function reducer(state: WalletState, action: Action): WalletState {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.phase, error: null };
    case 'SET_ADDRESS':
      return { ...state, address: action.address };
    case 'SET_BALANCE':
      return {
        ...state,
        balanceWei: action.wei,
        balanceFormatted: action.formatted,
        tokenBalances: action.tokens,
      };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'SET_PENDING_SRP':
      return { ...state, pendingSrp: action.srp };
    case 'CLEAR_PENDING_SRP':
      return { ...state, pendingSrp: null };
    case 'SET_VAULT_BALANCES':
      return { ...state, vaultBalances: action.balances };
    case 'SET_VAULT_SYNCING':
      return { ...state, vaultSyncing: action.syncing };
    case 'SET_VAULT_SYNC_TIME':
      return { ...state, lastVaultSync: action.time };
    case 'SET_PROXY_SETTINGS':
      return { ...state, proxy: action.proxy };
    case 'SET_DURESS_SETTINGS':
      return { ...state, duress: action.duress };
    case 'SET_HW_CONNECTED':
      return { ...state, hardwareWallet: action.status };
    case 'SET_DURESS_PINS_CONFIGURED':
      return { ...state, duressPinsConfigured: action.configured };
    case 'RESET':
      return { ...initialState, phase: 'onboarding' };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface WalletContextValue {
  state: WalletState;
  /** Create a new wallet with the given password. */
  createWallet: (password: string) => Promise<boolean>;
  /** Import a wallet from an SRP with the given password. */
  importWallet: (srp: string, password: string) => Promise<boolean>;
  /** Unlock the wallet with a password. */
  unlock: (password: string) => Promise<boolean>;
  /** Lock the wallet. */
  lock: () => void;
  /** Change the wallet password. */
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>;
  /** Wipe all wallet data. */
  wipe: () => Promise<boolean>;
  /** Refresh balances from the network. */
  refreshBalances: () => Promise<void>;
  /** Clear the pending SRP after the user has backed it up. */
  clearPendingSrp: () => void;
  /** Get the signing key pair (only available when unlocked). */
  getSigningKeyPair: () => import('@alphonse/core').SigningKeyPair | null;
  /** Access the address checker. */
  addressChecker: AddressChecker;
  /** Access the EVM client. */
  evmClient: EvmClient;
  /** Access the transaction tracker. */
  txTracker: TransactionTracker;
  /** Access the metadata manager (contacts, labels, notes, budgets). */
  metadataManager: MetadataManager;
  /** Access the privacy adapter (vault operations). */
  privacyAdapter: PrivacyAdapter | null;
  /** Access the vault state tracker. */
  vaultTracker: VaultStateTracker | null;
  /** Resync the vault (full note discovery). */
  resyncVault: () => Promise<boolean>;
  /** Refresh vault balances (quick, no full resync). */
  refreshVaultBalances: () => Promise<void>;
  /** Update proxy routing preferences. */
  setProxySettings: (settings: ProxySettings) => void;
  /** Update duress mode preferences. */
  setDuressSettings: (settings: DuressSettings) => void;
  /** Mark a hardware wallet as connected. */
  connectHardwareWallet: (type: HardwareWalletType) => Promise<boolean>;
  /** Mark hardware wallet as disconnected. */
  disconnectHardwareWallet: () => void;
  /** Configure duress PINs (real, optionally decoy and wipe). */
  configureDuressPins: (realPin: string, decoyPin?: string, wipePin?: string) => Promise<boolean>;
  /** Unlock with password + optional PIN (evaluates duress modes). */
  unlockWithPin: (password: string, pin: string) => Promise<boolean>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const servicesRef = useRef<ReturnType<typeof initWalletServices> | null>(null);
  const evmRef = useRef<ReturnType<typeof initEvmServices> | null>(null);
  const metadataRef = useRef<MetadataManager | null>(null);
  const privacyRef = useRef<{ adapter: PrivacyAdapter; tracker: VaultStateTracker } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const storedPinsRef = useRef<StoredPinHashes | null>(null);
  const cryptoRef = useRef(createCryptoProvider());

  // Initialize services once
  if (!servicesRef.current) {
    const storage = createSecureStorageAdapter();
    servicesRef.current = initWalletServices(storage);
  }
  if (!evmRef.current) {
    evmRef.current = initEvmServices();
  }
  if (!metadataRef.current) {
    const metaStore = createMetadataStore(servicesRef.current!.storage, 'METADATA');
    metadataRef.current = createMetadataManager(metaStore, cryptoRef.current.randomBytes);
  }

  const { walletManager, addressChecker } = servicesRef.current;
  const { client: evmClient, tracker: txTracker } = evmRef.current;
  const metadataManager = metadataRef.current;

  // Blocklist updater — start on mount, stop on unmount
  useEffect(() => {
    const updater = createBlocklistUpdater(addressChecker);
    updater.start();
    return () => updater.stop();
  }, [addressChecker]);

  // Auto-lock: lock wallet when app goes to background
  const lastActiveRef = useRef<number>(Date.now());
  const AUTO_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes inactivity

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (state.phase !== 'unlocked') return;

      if (nextState === 'background' || nextState === 'inactive') {
        lastActiveRef.current = Date.now();
      } else if (nextState === 'active') {
        const elapsed = Date.now() - lastActiveRef.current;
        if (elapsed >= AUTO_LOCK_TIMEOUT_MS) {
          walletManager.lock();
          dispatch({ type: 'SET_PHASE', phase: 'locked' });
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [state.phase, walletManager]);

  // Check wallet existence on mount
  useEffect(() => {
    (async () => {
      const exists = walletManager.exists();
      if (exists) {
        dispatch({ type: 'SET_PHASE', phase: 'locked' });
      } else {
        // Try loading from persistence to check if wallet was created in a previous session
        const persistence = servicesRef.current!.persistence;
        const result = await persistence.loadEnvelope();
        if (result.ok && result.value !== null) {
          dispatch({ type: 'SET_PHASE', phase: 'locked' });
        } else {
          dispatch({ type: 'SET_PHASE', phase: 'onboarding' });
        }
      }
    })();
  }, []);

  // Load persisted M4 settings (proxy, duress, hardware status)
  useEffect(() => {
    (async () => {
      const storage = servicesRef.current!.storage;
      const result = await storage.get(PREFS_NS, PREFS_KEY);
      if (!result.ok || result.value === null) return;

      const settings = deserializeSettings(result.value);
      if (!settings) return;

      dispatch({ type: 'SET_PROXY_SETTINGS', proxy: settings.proxy });
      dispatch({ type: 'SET_DURESS_SETTINGS', duress: settings.duress });
      dispatch({ type: 'SET_HW_CONNECTED', status: settings.hardwareWallet });

      // Restore duress PIN hashes into memory
      const pins = decodeDuressPins(settings.duressPins);
      if (pins) {
        storedPinsRef.current = pins;
        dispatch({ type: 'SET_DURESS_PINS_CONFIGURED', configured: true });
      }
    })();
  }, []);

  const refreshBalances = useCallback(async () => {
    const account = walletManager.getPublicAccount();
    if (!account) return;

    const chainId = evmClient.getChainId();
    const tokens = (KNOWN_TOKENS[chainId] ?? []).map((t) => ({
      address: t.address,
      name: t.name,
      symbol: t.symbol,
      decimals: t.decimals,
    }));

    const result = await evmClient.getAllBalances(account.address, tokens);
    if (result.ok) {
      dispatch({
        type: 'SET_BALANCE',
        wei: result.value.native,
        formatted: result.value.nativeFormatted,
        tokens: result.value.tokens,
      });
    }

    // Refresh pending tx statuses
    await txTracker.refreshPending(evmClient);
  }, [walletManager, evmClient, txTracker]);

  // --- Vault operations ---

  const initializePrivacy = useCallback(async () => {
    const signingKp = walletManager.getSigningKeyPair();
    if (!signingKp || privacyRef.current) return;

    try {
      const storage = servicesRef.current!.storage;
      const services = await initPrivacyServices(signingKp.privateKey, storage);
      privacyRef.current = services;

      // Load cached vault balances
      const balances = services.tracker.getBalances();
      if (balances.length > 0) {
        dispatch({ type: 'SET_VAULT_BALANCES', balances: [...balances] });
      }
      const syncTime = services.tracker.lastSyncedAt();
      if (syncTime) {
        dispatch({ type: 'SET_VAULT_SYNC_TIME', time: syncTime });
      }
    } catch {
      // Privacy init failure is non-fatal — vault features unavailable
    }
  }, [walletManager]);

  const teardownPrivacy = useCallback(() => {
    if (privacyRef.current) {
      privacyRef.current.tracker.stopPolling();
      privacyRef.current = null;
    }
    dispatch({ type: 'SET_VAULT_BALANCES', balances: [] });
    dispatch({ type: 'SET_VAULT_SYNC_TIME', time: null });
    dispatch({ type: 'SET_VAULT_SYNCING', syncing: false });
  }, []);

  const resyncVault = useCallback(async (): Promise<boolean> => {
    const privacy = privacyRef.current;
    if (!privacy || !state.address) return false;

    dispatch({ type: 'SET_VAULT_SYNCING', syncing: true });
    try {
      const result = await privacy.tracker.resync(state.address);
      if (!result.ok) {
        dispatch({ type: 'SET_ERROR', error: result.error.message });
        return false;
      }
      dispatch({ type: 'SET_VAULT_BALANCES', balances: [...result.value.balances] });
      dispatch({ type: 'SET_VAULT_SYNC_TIME', time: result.value.syncedAt });
      return true;
    } finally {
      dispatch({ type: 'SET_VAULT_SYNCING', syncing: false });
    }
  }, [state.address]);

  const refreshVaultBalances = useCallback(async () => {
    const privacy = privacyRef.current;
    if (!privacy || !state.address) return;

    const result = await privacy.tracker.refreshBalances(state.address);
    if (result.ok) {
      dispatch({ type: 'SET_VAULT_BALANCES', balances: [...result.value] });
    }
  }, [state.address]);

  // Initialize privacy on unlock, teardown on lock
  useEffect(() => {
    if (state.phase === 'unlocked') {
      initializePrivacy();
    } else if (state.phase === 'locked' || state.phase === 'onboarding') {
      teardownPrivacy();
    }
  }, [state.phase, initializePrivacy, teardownPrivacy]);

  // Balance polling when unlocked
  useEffect(() => {
    if (state.phase === 'unlocked') {
      refreshBalances();
      pollingRef.current = setInterval(refreshBalances, 15_000);

      // Start vault polling via tracker (handles its own interval)
      if (privacyRef.current && state.address) {
        privacyRef.current.tracker.startPolling(state.address, VAULT_POLL_INTERVAL_MS);
      }
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      privacyRef.current?.tracker.stopPolling();
    };
  }, [state.phase, state.address, refreshBalances]);

  const createWallet = useCallback(
    async (password: string): Promise<boolean> => {
      dispatch({ type: 'CLEAR_ERROR' });
      const pw = new TextEncoder().encode(password);
      try {
        const result = await walletManager.create(pw);
        if (!result.ok) {
          dispatch({ type: 'SET_ERROR', error: result.error.message });
          return false;
        }
        dispatch({ type: 'SET_PENDING_SRP', srp: result.value.srp });
        dispatch({ type: 'SET_ADDRESS', address: result.value.address });
        dispatch({ type: 'SET_PHASE', phase: 'unlocked' });
        return true;
      } finally {
        pw.fill(0);
      }
    },
    [walletManager]
  );

  const importWallet = useCallback(
    async (srp: string, password: string): Promise<boolean> => {
      dispatch({ type: 'CLEAR_ERROR' });
      const pw = new TextEncoder().encode(password);
      try {
        const result = await walletManager.import(srp as SRP, pw);
        if (!result.ok) {
          dispatch({ type: 'SET_ERROR', error: result.error.message });
          return false;
        }
        dispatch({ type: 'SET_ADDRESS', address: result.value.address });
        dispatch({ type: 'SET_PHASE', phase: 'unlocked' });
        return true;
      } finally {
        pw.fill(0);
      }
    },
    [walletManager]
  );

  const unlock = useCallback(
    async (password: string): Promise<boolean> => {
      dispatch({ type: 'CLEAR_ERROR' });
      const pw = new TextEncoder().encode(password);
      try {
        const result = await walletManager.unlock(pw);
        if (!result.ok) {
          dispatch({ type: 'SET_ERROR', error: result.error.message });
          return false;
        }
        const account = walletManager.getPublicAccount();
        if (account) dispatch({ type: 'SET_ADDRESS', address: account.address });
        dispatch({ type: 'SET_PHASE', phase: 'unlocked' });
        return true;
      } finally {
        pw.fill(0);
      }
    },
    [walletManager]
  );

  const lock = useCallback(() => {
    walletManager.lock();
    dispatch({ type: 'SET_PHASE', phase: 'locked' });
  }, [walletManager]);

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string): Promise<boolean> => {
      dispatch({ type: 'CLEAR_ERROR' });
      const oldPw = new TextEncoder().encode(oldPassword);
      const newPw = new TextEncoder().encode(newPassword);
      try {
        const result = await walletManager.changePassword(oldPw, newPw);
        if (!result.ok) {
          dispatch({ type: 'SET_ERROR', error: result.error.message });
          return false;
        }
        return true;
      } finally {
        oldPw.fill(0);
        newPw.fill(0);
      }
    },
    [walletManager]
  );

  const wipe = useCallback(async (): Promise<boolean> => {
    dispatch({ type: 'CLEAR_ERROR' });
    const result = await walletManager.wipe();
    if (!result.ok) {
      dispatch({ type: 'SET_ERROR', error: result.error.message });
      return false;
    }
    txTracker.clear();
    dispatch({ type: 'RESET' });
    return true;
  }, [walletManager, txTracker]);

  const clearPendingSrp = useCallback(() => {
    dispatch({ type: 'CLEAR_PENDING_SRP' });
  }, []);

  const getSigningKeyPair = useCallback(() => {
    return walletManager.getSigningKeyPair();
  }, [walletManager]);

  const setProxySettings = useCallback((settings: ProxySettings) => {
    dispatch({ type: 'SET_PROXY_SETTINGS', proxy: settings });
  }, []);

  const setDuressSettings = useCallback((settings: DuressSettings) => {
    dispatch({ type: 'SET_DURESS_SETTINGS', duress: settings });
  }, []);

  const connectHardwareWallet = useCallback(async (type: HardwareWalletType): Promise<boolean> => {
    dispatch({ type: 'SET_HW_CONNECTED', status: { connected: true, type } });
    return true;
  }, []);

  const disconnectHardwareWallet = useCallback(() => {
    dispatch({ type: 'SET_HW_CONNECTED', status: { connected: false, type: null } });
  }, []);

  // ---- Duress PIN configuration ----

  const configureDuressPins = useCallback(
    async (realPin: string, decoyPin?: string, wipePin?: string): Promise<boolean> => {
      dispatch({ type: 'CLEAR_ERROR' });
      try {
        const crypto = cryptoRef.current;
        const realSalt = crypto.randomBytes(32);
        const realHash = await hashPin(crypto, new TextEncoder().encode(realPin), realSalt);

        let decoyHash: Uint8Array | null = null;
        let decoySalt: Uint8Array | null = null;
        if (decoyPin) {
          decoySalt = crypto.randomBytes(32);
          decoyHash = await hashPin(crypto, new TextEncoder().encode(decoyPin), decoySalt);
        }

        let wipeHash: Uint8Array | null = null;
        let wipeSalt: Uint8Array | null = null;
        if (wipePin) {
          wipeSalt = crypto.randomBytes(32);
          wipeHash = await hashPin(crypto, new TextEncoder().encode(wipePin), wipeSalt);
        }

        const stored: StoredPinHashes = {
          realHash,
          realSalt,
          decoyHash,
          decoySalt,
          wipeHash,
          wipeSalt,
        };

        storedPinsRef.current = stored;
        dispatch({ type: 'SET_DURESS_PINS_CONFIGURED', configured: true });
        return true;
      } catch {
        dispatch({ type: 'SET_ERROR', error: 'Failed to configure duress PINs.' });
        return false;
      }
    },
    []
  );

  // ---- Unlock with PIN (duress evaluation) ----

  const unlockWithPin = useCallback(
    async (password: string, pin: string): Promise<boolean> => {
      dispatch({ type: 'CLEAR_ERROR' });

      const stored = storedPinsRef.current;
      if (!stored) {
        // No PINs configured — fall through to normal unlock
        return unlock(password);
      }

      const crypto = cryptoRef.current;
      const pinBytes = new TextEncoder().encode(pin);
      const evaluation = await evaluatePin(crypto, pinBytes, stored, {
        decoyEnabled: state.duress.decoyEnabled,
        wipeEnabled: state.duress.wipeEnabled,
      });

      if (!evaluation.matched) {
        dispatch({ type: 'SET_ERROR', error: 'Invalid PIN.' });
        return false;
      }

      if (evaluation.mode === DuressMode.WIPE) {
        // Forensic wipe — destroy everything and reset
        await wipe();
        return false;
      }

      // Normal or decoy unlock — authenticate with password first
      const pw = new TextEncoder().encode(password);
      try {
        const result = await walletManager.unlock(pw);
        if (!result.ok) {
          dispatch({ type: 'SET_ERROR', error: result.error.message });
          return false;
        }

        if (evaluation.mode === DuressMode.DECOY) {
          // TODO: Derive decoy address from SRP and show decoy balances.
          // For now, unlock normally but with a flag to show limited view.
          const account = walletManager.getPublicAccount();
          if (account) dispatch({ type: 'SET_ADDRESS', address: account.address });
        } else {
          const account = walletManager.getPublicAccount();
          if (account) dispatch({ type: 'SET_ADDRESS', address: account.address });
        }

        dispatch({ type: 'SET_PHASE', phase: 'unlocked' });
        return true;
      } finally {
        pw.fill(0);
      }
    },
    [unlock, wipe, walletManager, state.duress]
  );

  // ---- Proxy → EVM client rebuild ----

  useEffect(() => {
    if (!state.proxy.enabled) {
      // Rebuild client without proxy (reset to direct)
      evmRef.current = initEvmServices({ tracker: evmRef.current?.tracker });
      return;
    }

    const proxyConfig = validateProxyConfig({
      type: state.proxy.type,
      host: state.proxy.host,
      port: state.proxy.port,
    });
    if (!proxyConfig) return;

    const proxyFetch = createProxiedFetch({ proxy: proxyConfig });
    evmRef.current = initEvmServices({
      proxyFetch,
      tracker: evmRef.current?.tracker,
    });
  }, [state.proxy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      const storage = servicesRef.current!.storage;
      const payload = serializeSettings({
        proxy: state.proxy,
        duress: state.duress,
        hardwareWallet: state.hardwareWallet,
        duressPins: encodeDuressPins(storedPinsRef.current),
      });
      await storage.set(PREFS_NS, PREFS_KEY, payload);
    })();
  }, [state.proxy, state.duress, state.hardwareWallet, state.duressPinsConfigured]);

  const value: WalletContextValue = {
    state,
    createWallet,
    importWallet,
    unlock,
    lock,
    changePassword,
    wipe,
    refreshBalances,
    clearPendingSrp,
    getSigningKeyPair,
    addressChecker,
    evmClient,
    txTracker,
    metadataManager,
    privacyAdapter: privacyRef.current?.adapter ?? null,
    vaultTracker: privacyRef.current?.tracker ?? null,
    resyncVault,
    refreshVaultBalances,
    setProxySettings,
    setDuressSettings,
    connectHardwareWallet,
    disconnectHardwareWallet,
    configureDuressPins,
    unlockWithPin,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider');
  return ctx;
}
