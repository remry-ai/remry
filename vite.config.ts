import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: '@use "src/routes/_variables.scss" as *; '
      }
    }
  },
  test: {
    // Runs the unit tests below and the component tests (vitest.dom.config.ts) in parallel.
    workspace: './vitest.parallel.ts',
    include: ['src/**/*.test.spec.ts', 'cli/**/*.test.spec.ts', 'scripts/**/*.test.spec.ts'],
    environment: 'node'
  }
});
