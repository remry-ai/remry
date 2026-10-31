// The in-process migrator against real SQLite files, independent of the app database.

import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import type { Logger } from '../../src/shared/types/logger';
import { applyMigrations, checksum, ADDITIVE_MIGRATIONS } from '../../src/shared/db/migrate.server';

const BUN = process.versions.bun ? process.execPath : 'bun';
const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as Logger;
const onDisk = readdirSync('prisma/migrations', { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();

const freshDb = () => {
  const dir = mkdtempSync(join(tmpdir(), 'remry-migrate-'));
  return { dir, client: createClient({ url: `file:${join(dir, 'db.sqlite')}` }) };
};

// What a Remry must know to use a database with every migration applied: up to the last one that isn't additive.
const lastNeeded = onDisk.map((name, i) => (ADDITIVE_MIGRATIONS.has(name) ? 0 : i + 1)).reduce((m, n) => Math.max(m, n), 0);

describe('applyMigrations', () => {
  it('migrates a fresh database and records rows Prisma can read', async () => {
    const { client } = freshDb();
    const result = await applyMigrations(client, 'prisma/migrations', quiet);
    expect(result.ok && result.value.applied).toEqual(onDisk);
    expect(Number((await client.execute('PRAGMA user_version')).rows[0]![0])).toBe(lastNeeded);

    const rows = await client.execute('SELECT migration_name, checksum, finished_at, applied_steps_count FROM _prisma_migrations ORDER BY migration_name');
    expect(rows.rows.map((r) => r[0])).toEqual(onDisk);
    const first = rows.rows[0]!;
    expect(first[1]).toBe(checksum(readFileSync(join('prisma/migrations', onDisk[0]!, 'migration.sql'), 'utf8')));
    expect(first[2]).not.toBeNull();
    expect(Number(first[3])).toBe(1);

    const tables = (await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((r) => r[0]);
    expect(tables).toEqual(expect.arrayContaining(['person', 'group', 'group_member', 'org_person', 'personal_person', 'branding']));
    expect(tables).not.toContain('report');
    client.close();
  });

  it('lets an older Remry open a database a newer one migrated, when the newer migrations are additive', async () => {
    // A newer Remry whose newest migration is additive (the last such one on disk), and an
    // older one without it.
    const newest = onDisk.findLast((name) => ADDITIVE_MIGRATIONS.has(name))!;
    const upTo = onDisk.slice(0, onDisk.indexOf(newest) + 1);
    const copy = (names: readonly string[]): string => {
      const dir = mkdtempSync(join(tmpdir(), 'remry-migrations-'));
      for (const name of names) cpSync(join('prisma/migrations', name), join(dir, name), { recursive: true });
      return dir;
    };
    const { client } = freshDb();
    expect((await applyMigrations(client, copy(upTo), quiet)).ok).toBe(true);
    const needed = Number((await client.execute('PRAGMA user_version')).rows[0]![0]);
    expect(needed).toBeLessThan(upTo.length);
    const opened = await applyMigrations(client, copy(upTo.slice(0, -1)), quiet);
    expect(opened.ok && opened.value.applied).toEqual([]);
    // It keeps the newer Remry's record of what the database needs.
    expect(Number((await client.execute('PRAGMA user_version')).rows[0]![0])).toBe(needed);
    client.close();
  });

  it('refuses a database a newer Remry migrated past what it knows, when that migration changed what it reads', async () => {
    // drop_page_kinds removes columns an older Remry reads, so it isn't additive.
    const dropKinds = onDisk.find((name) => name.endsWith('_drop_page_kinds'))!;
    expect(ADDITIVE_MIGRATIONS.has(dropKinds)).toBe(false);
    const { dir, client } = freshDb();
    expect((await applyMigrations(client, 'prisma/migrations', quiet)).ok).toBe(true);
    const older = join(dir, 'older');
    for (const name of onDisk.slice(0, onDisk.indexOf(dropKinds))) cpSync(join('prisma/migrations', name), join(older, name), { recursive: true });
    expect((await applyMigrations(client, older, quiet)).ok).toBe(false);
    client.close();
  });

  it('applies nothing the second time', async () => {
    const { client } = freshDb();
    await applyMigrations(client, 'prisma/migrations', quiet);
    const again = await applyMigrations(client, 'prisma/migrations', quiet);
    expect(again.ok && again.value.applied).toEqual([]);
    client.close();
  });

  it('lets two processes open a fresh database at once, applying each migration once', async () => {
    const { dir, client } = freshDb();
    const path = join(dir, 'db.sqlite');
    const startAt = String(Date.now() + 1500);
    const run = () =>
      new Promise<{ readonly ok: boolean; readonly applied?: readonly string[]; readonly error?: string }>((resolve, reject) => {
        const child = spawn(BUN, ['tests/integration/fixtures/migrate-child.ts', path, startAt], { stdio: ['ignore', 'pipe', 'inherit'] });
        let out = '';
        child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
        child.on('close', () => {
          try {
            resolve(JSON.parse(out));
          } catch {
            reject(new Error(`migrate child printed: ${out}`));
          }
        });
      });
    const [first, second] = await Promise.all([run(), run()]);
    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    expect([...(first.applied ?? []), ...(second.applied ?? [])].sort()).toEqual(onDisk);

    const rows = await client.execute('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name');
    expect(rows.rows.map((r) => r[0])).toEqual(onDisk);
    client.close();
  });

  it('waits for a migration another process is applying, then reports it if it never finishes', async () => {
    const { client } = freshDb();
    await client.execute(
      `CREATE TABLE "_prisma_migrations" ("id" TEXT PRIMARY KEY NOT NULL, "checksum" TEXT NOT NULL, "finished_at" DATETIME, "migration_name" TEXT NOT NULL, "logs" TEXT, "rolled_back_at" DATETIME, "started_at" DATETIME NOT NULL DEFAULT current_timestamp, "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0)`
    );
    const firstSql = readFileSync(join('prisma/migrations', onDisk[0]!, 'migration.sql'), 'utf8');
    await client.execute({
      sql: 'INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at) VALUES (?, ?, ?, ?)',
      args: ['claim', checksum(firstSql), onDisk[0]!, Date.now()]
    });
    const result = await applyMigrations(client, 'prisma/migrations', quiet, { waitMs: 100, staleMs: 10 * 60_000, pollMs: 20 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('still being applied by another process');
    client.close();
  });

  it('refuses a migration edited after it was applied', async () => {
    const { dir, client } = freshDb();
    const migrations = join(dir, 'migrations');
    cpSync('prisma/migrations', migrations, { recursive: true });
    await applyMigrations(client, migrations, quiet);

    appendFileSync(join(migrations, onDisk[0]!, 'migration.sql'), '\n-- edited later\n');
    const result = await applyMigrations(client, migrations, quiet);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('modified after it was applied');
    client.close();
  });

  it('drops page kinds: the starter ones first, then the table and the page columns, keeping pages', async () => {
    const hasKinds = async (client: ReturnType<typeof createClient>) =>
      Number((await client.execute("SELECT count(*) FROM sqlite_master WHERE name = 'page_kind'")).rows[0]![0]) > 0;

    const fresh = freshDb();
    await applyMigrations(fresh.client, 'prisma/migrations', quiet);
    expect(await hasKinds(fresh.client)).toBe(false);
    fresh.client.close();

    const { dir, client } = freshDb();
    const migrations = join(dir, 'migrations');
    const kindsMigration = onDisk.find((name) => name.endsWith('_add_page_kinds'))!;
    cpSync('prisma/migrations', migrations, {
      recursive: true,
      filter: (src) => !onDisk.slice(onDisk.indexOf(kindsMigration)).some((name) => src.includes(name))
    });
    await applyMigrations(client, migrations, quiet);
    await client.execute("INSERT INTO page (id, title, kind, updated_at) VALUES ('p1', 'Datadog', 'SOFTWARE', CURRENT_TIMESTAMP)");
    cpSync('prisma/migrations', migrations, { recursive: true });
    await applyMigrations(client, migrations, quiet);
    expect(await hasKinds(client)).toBe(false);
    // A starter kind's page became a plain page before kinds went, so its text stays as it was.
    const page = (await client.execute("SELECT title, content FROM page WHERE id = 'p1'")).rows[0]!;
    expect([page[0], page[1]]).toEqual(['Datadog', '']);
    const columns = (await client.execute("SELECT name FROM pragma_table_info('page')")).rows.map((r) => r[0]);
    expect(columns).not.toContain('kind');
    expect(columns).not.toContain('properties');
    client.close();
  });

  it("writes a page's kind and field values into its text before kinds go", async () => {
    const { dir, client } = freshDb();
    const migrations = join(dir, 'migrations');
    const dropKinds = onDisk.find((name) => name.endsWith('_drop_page_kinds'))!;
    cpSync('prisma/migrations', migrations, { recursive: true, filter: (src) => !src.includes(dropKinds) });
    await applyMigrations(client, migrations, quiet);
    await client.execute(`INSERT INTO page_kind (key, name, fields, updated_at) VALUES ('EXPENSE', 'Expense', '[{"key":"amount","label":"Amount","input":"number"},{"key":"tags","label":"Tags","input":"multiselect","options":["Home","Fun"]},{"key":"paid","label":"Paid","input":"checkbox"}]', CURRENT_TIMESTAMP)`);
    await client.execute(`INSERT INTO page (id, title, kind, content, properties, updated_at) VALUES ('p1', 'Netflix', 'EXPENSE', 'Streaming.', '{"amount":15.49,"tags":["Home","Fun"],"paid":true,"note":null}', CURRENT_TIMESTAMP)`);
    await client.execute(`INSERT INTO page (id, title, kind, content, properties, updated_at) VALUES ('p2', 'Plain', 'GENERAL', 'Just text.', '{}', CURRENT_TIMESTAMP)`);
    await client.execute(`INSERT INTO page (id, title, kind, body_type, content, properties, updated_at) VALUES ('p3', 'Grid', 'EXPENSE', 'sheet', '{"columns":[],"data":[]}', '{"amount":3}', CURRENT_TIMESTAMP)`);
    cpSync(join('prisma/migrations', dropKinds), join(migrations, dropKinds), { recursive: true });
    expect((await applyMigrations(client, migrations, quiet)).ok).toBe(true);

    const content = async (id: string) => (await client.execute({ sql: 'SELECT content FROM page WHERE id = ?', args: [id] })).rows[0]![0];
    expect(await content('p1')).toBe('- **Kind:** Expense\n- **Amount:** 15.49\n- **Tags:** Home, Fun\n- **Paid:** Yes\n\nStreaming.');
    expect(await content('p2')).toBe('Just text.');
    // A spreadsheet page has no text to hold them.
    expect(await content('p3')).toBe('{"columns":[],"data":[]}');
    // Search reads the values in the text now, and the page's triggers still run.
    const hits = (await client.execute("SELECT entity_id FROM search_index WHERE search_index MATCH 'expense'")).rows.map((r) => r[0]);
    expect(hits).toEqual(['p1']);
    await client.execute("UPDATE page SET title = 'Netflix plan' WHERE id = 'p1'");
    expect((await client.execute("SELECT title FROM search_index WHERE entity_type = 'PAGE' AND entity_id = 'p1'")).rows[0]![0]).toBe('Netflix plan');
    client.close();
  });

  it('indexes rows that existed before the search index was added', async () => {
    const { dir, client } = freshDb();
    const migrations = join(dir, 'migrations');
    cpSync('prisma/migrations', migrations, { recursive: true });
    const indexMigration = onDisk.find((name) => name.endsWith('_add_search_index'))!;
    const later = onDisk.slice(onDisk.indexOf(indexMigration));
    for (const name of later) rmSync(join(migrations, name), { recursive: true });
    await applyMigrations(client, migrations, quiet);

    await client.execute("INSERT INTO person (id, name, updated_at) VALUES ('p1', 'Ada Lovelace', CURRENT_TIMESTAMP)");
    await client.execute("INSERT INTO note (id, entity_type, entity_id, content, updated_at) VALUES ('n1', 'PERSON', 'p1', 'Analytical engine notes', CURRENT_TIMESTAMP)");
    await client.execute(`INSERT INTO page (id, title, kind, properties, updated_at) VALUES ('w1', 'Babbage', 'ENGINE', '{"vendor":"Difference Ltd"}', CURRENT_TIMESTAMP)`);
    for (const name of later) cpSync(join('prisma/migrations', name), join(migrations, name), { recursive: true });
    const result = await applyMigrations(client, migrations, quiet);
    expect(result.ok && result.value.applied).toEqual(later);

    const hits = async (match: string) =>
      (await client.execute({ sql: 'SELECT entity_type, entity_id, parent_id FROM search_index WHERE search_index MATCH ? ORDER BY entity_id', args: [match] })).rows
        .map((r) => [r[0], r[1], r[2]]);
    expect(await hits('lovelace')).toEqual([['PERSON', 'p1', null]]);
    // The page's old kind is in its text now (drop_page_kinds), so it matches too.
    expect(await hits('engine')).toEqual([['NOTE', 'n1', 'p1'], ['PAGE', 'w1', null]]);
    expect(await hits('difference')).toEqual([['PAGE', 'w1', null]]);  // a field value, in its text too
    client.close();
  });

  it('turns teams and departments into groups and moves person fields to their modules, keeping ids', async () => {
    const { dir, client } = freshDb();
    const migrations = join(dir, 'migrations');
    const groupsMigration = onDisk.find((name) => name.endsWith('_add_groups_and_person_modules'))!;
    const later = onDisk.slice(onDisk.indexOf(groupsMigration));
    cpSync('prisma/migrations', migrations, { recursive: true });
    for (const name of later) rmSync(join(migrations, name), { recursive: true });
    await applyMigrations(client, migrations, quiet);

    await client.executeMultiple(`
      INSERT INTO department (id, name, updated_at) VALUES ('d1', 'Engineering', CURRENT_TIMESTAMP);
      INSERT INTO team (id, name, description, updated_at) VALUES ('t1', 'Platform', 'Runs the build farm', CURRENT_TIMESTAMP);
      INSERT INTO person (id, name, title, updated_at) VALUES ('p1', 'Ada', 'CTO', CURRENT_TIMESTAMP);
      INSERT INTO person (id, name, title, lead_id, department_id, birthday, updated_at) VALUES ('p2', 'Bo', 'Engineer', 'p1', 'd1', '--05-03', CURRENT_TIMESTAMP);
      INSERT INTO team_member (id, team_id, person_id) VALUES ('m1', 't1', 'p2');
      INSERT INTO note (id, entity_type, entity_id, content, updated_at) VALUES ('n1', 'TEAM', 't1', 'Hiring two', CURRENT_TIMESTAMP);
      INSERT INTO project (id, name, owner_type, owner_id, updated_at) VALUES ('pr1', 'Checkout', 'DEPARTMENT', 'd1', CURRENT_TIMESTAMP);
      INSERT INTO relation (id, from_type, from_id, to_type, to_id, kind, updated_at) VALUES ('r1', 'PROJECT', 'pr1', 'TEAM', 't1', 'RELATED', CURRENT_TIMESTAMP);
    `);
    for (const name of later) cpSync(join('prisma/migrations', name), join(migrations, name), { recursive: true });
    const result = await applyMigrations(client, migrations, quiet);
    expect(result.ok && result.value.applied).toEqual(later);

    const rows = async (sql: string) => (await client.execute(sql)).rows.map((r) => Object.values(r));
    expect(await rows('SELECT key, exclusive FROM group_kind ORDER BY sort_order')).toEqual([['TEAM', 0], ['DEPARTMENT', 1]]);
    expect(await rows('SELECT id, kind, name FROM "group" ORDER BY id')).toEqual([['d1', 'DEPARTMENT', 'Engineering'], ['t1', 'TEAM', 'Platform']]);
    expect(await rows('SELECT group_id, person_id FROM group_member ORDER BY group_id')).toEqual([['d1', 'p2'], ['t1', 'p2']]);
    expect(await rows('SELECT person_id, title FROM org_person ORDER BY person_id')).toEqual([['p1', 'CTO'], ['p2', 'Engineer']]);
    // The lead became a one-each LEAD_OF person relation, from the lead to the report.
    expect(await rows('SELECT key, exclusive FROM person_relation_kind')).toEqual([['LEAD_OF', 1]]);
    expect(await rows("SELECT from_person_id, to_person_id FROM person_relation WHERE kind = 'LEAD_OF'")).toEqual([['p1', 'p2']]);
    expect(await rows('SELECT person_id, birthday FROM personal_person')).toEqual([['p2', '--05-03']]);
    expect(await rows('SELECT entity_type FROM note')).toEqual([['GROUP']]);
    expect(await rows('SELECT owner_type FROM project')).toEqual([['GROUP']]);
    expect(await rows('SELECT to_type, kind FROM relation')).toEqual([['GROUP', 'RELATED']]);

    const hits = async (match: string) =>
      (await client.execute({ sql: 'SELECT entity_type, entity_id, parent_type FROM search_index WHERE search_index MATCH ? ORDER BY entity_id', args: [match] })).rows
        .map((r) => [r[0], r[1], r[2]]);
    expect(await hits('farm')).toEqual([['GROUP', 't1', null]]);
    expect(await hits('hiring')).toEqual([['NOTE', 'n1', 'GROUP']]);
    expect(await hits('engineer')).toContainEqual(['PERSON', 'p2', null]);
    // A module's field reindexes the person when it changes.
    await client.execute("UPDATE org_person SET title = 'Architect' WHERE person_id = 'p2'");
    expect(await hits('architect')).toEqual([['PERSON', 'p2', null]]);
    expect((await client.execute('PRAGMA foreign_key_check')).rows).toEqual([]);
    client.close();
  });

  it('moves relationships between people to person_relation, one row per symmetric pair', async () => {
    const { dir, client } = freshDb();
    const migrations = join(dir, 'migrations');
    const personMigration = onDisk.find((name) => name.endsWith('_add_person_relations'))!;
    const later = onDisk.slice(onDisk.indexOf(personMigration));
    cpSync('prisma/migrations', migrations, { recursive: true });
    for (const name of later) rmSync(join(migrations, name), { recursive: true });
    await applyMigrations(client, migrations, quiet);

    await client.executeMultiple(`
      INSERT INTO relation_kind (key, label, inverse_label, symmetric, people_only, exclusive, updated_at) VALUES
        ('PARENT_OF', 'Parent of', 'Child of', 0, 1, 0, CURRENT_TIMESTAMP),
        ('FRIEND_OF', 'Friend of', 'Friend of', 1, 1, 0, CURRENT_TIMESTAMP),
        ('USES', 'Uses', 'Used by', 0, 0, 0, CURRENT_TIMESTAMP);
      INSERT INTO person (id, name, updated_at) VALUES ('a', 'Ada', CURRENT_TIMESTAMP), ('b', 'Bo', CURRENT_TIMESTAMP);
      INSERT INTO project (id, name, updated_at) VALUES ('pr1', 'Garden', CURRENT_TIMESTAMP);
      INSERT INTO relation (id, from_type, from_id, to_type, to_id, kind, note, updated_at) VALUES
        ('r1', 'PERSON', 'a', 'PERSON', 'b', 'PARENT_OF', 'adopted', CURRENT_TIMESTAMP),
        ('r2', 'PERSON', 'b', 'PERSON', 'a', 'FRIEND_OF', NULL, CURRENT_TIMESTAMP),
        ('r3', 'PERSON', 'a', 'PERSON', 'b', 'FRIEND_OF', NULL, CURRENT_TIMESTAMP),
        ('r4', 'PERSON', 'a', 'PROJECT', 'pr1', 'USES', 'weekends', CURRENT_TIMESTAMP),
        ('r5', 'PERSON', 'a', 'PERSON', 'b', 'RELATED', NULL, CURRENT_TIMESTAMP);
    `);
    for (const name of later) cpSync(join('prisma/migrations', name), join(migrations, name), { recursive: true });
    const result = await applyMigrations(client, migrations, quiet);
    expect(result.ok && result.value.applied).toEqual(later);

    const rows = async (sql: string) => (await client.execute(sql)).rows.map((r) => Object.values(r));
    expect(await rows('SELECT key FROM person_relation_kind ORDER BY key')).toEqual([['FRIEND_OF'], ['PARENT_OF'], ['USES']]);
    expect(await rows('SELECT from_person_id, to_person_id, kind, note FROM person_relation ORDER BY kind')).toEqual([
      ['a', 'b', 'FRIEND_OF', null],
      ['a', 'b', 'PARENT_OF', 'adopted']
    ]);
    // A notebook kind between other things becomes RELATED, keeping its note.
    expect(await rows('SELECT id, kind, note FROM relation ORDER BY id')).toEqual([['r4', 'RELATED', 'weekends'], ['r5', 'RELATED', null]]);
    expect((await client.execute("SELECT name FROM sqlite_master WHERE name = 'relation_kind'")).rows).toEqual([]);
    expect((await client.execute('PRAGMA foreign_key_check')).rows).toEqual([]);
    client.close();
  });
});
