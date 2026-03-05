/**
 * Hardware wallet types.
 *
 * Defines device types, connection states, and the HW signer interface.
 * HW wallets only sign — keys never leave the device.
 */

import type { Address, Brand } from '@alphonse/core';
import type { TransactionSigner } from '@alphonse/evm';

// ---------------------------------------------------------------------------
// Device types
// ---------------------------------------------------------------------------

export const HWDeviceType = {
  LEDGER: 'LEDGER',
  TREZOR: 'TREZOR',
} as const;

export type HWDeviceType = (typeof HWDeviceType)[keyof typeof HWDeviceType];

// ---------------------------------------------------------------------------
// Connection status
// ---------------------------------------------------------------------------

export const ConnectionStatus = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  ERROR: 'ERROR',
} as const;

export type ConnectionStatus = (typeof ConnectionStatus)[keyof typeof ConnectionStatus];

// ---------------------------------------------------------------------------
// Device info
// ---------------------------------------------------------------------------

/** Unique device identifier (transport-level). */
export type DeviceId = Brand<string, 'DeviceId'>;

export interface DeviceInfo {
  readonly id: DeviceId;
  readonly type: HWDeviceType;
  readonly name: string;
  readonly model?: string;
  readonly firmwareVersion?: string;
}

// ---------------------------------------------------------------------------
// Transport abstraction
// ---------------------------------------------------------------------------

/**
 * Transport-level abstraction for communicating with hardware wallets.
 *
 * Implementations wrap platform-specific transports:
 * - BLE (mobile: @ledgerhq/hw-transport-web-ble)
 * - USB/HID (desktop: @ledgerhq/hw-transport-webhid)
 * - Trezor Connect bridge
 *
 * Platform-specific transport implementations are NOT in this package.
 * This package defines the interface; the mobile app provides concrete transports.
 */
export interface HWTransport {
  /** Open a connection to the device. */
  open: () => Promise<void>;
  /** Close the connection. */
  close: () => Promise<void>;
  /** Send an APDU command and receive a response. */
  exchange: (apdu: Uint8Array) => Promise<Uint8Array>;
  /** Whether the transport is currently connected. */
  isConnected: () => boolean;
}

// ---------------------------------------------------------------------------
// HW signer interface (extends TransactionSigner)
// ---------------------------------------------------------------------------

/**
 * Hardware wallet signer.
 *
 * Extends TransactionSigner with device management methods.
 * Transaction approval happens on the hardware device screen.
 * Keys never leave the device.
 */
export interface HWSigner extends TransactionSigner {
  /** Device information. */
  readonly device: DeviceInfo;
  /** Current connection status. */
  readonly status: ConnectionStatus;
  /** Connect to the hardware wallet. */
  connect: () => Promise<void>;
  /** Disconnect from the hardware wallet. */
  disconnect: () => Promise<void>;
  /**
   * Get address from device with on-screen verification.
   * The user confirms the address matches on the device display.
   */
  getAddressWithVerification: (derivationPath: string) => Promise<Address>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface HWSignerConfig {
  /** Device type to connect to. */
  readonly deviceType: HWDeviceType;
  /** BIP-44 derivation path (default: m/44'/60'/0'/0/0). */
  readonly derivationPath?: string;
  /** Transport implementation (platform-specific). */
  readonly transport: HWTransport;
  /** Timeout for device operations in ms (default: 60000). */
  readonly timeoutMs?: number;
}

export const DEFAULT_ETH_PATH = "m/44'/60'/0'/0/0";
export const DEFAULT_HW_TIMEOUT_MS = 60_000;
