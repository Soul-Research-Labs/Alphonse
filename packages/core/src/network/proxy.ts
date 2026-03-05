/**
 * Network privacy routing configuration.
 *
 * All privacy routing is **opt-in**. Default is direct connection.
 * When enabled, failure must **block and notify** — never silently
 * fall back to direct. User must always know their current routing state.
 *
 * v1: Generic SOCKS5/HTTP proxy toggle (covers Tor/Orbot, NymVPN, SSH tunnels).
 * Future: Built-in Nym mixnet via @nymproject/sdk.
 */

import type { Brand } from '../types/common';

// ---------------------------------------------------------------------------
// Proxy configuration
// ---------------------------------------------------------------------------

export const ProxyType = {
  SOCKS5: 'SOCKS5',
  HTTP: 'HTTP',
} as const;

export type ProxyType = (typeof ProxyType)[keyof typeof ProxyType];

export interface ProxyAuth {
  readonly username: string;
  readonly password: string;
}

export interface ProxyConfig {
  readonly type: ProxyType;
  readonly host: string;
  readonly port: number;
  readonly auth?: ProxyAuth;
}

// ---------------------------------------------------------------------------
// Routing state
// ---------------------------------------------------------------------------

export const RoutingStatus = {
  DIRECT: 'DIRECT',
  PROXY_CONNECTED: 'PROXY_CONNECTED',
  PROXY_ERROR: 'PROXY_ERROR',
} as const;

export type RoutingStatus = (typeof RoutingStatus)[keyof typeof RoutingStatus];

export interface ProxyRoutingState {
  readonly enabled: boolean;
  readonly config: ProxyConfig | null;
  readonly status: RoutingStatus;
  readonly lastError?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const HOSTNAME_REGEX =
  /^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*$/;
const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const ONION_REGEX = /^[a-zA-Z2-7]{56}\.onion$/;

/**
 * Validate and sanitize a proxy configuration.
 * Returns null if invalid.
 */
export function validateProxyConfig(config: ProxyConfig): ProxyConfig | null {
  const host = config.host.trim().toLowerCase();

  // Validate host
  if (!host) return null;
  if (!HOSTNAME_REGEX.test(host) && !IP_REGEX.test(host) && !ONION_REGEX.test(host)) {
    // Allow localhost
    if (host !== 'localhost') return null;
  }

  // Validate IP octets if IP address
  if (IP_REGEX.test(host)) {
    const octets = host.split('.').map(Number);
    if (octets.some((o) => o > 255)) return null;
  }

  // Validate port
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) return null;

  return {
    type: config.type,
    host,
    port: config.port,
    auth: config.auth,
  };
}

/**
 * Create a proxy URL string from config (for HTTP transports).
 * Format: socks5://[user:pass@]host:port or http://[user:pass@]host:port
 */
export function proxyConfigToUrl(config: ProxyConfig): string {
  const scheme = config.type === 'SOCKS5' ? 'socks5' : 'http';
  const auth = config.auth ? `${config.auth.username}:${config.auth.password}@` : '';
  return `${scheme}://${auth}${config.host}:${config.port}`;
}

/**
 * Create a default proxy routing state (disabled).
 */
export function createDefaultRoutingState(): ProxyRoutingState {
  return {
    enabled: false,
    config: null,
    status: 'DIRECT',
  };
}
