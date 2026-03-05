/**
 * Blocklist updater — periodically fetch updated blocklist and apply to address checker.
 *
 * Fetches a remote JSON array of hex addresses and merges them into the
 * local address checker's blocklist. Works offline with the last-known list.
 *
 * The remote URL can be configured. If the fetch fails, the app continues
 * with the existing blocklist — no silent failures.
 */

import type { AddressChecker } from '@alphonse/core';
import type { Address } from '@alphonse/core';

/** Default blocklist source — can be overridden. */
const DEFAULT_BLOCKLIST_URL =
  'https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/master/src/config.json';

const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface BlocklistUpdater {
  /** Trigger an immediate update. Returns the number of addresses loaded. */
  update: () => Promise<number>;
  /** Start periodic background updates. */
  start: () => void;
  /** Stop periodic updates. */
  stop: () => void;
}

/**
 * Create a blocklist updater that fetches addresses and feeds them to the checker.
 */
export function createBlocklistUpdater(
  addressChecker: AddressChecker,
  options?: {
    url?: string;
    intervalMs?: number;
  }
): BlocklistUpdater {
  const url = options?.url ?? DEFAULT_BLOCKLIST_URL;
  const intervalMs = options?.intervalMs ?? UPDATE_INTERVAL_MS;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function update(): Promise<number> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch(url, { signal: controller.signal as never });
      clearTimeout(timeoutId);

      if (!response.ok) return 0;

      const data: unknown = await response.json();

      // Support both plain array and MetaMask config format
      let addresses: string[] = [];
      if (Array.isArray(data)) {
        addresses = data.filter(
          (item: unknown): item is string =>
            typeof item === 'string' && /^0x[0-9a-fA-F]{40}$/.test(item)
        );
      } else if (
        data !== null &&
        typeof data === 'object' &&
        'blacklist' in data &&
        Array.isArray((data as { blacklist: unknown }).blacklist)
      ) {
        // MetaMask format: { blacklist: string[] } — may include domains, filter for addresses
        addresses = (data as { blacklist: unknown[] }).blacklist.filter(
          (item: unknown): item is string =>
            typeof item === 'string' && /^0x[0-9a-fA-F]{40}$/.test(item)
        );
      }

      if (addresses.length > 0) {
        addressChecker.updateBlocklist(addresses as Address[]);
      }

      return addresses.length;
    } catch {
      // Offline or network error — continue with existing blocklist
      return 0;
    }
  }

  function start() {
    if (timer) return;
    // Initial fetch
    update();
    timer = setInterval(update, intervalMs);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { update, start, stop };
}
