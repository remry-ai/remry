import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Component tests (`*.dom.spec.ts`): Svelte components mounted in a fake DOM (jsdom),
// with Svelte's browser runtime, for flows that only break in the real reactive runtime.
export default defineConfig({
  plugins: [sveltekit()],
  resolve: { conditions: ['browser'] },
  css: {
    preprocessorOptions: {
      scss: { additionalData: '@use "src/routes/_variables.scss" as *; ' }
    }
  },
  test: {
    include: ['src/**/*.dom.spec.ts'],
    environment: 'jsdom'
  }
});
