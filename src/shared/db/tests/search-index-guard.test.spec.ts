// Prisma doesn't know about the full-text index (an FTS5 table and triggers;
// prisma.config.ts lists its tables as external). A migration that redefines a
// table Prisma's way (CREATE new_x, copy, DROP TABLE x, RENAME) drops x's
// triggers with it, and the index silently stops updating. This fails until
// such a migration recreates them. See prisma/CLAUDE.md § Migrations.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = 'prisma/migrations';
const INDEX_MIGRATION = /_add_search_index$/;

const names = readdirSync(MIGRATIONS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const sqlOf = (name: string): string => readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8');

const indexMigration = names.find((n) => INDEX_MIGRATION.test(n));
const indexedTables = indexMigration
  ? [...new Set([...sqlOf(indexMigration).matchAll(/CREATE TRIGGER "search_\w+" AFTER \w+ ON "(\w+)"/g)].map((m) => m[1]!))]
  : [];

describe('search index triggers', () => {
  it('are created for every indexed table', () => {
    expect(indexedTables).toEqual(expect.arrayContaining(['person', 'note', 'doc', 'page', 'todo', 'goal_check_in']));
  });

  const later = indexMigration ? names.slice(names.indexOf(indexMigration) + 1) : [];
  it.each(later.length > 0 ? later : ['(none yet)'])('survive migration %s', (name) => {
    if (name === '(none yet)') return;
    const sql = sqlOf(name);
    for (const table of indexedTables) {
      // Only a table that's redefined (copied to new_x, then renamed back) needs its triggers again;
      // one that's dropped for good (team and department, which became groups) takes them along.
      if (!new RegExp(`DROP TABLE "${table}"`).test(sql) || !new RegExp(`RENAME TO "${table}"`).test(sql)) continue;
      for (const event of ['ai', 'au', 'ad']) {
        expect(
          sql,
          `${name} redefines "${table}", which drops its search triggers. Copy the three "search_${table}_*" triggers from ${indexMigration} to the end of this migration.`
        ).toContain(`CREATE TRIGGER "search_${table}_${event}"`);
      }
    }
    expect(sql, `${name} drops the search index`).not.toMatch(/DROP TABLE "search_index/);
  });
});
