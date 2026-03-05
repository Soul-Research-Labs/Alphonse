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
import type { ReactNode } from 'react';
import type { AddressChecker } from '@alphonse/core';
import type { Address, SRP } from '@alphonse/core';
import type { EvmClient, TransactionTracker, TokenBalance } from '@alphonse/evm';
import { KNOWN_TOKENS } from '@alphonse/evm';
import { createSecureStorageAdapter } from '../services/storage';
import { initWalletServices } from '../services/wallet';
import { initEvmServices } from '../services/evm';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type AppPhase = 'loading' | 'onboarding' | 'locked' | 'unlocked';

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
}

const initialState: WalletState = {
  phase: 'loading',
  address: null,
  balanceWei: null,
  balanceFormatted: null,
  tokenBalances: [],
  error: null,
  pendingSrp: null,
};

type Action =
  | { type: 'SET_PHASE'; phase: AppPhase }
  | { type: 'SET_ADDRESS'; address: Address }
  | { type: 'SET_BALANCE'; wei: bigint; formatted: string; tokens: TokenBalance[] }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_PENDING_SRP'; srp: SRP }
  | { type: 'CLEAR_PENDING_SRP' }
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
}

const WalletContext = createContext<WalletContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const servicesRef = useRef<ReturnType<typeof initWalletServices> | null>(null);
  const evmRef = useRef<ReturnType<typeof initEvmServices> | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize services once
  if (!servicesRef.current) {
    const storage = createSecureStorageAdapter();
    servicesRef.current = initWalletServices(storage);
  }
  if (!evmRef.current) {
    evmRef.current = initEvmServices();
  }

  const { walletManager, addressChecker } = servicesRef.current;
  const { client: evmClient, tracker: txTracker } = evmRef.current;

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

  // Balance polling when unlocked
  useEffect(() => {
    if (state.phase === 'unlocked') {
      refreshBalances();
      pollingRef.current = setInterval(refreshBalances, 15_000);
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [state.phase, refreshBalances]);

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
