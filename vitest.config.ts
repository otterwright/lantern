import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    globalSetup: ['src/test-global-setup.ts'],
    setupFiles: ['src/test-setup.ts'],
    testTimeout: 30_000,
  },
});
