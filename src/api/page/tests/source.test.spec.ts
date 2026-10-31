// A wiki page's source file, as a doc's: attaching it (page.attachSource) and converting it
// with the local Claude (page.convertSource).
import { describe, it, expect, vi } from 'vitest';
import { createTestRegistry } from '$shared/registry.test';
import type { Registry } from '$shared/registry';
import { CLAUDE_NOT_FOUND_WARNING } from '$shared/assist/claude-cli';
import type { PdfConversionJob, PdfConverter } from '$shared/types/pdf-conversion';
import { attachPageSource } from '../operations';
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
  it('stores the file under the page\'s folder and replaces the one before it', async () => {
    const putObject = vi.fn();
    const deleteObject = vi.fn();
    const update = vi.fn();
    const reg = createTestRegistry({
      prisma: { page: { findUnique: vi.fn().mockResolvedValue({ sourceUrl: 'pages/pg1/source-old.pdf', archivedAt: null }), update } } as unknown as Registry['prisma'],
      storage: storageMock({ putObject, deleteObject }),
      uuid: () => 'uuid-1'
    });

    const csv = Buffer.from('name,amount\nA,1\n').toString('base64');
    const result = await attachPageSource(reg, 'pg1', csv, 'budget.csv');

    expect(result).toEqual({ ok: true, value: { sourceUrl: 'pages/pg1/source-uuid-1.csv' } });
    expect(putObject).toHaveBeenCalledWith('pages/pg1/source-uuid-1.csv', expect.anything(), 'text/plain; charset=utf-8');
    expect(update).toHaveBeenCalledWith({ where: { id: 'pg1' }, data: { sourceUrl: 'pages/pg1/source-uuid-1.csv' } });
    expect(deleteObject).toHaveBeenCalledWith('pages/pg1/source-old.pdf');
  });

  it('refuses a file Claude can\'t read, without writing', async () => {
    const putObject = vi.fn();
    const reg = createTestRegistry({
      prisma: { page: { findUnique: vi.fn().mockResolvedValue({ sourceUrl: null, archivedAt: null }), update: vi.fn() } } as unknown as Registry['prisma'],
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

describe('convertPageSource', () => {
  const pageWith = (row: object) => createTestRegistry({
    prisma: { page: { findUnique: vi.fn().mockResolvedValue({ archivedAt: null, ...row }) } } as unknown as Registry['prisma'],
    storage: storageMock()
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
