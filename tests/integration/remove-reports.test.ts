// The remove_reports migration: each report becomes a doc on what it was attached to (a sub-page,
// on a wiki page), keeping its id, so its notes and relations follow; then the table goes. Its SQL
// runs here against a report table set up the way older versions left one.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getRegistry } from '../../src/shared/registry.server';
import { createPage, getPage } from '../../src/api/page/operations';
import { getDoc } from '../../src/api/attached/doc/operations';
import { listNotes } from '../../src/api/attached/note/operations';
import { searchNotebook } from '../../src/api/search/operations';
import { TEST_NOTEBOOK } from './test-notebooks';

const MIGRATION = resolve('prisma/migrations/20261103120000_remove_reports/migration.sql');

describe('remove_reports', () => {
  it('keeps each report as a doc or a sub-page, with what hung off it, and drops the table', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const p = reg.prisma;
    const page = await createPage(reg, { title: 'Vendors' });
    if (!page.ok) throw page.error;

    // The table as older versions had it.
    await p.$executeRawUnsafe(`CREATE TABLE "report" ("id" TEXT NOT NULL PRIMARY KEY, "entity_type" TEXT NOT NULL, "entity_id" TEXT NOT NULL, "title" TEXT NOT NULL, "content" TEXT NOT NULL DEFAULT '', "branding_id" TEXT, "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" DATETIME NOT NULL)`);
    const now = new Date().toISOString();
    await p.$executeRawUnsafe(`INSERT INTO "report" ("id", "entity_type", "entity_id", "title", "content", "created_at", "updated_at") VALUES ('rep_person', 'PERSON', 'person_alice', 'Q3 review', '# Q3 zygomorphic', ?, ?), ('rep_page', 'PAGE', ?, 'Pricing report', '# Prices', ?, ?)`, now, now, page.value.id, now, now);
    await p.note.create({ data: { entityType: 'REPORT', entityId: 'rep_person', content: 'Shared with Bob' } });
    await p.relation.create({ data: { fromType: 'PERSON', fromId: 'person_bob', toType: 'REPORT', toId: 'rep_person', kind: 'RELATED' } });

    const sql = readFileSync(MIGRATION, 'utf8').split('\n').filter((line) => !line.startsWith('--')).join('\n');
    for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) await p.$executeRawUnsafe(statement);

    const doc = await getDoc(reg, 'rep_person');
    expect(doc.ok && [doc.value.title, doc.value.content, doc.value.entityType, doc.value.entityId]).toEqual(['Q3 review', '# Q3 zygomorphic', 'PERSON', 'person_alice']);
    const notes = await listNotes(reg, 'DOC', 'rep_person');
    expect(notes.ok && notes.value.map((n) => n.content)).toEqual(['Shared with Bob']);
    expect(await p.relation.count({ where: { fromId: 'person_bob', toType: 'DOC', toId: 'rep_person' } })).toBe(1);

    const sub = await getPage(reg, 'rep_page');
    expect(sub.ok && [sub.value.title, sub.value.content]).toEqual(['Pricing report', '# Prices']);
    const parent = await getPage(reg, page.value.id);
    expect(parent.ok && parent.value.children.map((c) => c.title)).toEqual(['Pricing report']);

    // Searchable as a doc now, and nothing left under REPORT.
    const hits = await searchNotebook(reg, { q: 'zygomorphic' });
    expect(hits.ok && hits.value.results.map((r) => [r.entityType, r.entityId])).toEqual([['DOC', 'rep_person']]);
    const tables = await p.$queryRawUnsafe<{ name: string }[]>("SELECT name FROM sqlite_master WHERE name = 'report'");
    expect(tables).toEqual([]);
  });
});
