import { describe, it, expect, vi } from 'vitest';
import { createTestRegistry } from '$shared/registry.test';
import type { Registry } from '$shared/registry';
import { createReport, getReport, updateReport } from '../operations';

const BAD_CHART = ['# Q3 review', '', '```chart', '{"type":"bar","labels":["a","b","c"],"series":[{"values":[1,2]}]}', '```'].join('\n');
const GOOD_CHART = ['```chart', '{"type":"bar","labels":["a","b"],"series":[{"values":[1,2]}]}', '```'].join('\n');

const brandingRow = {
  id: 'brand_1',
  name: 'Acme',
  iconUrl: 'branding/brand_1/icon-a.png',
  logoUrl: 'branding/brand_1/logo-b.png',
  primaryColor: '#111111',
  accentColor: '#222222',
  primaryFontColor: '#ffffff',
  accentFontColor: '#ffffff'
};

describe('createReport', () => {
  it('rejects a malformed chart block, naming its line, without writing', async () => {
    const create = vi.fn();
    const reg = createTestRegistry({
      prisma: {
        person: { findUnique: vi.fn().mockResolvedValue({ name: 'Alice', archivedAt: null }) },
        report: { create }
      } as unknown as Registry['prisma']
    });

    const result = await createReport(reg, { entityType: 'PERSON', entityId: 'p1', title: 'Q3', content: BAD_CHART });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('chart block at line 3');
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a report for an entity that does not exist', async () => {
    const reg = createTestRegistry({
      prisma: {
        person: { findUnique: vi.fn().mockResolvedValue(null) },
        report: { create: vi.fn() }
      } as unknown as Registry['prisma']
    });

    const result = await createReport(reg, { entityType: 'PERSON', entityId: 'nope', title: 'Q3' });
    expect(result.ok).toBe(false);
  });

  it('creates a report with valid chart blocks', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'rep_1' });
    const reg = createTestRegistry({
      prisma: {
        person: { findUnique: vi.fn().mockResolvedValue({ name: 'Alice' }) },
        report: { create },
        relation: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) }
      } as unknown as Registry['prisma']
    });

    const result = await createReport(reg, { entityType: 'PERSON', entityId: 'p1', title: 'Q3', content: GOOD_CHART });
    expect(result.ok).toBe(true);
    expect(create.mock.calls[0]![0].data).toMatchObject({ entityType: 'PERSON', entityId: 'p1', content: GOOD_CHART, brandingId: null });
  });
});

describe('updateReport', () => {
  it('rejects a malformed chart block without writing', async () => {
    const update = vi.fn();
    const reg = createTestRegistry({
      prisma: {
        report: { findUnique: vi.fn().mockResolvedValue({ id: 'rep_1' }), update }
      } as unknown as Registry['prisma']
    });

    const result = await updateReport(reg, 'rep_1', { content: BAD_CHART });
    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('getReport', () => {
  const row = (branding: typeof brandingRow | null) => ({
    id: 'rep_1',
    entityType: 'PERSON',
    entityId: 'p1',
    title: 'Q3',
    content: GOOD_CHART,
    brandingId: branding?.id ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
    branding
  });

  it('resolves branding images to local /files URLs', async () => {
    const reg = createTestRegistry({
      prisma: {
        report: { findUnique: vi.fn().mockResolvedValue(row(brandingRow)) },
        person: { findUnique: vi.fn().mockResolvedValue({ name: 'Alice' }) }
      } as unknown as Registry['prisma']
    });

    const result = await getReport(reg, 'rep_1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entityName).toBe('Alice');
    expect(result.value.entityPath).toBe('/app/people/p1');
    expect(result.value.branding?.logoUrl).toBe('/files/branding/brand_1/logo-b.png');
    expect(result.value.branding?.iconUrl).toBe('/files/branding/brand_1/icon-a.png');
  });

  it('falls back to the default branding when the report has none', async () => {
    const findFirst = vi.fn().mockResolvedValue(brandingRow);
    const reg = createTestRegistry({
      prisma: {
        report: { findUnique: vi.fn().mockResolvedValue(row(null)) },
        branding: { findFirst },
        person: { findUnique: vi.fn().mockResolvedValue({ name: 'Alice' }) }
      } as unknown as Registry['prisma']
    });

    const result = await getReport(reg, 'rep_1');
    expect(findFirst).toHaveBeenCalledWith({ where: { isDefault: true } });
    if (result.ok) {
      expect(result.value.brandingId).toBeNull();
      expect(result.value.branding?.name).toBe('Acme');
    }
  });
});
