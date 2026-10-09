import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    environment: 'node',
    // integration tests run sequentially — they share a real DB
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000
  }
});
