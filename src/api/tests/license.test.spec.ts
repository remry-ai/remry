import { describe, it, expect, vi } from 'vitest';
import type { Registry } from '$shared/registry';
import { NO_LICENSE, type LicenseStatus } from '$shared/types/license';
import { ok } from '$shared/utils/result';
import { becomesDrawing, countDrawings, drawingGated, gated } from '../_license';

const active: LicenseStatus = { state: 'active', licensee: { name: 'Dana', email: 'd@x' }, expires: '2099-01-01', daysLeft: 9000, problem: null };
const ctx = (status: LicenseStatus) => ({ license: vi.fn().mockResolvedValue(status) });

/** A notebook with this many drawing docs and pages, and these rows by id. */
const prisma = (docs: number, pages: number, rows: Record<string, { bodyType: string }> = {}) => ({
  doc: { count: vi.fn().mockResolvedValue(docs), findUnique: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(rows[where.id] ?? null)) },
  page: { count: vi.fn().mockResolvedValue(pages), findUnique: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(rows[where.id] ?? null)) }
});
const regWith = (p: ReturnType<typeof prisma>) => ({ prisma: p as unknown as Registry['prisma'] });

describe('gated', () => {
  it('runs with an active license and refuses without one, saying which feature', async () => {
    const run = vi.fn().mockResolvedValue(ok('done'));
    expect(await gated(ctx(active), 'sync', run)).toEqual(ok('done'));
    const refused = await gated(ctx(NO_LICENSE), 'sync', run);
    expect(!refused.ok && refused.error.message).toMatch(/^Sync now is part of Remry Pro/);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('countDrawings', () => {
  it('counts drawing docs and pages together, archived ones included', async () => {
    const p = prisma(2, 1);
    expect(await countDrawings(regWith(p))).toBe(3);
    expect(p.doc.count).toHaveBeenCalledWith({ where: { bodyType: 'drawing' } });
    expect(p.page.count).toHaveBeenCalledWith({ where: { bodyType: 'drawing' } });
  });
});

describe('drawingGated', () => {
  it('always runs a call that makes no new drawing, without reading the license', async () => {
    const c = ctx(NO_LICENSE);
    const run = vi.fn().mockResolvedValue(ok(1));
    expect(await drawingGated(c, regWith(prisma(9, 9)), false, run)).toEqual(ok(1));
    expect(c.license).not.toHaveBeenCalled();
  });

  it('runs while under the free drawings', async () => {
    const run = vi.fn().mockResolvedValue(ok(1));
    expect(await drawingGated(ctx(NO_LICENSE), regWith(prisma(1, 1)), true, run)).toEqual(ok(1));
  });

  it('refuses the fourth without a license, and never runs it', async () => {
    const run = vi.fn().mockResolvedValue(ok(1));
    const refused = await drawingGated(ctx(NO_LICENSE), regWith(prisma(2, 1)), true, run);
    expect(!refused.ok && refused.error.message).toMatch(/^This notebook has 3 drawings, and 3 are free/);
    expect(run).not.toHaveBeenCalled();
  });

  it('runs past the free ones with a license, without counting', async () => {
    const p = prisma(40, 40);
    const run = vi.fn().mockResolvedValue(ok(1));
    expect(await drawingGated(ctx(active), regWith(p), true, run)).toEqual(ok(1));
    expect(p.doc.count).not.toHaveBeenCalled();
  });
});

describe('becomesDrawing', () => {
  const p = prisma(0, 0, { d1: { bodyType: 'doc' }, d2: { bodyType: 'drawing' }, s1: { bodyType: 'sheet' } });
  const reg = regWith(p);

  it('is true only when a doc or page that isn\'t a drawing is set to one', async () => {
    expect(await becomesDrawing(reg, 'DOC', 'd1', 'drawing')).toBe(true);
    expect(await becomesDrawing(reg, 'PAGE', 's1', 'drawing')).toBe(true);
  });

  it('is false for a drawing already, another body type, no body type or a missing row', async () => {
    expect(await becomesDrawing(reg, 'DOC', 'd2', 'drawing')).toBe(false);
    expect(await becomesDrawing(reg, 'DOC', 'd1', 'sheet')).toBe(false);
    expect(await becomesDrawing(reg, 'DOC', 'd1', undefined)).toBe(false);
    expect(await becomesDrawing(reg, 'PAGE', 'gone', 'drawing')).toBe(false);
  });
});
