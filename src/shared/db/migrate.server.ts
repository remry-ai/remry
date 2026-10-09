// In-process migrations, compatible with Prisma's `_prisma_migrations` table so
// `prisma migrate dev` keeps working for authoring new migrations. Rows match
// what Prisma writes: checksum is the hex SHA-256 of migration.sql, timestamps
// are integer milliseconds, and applied_steps_count is 1 when finished.

import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import type { Logger } from '$shared/types/logger';
import { ok, err, type Result } from '$shared/utils/result';

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
}

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

/** Pending migrations, or an error if the database and the migration files disagree. */
export const planMigrations = (
  onDisk: readonly MigrationFile[],
  applied: readonly AppliedMigration[]
): Result<{ readonly pending: readonly MigrationFile[] }> => {
  const live = applied.filter((a) => a.rolledBackAt === null);

  const failed = live.find((a) => a.finishedAt === null);
  if (failed) {
    return err(new Error(`migration ${failed.migrationName} previously failed part way; repair the database before continuing`));
  }

  const files = new Map(onDisk.map((m) => [m.name, m]));
  for (const a of live) {
    const file = files.get(a.migrationName);
    if (!file) return err(new Error(`applied migration ${a.migrationName} is missing from prisma/migrations`));
    if (file.checksum !== a.checksum) return err(new Error(`migration ${a.migrationName} was modified after it was applied`));
  }

  const done = new Set(live.map((a) => a.migrationName));
  const pending = [...onDisk].sort((a, b) => a.name.localeCompare(b.name)).filter((m) => !done.has(m.name));
  return ok({ pending });
};

const readApplied = async (client: Client): Promise<readonly AppliedMigration[]> => {
  const rs = await client.execute('SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations');
  return rs.rows.map((r) => ({
    migrationName: String(r[0]),
    checksum: String(r[1]),
    finishedAt: (r[2] ?? null) as string | number | null,
    rolledBackAt: (r[3] ?? null) as string | number | null
  }));
};

export const applyMigrations = async (
  client: Client,
  dir: string,
  logger: Logger
): Promise<Result<{ readonly applied: readonly string[] }>> => {
  await client.execute(MIGRATIONS_TABLE);
  const onDisk = await readMigrations(dir);
  for (const rename of planRenames(onDisk, await readApplied(client))) {
    await client.execute({ sql: 'UPDATE _prisma_migrations SET migration_name = ? WHERE migration_name = ?', args: [rename.to, rename.from] });
    logger.info({ migration: rename.to, was: rename.from }, 'recorded renamed migration');
  }
  const plan = planMigrations(onDisk, await readApplied(client));
  if (!plan.ok) return err(plan.error);

  const applied: string[] = [];
  for (const migration of plan.value.pending) {
    const id = randomUUID();
    await client.execute({
      sql: 'INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, ?, 0)',
      args: [id, migration.checksum, migration.name, Date.now()]
    });

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

  return ok({ applied });
};
