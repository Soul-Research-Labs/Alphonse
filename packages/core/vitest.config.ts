import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure-JS Argon2id is slow — increase timeout for key derivation tests
    testTimeout: 30_000,
  },
});
