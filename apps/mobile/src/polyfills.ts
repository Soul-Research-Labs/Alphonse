/**
 * Runtime polyfills for React Native / Hermes.
 *
 * Must be imported BEFORE any @noble/@scure libraries are loaded,
 * since they check for `globalThis.crypto.getRandomValues` at import time.
 */

import { getRandomValues } from 'expo-crypto';

// Polyfill globalThis.crypto.getRandomValues (required by @noble/ciphers, @noble/hashes, @scure/bip39)
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = {};
}
if (typeof globalThis.crypto.getRandomValues !== 'function') {
  globalThis.crypto.getRandomValues = getRandomValues as typeof globalThis.crypto.getRandomValues;
}
