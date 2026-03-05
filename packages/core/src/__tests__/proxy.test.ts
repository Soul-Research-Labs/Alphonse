import { describe, it, expect } from 'vitest';
import {
  validateProxyConfig,
  proxyConfigToUrl,
  createDefaultRoutingState,
  type ProxyConfig,
} from '../network/proxy';

describe('Proxy configuration', () => {
  // -----------------------------------------------------------------------
  // validateProxyConfig
  // -----------------------------------------------------------------------

  describe('validateProxyConfig', () => {
    it('should accept a valid SOCKS5 config', () => {
      const cfg: ProxyConfig = { type: 'SOCKS5', host: '127.0.0.1', port: 9050 };
      const result = validateProxyConfig(cfg);
      expect(result).toEqual({ type: 'SOCKS5', host: '127.0.0.1', port: 9050 });
    });

    it('should accept a valid HTTP config with auth', () => {
      const cfg: ProxyConfig = {
        type: 'HTTP',
        host: 'proxy.example.com',
        port: 8080,
        auth: { username: 'user', password: 'pass' },
      };
      const result = validateProxyConfig(cfg);
      expect(result).not.toBeNull();
      expect(result!.auth).toEqual({ username: 'user', password: 'pass' });
    });

    it('should accept localhost', () => {
      const cfg: ProxyConfig = { type: 'SOCKS5', host: 'localhost', port: 9050 };
      expect(validateProxyConfig(cfg)).not.toBeNull();
    });

    it('should accept a .onion address (56 char base32)', () => {
      // Valid v3 onion address (56 base32 characters + .onion)
      const onion = 'a'.repeat(56) + '.onion';
      const cfg: ProxyConfig = { type: 'SOCKS5', host: onion, port: 80 };
      expect(validateProxyConfig(cfg)).not.toBeNull();
    });

    it('should normalise host to lowercase', () => {
      const cfg: ProxyConfig = { type: 'HTTP', host: 'Proxy.Example.COM', port: 3128 };
      const result = validateProxyConfig(cfg);
      expect(result!.host).toBe('proxy.example.com');
    });

    it('should reject empty host', () => {
      const cfg: ProxyConfig = { type: 'SOCKS5', host: '', port: 9050 };
      expect(validateProxyConfig(cfg)).toBeNull();
    });

    it('should reject whitespace-only host', () => {
      const cfg: ProxyConfig = { type: 'SOCKS5', host: '   ', port: 9050 };
      expect(validateProxyConfig(cfg)).toBeNull();
    });

    it('should reject IP with octet > 255', () => {
      const cfg: ProxyConfig = { type: 'SOCKS5', host: '999.0.0.1', port: 9050 };
      expect(validateProxyConfig(cfg)).toBeNull();
    });

    it('should reject port 0', () => {
      const cfg: ProxyConfig = { type: 'SOCKS5', host: '127.0.0.1', port: 0 };
      expect(validateProxyConfig(cfg)).toBeNull();
    });

    it('should reject port above 65535', () => {
      const cfg: ProxyConfig = { type: 'SOCKS5', host: '127.0.0.1', port: 70000 };
      expect(validateProxyConfig(cfg)).toBeNull();
    });

    it('should reject non-integer port', () => {
      const cfg: ProxyConfig = { type: 'SOCKS5', host: '127.0.0.1', port: 3.14 };
      expect(validateProxyConfig(cfg)).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // proxyConfigToUrl
  // -----------------------------------------------------------------------

  describe('proxyConfigToUrl', () => {
    it('should produce socks5:// URL for SOCKS5', () => {
      const cfg: ProxyConfig = { type: 'SOCKS5', host: '127.0.0.1', port: 9050 };
      expect(proxyConfigToUrl(cfg)).toBe('socks5://127.0.0.1:9050');
    });

    it('should produce http:// URL for HTTP', () => {
      const cfg: ProxyConfig = { type: 'HTTP', host: 'proxy.local', port: 8080 };
      expect(proxyConfigToUrl(cfg)).toBe('http://proxy.local:8080');
    });

    it('should include auth credentials in URL', () => {
      const cfg: ProxyConfig = {
        type: 'SOCKS5',
        host: 'tor.local',
        port: 9050,
        auth: { username: 'user', password: 'secret' },
      };
      expect(proxyConfigToUrl(cfg)).toBe('socks5://user:secret@tor.local:9050');
    });
  });

  // -----------------------------------------------------------------------
  // createDefaultRoutingState
  // -----------------------------------------------------------------------

  describe('createDefaultRoutingState', () => {
    it('should return disabled direct state', () => {
      const state = createDefaultRoutingState();
      expect(state.enabled).toBe(false);
      expect(state.config).toBeNull();
      expect(state.status).toBe('DIRECT');
    });
  });
});
