// A wiki page's source file, as a doc's, kept only in the page's folder like its images:
// attaching it (page.attachSource), finding it, and converting it with the local Claude.
import { describe, it, expect, vi } from 'vitest';
import { createTestRegistry } from '$shared/registry.test';
import type { Registry } from '$shared/registry';
import { CLAUDE_NOT_FOUND_WARNING } from '$shared/assist/claude-cli';
import type { PdfConversionJob, PdfConverter } from '$shared/types/pdf-conversion';
import { attachPageSource, pageSourceKey } from '../operations';
import { convertPageSource, pageJobKey } from '../convert';

const storageMock = (overrides: Partial<Registry['storage']> = {}): Registry['storage'] => ({
  putObject: vi.fn().mockResolvedValue(undefined),
  readObject: vi.fn().mockResolvedValue(null),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  deleteFolder: vi.fn().mockResolvedValue(undefined),
  listFolder: vi.fn().mockResolvedValue([]),
  moveObject: vi.fn().mockResolvedValue(undefined),
  pathFor: vi.fn((key: string) => `/files/${key}`),
  ...overrides
});

const fakeConverter = (claudePath: string | null = '/opt/homebrew/bin/claude') => {
  const jobs: PdfConversionJob[] = [];
  const converter: PdfConverter = { locate: () => claudePath, start: (job) => { jobs.push(job); }, status: vi.fn(() => ({ state: 'running' as const })) };
  return { converter, jobs };
};

describe('attachPageSource', () => {
  it('stores the file in the page\'s folder, writing nothing to the database, and replaces the one before it', async () => {
    const putObject = vi.fn();
    const deleteObject = vi.fn();
    const update = vi.fn();
    const reg = createTestRegistry({
      prisma: { page: { findUnique: vi.fn().mockResolvedValue({ id: 'pg1', archivedAt: null }), update } } as unknown as Registry['prisma'],
      storage: storageMock({
        putObject,
        deleteObject,
        listFolder: vi.fn().mockResolvedValue([{ name: 'image-1.png', modifiedAt: new Date() }, { name: 'source-old.pdf', modifiedAt: new Date() }])
      }),
      uuid: () => 'uuid-1'
    });

    const csv = Buffer.from('name,amount\nA,1\n').toString('base64');
    const result = await attachPageSource(reg, 'pg1', csv, 'budget.csv');

    expect(result).toEqual({ ok: true, value: { sourceUrl: 'pages/pg1/source-uuid-1.csv' } });
    expect(putObject).toHaveBeenCalledWith('pages/pg1/source-uuid-1.csv', expect.anything(), 'text/plain; charset=utf-8');
    expect(update).not.toHaveBeenCalled();
    expect(deleteObject).toHaveBeenCalledWith('pages/pg1/source-old.pdf');
    expect(deleteObject).toHaveBeenCalledTimes(1);
  });

  it('refuses a file Claude can\'t read, without writing', async () => {
    const putObject = vi.fn();
    const reg = createTestRegistry({
      prisma: { page: { findUnique: vi.fn().mockResolvedValue({ id: 'pg1', archivedAt: null }), update: vi.fn() } } as unknown as Registry['prisma'],
      storage: storageMock({ putObject })
    });
    const docx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]).toString('base64');
    const result = await attachPageSource(reg, 'pg1', docx, 'report.docx');
    expect(!result.ok && result.error.message).toContain("can't be read");
    expect(putObject).not.toHaveBeenCalled();
  });

  it('refuses a page that does not exist', async () => {
    const reg = createTestRegistry({ prisma: { page: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as Registry['prisma'] });
    const result = await attachPageSource(reg, 'nope', Buffer.from('x').toString('base64'));
    expect(!result.ok && result.error.message).toBe('Page nope not found');
  });
});

describe('pageSourceKey', () => {
  it('finds the newest source- file in the page\'s folder, leaving its images', async () => {
    const reg = createTestRegistry({ storage: storageMock({ listFolder: vi.fn().mockResolvedValue([
      { name: 'image-a.png', modifiedAt: new Date('2026-10-03') },
      { name: 'source-old.pdf', modifiedAt: new Date('2026-10-01') },
      { name: 'source-new.csv', modifiedAt: new Date('2026-10-02') }
    ]) }) });
    expect(await pageSourceKey(reg, 'pg1')).toBe('pages/pg1/source-new.csv');
    expect(await pageSourceKey(createTestRegistry({ storage: storageMock() }), 'pg1')).toBeNull();
  });
});

describe('convertPageSource', () => {
  const pageWith = ({ sourceUrl, bodyType }: { readonly sourceUrl: string | null; readonly bodyType: string }) => createTestRegistry({
    prisma: { page: { findUnique: vi.fn().mockResolvedValue({ archivedAt: null, bodyType }) } } as unknown as Registry['prisma'],
    storage: storageMock({ listFolder: vi.fn().mockResolvedValue(sourceUrl ? [{ name: sourceUrl.split('/').pop(), modifiedAt: new Date() }] : []) })
  });

  it('warns when claude is not installed', async () => {
    const result = await convertPageSource(createTestRegistry(), fakeConverter(null).converter, 'work', 'pg1');
    expect(result).toEqual({ ok: true, value: { started: false, warning: CLAUDE_NOT_FOUND_WARNING } });
  });

  it('starts a job for the page\'s file, keyed apart from the docs\'', async () => {
    const { converter, jobs } = fakeConverter();
    const result = await convertPageSource(pageWith({ sourceUrl: 'pages/pg1/source-a.pdf', bodyType: 'doc' }), converter, 'work', 'pg1');
    expect(result).toEqual({ ok: true, value: { started: true } });
    expect(jobs.map((j) => [j.key, j.pdfPath])).toEqual([[pageJobKey('work', 'pg1'), '/files/pages/pg1/source-a.pdf']]);
    expect(pageJobKey('work', 'pg1')).toBe('work/page:pg1');
  });

  it('refuses a page with no file, and a spreadsheet page', async () => {
    const none = await convertPageSource(pageWith({ sourceUrl: null, bodyType: 'doc' }), fakeConverter().converter, 'work', 'pg1');
    expect(!none.ok && none.error.message).toContain('no source file attached');
    const sheet = await convertPageSource(pageWith({ sourceUrl: 'pages/pg1/source-a.pdf', bodyType: 'sheet' }), fakeConverter().converter, 'work', 'pg1');
    expect(!sheet.ok && sheet.error.message).toContain('spreadsheet page');
  });
});
