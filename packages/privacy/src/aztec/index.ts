/**
 * Aztec adapter — v1 privacy protocol for ALPHONSE.
 *
 * Re-exports the adapter factory, PXE client, and account utilities.
 */

export { createPxeClient } from './client';
export type {
  PxeClient,
  PxeClientConfig,
  AztecAddress,
  AztecNote,
  AztecTxHash,
  AztecTxReceipt,
  AztecAccountInfo,
} from './client';

export { createAztecAccount, restoreAztecAccount } from './account';
export type { AztecAccount, AztecAccountConfig } from './account';

export { createAztecAdapter } from './adapter';
export type { AztecAdapterConfig } from './adapter';
