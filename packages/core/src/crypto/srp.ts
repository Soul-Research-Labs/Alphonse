/** BIP-39 Secret Recovery Phrase (SRP) management. SRP is NEVER logged. */

import { generateMnemonic, mnemonicToSeedSync, validateMnemonic, englishWordlist } from './deps';
import { type Result, Result as R, type AlphonseError, ErrorCode } from '../types/common';
import type { SRP, SRPWordCount } from '../types/wallet';

export interface SrpManager {
  generate: (wordCount?: SRPWordCount) => SRP;
  validate: (mnemonic: string) => boolean;
  toSeed: (srp: SRP, passphrase?: string) => Uint8Array;
  normalize: (raw: string) => Result<SRP, AlphonseError>;
}

export function createSrpManager(): SrpManager {
  function generate(wordCount: SRPWordCount = 12): SRP {
    return generateMnemonic(englishWordlist, wordCount === 24 ? 256 : 128) as SRP;
  }

  function validate(mnemonic: string): boolean {
    return validateMnemonic(mnemonic, englishWordlist);
  }

  function toSeed(srp: SRP, passphrase = ''): Uint8Array {
    return mnemonicToSeedSync(srp, passphrase);
  }

  function normalize(raw: string): Result<SRP, AlphonseError> {
    const normalized = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!validate(normalized)) {
      return R.err({
        code: ErrorCode.INVALID_SRP,
        message: 'Invalid mnemonic phrase. Check spelling and word count (12 or 24 words).',
      });
    }
    return R.ok(normalized as SRP);
  }

  return { generate, validate, toSeed, normalize };
}
