// @ts-check

import { tanstackConfig } from '@tanstack/eslint-config';

export default [
  {
    ignores: [
      'eslint.config.js',
      '.prettierrc.json',
      '**/routeTree.gen.ts',
      '**/vite.config.ts',
      '**/dist/**',
      '**/node_modules/**',
    ],
  },
  ...tanstackConfig,
];
