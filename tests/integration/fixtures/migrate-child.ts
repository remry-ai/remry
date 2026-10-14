// Applies the repo's migrations to one database file, as a separate process would
// when it opens a notebook. Prints the result as JSON. Used by migrate.test.ts.

import { applyMigrations } from '../../../src/shared/db/migrate.server';
import { createWaitingClient, enableWal } from '../../../src/shared/db/libsql.server';
import type { Logger } from '../../../src/shared/types/logger';

const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as Logger;
const [path, startAt] = process.argv.slice(2);
// As migrateDatabase does: the busy timeout first, since switching to WAL needs the lock too.
const client = await createWaitingClient({ url: `file:${path}` });
await enableWal(client);
// Start together with the other process, so both look for pending migrations at once.
await new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(startAt) - Date.now())));
const result = await applyMigrations(client, 'prisma/migrations', quiet, { waitMs: 30_000, staleMs: 10 * 60_000, pollMs: 20 });
console.log(JSON.stringify(result.ok ? { ok: true, applied: result.value.applied } : { ok: false, error: result.error.message }));
client.close();
