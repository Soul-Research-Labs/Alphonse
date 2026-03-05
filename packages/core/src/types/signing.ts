import type { Address, Brand, Hex, Timestamp, TxHash } from './common';

// ---------------------------------------------------------------------------
// Signing request
// ---------------------------------------------------------------------------

export const SigningRequestType = {
  /** Sign an EVM transaction. */
  TRANSACTION: 'TRANSACTION',
  /** Sign an arbitrary message (EIP-191). */
  MESSAGE: 'MESSAGE',
  /** Sign typed data (EIP-712). */
  TYPED_DATA: 'TYPED_DATA',
} as const;

export type SigningRequestType = (typeof SigningRequestType)[keyof typeof SigningRequestType];

/** Branded signing request identifier. */
export type SigningRequestId = Brand<string, 'SigningRequestId'>;

export interface SigningRequest {
  readonly id: SigningRequestId;
  readonly type: SigningRequestType;
  readonly createdAt: Timestamp;
  /** The address that will sign. */
  readonly signer: Address;
  /** Chain ID for EIP-155 replay protection context. */
  readonly chainId: number;
  /**
   * Payload to be signed.
   * For TRANSACTION: serialized unsigned tx data.
   * For MESSAGE: raw message bytes.
   * For TYPED_DATA: EIP-712 struct hash input.
   */
  readonly payload: Hex;
  /** Human-readable description for the approval UI. */
  readonly displayInfo: SigningDisplayInfo;
}

// ---------------------------------------------------------------------------
// Display info for approval screen
// ---------------------------------------------------------------------------

export interface SigningDisplayInfo {
  /** Short title, e.g. "Send 0.5 ETH". */
  readonly title: string;
  /** Recipient address (if applicable). */
  readonly to?: Address;
  /** Human-readable amount (if applicable). */
  readonly amount?: string;
  /** Asset symbol (if applicable). */
  readonly assetSymbol?: string;
  /** Estimated gas fee in human-readable format. */
  readonly estimatedFee?: string;
  /** Warnings to display (e.g. "This transfer is public."). */
  readonly warnings: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Signing result
// ---------------------------------------------------------------------------

export const SigningDecision = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type SigningDecision = (typeof SigningDecision)[keyof typeof SigningDecision];

export interface SigningResult {
  readonly requestId: SigningRequestId;
  readonly decision: SigningDecision;
  /** Signature bytes (present only if approved and successful). */
  readonly signature?: Hex;
  /** Transaction hash (present only for submitted transactions). */
  readonly txHash?: TxHash;
  readonly decidedAt: Timestamp;
}
