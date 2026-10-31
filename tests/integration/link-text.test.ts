// A file link's saved text and a source's last-edited time, against the real database: the
// columns migrate in, a read returns the saved text before the file, the text is searchable and
// leaves the index with the link, and markSynced keeps the source's edited time between syncs.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { createProject } from '../../src/api/project/operations';
import { addLink, listLinks, markLinkSynced, readLinkFile, removeLink, updateLink, uploadLinkFile } from '../../src/api/attached/link/operations';
import { searchNotebook } from '../../src/api/search/operations';
import { TEST_NOTEBOOK } from './test-notebooks';

const reg = getRegistry(TEST_NOTEBOOK);

// The smallest PDF the upload accepts: its magic bytes.
const pdfBase64 = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'latin1').toString('base64');

const hits = async (q: string): Promise<readonly string[]> => {
  const result = await searchNotebook(reg, { q });
  if (!result.ok) throw result.error;
  return result.value.results.map((r) => r.entityId);
};

describe('a file link\'s saved text', () => {
  it('is read before the file, searchable, and gone from search with the link', async () => {
    const project = await createProject(reg, { name: 'Vendor renewal (link text)' });
    if (!project.ok) throw project.error;
    const upload = await uploadLinkFile(reg, 'PROJECT', project.value.id, { dataBase64: pdfBase64 }, 'Contract.pdf');
    if (!upload.ok) throw upload.error;
    const id = upload.value.id;

    // No text yet: the PDF itself, saying so.
    const first = await readLinkFile(reg, id);
    expect(first.ok && first.value.kind === 'pdf' && first.value.textSaved).toBe(false);

    expect((await updateLink(reg, id, { text: '# Contract\nTermination needs ninety days notice.\n[Figure: signature]' })).ok).toBe(true);
    const listed = await listLinks(reg, 'PROJECT', project.value.id);
    expect(listed.ok && listed.value.map((l) => l.hasText)).toEqual([true]);

    const saved = await readLinkFile(reg, id);
    expect(saved.ok && saved.value.kind === 'text' && [saved.value.savedTextOf, saved.value.text.startsWith('# Contract')]).toEqual(['pdf', true]);
    const original = await readLinkFile(reg, id, { original: true });
    expect(original.ok && original.value.kind).toBe('pdf');

    expect(await hits('termination ninety')).toEqual([id]);
    await removeLink(reg, id);
    expect(await hits('termination ninety')).toEqual([]);
  });

  it('is a text file\'s own text from the upload', async () => {
    const project = await createProject(reg, { name: 'Budget (link text)' });
    if (!project.ok) throw project.error;
    const upload = await uploadLinkFile(reg, 'PROJECT', project.value.id, { text: 'service,monthly\nZylophone,12\n' }, 'subs.csv');
    if (!upload.ok) throw upload.error;
    expect(await hits('zylophone')).toEqual([upload.value.id]);
  });
});

describe('a source\'s last-edited time', () => {
  it('is set on add and on markSynced, and kept by a markSynced without one', async () => {
    const project = await createProject(reg, { name: 'Checkout (source edited)' });
    if (!project.ok) throw project.error;
    const v1 = new Date('2026-10-20T08:00:00Z');
    const link = await addLink(reg, 'PROJECT', project.value.id, { url: 'https://www.notion.so/acme/Checkout-PRD-1', synced: true, sourceEditedAt: v1 });
    if (!link.ok) throw link.error;
    const edited = async () => {
      const listed = await listLinks(reg, 'PROJECT', project.value.id);
      return listed.ok ? listed.value[0]?.sourceEditedAt?.toISOString() : undefined;
    };
    expect(await edited()).toBe(v1.toISOString());

    await markLinkSynced(reg, link.value.id);
    expect(await edited()).toBe(v1.toISOString());

    const v2 = new Date('2026-10-28T16:30:00Z');
    const synced = await markLinkSynced(reg, link.value.id, v2);
    expect(synced.ok && synced.value.sourceEditedAt?.toISOString()).toBe(v2.toISOString());
    expect(await edited()).toBe(v2.toISOString());
  });
});
