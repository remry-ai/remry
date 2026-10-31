// The doc_sources_to_links migration: a doc's attached PDF (doc.source_url) becomes a file link
// on the doc, pointing at the same file, and the column is emptied. Its SQL runs here against a
// doc set up the way older versions left one, then the link reads back through link.read.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getRegistry } from '../../src/shared/registry.server';
import { listLinks, readLinkFile } from '../../src/api/attached/link/operations';
import { TEST_NOTEBOOK } from './test-notebooks';

const MIGRATION = resolve('prisma/migrations/20261101120000_doc_sources_to_links/migration.sql');

describe('doc_sources_to_links', () => {
  it('turns an attached PDF into a file link on the doc, and empties the column', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const pdf = Buffer.from('%PDF-1.7\n% test\n');
    await reg.prisma.doc.create({ data: { id: 'doc_old', entityType: 'PERSON', entityId: 'person_alice', title: 'Contract', sourceUrl: 'docs/doc_old/source-a.pdf' } });
    await reg.prisma.doc.create({ data: { id: 'doc_plain', entityType: 'PERSON', entityId: 'person_alice', title: 'Notes' } });
    await reg.storage.putObject('docs/doc_old/source-a.pdf', pdf, 'application/pdf');

    // The migration's statements, as the migrator runs them.
    const sql = readFileSync(MIGRATION, 'utf8').split('\n').filter((line) => !line.startsWith('--')).join('\n');
    for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) await reg.prisma.$executeRawUnsafe(statement);

    const links = await listLinks(reg, 'DOC', 'doc_old');
    expect(links.ok && links.value.map((l) => [l.url, l.title])).toEqual([['storage://docs/doc_old/source-a.pdf', 'Original.pdf']]);
    expect((await reg.prisma.doc.findUnique({ where: { id: 'doc_old' } }))?.sourceUrl).toBeNull();
    expect((await listLinks(reg, 'DOC', 'doc_plain')).ok && (await listLinks(reg, 'DOC', 'doc_plain'))).toMatchObject({ value: [] });

    // The link works like any file link: link.read hands the PDF over.
    const read = await readLinkFile(reg, links.ok ? links.value[0]!.id : '');
    expect(read.ok && read.value.kind).toBe('pdf');
    // Its created_at reads back as a date, in the format Prisma writes.
    expect(links.ok && links.value[0]!.createdAt instanceof Date && !Number.isNaN(links.value[0]!.createdAt.getTime())).toBe(true);
  });
});
