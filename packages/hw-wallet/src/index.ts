/**
 * @alphonse/hw-wallet
 *
 * Hardware wallet support for Ledger and Trezor.
 * Signing only — keys never leave the device.
 * Transaction approval happens on the hardware device screen.
 *
 * Platform-agnostic — transports are injected by the consuming app.
 */

export * from './types';
export { createLedgerSigner } from './ledger';
export { createTrezorSigner } from './trezor';
