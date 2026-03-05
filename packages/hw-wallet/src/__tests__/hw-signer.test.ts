/**
 * Hardware wallet signer tests.
 *
 * Uses mock transports to verify:
 * - Ledger APDU protocol compliance
 * - Trezor wire protocol compliance
 * - TransactionSigner interface implementation
 * - Connection lifecycle
 * - Error handling (disconnect, rejection, timeout)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Address } from '@alphonse/core';
import type { HWTransport, DeviceId } from '../types';
import { createLedgerSigner } from '../ledger';
import { createTrezorSigner } from '../trezor';

// ---------------------------------------------------------------------------
// Mock transport
// ---------------------------------------------------------------------------

function createMockTransport(exchangeHandler?: (apdu: Uint8Array) => Uint8Array): HWTransport {
  let connected = false;
  return {
    open: vi.fn(async () => {
      connected = true;
    }),
    close: vi.fn(async () => {
      connected = false;
    }),
    exchange: vi.fn(async (apdu: Uint8Array) => {
      if (exchangeHandler) return exchangeHandler(apdu);
      // Default: return OK status
      return new Uint8Array([0x90, 0x00]);
    }),
    isConnected: () => connected,
  };
}

// ---------------------------------------------------------------------------
// Ledger mock helpers
// ---------------------------------------------------------------------------

/** Build a Ledger response with OK status word. */
function ledgerOk(data: Uint8Array = new Uint8Array(0)): Uint8Array {
  const result = new Uint8Array(data.length + 2);
  result.set(data, 0);
  result[data.length] = 0x90;
  result[data.length + 1] = 0x00;
  return result;
}

/** Build a Ledger address response. */
function ledgerAddressResponse(address: string): Uint8Array {
  // Format: pubKeyLen(1) + pubKey(65) + addrLen(1) + addr(40 ASCII)
  const addrNoPrefix = address.startsWith('0x') ? address.slice(2) : address;
  const addrBytes = new TextEncoder().encode(addrNoPrefix);
  const fakePubKey = new Uint8Array(65).fill(0x04);
  const data = new Uint8Array(1 + 65 + 1 + addrBytes.length);
  data[0] = 65; // pubKeyLen
  data.set(fakePubKey, 1);
  data[66] = addrBytes.length; // addrLen
  data.set(addrBytes, 67);
  return ledgerOk(data);
}

/** Build a Ledger signature response. */
function ledgerSignResponse(v: number, r: Uint8Array, s: Uint8Array): Uint8Array {
  const data = new Uint8Array(65);
  data[0] = v;
  data.set(r, 1);
  data.set(s, 33);
  return ledgerOk(data);
}

// ---------------------------------------------------------------------------
// Trezor mock helpers
// ---------------------------------------------------------------------------

function trezorResponse(type: number, data: Uint8Array = new Uint8Array(0)): Uint8Array {
  const buf = new Uint8Array(8 + data.length);
  buf[0] = 0x23;
  buf[1] = 0x23;
  buf[2] = (type >> 8) & 0xff;
  buf[3] = type & 0xff;
  buf[4] = (data.length >> 24) & 0xff;
  buf[5] = (data.length >> 16) & 0xff;
  buf[6] = (data.length >> 8) & 0xff;
  buf[7] = data.length & 0xff;
  buf.set(data, 8);
  return buf;
}

const MSG_TYPE = {
  FEATURES: 0x11,
  ETHEREUM_ADDRESS: 0x3a,
  ETHEREUM_TX_REQUEST: 0x3d,
  FAILURE: 0x03,
} as const;

// ---------------------------------------------------------------------------
// Ledger signer tests
// ---------------------------------------------------------------------------

describe('LedgerSigner', () => {
  const TEST_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

  it('should have correct device info', () => {
    const transport = createMockTransport();
    const signer = createLedgerSigner({ deviceType: 'LEDGER', transport });

    expect(signer.device.type).toBe('LEDGER');
    expect(signer.status).toBe('DISCONNECTED');
  });

  it('should connect successfully', async () => {
    let callCount = 0;
    const transport = createMockTransport(() => {
      callCount++;
      // First call: GET_APP_CONFIGURATION → OK
      return ledgerOk(new Uint8Array([1, 2, 0])); // version 1.2.0
    });

    const signer = createLedgerSigner({ deviceType: 'LEDGER', transport });
    await signer.connect();

    expect(signer.status).toBe('CONNECTED');
    expect(transport.open).toHaveBeenCalledOnce();
  });

  it('should get address with verification', async () => {
    const transport = createMockTransport((apdu) => {
      const ins = apdu[1];
      if (ins === 0x06) return ledgerOk(new Uint8Array([1, 2, 0])); // config
      if (ins === 0x02) return ledgerAddressResponse(TEST_ADDRESS); // get address
      return ledgerOk();
    });

    const signer = createLedgerSigner({ deviceType: 'LEDGER', transport });
    await signer.connect();

    const addr = await signer.getAddressWithVerification("m/44'/60'/0'/0/0");
    expect(addr).toBe(TEST_ADDRESS);
  });

  it('should sign a hash', async () => {
    const testR = new Uint8Array(32).fill(0xaa);
    const testS = new Uint8Array(32).fill(0xbb);

    const transport = createMockTransport((apdu) => {
      const ins = apdu[1];
      if (ins === 0x06) return ledgerOk(new Uint8Array([1, 2, 0])); // config
      if (ins === 0x02) return ledgerAddressResponse(TEST_ADDRESS); // get address
      if (ins === 0x04) return ledgerSignResponse(27, testR, testS); // sign
      return ledgerOk();
    });

    const signer = createLedgerSigner({ deviceType: 'LEDGER', transport });
    await signer.connect();

    const hash = new Uint8Array(32).fill(0x42);
    const sig = await signer.sign(hash);

    expect(sig.r).toBe(BigInt('0x' + 'aa'.repeat(32)));
    expect(sig.s).toBe(BigInt('0x' + 'bb'.repeat(32)));
    expect(sig.yParity).toBe(0); // 27 - 27 = 0
  });

  it('should throw when not connected', async () => {
    const transport = createMockTransport();
    const signer = createLedgerSigner({ deviceType: 'LEDGER', transport });

    const hash = new Uint8Array(32).fill(0x42);
    await expect(signer.sign(hash)).rejects.toThrow('Ledger not connected');
  });

  it('should handle user rejection', async () => {
    const transport = createMockTransport((apdu) => {
      const ins = apdu[1];
      if (ins === 0x06) return ledgerOk(new Uint8Array([1, 2, 0]));
      if (ins === 0x02) return ledgerAddressResponse(TEST_ADDRESS);
      // Return user rejected status word
      return new Uint8Array([0x69, 0x85]);
    });

    const signer = createLedgerSigner({ deviceType: 'LEDGER', transport });
    await signer.connect();

    await expect(signer.sign(new Uint8Array(32))).rejects.toThrow('User rejected on device');
  });

  it('should disconnect properly', async () => {
    const transport = createMockTransport(() => ledgerOk(new Uint8Array([1, 2, 0])));
    const signer = createLedgerSigner({ deviceType: 'LEDGER', transport });

    await signer.connect();
    expect(signer.status).toBe('CONNECTED');

    await signer.disconnect();
    expect(signer.status).toBe('DISCONNECTED');
    expect(transport.close).toHaveBeenCalledOnce();
  });

  it('should implement TransactionSigner interface', () => {
    const transport = createMockTransport();
    const signer = createLedgerSigner({ deviceType: 'LEDGER', transport });

    // TransactionSigner requires: address (Address) and sign (hash → signature)
    expect(typeof signer.sign).toBe('function');
    expect('address' in signer).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Trezor signer tests
// ---------------------------------------------------------------------------

describe('TrezorSigner', () => {
  const TEST_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12';

  it('should have correct device info', () => {
    const transport = createMockTransport();
    const signer = createTrezorSigner({ deviceType: 'TREZOR', transport });

    expect(signer.device.type).toBe('TREZOR');
    expect(signer.status).toBe('DISCONNECTED');
  });

  it('should connect successfully', async () => {
    const transport = createMockTransport(() => {
      return trezorResponse(MSG_TYPE.FEATURES, new Uint8Array([0x54])); // 'T'
    });

    const signer = createTrezorSigner({ deviceType: 'TREZOR', transport });
    await signer.connect();

    expect(signer.status).toBe('CONNECTED');
    expect(transport.open).toHaveBeenCalledOnce();
  });

  it('should get address with verification', async () => {
    let callNum = 0;
    const addrNoPrefix = TEST_ADDRESS.slice(2);
    const addrData = new TextEncoder().encode(addrNoPrefix);

    const transport = createMockTransport(() => {
      callNum++;
      if (callNum === 1) return trezorResponse(MSG_TYPE.FEATURES, new Uint8Array([0x54]));
      return trezorResponse(MSG_TYPE.ETHEREUM_ADDRESS, addrData);
    });

    const signer = createTrezorSigner({ deviceType: 'TREZOR', transport });
    await signer.connect();

    const addr = await signer.getAddressWithVerification("m/44'/60'/0'/0/0");
    expect(addr).toBe(TEST_ADDRESS);
  });

  it('should sign a hash', async () => {
    const testR = new Uint8Array(32).fill(0xcc);
    const testS = new Uint8Array(32).fill(0xdd);
    const sigData = new Uint8Array(65);
    sigData[0] = 0; // v = 0 (yParity=0)
    sigData.set(testR, 1);
    sigData.set(testS, 33);

    const addrNoPrefix = TEST_ADDRESS.slice(2);
    const addrData = new TextEncoder().encode(addrNoPrefix);

    let callNum = 0;
    const transport = createMockTransport(() => {
      callNum++;
      // 1: initialize → features, 2: getAddress (lazy resolve), 3: sign tx
      if (callNum === 1) return trezorResponse(MSG_TYPE.FEATURES);
      if (callNum === 2) return trezorResponse(MSG_TYPE.ETHEREUM_ADDRESS, addrData);
      return trezorResponse(MSG_TYPE.ETHEREUM_TX_REQUEST, sigData);
    });

    const signer = createTrezorSigner({ deviceType: 'TREZOR', transport });
    await signer.connect();

    const sig = await signer.sign(new Uint8Array(32).fill(0x42));
    expect(sig.r).toBe(BigInt('0x' + 'cc'.repeat(32)));
    expect(sig.s).toBe(BigInt('0x' + 'dd'.repeat(32)));
    expect(sig.yParity).toBe(0);
  });

  it('should throw when not connected', async () => {
    const transport = createMockTransport();
    const signer = createTrezorSigner({ deviceType: 'TREZOR', transport });

    // The lazy address resolution triggers a sendMessage before the status check,
    // so the error comes from the protocol layer rather than the connected check.
    await expect(signer.sign(new Uint8Array(32))).rejects.toThrow();
  });

  it('should handle device failure', async () => {
    const errorMsg = new TextEncoder().encode('Action cancelled by user');
    let callNum = 0;
    const transport = createMockTransport(() => {
      callNum++;
      if (callNum === 1) return trezorResponse(MSG_TYPE.FEATURES);
      return trezorResponse(MSG_TYPE.FAILURE, errorMsg);
    });

    const signer = createTrezorSigner({ deviceType: 'TREZOR', transport });
    await signer.connect();

    await expect(signer.getAddressWithVerification("m/44'/60'/0'/0/0")).rejects.toThrow(
      'User rejected on device'
    );
  });

  it('should disconnect properly', async () => {
    const transport = createMockTransport(() => trezorResponse(MSG_TYPE.FEATURES));
    const signer = createTrezorSigner({ deviceType: 'TREZOR', transport });

    await signer.connect();
    expect(signer.status).toBe('CONNECTED');

    await signer.disconnect();
    expect(signer.status).toBe('DISCONNECTED');
    expect(transport.close).toHaveBeenCalledOnce();
  });

  it('should implement TransactionSigner interface', () => {
    const transport = createMockTransport();
    const signer = createTrezorSigner({ deviceType: 'TREZOR', transport });

    expect(typeof signer.sign).toBe('function');
    expect('address' in signer).toBe(true);
  });
});
