/**
 * Ledger hardware wallet signer.
 *
 * Implements HWSigner using Ledger's Ethereum app APDU protocol.
 * Transaction signing requires user approval on the Ledger device screen.
 * Keys NEVER leave the device.
 *
 * Transport is injected — this module does not depend on platform-specific
 * BLE/USB libraries. The mobile app provides the concrete transport.
 */

import { Result } from '@alphonse/core';
import type { Address } from '@alphonse/core';

import type {
  ConnectionStatus,
  DeviceId,
  DeviceInfo,
  HWSigner,
  HWSignerConfig,
  HWTransport,
} from './types';
import { DEFAULT_ETH_PATH, DEFAULT_HW_TIMEOUT_MS } from './types';

// ---------------------------------------------------------------------------
// Ledger Ethereum App APDU constants
// ---------------------------------------------------------------------------

/** Ledger Ethereum app CLA byte. */
const ETH_CLA = 0xe0;

/** INS codes for Ledger Ethereum app. */
const INS = {
  GET_PUBLIC_KEY: 0x02,
  SIGN_TRANSACTION: 0x04,
  GET_APP_CONFIGURATION: 0x06,
  SIGN_PERSONAL_MESSAGE: 0x08,
  SIGN_EIP712_MESSAGE: 0x0c,
} as const;

/** Status words. */
const SW = {
  OK: 0x9000,
  USER_REJECTED: 0x6985,
  APP_NOT_OPEN: 0x6d00,
  WRONG_LENGTH: 0x6700,
} as const;

// ---------------------------------------------------------------------------
// APDU helpers
// ---------------------------------------------------------------------------

function buildApdu(
  cla: number,
  ins: number,
  p1: number,
  p2: number,
  data?: Uint8Array
): Uint8Array {
  const dataLen = data?.length ?? 0;
  const buf = new Uint8Array(5 + dataLen);
  buf[0] = cla;
  buf[1] = ins;
  buf[2] = p1;
  buf[3] = p2;
  buf[4] = dataLen;
  if (data) buf.set(data, 5);
  return buf;
}

function encodePath(path: string): Uint8Array {
  const parts = path
    .split('/')
    .filter((p) => p !== 'm')
    .map((p) => {
      const hardened = p.endsWith("'");
      const num = parseInt(hardened ? p.slice(0, -1) : p, 10);
      return hardened ? (num | 0x80000000) >>> 0 : num;
    });

  const buf = new Uint8Array(1 + parts.length * 4);
  buf[0] = parts.length;
  for (let i = 0; i < parts.length; i++) {
    const offset = 1 + i * 4;
    buf[offset] = (parts[i] >> 24) & 0xff;
    buf[offset + 1] = (parts[i] >> 16) & 0xff;
    buf[offset + 2] = (parts[i] >> 8) & 0xff;
    buf[offset + 3] = parts[i] & 0xff;
  }
  return buf;
}

function getStatusWord(response: Uint8Array): number {
  if (response.length < 2) return 0;
  return (response[response.length - 2] << 8) | response[response.length - 1];
}

function stripStatusWord(response: Uint8Array): Uint8Array {
  return response.subarray(0, response.length - 2);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Ledger hardware wallet signer.
 *
 * The transport must be provided by the platform (mobile: BLE, desktop: USB/HID).
 * Keys never leave the Ledger device.
 */
export function createLedgerSigner(config: HWSignerConfig): HWSigner {
  const path = config.derivationPath ?? DEFAULT_ETH_PATH;
  const timeoutMs = config.timeoutMs ?? DEFAULT_HW_TIMEOUT_MS;
  const transport = config.transport;

  let currentStatus: ConnectionStatus = 'DISCONNECTED';
  let resolvedAddress: Address | null = null;

  const device: DeviceInfo = {
    id: 'ledger-pending' as DeviceId,
    type: 'LEDGER',
    name: 'Ledger',
  };

  async function withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Ledger operation timed out')), timeoutMs)
      ),
    ]);
  }

  async function exchangeApdu(
    ins: number,
    p1: number,
    p2: number,
    data?: Uint8Array
  ): Promise<Uint8Array> {
    const apdu = buildApdu(ETH_CLA, ins, p1, p2, data);
    const response = await withTimeout(transport.exchange(apdu));
    const sw = getStatusWord(response);

    if (sw === SW.USER_REJECTED) {
      throw new Error('User rejected on device');
    }
    if (sw === SW.APP_NOT_OPEN) {
      throw new Error('Ethereum app not open on Ledger');
    }
    if (sw !== SW.OK) {
      throw new Error(`Ledger error: 0x${sw.toString(16)}`);
    }

    return stripStatusWord(response);
  }

  async function connect(): Promise<void> {
    currentStatus = 'CONNECTING';
    try {
      await withTimeout(transport.open());
      // Verify Ethereum app is open by requesting config
      await exchangeApdu(INS.GET_APP_CONFIGURATION, 0x00, 0x00);
      currentStatus = 'CONNECTED';
    } catch (e) {
      currentStatus = 'ERROR';
      throw e;
    }
  }

  async function disconnect(): Promise<void> {
    try {
      await transport.close();
    } finally {
      currentStatus = 'DISCONNECTED';
      resolvedAddress = null;
    }
  }

  async function getAddressWithVerification(derivationPath: string): Promise<Address> {
    const pathData = encodePath(derivationPath);
    // p1=0x01 means display on device for verification
    const response = await exchangeApdu(INS.GET_PUBLIC_KEY, 0x01, 0x00, pathData);
    return parseAddressResponse(response);
  }

  /**
   * Get address without on-device verification (for internal use).
   * Used during sign() to resolve the signer address if not yet cached.
   */
  async function getAddress(derivationPath: string): Promise<Address> {
    const pathData = encodePath(derivationPath);
    // p1=0x00 means no display
    const response = await exchangeApdu(INS.GET_PUBLIC_KEY, 0x00, 0x00, pathData);
    return parseAddressResponse(response);
  }

  function parseAddressResponse(response: Uint8Array): Address {
    // Response format: pubKeyLen(1) || pubKey(pubKeyLen) || addrLen(1) || addr(addrLen)
    const pubKeyLen = response[0];
    const addrOffset = 1 + pubKeyLen;
    const addrLen = response[addrOffset];
    const addrBytes = response.subarray(addrOffset + 1, addrOffset + 1 + addrLen);
    const addr = new TextDecoder().decode(addrBytes);
    return `0x${addr}` as Address;
  }

  /**
   * Sign a 32-byte transaction hash on the Ledger device.
   *
   * The user must physically approve on the device screen.
   * The hash is the keccak256 of the unsigned serialized EIP-1559 tx.
   *
   * Note: Ledger Ethereum app signs full RLP-encoded transactions,
   * not just hashes. For the initial implementation we send the hash
   * as the payload and the device signs it. In production this would
   * need the full serialized unsigned tx for proper on-device display.
   */
  async function sign(hash: Uint8Array): Promise<{ r: bigint; s: bigint; yParity: number }> {
    if (currentStatus !== 'CONNECTED') {
      throw new Error('Ledger not connected');
    }

    // Build payload: path + hash
    const pathData = encodePath(path);
    const payload = new Uint8Array(pathData.length + hash.length);
    payload.set(pathData, 0);
    payload.set(hash, pathData.length);

    // Send sign transaction command (P1=0x00 for first and only chunk)
    const response = await exchangeApdu(INS.SIGN_TRANSACTION, 0x00, 0x00, payload);

    // Response: v(1) || r(32) || s(32)
    const v = response[0];
    const rBytes = response.subarray(1, 33);
    const sBytes = response.subarray(33, 65);

    const r = BigInt('0x' + Buffer.from(rBytes).toString('hex'));
    const s = BigInt('0x' + Buffer.from(sBytes).toString('hex'));

    // Convert v to yParity (EIP-1559): v is 0 or 1 directly, or legacy 27/28
    const yParity = v >= 27 ? v - 27 : v;

    return { r, s, yParity };
  }

  // Resolve address lazily
  const signer: HWSigner = {
    get address(): Address {
      return resolvedAddress ?? ('' as Address);
    },
    get status(): ConnectionStatus {
      return currentStatus;
    },
    device,
    sign,
    connect,
    disconnect,
    getAddressWithVerification,
  };

  // Override address getter to resolve lazily on first sign
  const originalSign = signer.sign;
  signer.sign = async (hash: Uint8Array) => {
    if (!resolvedAddress) {
      resolvedAddress = await getAddress(path);
    }
    return originalSign(hash);
  };

  return signer;
}
