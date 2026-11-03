import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['tests/dialog-test-setup.ts'],
    testTimeout: 30000,
    maxWorkers: 2,
  },
});
