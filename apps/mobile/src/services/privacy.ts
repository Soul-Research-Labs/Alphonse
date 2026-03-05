/**
 * Privacy service — initializes the Aztec adapter and vault state tracker.
 *
 * Wires together: PXE client, Aztec account, privacy adapter, and state tracker.
 * Call at wallet unlock time with the domain-separated signing key.
 */

import {
  createPxeClient,
  createAztecAccount,
  restoreAztecAccount,
  createAztecAdapter,
  createVaultStateTracker,
} from '@alphonse/privacy';
import type { PrivacyAdapter, VaultStateTracker } from '@alphonse/privacy';
import type { StorageAdapter } from '@alphonse/storage';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default PXE endpoint for development (Aztec sandbox). */
const DEFAULT_PXE_URL = 'http://localhost:8080';

/** Balance polling interval: 30 seconds. */
const VAULT_POLL_INTERVAL_MS = 30_000;

/** Known asset symbols for display. */
const DEFAULT_ASSET_SYMBOLS = new Map<string | null, string>([
  [null, 'ETH'],
  ['', 'ETH'],
]);

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface PrivacyServices {
  readonly adapter: PrivacyAdapter;
  readonly tracker: VaultStateTracker;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize privacy services.
 *
 * @param signingKey  32-byte domain-separated key from SRP (KeyDomain.SIGNING)
 * @param storage     Storage adapter for persisting vault state
 * @param pxeUrl      Optional PXE endpoint URL (defaults to localhost sandbox)
 */
export async function initPrivacyServices(
  signingKey: Uint8Array,
  storage: StorageAdapter,
  pxeUrl?: string
): Promise<PrivacyServices> {
  const pxe = createPxeClient({
    url: pxeUrl ?? DEFAULT_PXE_URL,
    timeoutMs: 30_000,
  });

  // Try to register with PXE; fall back to offline restore if PXE unavailable
  const accountResult = await createAztecAccount({ pxe, signingKey });
  const account = accountResult.ok ? accountResult.value : restoreAztecAccount(signingKey);

  const adapter = createAztecAdapter({
    pxe,
    account,
    assetSymbols: DEFAULT_ASSET_SYMBOLS,
  });

  const tracker = createVaultStateTracker({ adapter, storage });

  // Load previously persisted state (if any)
  await tracker.loadPersistedState();

  return { adapter, tracker };
}

export { VAULT_POLL_INTERVAL_MS };
