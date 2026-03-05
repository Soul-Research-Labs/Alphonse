/** In-memory StorageAdapter for testing. Data does not survive restarts. */

import { Result } from '@alphonse/core';
import type { StorageAdapter, StorageNamespace } from '../types/adapter';

export function createInMemoryStorageAdapter(): StorageAdapter {
  const store = new Map<string, Map<string, Uint8Array>>();

  function ns(namespace: StorageNamespace): Map<string, Uint8Array> {
    let map = store.get(namespace);
    if (!map) {
      map = new Map();
      store.set(namespace, map);
    }
    return map;
  }

  return {
    async get(namespace, key) {
      try {
        const v = ns(namespace).get(key) ?? null;
        return Result.ok(v ? new Uint8Array(v) : null);
      } catch (cause) {
        return Result.err({
          code: 'STORAGE_READ_FAILED' as const,
          message: `Read failed: ${namespace}/${key}`,
          cause,
        });
      }
    },

    async set(namespace, key, value) {
      try {
        ns(namespace).set(key, new Uint8Array(value));
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({
          code: 'STORAGE_WRITE_FAILED' as const,
          message: `Write failed: ${namespace}/${key}`,
          cause,
        });
      }
    },

    async delete(namespace, key) {
      try {
        ns(namespace).delete(key);
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({
          code: 'STORAGE_WRITE_FAILED' as const,
          message: `Delete failed: ${namespace}/${key}`,
          cause,
        });
      }
    },

    async keys(namespace) {
      try {
        return Result.ok(Array.from(ns(namespace).keys()));
      } catch (cause) {
        return Result.err({
          code: 'STORAGE_READ_FAILED' as const,
          message: `Keys failed: ${namespace}`,
          cause,
        });
      }
    },

    async has(namespace, key) {
      try {
        return Result.ok(ns(namespace).has(key));
      } catch (cause) {
        return Result.err({
          code: 'STORAGE_READ_FAILED' as const,
          message: `Has failed: ${namespace}/${key}`,
          cause,
        });
      }
    },

    async clear(namespace) {
      try {
        const map = store.get(namespace);
        if (map) {
          for (const v of map.values()) v.fill(0);
          map.clear();
        }
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({
          code: 'STORAGE_WRITE_FAILED' as const,
          message: `Clear failed: ${namespace}`,
          cause,
        });
      }
    },

    async clearAll() {
      try {
        for (const [, map] of store) {
          for (const v of map.values()) v.fill(0);
          map.clear();
        }
        store.clear();
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({
          code: 'STORAGE_WRITE_FAILED' as const,
          message: 'Clear all failed.',
          cause,
        });
      }
    },
  };
}
