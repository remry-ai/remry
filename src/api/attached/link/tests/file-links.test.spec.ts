// Files uploaded as links: stored in the doc's or page's folder, with a link pointing at them
// (storage://…), removed with the link, and converted into the doc's or page's text.
import { describe, it, expect, vi } from 'vitest';
import { createTestRegistry } from '$shared/registry.test';
import type { Registry } from '$shared/registry';
import type { PdfConversionJob, PdfConverter } from '$shared/types/pdf-conversion';
import { addLink, readLinkFile, removeLink, updateLink, uploadLinkFile, READ_IMAGE_BYTES, READ_TEXT_LIMIT } from '../operations';
import { convertFileLink, fileJobKey, transcribeFileLink } from '../convert';
import { cleanupPrisma } from '../../../tests/cleanup-prisma';
import { textSourceFile } from '$api/_uploads';
import { updatePage } from '$api/page/operations';

// Writing a page is tested with the page; here only what's written, and whether Claude runs.
vi.mock('$api/page/operations', () => ({ updatePage: vi.fn().mockResolvedValue({ ok: true, value: {} }) }));

const csv = Buffer.from('name,amount\nHosting,120\n').toString('base64');

describe('uploadLinkFile', () => {
  it('stores the file in the page\'s folder and adds a link to it, titled with its name', async () => {
    const putObject = vi.fn();
    const create = vi.fn().mockResolvedValue({ id: 'link_1' });
    const reg = createTestRegistry({
      prisma: { page: { findUnique: vi.fn().mockResolvedValue({ id: 'pg1', title: 'Budget', archivedAt: null }) }, link: { create } } as unknown as Registry['prisma'],
      storage: { ...createTestRegistry().storage, putObject },
      uuid: () => 'u1'
    });

    const result = await uploadLinkFile(reg, 'PAGE', 'pg1', { dataBase64: csv }, 'Budget 2026.csv');

    expect(result).toEqual({ ok: true, value: { id: 'link_1', url: 'storage://pages/pg1/file-u1.csv' } });
    expect(putObject).toHaveBeenCalledWith('pages/pg1/file-u1.csv', expect.anything(), 'text/plain; charset=utf-8');
    // A text file's saved text is the file itself, so it's searchable and read without opening the file.
    expect(create).toHaveBeenCalledWith({ data: { entityType: 'PAGE', entityId: 'pg1', url: 'storage://pages/pg1/file-u1.csv', title: 'Budget 2026.csv', text: 'name,amount\nHosting,120\n' } });
  });

  it('refuses a file Claude can\'t read, and an entity with no files folder', async () => {
    const reg = createTestRegistry({ prisma: { doc: { findUnique: vi.fn().mockResolvedValue({ id: 'd1', title: 'Spec' }) }, link: { create: vi.fn() } } as unknown as Registry['prisma'] });
    const docx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]).toString('base64');
    const binary = await uploadLinkFile(reg, 'DOC', 'd1', { dataBase64: docx }, 'report.docx');
    expect(!binary.ok && binary.error.message).toContain("can't be read");
    const note = await uploadLinkFile(reg, 'NOTE', 'n1', { dataBase64: csv }, 'x.csv');
    expect(!note.ok && note.error.message).toContain('Add a link to it here instead');
  });
});

describe('uploadLinkFile with text', () => {
  it('stores text sent as text, as UTF-8 under its extension, served as plain text', async () => {
    const putObject = vi.fn();
    const reg = createTestRegistry({
      prisma: { page: { findUnique: vi.fn().mockResolvedValue({ id: 'pg1', title: 'Budget', archivedAt: null }) }, link: { create: vi.fn().mockResolvedValue({ id: 'link_2' }) } } as unknown as Registry['prisma'],
      storage: { ...createTestRegistry().storage, putObject },
      uuid: () => 'u2'
    });

    const result = await uploadLinkFile(reg, 'PAGE', 'pg1', { text: '# Café notes\n' }, 'notes.md');

    expect(result).toEqual({ ok: true, value: { id: 'link_2', url: 'storage://pages/pg1/file-u2.md' } });
    const [, bytes, type] = putObject.mock.calls[0]!;
    expect([Buffer.from(bytes as Uint8Array).toString('utf8'), type]).toEqual(['# Café notes\n', 'text/plain; charset=utf-8']);
  });
});

describe('textSourceFile', () => {
  it('refuses empty text and text with NUL characters, and never stores text as a PDF', () => {
    expect(textSourceFile('', 'a.md').ok).toBe(false);
    expect(textSourceFile('a\u0000b', 'a.bin').ok).toBe(false);
    const named = textSourceFile('%PDF-1.7 not really', 'fake.pdf');
    expect(named.ok && [named.value.extension, named.value.contentType]).toEqual(['txt', 'text/plain; charset=utf-8']);
  });
});

describe('addLink', () => {
  it('refuses a storage:// address typed by hand', async () => {
    const result = await addLink(createTestRegistry(), 'PAGE', 'pg1', { url: 'storage://docs/other/file-x.pdf' });
    expect(!result.ok && result.error.message).toContain('made by uploading the file');
  });
});

describe('removeLink', () => {
  const regWith = (url: string, deleteObject = vi.fn()) => {
    const prisma = cleanupPrisma({}, {
      link: { findUnique: vi.fn().mockResolvedValue({ id: 'l1', url, entityType: 'PAGE', entityId: 'pg1' }), findMany: vi.fn().mockResolvedValue([]), delete: vi.fn(), deleteMany: vi.fn() },
      page: { findUnique: vi.fn().mockResolvedValue({ id: 'pg1', title: 'Budget', archivedAt: null }) }
    });
    return createTestRegistry({ prisma: prisma as unknown as Registry['prisma'], storage: { ...createTestRegistry().storage, deleteObject } });
  };

  it('deletes a file link\'s file in the entity\'s own folder', async () => {
    const deleteObject = vi.fn();
    expect((await removeLink(regWith('storage://pages/pg1/file-a.csv', deleteObject), 'l1')).ok).toBe(true);
    expect(deleteObject).toHaveBeenCalledWith('pages/pg1/file-a.csv');
  });

  it('never deletes a file outside it, nor anything for an outside link', async () => {
    const deleteObject = vi.fn();
    await removeLink(regWith('storage://docs/other/file-a.csv', deleteObject), 'l1');
    await removeLink(regWith('https://linear.app/x', deleteObject), 'l1');
    expect(deleteObject).not.toHaveBeenCalled();
  });
});

describe('convertFileLink', () => {
  const fakeConverter = () => {
    const jobs: PdfConversionJob[] = [];
    const converter: PdfConverter = { locate: () => '/usr/local/bin/claude', start: (job) => { jobs.push(job); }, status: vi.fn(() => ({ state: 'running' as const })) };
    return { converter, jobs };
  };
  const regWith = (link: object, page: object = { bodyType: 'doc', archivedAt: null }) => createTestRegistry({
    prisma: { link: { findUnique: vi.fn().mockResolvedValue(link) }, page: { findUnique: vi.fn().mockResolvedValue({ id: 'pg1', ...page }) } } as unknown as Registry['prisma']
  });

  it('starts a job writing the page from the file, keyed by the page', async () => {
    const { converter, jobs } = fakeConverter();
    const result = await convertFileLink(regWith({ id: 'l1', url: 'storage://pages/pg1/file-a.csv', entityType: 'PAGE', entityId: 'pg1' }), converter, 'work', 'l1');
    expect(result).toEqual({ ok: true, value: { started: true } });
    expect(jobs.map((j) => [j.key, j.pdfPath])).toEqual([[fileJobKey('work', 'PAGE', 'pg1'), '/files/pages/pg1/file-a.csv']]);
  });

  it('refuses an outside link, a file in another folder, and a spreadsheet page', async () => {
    const { converter } = fakeConverter();
    const outside = await convertFileLink(regWith({ id: 'l1', url: 'https://linear.app/x', entityType: 'PAGE', entityId: 'pg1' }), converter, 'work', 'l1');
    expect(!outside.ok && outside.error.message).toContain('Only a file uploaded');
    const elsewhere = await convertFileLink(regWith({ id: 'l1', url: 'storage://pages/other/file-a.csv', entityType: 'PAGE', entityId: 'pg1' }), converter, 'work', 'l1');
    expect(elsewhere.ok).toBe(false);
    const sheet = await convertFileLink(regWith({ id: 'l1', url: 'storage://pages/pg1/file-a.csv', entityType: 'PAGE', entityId: 'pg1' }, { bodyType: 'sheet', archivedAt: null }), converter, 'work', 'l1');
    expect(!sheet.ok && sheet.error.message).toContain('spreadsheet page');
  });
});

describe('readLinkFile', () => {
  const regWith = (url: string, stored: { bytes: Uint8Array; contentType: string } | null) => createTestRegistry({
    prisma: { link: { findUnique: vi.fn().mockResolvedValue({ id: 'l1', url, title: 'budget.csv', entityType: 'PAGE', entityId: 'pg1' }) } } as unknown as Registry['prisma'],
    storage: { ...createTestRegistry().storage, readObject: vi.fn().mockResolvedValue(stored) }
  });
  const text = (s: string) => ({ bytes: new TextEncoder().encode(s), contentType: 'text/plain; charset=utf-8' });

  it('gives a text file\'s text, cut and marked past the limit', async () => {
    expect(await readLinkFile(regWith('storage://pages/pg1/file-a.csv', text('a,b\n1,2\n')), 'l1')).toEqual({ ok: true, value: { title: 'budget.csv', kind: 'text', text: 'a,b\n1,2\n' } });
    const long = await readLinkFile(regWith('storage://pages/pg1/file-a.txt', text('x'.repeat(READ_TEXT_LIMIT + 5))), 'l1');
    expect(long.ok && long.value.kind === 'text' && [long.value.text.length, long.value.truncated]).toEqual([READ_TEXT_LIMIT, true]);
  });

  it('hands over an image or a PDF as an attachment', async () => {
    const png = await readLinkFile(regWith('storage://pages/pg1/file-a.png', { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' }), 'l1');
    expect(png).toEqual({ ok: true, value: { title: 'budget.csv', kind: 'image', attachment: { mimeType: 'image/png', dataBase64: 'AQID' }, textSaved: false } });
    const pdf = await readLinkFile(regWith('storage://pages/pg1/file-a.pdf', { bytes: new Uint8Array([1]), contentType: 'application/pdf' }), 'l1');
    expect(pdf.ok && pdf.value.kind).toBe('pdf');
  });

  it('refuses an outside link, a missing file and an image too large to hand over', async () => {
    const outside = await readLinkFile(regWith('https://linear.app/x', null), 'l1');
    expect(!outside.ok && outside.error.message).toContain('points outside the notebook');
    const missing = await readLinkFile(regWith('storage://pages/pg1/file-a.csv', null), 'l1');
    expect(!missing.ok && missing.error.message).toContain('missing');
    const big = await readLinkFile(regWith('storage://pages/pg1/file-a.png', { bytes: new Uint8Array(READ_IMAGE_BYTES + 1), contentType: 'image/png' }), 'l1');
    expect(!big.ok && big.error.message).toContain('Ask the user to paste');
  });
});

describe('readLinkFile with saved text', () => {
  const regWith = (url: string, text: string | null) => {
    const readObject = vi.fn().mockResolvedValue({ bytes: new Uint8Array([1]), contentType: 'application/pdf' });
    const reg = createTestRegistry({
      prisma: { link: { findUnique: vi.fn().mockResolvedValue({ id: 'l1', url, title: 'Contract.pdf', entityType: 'PROJECT', entityId: 'pr1', text }) } } as unknown as Registry['prisma'],
      storage: { ...createTestRegistry().storage, readObject }
    });
    return { reg, readObject };
  };

  it('returns a PDF\'s saved text without opening the file, saying what it stands for', async () => {
    const { reg, readObject } = regWith('storage://projects/pr1/file-a.pdf', '# Contract\n[Figure: signature]');
    expect(await readLinkFile(reg, 'l1')).toEqual({ ok: true, value: { title: 'Contract.pdf', kind: 'text', text: '# Contract\n[Figure: signature]', savedTextOf: 'pdf' } });
    expect(readObject).not.toHaveBeenCalled();
  });

  it('opens the file itself with original, and says when no text is saved yet', async () => {
    const saved = regWith('storage://projects/pr1/file-a.pdf', '# Contract');
    const original = await readLinkFile(saved.reg, 'l1', { original: true });
    expect(original.ok && original.value.kind === 'pdf' && original.value.textSaved).toBe(true);
    const unsaved = await readLinkFile(regWith('storage://projects/pr1/file-a.pdf', null).reg, 'l1');
    expect(unsaved.ok && unsaved.value.kind === 'pdf' && unsaved.value.textSaved).toBe(false);
  });
});

describe('updateLink', () => {
  const regWith = (url: string) => {
    const update = vi.fn();
    const reg = createTestRegistry({
      prisma: {
        link: { findUnique: vi.fn().mockResolvedValue({ id: 'l1', url, entityType: 'PROJECT', entityId: 'pr1' }), update },
        project: { findUnique: vi.fn().mockResolvedValue({ id: 'pr1', archivedAt: null }) }
      } as unknown as Registry['prisma']
    });
    return { reg, update };
  };

  it('saves a file link\'s text, and clears it with null or blank text', async () => {
    const { reg, update } = regWith('storage://projects/pr1/file-a.pdf');
    expect((await updateLink(reg, 'l1', { text: '# Contract' })).ok).toBe(true);
    await updateLink(reg, 'l1', { text: '  ' });
    await updateLink(reg, 'l1', { title: 'Signed contract.pdf' });
    expect(update.mock.calls.map(([arg]) => arg.data)).toEqual([{ text: '# Contract' }, { text: null }, { title: 'Signed contract.pdf' }]);
  });

  it('keeps no text for an outside link', async () => {
    const { reg, update } = regWith('https://notion.so/acme/Spec-abc');
    const result = await updateLink(reg, 'l1', { text: 'the spec' });
    expect(!result.ok && result.error.message).toContain('Only a file uploaded as a link keeps its text');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('transcribeFileLink and convertFileLink with saved text', () => {
  const setup = (link: object) => {
    const jobs: PdfConversionJob[] = [];
    const converter: PdfConverter = { locate: () => '/usr/local/bin/claude', start: (job) => { jobs.push(job); }, status: vi.fn(() => ({ state: 'running' as const })) };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const pageUpdate = vi.fn();
    const reg = createTestRegistry({
      prisma: {
        link: { findUnique: vi.fn().mockResolvedValue(link), updateMany },
        page: { findUnique: vi.fn().mockResolvedValue({ id: 'pg1', bodyType: 'doc', archivedAt: null }), update: pageUpdate },
        project: { findUnique: vi.fn().mockResolvedValue({ id: 'pr1', archivedAt: null }) }
      } as unknown as Registry['prisma']
    });
    return { reg, converter, jobs, updateMany };
  };

  it('saves a PDF\'s text on the link from a job keyed by the link', async () => {
    const { reg, converter, jobs, updateMany } = setup({ id: 'l1', url: 'storage://projects/pr1/file-a.pdf', entityType: 'PROJECT', entityId: 'pr1', text: null });
    expect(await transcribeFileLink(reg, converter, 'work', 'l1')).toEqual({ ok: true, value: { started: true } });
    expect(jobs.map((j) => j.key)).toEqual([fileJobKey('work', 'LINK', 'l1')]);
    await jobs[0]!.onMarkdown('# Contract');
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { text: '# Contract' } });
  });

  it('says when claude isn\'t installed', async () => {
    const { reg } = setup({ id: 'l1', url: 'storage://projects/pr1/file-a.pdf', entityType: 'PROJECT', entityId: 'pr1', text: null });
    const none: PdfConverter = { locate: () => null, start: vi.fn(), status: vi.fn() };
    const result = await transcribeFileLink(reg, none, 'work', 'l1');
    expect(result.ok && !result.value.started).toBe(true);
  });

  it('writes a page from a PDF\'s saved text without running Claude', async () => {
    const { reg, converter, jobs } = setup({ id: 'l1', url: 'storage://pages/pg1/file-a.pdf', entityType: 'PAGE', entityId: 'pg1', text: '# From the PDF' });
    expect(await convertFileLink(reg, converter, 'work', 'l1')).toEqual({ ok: true, value: { started: true } });
    expect(jobs).toEqual([]);
    expect(updatePage).toHaveBeenLastCalledWith(reg, 'pg1', { content: '# From the PDF' });
  });

  it('runs Claude for a CSV even with its text saved, and keeps that text as the file', async () => {
    const { reg, converter, jobs, updateMany } = setup({ id: 'l1', url: 'storage://pages/pg1/file-a.csv', entityType: 'PAGE', entityId: 'pg1', text: 'a,b\n1,2\n' });
    await convertFileLink(reg, converter, 'work', 'l1');
    expect(jobs).toHaveLength(1);
    await jobs[0]!.onMarkdown('| a | b |');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('saves the text along with the page when converting a PDF with none yet', async () => {
    const { reg, converter, jobs, updateMany } = setup({ id: 'l1', url: 'storage://pages/pg1/file-a.pdf', entityType: 'PAGE', entityId: 'pg1', text: null });
    await convertFileLink(reg, converter, 'work', 'l1');
    await jobs[0]!.onMarkdown('# From the PDF');
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { text: '# From the PDF' } });
  });
});
