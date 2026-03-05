/**
 * Domain-separated key derivation from SRP.
 *
 * SRP → BIP-39 seed → HKDF(domain) → independent keys.
 * Domains: SIGNING (BIP-32/44), VAULT_STORE, SYNC, PAIRING.
 * Keys are one-way from SRP and cannot derive each other.
 */

import { HDKey, sha256, keccak_256, secp256k1 } from './deps';
import { toBase64, toHex } from './encoding';

import type { CryptoProvider, KdfParams, KeyDomain } from '../types/crypto';
import type { VaultKey, DeviceUnlockKey } from '../types/auth';
import type { Address } from '../types/common';
import type { SRP } from '../types/wallet';
import type { SrpManager } from './srp';

const KEY_LEN = 32;
const ETH_PATH = "m/44'/60'/0'/0/0";
const WALLET_ID_INFO = new TextEncoder().encode('alphonse.wallet_id.v1');

const DOMAIN_INFO: Record<KeyDomain, string> = {
  SIGNING: 'alphonse.signing.v1',
  VAULT_STORE: 'alphonse.vault_store.v1',
  SYNC: 'alphonse.sync.v1',
  PAIRING: 'alphonse.pairing.v1',
};

export const DEFAULT_ARGON2_PARAMS = {
  memoryCost: 2048,
  timeCost: 2,
  parallelism: 1,
} as const;

export interface KeyDerivation {
  deriveVaultKey: (srp: SRP) => Promise<VaultKey>;
  deriveDeviceUnlockKey: (password: Uint8Array, salt: Uint8Array) => Promise<DeviceUnlockKey>;
  deriveSigningKeyPair: (srp: SRP) => SigningKeyPair;
  deriveDomainKey: (srp: SRP, domain: KeyDomain) => Promise<Uint8Array>;
  deriveWalletId: (srp: SRP) => string;
  generateUnlockKdfParams: () => KdfParams;
}

export interface SigningKeyPair {
  readonly privateKey: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly address: Address;
  readonly derivationPath: string;
}

function publicKeyToAddress(compressedPubKey: Uint8Array): Address {
  const point = secp256k1.Point.fromHex(toHex(compressedPubKey));
  const uncompressed = point.toBytes(false); // 65 bytes: 04 || X || Y
  const hash = keccak_256(uncompressed.subarray(1));
  return `0x${toHex(hash.subarray(12))}` as Address;
}

export function createKeyDerivation(crypto: CryptoProvider, srpManager: SrpManager): KeyDerivation {
  async function deriveDomainKey(srp: SRP, domain: KeyDomain): Promise<Uint8Array> {
    const seed = srpManager.toSeed(srp);
    const params: KdfParams = {
      algorithm: 'hkdf-sha256',
      salt: toBase64(new TextEncoder().encode(`alphonse.salt.${domain}`)),
      info: DOMAIN_INFO[domain],
    };
    try {
      return await crypto.deriveKey(seed, params, KEY_LEN);
    } finally {
      seed.fill(0);
    }
  }

  async function deriveVaultKey(srp: SRP): Promise<VaultKey> {
    return (await deriveDomainKey(srp, 'VAULT_STORE')) as unknown as VaultKey;
  }

  async function deriveDeviceUnlockKey(
    password: Uint8Array,
    salt: Uint8Array
  ): Promise<DeviceUnlockKey> {
    const params: KdfParams = {
      algorithm: 'argon2id',
      salt: toBase64(salt),
      ...DEFAULT_ARGON2_PARAMS,
    };
    return (await crypto.deriveKey(password, params, KEY_LEN)) as unknown as DeviceUnlockKey;
  }

  function deriveSigningKeyPair(srp: SRP): SigningKeyPair {
    const seed = srpManager.toSeed(srp);
    try {
      const derived = HDKey.fromMasterSeed(seed).derive(ETH_PATH);
      if (!derived.privateKey || !derived.publicKey) {
        throw new Error('Failed to derive signing key pair');
      }
      return {
        privateKey: new Uint8Array(derived.privateKey),
        publicKey: new Uint8Array(derived.publicKey),
        address: publicKeyToAddress(derived.publicKey),
        derivationPath: ETH_PATH,
      };
    } finally {
      seed.fill(0);
    }
  }

  function deriveWalletId(srp: SRP): string {
    const seed = srpManager.toSeed(srp);
    try {
      const buf = new Uint8Array(seed.length + WALLET_ID_INFO.length);
      buf.set(seed, 0);
      buf.set(WALLET_ID_INFO, seed.length);
      return toHex(sha256(buf).subarray(0, 16));
    } finally {
      seed.fill(0);
    }
  }

  function generateUnlockKdfParams(): KdfParams {
    return {
      algorithm: 'argon2id',
      salt: toBase64(crypto.randomBytes(32)),
      ...DEFAULT_ARGON2_PARAMS,
    };
  }

  return {
    deriveVaultKey,
    deriveDeviceUnlockKey,
    deriveSigningKeyPair,
    deriveDomainKey,
    deriveWalletId,
    generateUnlockKdfParams,
  };
}
