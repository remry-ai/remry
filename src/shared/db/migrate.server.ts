// In-process migrations, compatible with Prisma's `_prisma_migrations` table so
// `prisma migrate dev` keeps working for authoring new migrations. Rows match
// what Prisma writes: checksum is the hex SHA-256 of migration.sql, timestamps
// are integer milliseconds, and applied_steps_count is 1 when finished.

import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Client, Transaction } from '@libsql/client';
import type { Logger } from '$shared/types/logger';
import { ok, err, type Result } from '$shared/utils/result';
import { BUSY_TIMEOUT } from './libsql.server';

export interface MigrationFile {
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
}

export interface AppliedMigration {
  readonly migrationName: string;
  readonly checksum: string;
  readonly finishedAt: string | number | null;
  readonly rolledBackAt: string | number | null;
  readonly startedAt?: string | number | null;
  readonly logs?: string | null;
}

/** How long to wait for another process's migration, and when an unfinished one counts as abandoned. */
export interface MigrationTiming {
  readonly waitMs: number;
  readonly staleMs: number;
  readonly pollMs: number;
}

const DEFAULT_TIMING: MigrationTiming = { waitMs: 60_000, staleMs: 10 * 60_000, pollMs: 200 };

// Prisma's own DDL for SQLite.
const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

export const checksum = (sql: string): string => createHash('sha256').update(sql).digest('hex');

export const readMigrations = async (dir: string): Promise<readonly MigrationFile[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const migrations = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const sql = await readFile(join(dir, entry.name, 'migration.sql'), 'utf8');
        return { name: entry.name, sql, checksum: checksum(sql) };
      })
  );
  return migrations.sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Migrations renamed after some databases had applied them, old name → new name.
 * add_page_kinds was renamed to sort after add_search_index when the two branches
 * merged; databases that ran it under its first name keep it, under the new name.
 */
export const RENAMED_MIGRATIONS: Readonly<Record<string, string>> = {
  '20261004120000_add_page_kinds': '20261004200000_add_page_kinds'
};

/** Applied rows recorded under a renamed migration's old name, whose new file has the same checksum. */
export const planRenames = (
  onDisk: readonly MigrationFile[],
  applied: readonly AppliedMigration[],
  renamed: Readonly<Record<string, string>> = RENAMED_MIGRATIONS
): readonly { readonly from: string; readonly to: string }[] => {
  const names = new Set(applied.map((a) => a.migrationName));
  return applied.flatMap((a) => {
    const to = renamed[a.migrationName];
    const file = to ? onDisk.find((m) => m.name === to) : undefined;
    return to && file && file.checksum === a.checksum && !names.has(to) ? [{ from: a.migrationName, to }] : [];
  });
};

/**
 * Migrations that only add (an index, a table, a nullable column), so a Remry from before them
 * can still use a database that has them. A database records how many migrations a Remry must
 * know to use it (`requiredMigrations`), counting to its last migration not listed here. An
 * update often leaves an older Remry running for a while (a Claude session's MCP server, or an
 * app server the update hasn't replaced yet), and without this it refused every notebook the
 * new version had migrated. List a migration here only if it changes nothing an older Remry reads or writes.
 */
export const ADDITIVE_MIGRATIONS: ReadonlySet<string> = new Set([
  '20261017120000_project_parent_index',
  '20261020120000_synthesis_prompt',
  // Moves docs' attached PDFs into links; an older Remry sees the links and no attached PDF.
  '20261101120000_doc_sources_to_links'
]);

/**
 * How many migrations, in name order, a Remry must know to use a database with these applied:
 * up to the last one that isn't additive. Stored in the database's `PRAGMA user_version`.
 */
export const requiredMigrations = (
  onDisk: readonly MigrationFile[],
  applied: readonly AppliedMigration[],
  additive: ReadonlySet<string> = ADDITIVE_MIGRATIONS
): number => {
  const done = new Set(applied.filter((a) => a.rolledBackAt === null && a.finishedAt !== null).map((a) => a.migrationName));
  const sorted = [...onDisk].sort((a, b) => a.name.localeCompare(b.name));
  let required = 0;
  sorted.forEach((m, i) => {
    if (done.has(m.name) && !additive.has(m.name)) required = i + 1;
  });
  return required;
};

/**
 * Pending migrations, or an error if the database and the migration files disagree. Applied
 * migrations this Remry doesn't have are a newer Remry's: fine when they all come after its own
 * and the database says it needs no more than this Remry knows (`required`, from user_version;
 * 0 when no Remry recorded it), else an error that says to update.
 */
export const planMigrations = (
  onDisk: readonly MigrationFile[],
  applied: readonly AppliedMigration[],
  required = 0
): Result<{ readonly pending: readonly MigrationFile[] }> => {
  const live = applied.filter((a) => a.rolledBackAt === null);

  const failed = live.find((a) => a.finishedAt === null);
  if (failed) {
    return err(new Error(`migration ${failed.migrationName} previously failed part way; repair the database before continuing`));
  }

  const files = new Map(onDisk.map((m) => [m.name, m]));
  const newest = [...onDisk].sort((a, b) => a.name.localeCompare(b.name)).at(-1)?.name ?? '';
  const unknown = live.filter((a) => !files.has(a.migrationName));
  if (unknown.length > 0) {
    const fromNewerRemry = unknown.every((a) => a.migrationName.localeCompare(newest) > 0);
    if (!fromNewerRemry) return err(new Error(`applied migration ${unknown[0]!.migrationName} is missing from prisma/migrations`));
    if (required === 0 || required > onDisk.length) {
      return err(new Error(`This notebook was updated by a newer version of Remry (migration ${unknown[0]!.migrationName}). Update Remry to open it.`));
    }
  }
  for (const a of live) {
    const file = files.get(a.migrationName);
    if (file && file.checksum !== a.checksum) return err(new Error(`migration ${a.migrationName} was modified after it was applied`));
  }

  const done = new Set(live.map((a) => a.migrationName));
  const pending = [...onDisk].sort((a, b) => a.name.localeCompare(b.name)).filter((m) => !done.has(m.name));
  return ok({ pending });
};

const toMillis = (value: string | number | null | undefined): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  return Number.NaN;
};

/**
 * A migration another process has claimed and is still applying: unfinished, with no
 * error logged, and started within `staleMs`. Anything else unfinished is a failure
 * (a logged error, or a process that died part way), which planMigrations refuses.
 */
export const migrationInProgress = (applied: readonly AppliedMigration[], now: number, staleMs: number): AppliedMigration | undefined =>
  applied.find(
    (a) => a.rolledBackAt === null && a.finishedAt === null && (a.logs ?? null) === null && now - toMillis(a.startedAt) < staleMs
  );

const readApplied = async (client: Client | Transaction): Promise<readonly AppliedMigration[]> => {
  const rs = await client.execute('SELECT migration_name, checksum, finished_at, rolled_back_at, started_at, logs FROM _prisma_migrations');
  return rs.rows.map((r) => ({
    migrationName: String(r[0]),
    checksum: String(r[1]),
    finishedAt: (r[2] ?? null) as string | number | null,
    rolledBackAt: (r[3] ?? null) as string | number | null,
    startedAt: (r[4] ?? null) as string | number | null,
    logs: (r[5] ?? null) as string | null
  }));
};

const readRequired = async (client: Client | Transaction): Promise<number> =>
  Number((await client.execute('PRAGMA user_version')).rows[0]?.[0] ?? 0);

/**
 * Records how many migrations a Remry must know to use this database (`requiredMigrations`),
 * once this Remry has every migration applied to it. A Remry that met newer migrations it
 * doesn't know leaves the newer one's record as it is.
 */
const recordRequired = async (client: Client, onDisk: readonly MigrationFile[]): Promise<void> => {
  const applied = (await readApplied(client)).filter((a) => a.rolledBackAt === null);
  const known = new Set(onDisk.map((m) => m.name));
  if (applied.some((a) => !known.has(a.migrationName))) return;
  const required = requiredMigrations(onDisk, applied);
  if ((await readRequired(client)) !== required) await client.execute(`PRAGMA user_version = ${required}`);
};

type Claim =
  | { readonly kind: 'done' }
  | { readonly kind: 'wait'; readonly migration: string }
  | { readonly kind: 'apply'; readonly migration: MigrationFile; readonly id: string };

/**
 * Under a write lock, record renames and claim the next pending migration by inserting
 * its unfinished row. The lock makes the check and the claim one step, so two processes
 * opening the notebook at once never apply the same migration; the loser sees the claim
 * and waits. The migration's own SQL runs outside the lock: Prisma's table rebuilds turn
 * `PRAGMA foreign_keys` off, which does nothing inside a transaction.
 */
const claimNext = async (client: Client, onDisk: readonly MigrationFile[], logger: Logger, staleMs: number): Promise<Result<Claim>> => {
  // BEGIN IMMEDIATE waits on the connection's busy timeout, which libsql leaves at 0.
  await client.execute(BUSY_TIMEOUT);
  const tx = await client.transaction('write');
  try {
    for (const rename of planRenames(onDisk, await readApplied(tx))) {
      await tx.execute({ sql: 'UPDATE _prisma_migrations SET migration_name = ? WHERE migration_name = ?', args: [rename.to, rename.from] });
      logger.info({ migration: rename.to, was: rename.from }, 'recorded renamed migration');
    }
    const applied = await readApplied(tx);
    const running = migrationInProgress(applied, Date.now(), staleMs);
    if (running) {
      await tx.commit();
      return ok({ kind: 'wait', migration: running.migrationName });
    }
    const plan = planMigrations(onDisk, applied, await readRequired(tx));
    if (!plan.ok) {
      await tx.commit();
      return err(plan.error);
    }
    const next = plan.value.pending[0];
    if (!next) {
      await tx.commit();
      return ok({ kind: 'done' });
    }
    const id = randomUUID();
    await tx.execute({
      sql: 'INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, ?, 0)',
      args: [id, next.checksum, next.name, Date.now()]
    });
    await tx.commit();
    return ok({ kind: 'apply', migration: next, id });
  } finally {
    tx.close();
  }
};

export const applyMigrations = async (
  client: Client,
  dir: string,
  logger: Logger,
  timing: MigrationTiming = DEFAULT_TIMING
): Promise<Result<{ readonly applied: readonly string[] }>> => {
  await client.execute(MIGRATIONS_TABLE);
  const onDisk = await readMigrations(dir);
  const applied: string[] = [];
  const deadline = Date.now() + timing.waitMs;

  for (;;) {
    const claim = await claimNext(client, onDisk, logger, timing.staleMs);
    if (!claim.ok) return err(claim.error);
    if (claim.value.kind === 'done') {
      await recordRequired(client, onDisk);
      return ok({ applied });
    }

    if (claim.value.kind === 'wait') {
      if (Date.now() >= deadline) {
        return err(new Error(`migration ${claim.value.migration} is still being applied by another process; try again shortly`));
      }
      await new Promise((resolve) => setTimeout(resolve, timing.pollMs));
      continue;
    }

    const { migration, id } = claim.value;
    try {
      await client.executeMultiple(migration.sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await client.execute({ sql: 'UPDATE _prisma_migrations SET logs = ? WHERE id = ?', args: [message, id] });
      return err(new Error(`migration ${migration.name} failed: ${message}`));
    }

    await client.execute({
      sql: 'UPDATE _prisma_migrations SET finished_at = ?, applied_steps_count = 1 WHERE id = ?',
      args: [Date.now(), id]
    });
    logger.info({ migration: migration.name }, 'applied migration');
    applied.push(migration.name);
  }
};
