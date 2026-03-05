/**
 * RPC transport creation with fallback rotation and optional proxy routing.
 *
 * Uses viem's fallback + http transports to automatically rotate
 * between endpoints on failure/rate-limiting.
 *
 * When proxy is enabled, all RPC traffic is routed through the configured
 * SOCKS5 or HTTP proxy. On proxy failure the transport **throws** — it
 * never falls back silently to a direct connection.
 */

import { http, fallback, type Transport } from 'viem';
import type { RpcConfig, RpcEndpoint } from './types/network';
import type { ProxyConfig } from '@alphonse/core';

// ---------------------------------------------------------------------------
// Proxy-aware fetch
// ---------------------------------------------------------------------------

/**
 * A fetch function that routes through a proxy.
 *
 * This is designed to be pluggable — consumers provide the actual proxy
 * `fetch` implementation at creation time (e.g. from a `socks-proxy-agent`
 * or HTTP CONNECT wrapper). The factory validates that the proxy is
 * reachable and wraps every call with error handling that blocks (throws)
 * on failure instead of falling back to direct.
 */
export type ProxiedFetch = typeof globalThis.fetch;

export interface CreateProxiedFetchOptions {
  /** Proxy configuration. */
  proxy: ProxyConfig;
  /**
   * Platform-specific fetch implementation that routes through the proxy.
   * If not provided the transport will throw, guaranteeing no direct leak.
   */
  fetchImpl?: ProxiedFetch;
}

/**
 * Create a fetch wrapper that enforces proxy routing.
 *
 * If no `fetchImpl` is supplied, every request will throw — this is
 * intentional: the proxy adapter must be provided by the platform layer.
 * Failure is always loud.
 */
export function createProxiedFetch(options: CreateProxiedFetchOptions): ProxiedFetch {
  const { proxy, fetchImpl } = options;

  if (!fetchImpl) {
    return (() => {
      throw new Error(
        `Proxy routing enabled (${proxy.type}://${proxy.host}:${proxy.port}) ` +
          'but no platform fetch implementation was provided. ' +
          'Install a SOCKS5/HTTP proxy adapter for your platform.'
      );
    }) as unknown as ProxiedFetch;
  }

  // Wrap the implementation so proxy errors are surfaced, never swallowed
  const proxiedFetch: ProxiedFetch = async (input, init) => {
    try {
      return await fetchImpl(input, init);
    } catch (cause) {
      throw new Error(
        `Proxy request failed (${proxy.type}://${proxy.host}:${proxy.port}): ${String(cause)}`,
        { cause }
      );
    }
  };

  return proxiedFetch;
}

// ---------------------------------------------------------------------------
// Transport factory
// ---------------------------------------------------------------------------

export interface CreateRpcTransportOptions {
  config: RpcConfig;
  /**
   * Optional proxy-aware fetch. When provided, all RPC requests will
   * be routed through the proxy. Obtain via `createProxiedFetch()`.
   */
  proxyFetch?: ProxiedFetch;
}

/**
 * Create a viem Transport with automatic fallback rotation.
 *
 * Endpoints are tried in order. On failure, the next endpoint is used.
 * This implements the rotation requirement from AGENTS.md.
 */
export function createRpcTransport(config: RpcConfig, proxyFetch?: ProxiedFetch): Transport {
  const transports = config.endpoints.map((ep: RpcEndpoint) =>
    http(ep.url, {
      timeout: config.requestTimeoutMs,
      retryCount: config.maxRetries,
      retryDelay: config.retryBackoffMs,
      ...(proxyFetch ? { fetchFn: proxyFetch } : {}),
    })
  );

  return fallback(transports, { rank: true });
}

/** Default RPC config values. */
export const DEFAULT_RPC_CONFIG = {
  requestTimeoutMs: 15_000,
  maxRetries: 2,
  retryBackoffMs: 1_000,
} as const;
