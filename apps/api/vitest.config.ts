import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/setup-global.ts'],
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});
