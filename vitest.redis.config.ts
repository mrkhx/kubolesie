import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/api/src/redis.integration.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
