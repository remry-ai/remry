// Server-only settings resolver.
// Import on the server: `import { settings } from '$shared/settings/server/index.server'`.
// Relative imports only — prisma.config.ts loads this outside SvelteKit.

import { development } from './development';
import { production } from './production';
import { test } from './test';
import type { ServerSettings } from './types';

const byEnv: Readonly<Record<string, ServerSettings>> = { production, test };

export const settings: ServerSettings = byEnv[process.env.APP_ENV ?? ''] ?? development;

export type { ServerSettings };
