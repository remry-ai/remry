import { defineWorkspace } from 'vitest/config';

// `bun run test` runs both side by side in one run: the unit tests in Node (vite.config.ts)
// and the component tests in jsdom (vitest.dom.config.ts). vite.config.ts names this file; it
// isn't vitest.workspace.ts or vitest.projects.ts, which Vitest finds by itself, so the
// integration run (vitest.integration.config.ts) leaves it alone.
export default defineWorkspace([
  { extends: './vite.config.ts', test: { name: 'unit' } },
  { extends: './vitest.dom.config.ts', test: { name: 'dom' } }
]);
