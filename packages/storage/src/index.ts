/**
 * @alphonse/storage
 *
 * Encrypted storage interface and platform adapters.
 * Extension: encrypted blob in IndexedDB / extension storage.
 * Mobile: OS keychain/keystore + encrypted DB.
 *
 * All stored data must be ciphertext — never plaintext secrets.
 * Encryption modules must be abstraction-based and replaceable
 * to support future hybrid post-quantum upgrades.
 *
 * Platform-agnostic interface — platform adapters are separate.
 */

export const PACKAGE_NAME = '@alphonse/storage' as const;
