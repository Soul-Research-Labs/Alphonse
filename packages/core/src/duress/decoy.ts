/**
 * Decoy wallet derivation.
 *
 * The decoy wallet uses the same SRP but a different derivation path
 * (account index 1 instead of 0). When the decoy PIN is entered,
 * the app unlocks with this alternate identity.
 *
 * The real vault data remains encrypted and inaccessible — the decoy
 * never sees or touches the real vault key.
 */

import { HDKey, secp256k1, keccak_256 } from '../crypto/deps';
import { toHex } from '../crypto/encoding';
import type { Address } from '../types/common';
import type { SRP } from '../types/wallet';
import type { SrpManager } from '../crypto/srp';
import { DECOY_ETH_PATH } from './types';

export interface DecoyKeyPair {
  readonly privateKey: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly address: Address;
  readonly derivationPath: string;
}

/**
 * Derive the decoy signing key pair from the same SRP.
 *
 * Uses m/44'/60'/1'/0/0 (account index 1) instead of the real
 * wallet's m/44'/60'/0'/0/0 (account index 0).
 */
export function deriveDecoyKeyPair(srpManager: SrpManager, srp: SRP): DecoyKeyPair {
  const seed = srpManager.toSeed(srp);
  try {
    const derived = HDKey.fromMasterSeed(seed).derive(DECOY_ETH_PATH);
    if (!derived.privateKey || !derived.publicKey) {
      throw new Error('Failed to derive decoy key pair');
    }

    return {
      privateKey: new Uint8Array(derived.privateKey),
      publicKey: new Uint8Array(derived.publicKey),
      address: publicKeyToAddress(derived.publicKey),
      derivationPath: DECOY_ETH_PATH,
    };
  } finally {
    seed.fill(0);
  }
}

function publicKeyToAddress(compressedPubKey: Uint8Array): Address {
  const point = secp256k1.Point.fromHex(toHex(compressedPubKey));
  const uncompressed = point.toBytes(false); // 65 bytes: 04 || X || Y
  const hash = keccak_256(uncompressed.subarray(1));
  return `0x${toHex(hash.subarray(12))}` as Address;
}
