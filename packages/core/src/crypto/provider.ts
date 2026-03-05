/**
 * CryptoProvider backed by @noble/@scure.
 * AES-256-GCM · XChaCha20-Poly1305 · HKDF-SHA256 · Argon2id · HMAC-SHA256
 */

import {
  gcm,
  xchacha20poly1305,
  randomBytes as nobleRandomBytes,
  hkdf,
  hmac as nobleHmac,
  sha256,
  argon2id,
} from './deps';
import { toBase64, fromBase64 } from './encoding';

import type { CipherAlgorithm, CryptoProvider, EncryptedPayload, KdfParams } from '../types/crypto';

const ENVELOPE_VERSION = 1;
const AES_GCM_IV_LEN = 12;
const XCHACHA_NONCE_LEN = 24;
const TAG_LEN = 16;

function makeCipher(algorithm: CipherAlgorithm, key: Uint8Array, nonce: Uint8Array) {
  if (algorithm === 'aes-256-gcm') return gcm(key, nonce);
  if (algorithm === 'xchacha20-poly1305') return xchacha20poly1305(key, nonce);
  throw new Error(`Unsupported cipher: ${algorithm as string}`);
}

function nonceLength(algorithm: CipherAlgorithm): number {
  return algorithm === 'aes-256-gcm' ? AES_GCM_IV_LEN : XCHACHA_NONCE_LEN;
}

function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  algorithm: CipherAlgorithm
): EncryptedPayload {
  const nonce = nobleRandomBytes(nonceLength(algorithm));
  const sealed = makeCipher(algorithm, key, nonce).encrypt(plaintext);
  // Both AES-GCM and XChaCha20-Poly1305 append a 16-byte tag
  const ct = sealed.subarray(0, sealed.length - TAG_LEN);
  const tag = sealed.subarray(sealed.length - TAG_LEN);

  return {
    algorithm,
    iv: toBase64(nonce),
    ciphertext: toBase64(ct),
    tag: toBase64(tag),
    version: ENVELOPE_VERSION,
  };
}

function decrypt(payload: EncryptedPayload, key: Uint8Array): Uint8Array {
  const iv = fromBase64(payload.iv);
  const ct = fromBase64(payload.ciphertext);
  const tag = fromBase64(payload.tag);

  const sealed = new Uint8Array(ct.length + tag.length);
  sealed.set(ct, 0);
  sealed.set(tag, ct.length);

  return makeCipher(payload.algorithm, key, iv).decrypt(sealed);
}

async function deriveKey(input: Uint8Array, params: KdfParams, len: number): Promise<Uint8Array> {
  if (params.algorithm === 'hkdf-sha256') {
    return hkdf(sha256, input, fromBase64(params.salt), new TextEncoder().encode(params.info), len);
  }
  if (params.algorithm === 'argon2id') {
    return argon2id(input, fromBase64(params.salt), {
      t: params.timeCost,
      m: params.memoryCost,
      p: params.parallelism,
      dkLen: len,
    });
  }
  throw new Error(`Unsupported KDF: ${(params as { algorithm: string }).algorithm}`);
}

/** Create a CryptoProvider backed by @noble/@scure. */
export function createCryptoProvider(): CryptoProvider {
  return {
    encrypt: async (pt, key, alg) => encrypt(pt, key, alg),
    decrypt: async (payload, key) => decrypt(payload, key),
    deriveKey,
    randomBytes: nobleRandomBytes,
    hmac: async (key, data) => nobleHmac(sha256, key, data),
  };
}
