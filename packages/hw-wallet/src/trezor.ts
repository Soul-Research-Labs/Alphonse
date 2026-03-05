/**
 * Trezor hardware wallet signer.
 *
 * Implements HWSigner using the Trezor Connect bridge protocol.
 * Transaction signing requires user approval on the Trezor device screen.
 * Keys NEVER leave the device. Keys are never imported or exported.
 *
 * Transport is injected — this module wraps the transport abstraction
 * to communicate with Trezor Connect. The mobile/desktop app provides
 * the concrete bridge connection.
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
// Trezor Connect message types (simplified protocol)
// ---------------------------------------------------------------------------

/** Message type identifiers for Trezor wire protocol. */
const MSG_TYPE = {
  INITIALIZE: 0x00,
  FEATURES: 0x11,
  ETHEREUM_GET_ADDRESS: 0x38,
  ETHEREUM_ADDRESS: 0x3a,
  ETHEREUM_SIGN_TX: 0x3c,
  ETHEREUM_TX_REQUEST: 0x3d,
  BUTTON_REQUEST: 0x1a,
  BUTTON_ACK: 0x1b,
  FAILURE: 0x03,
} as const;

// ---------------------------------------------------------------------------
// Protocol helpers
// ---------------------------------------------------------------------------

function encodeMessage(type: number, data: Uint8Array = new Uint8Array(0)): Uint8Array {
  // Trezor wire format: ## (2 bytes magic) + type (2) + length (4) + data
  const buf = new Uint8Array(8 + data.length);
  buf[0] = 0x23; // '#'
  buf[1] = 0x23; // '#'
  buf[2] = (type >> 8) & 0xff;
  buf[3] = type & 0xff;
  buf[4] = (data.length >> 24) & 0xff;
  buf[5] = (data.length >> 16) & 0xff;
  buf[6] = (data.length >> 8) & 0xff;
  buf[7] = data.length & 0xff;
  buf.set(data, 8);
  return buf;
}

function decodeMessage(raw: Uint8Array): { type: number; data: Uint8Array } {
  const type = (raw[2] << 8) | raw[3];
  const length = (raw[4] << 24) | (raw[5] << 16) | (raw[6] << 8) | raw[7];
  const data = raw.subarray(8, 8 + length);
  return { type, data };
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

  // Simple encoding: count (1 byte) + each part as 4 bytes big-endian
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

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Trezor hardware wallet signer.
 *
 * The transport must be provided by the platform.
 * Keys never leave the Trezor device.
 * Never imports or exports keys to/from the device.
 */
export function createTrezorSigner(config: HWSignerConfig): HWSigner {
  const path = config.derivationPath ?? DEFAULT_ETH_PATH;
  const timeoutMs = config.timeoutMs ?? DEFAULT_HW_TIMEOUT_MS;
  const transport = config.transport;

  let currentStatus: ConnectionStatus = 'DISCONNECTED';
  let resolvedAddress: Address | null = null;
  let deviceModel: string | undefined;
  let firmwareVersion: string | undefined;

  const device: DeviceInfo = {
    id: 'trezor-pending' as DeviceId,
    type: 'TREZOR',
    name: 'Trezor',
  };

  async function withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Trezor operation timed out')), timeoutMs)
      ),
    ]);
  }

  async function sendMessage(
    type: number,
    data?: Uint8Array
  ): Promise<{ type: number; data: Uint8Array }> {
    const msg = encodeMessage(type, data);
    const response = await withTimeout(transport.exchange(msg));
    const decoded = decodeMessage(response);

    // Handle button request flow (device waiting for physical button press)
    if (decoded.type === MSG_TYPE.BUTTON_REQUEST) {
      // Acknowledge the button request
      const ackMsg = encodeMessage(MSG_TYPE.BUTTON_ACK);
      const ackResponse = await withTimeout(transport.exchange(ackMsg));
      return decodeMessage(ackResponse);
    }

    if (decoded.type === MSG_TYPE.FAILURE) {
      const errorMsg = new TextDecoder().decode(decoded.data);
      if (errorMsg.includes('cancelled') || errorMsg.includes('rejected')) {
        throw new Error('User rejected on device');
      }
      throw new Error(`Trezor error: ${errorMsg}`);
    }

    return decoded;
  }

  async function connect(): Promise<void> {
    currentStatus = 'CONNECTING';
    try {
      await withTimeout(transport.open());

      // Initialize session and get device features
      const features = await sendMessage(MSG_TYPE.INITIALIZE);
      if (features.type === MSG_TYPE.FEATURES && features.data.length > 0) {
        // Parse model and firmware from features (simplified)
        try {
          const text = new TextDecoder().decode(features.data);
          if (text.includes('T')) deviceModel = 'Trezor Model T';
          else if (text.includes('1')) deviceModel = 'Trezor Model One';
        } catch {
          // Non-fatal: model detection is optional
        }
      }

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
    return getAddressFromDevice(derivationPath, true);
  }

  async function getAddressFromDevice(
    derivationPath: string,
    showOnDevice: boolean
  ): Promise<Address> {
    const pathData = encodePath(derivationPath);
    // Append show_display flag (1 byte)
    const payload = new Uint8Array(pathData.length + 1);
    payload.set(pathData, 0);
    payload[pathData.length] = showOnDevice ? 1 : 0;

    const response = await sendMessage(MSG_TYPE.ETHEREUM_GET_ADDRESS, payload);

    if (response.type !== MSG_TYPE.ETHEREUM_ADDRESS) {
      throw new Error('Unexpected response from Trezor');
    }

    // Response contains the address as ASCII hex
    const addrStr = new TextDecoder().decode(response.data);
    return (addrStr.startsWith('0x') ? addrStr : `0x${addrStr}`) as Address;
  }

  /**
   * Sign a 32-byte transaction hash on the Trezor device.
   *
   * The user must physically approve on the device screen.
   */
  async function sign(hash: Uint8Array): Promise<{ r: bigint; s: bigint; yParity: number }> {
    if (currentStatus !== 'CONNECTED') {
      throw new Error('Trezor not connected');
    }

    // Build sign payload: path + hash
    const pathData = encodePath(path);
    const payload = new Uint8Array(pathData.length + hash.length);
    payload.set(pathData, 0);
    payload.set(hash, pathData.length);

    const response = await sendMessage(MSG_TYPE.ETHEREUM_SIGN_TX, payload);

    if (response.type !== MSG_TYPE.ETHEREUM_TX_REQUEST) {
      throw new Error('Unexpected sign response from Trezor');
    }

    // Response format: v(1) + r(32) + s(32)
    const data = response.data;
    if (data.length < 65) {
      throw new Error('Invalid signature length from Trezor');
    }

    const v = data[0];
    const rBytes = data.subarray(1, 33);
    const sBytes = data.subarray(33, 65);

    const r = BigInt('0x' + bytesToHex(rBytes));
    const s = BigInt('0x' + bytesToHex(sBytes));
    const yParity = v >= 27 ? v - 27 : v;

    return { r, s, yParity };
  }

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

  // Resolve address lazily on first sign
  const originalSign = signer.sign;
  signer.sign = async (hash: Uint8Array) => {
    if (!resolvedAddress) {
      resolvedAddress = await getAddressFromDevice(path, false);
    }
    return originalSign(hash);
  };

  return signer;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
