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
    testTimeout: 30_000,
    // setup.ts migrates a fresh database before each file, which took up to ~10s on a slow CI runner.
    hookTimeout: 30_000
  }
});
