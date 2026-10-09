import { describe, it, expect, vi } from 'vitest';
import { createTestRegistry } from '$shared/registry.test';
import type { Registry } from '$shared/registry';
import { CLAUDE_NOT_FOUND_WARNING } from '$shared/assist/claude-cli';
import type { PdfConversionJob, PdfConverter } from '$shared/types/pdf-conversion';
import { convertDocPdf, getPdfConversion } from '../convert';

const fakeConverter = (claudePath: string | null = '/opt/homebrew/bin/claude') => {
  const jobs: PdfConversionJob[] = [];
  const converter: PdfConverter = {
    locate: () => claudePath,
    start: (job) => { jobs.push(job); },
    status: vi.fn(() => ({ state: 'running' as const }))
  };
  return { converter, jobs };
};

const docRow = { id: 'doc_1', entityType: 'PERSON', entityId: 'p1', sourceUrl: 'docs/doc_1/source-a.pdf' };

describe('convertDocPdf', () => {
  it('warns, without reading the doc, when claude is not installed', async () => {
    const findUnique = vi.fn();
    const reg = createTestRegistry({ prisma: { doc: { findUnique } } as unknown as Registry['prisma'] });

    const result = await convertDocPdf(reg, fakeConverter(null).converter, 'work', 'doc_1');

    expect(result).toEqual({ ok: true, value: { started: false, warning: CLAUDE_NOT_FOUND_WARNING } });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('warns when there is no converter (the CLI and MCP context)', async () => {
    const result = await convertDocPdf(createTestRegistry(), undefined, 'work', 'doc_1');
    expect(result).toEqual({ ok: true, value: { started: false, warning: CLAUDE_NOT_FOUND_WARNING } });
  });

  it('refuses a doc with no PDF', async () => {
    const reg = createTestRegistry({
      prisma: { doc: { findUnique: vi.fn().mockResolvedValue({ ...docRow, sourceUrl: null }) } } as unknown as Registry['prisma']
    });
    const { converter, jobs } = fakeConverter();

    const result = await convertDocPdf(reg, converter, 'work', 'doc_1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('no PDF attached');
    expect(jobs).toHaveLength(0);
  });

  it('refuses a doc on an archived entity', async () => {
    const reg = createTestRegistry({
      prisma: {
        doc: { findUnique: vi.fn().mockResolvedValue(docRow) },
        person: { findUnique: vi.fn().mockResolvedValue({ name: 'Alice', archivedAt: new Date('2024-01-01') }) }
      } as unknown as Registry['prisma']
    });
    const { converter, jobs } = fakeConverter();

    const result = await convertDocPdf(reg, converter, 'work', 'doc_1');

    expect(result.ok).toBe(false);
    expect(jobs).toHaveLength(0);
  });

  it("starts a job for the PDF on disk that saves Claude's markdown into the doc", async () => {
    const update = vi.fn().mockResolvedValue({});
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const reg = createTestRegistry({
      prisma: {
        doc: { findUnique: vi.fn().mockResolvedValue(docRow), update },
        person: { findUnique: vi.fn().mockResolvedValue({ name: 'Alice', archivedAt: null }) },
        relation: { deleteMany }
      } as unknown as Registry['prisma']
    });
    const { converter, jobs } = fakeConverter();

    const result = await convertDocPdf(reg, converter, 'work', 'doc_1');

    expect(result).toEqual({ ok: true, value: { started: true } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      key: 'work/doc_1',
      claudePath: '/opt/homebrew/bin/claude',
      pdfPath: '/files/docs/doc_1/source-a.pdf'
    });

    const saved = await jobs[0]!.onMarkdown('# Contract');
    expect(saved.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({ where: { id: 'doc_1' }, data: { content: '# Contract' } });
    expect(deleteMany).toHaveBeenCalled();
  });
});

describe('getPdfConversion', () => {
  it('is idle without a converter, and asks the converter for the doc in this notebook otherwise', () => {
    expect(getPdfConversion(undefined, 'work', 'doc_1')).toEqual({ ok: true, value: { state: 'idle' } });

    const { converter } = fakeConverter();
    expect(getPdfConversion(converter, 'work', 'doc_1')).toEqual({ ok: true, value: { state: 'running' } });
    expect(converter.status).toHaveBeenCalledWith('work/doc_1');
  });
});
