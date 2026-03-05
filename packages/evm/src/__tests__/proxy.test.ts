/**
 * Tests for proxy routing utilities in the EVM package.
 *
 * These tests verify:
 * - createProxiedFetch blocks on missing implementation
 * - createProxiedFetch wraps errors correctly
 * - createRpcTransport accepts optional proxyFetch
 */

import { describe, it, expect, vi } from 'vitest';
import { createProxiedFetch, createRpcTransport, type ProxiedFetch } from '../rpc';
import type { ProxyConfig } from '@alphonse/core';
import type { RpcConfig, RpcEndpoint } from '../types/network';
import type { Timestamp } from '@alphonse/core';

const testProxy: ProxyConfig = {
  type: 'SOCKS5',
  host: '127.0.0.1',
  port: 9050,
};

const testEndpoint: RpcEndpoint = {
  url: 'https://rpc.example.com',
  isUserProvided: false,
  status: 'HEALTHY' as const,
  lastCheckedAt: null,
  failureCount: 0,
};

const testRpcConfig: RpcConfig = {
  endpoints: [testEndpoint],
  requestTimeoutMs: 5000,
  maxRetries: 1,
  retryBackoffMs: 500,
};

describe('createProxiedFetch', () => {
  it('should throw when no fetchImpl is provided', () => {
    const proxied = createProxiedFetch({ proxy: testProxy });

    expect(() => proxied(new Request('https://rpc.example.com'))).toThrow(
      /no platform fetch implementation/i
    );
  });

  it('should throw with proxy details in the error when no fetchImpl', () => {
    const proxied = createProxiedFetch({ proxy: testProxy });

    expect(() => proxied(new Request('https://rpc.example.com'))).toThrow(
      'SOCKS5://127.0.0.1:9050'
    );
  });

  it('should delegate to the provided fetchImpl', async () => {
    const mockResponse = new Response('OK', { status: 200 });
    const mockFetch = vi.fn<ProxiedFetch>().mockResolvedValue(mockResponse);

    const proxied = createProxiedFetch({ proxy: testProxy, fetchImpl: mockFetch });
    const result = await proxied('https://rpc.example.com');

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(result).toBe(mockResponse);
  });

  it('should wrap proxy errors with context', async () => {
    const mockFetch = vi.fn<ProxiedFetch>().mockRejectedValue(new Error('Connection refused'));

    const proxied = createProxiedFetch({ proxy: testProxy, fetchImpl: mockFetch });

    await expect(proxied('https://rpc.example.com')).rejects.toThrow(
      /Proxy request failed.*Connection refused/
    );
  });
});

describe('createRpcTransport with proxy', () => {
  it('should accept proxyFetch and return a transport', () => {
    const mockFetch = vi.fn<ProxiedFetch>().mockResolvedValue(new Response('OK'));
    const transport = createRpcTransport(testRpcConfig, mockFetch);

    // viem transports are factory functions
    expect(typeof transport).toBe('function');
  });

  it('should work without proxyFetch (direct routing)', () => {
    const transport = createRpcTransport(testRpcConfig);
    expect(typeof transport).toBe('function');
  });
});
