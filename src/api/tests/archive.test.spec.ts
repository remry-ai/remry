import { describe, it, expect, vi } from 'vitest';
import { createTestRegistry } from '$shared/registry.test';
import type { Registry } from '$shared/registry';
import { archiveWhere, ensureAllWritable, ensureWritable, notAttachedToArchived, setArchived } from '../_archive';

describe('archiveWhere', () => {
  it('shows active rows by default, archived rows for only, and everything for include', () => {
    expect(archiveWhere()).toEqual({ archivedAt: null });
    expect(archiveWhere('only')).toEqual({ archivedAt: { not: null } });
    expect(archiveWhere('include')).toEqual({});
  });
});

describe('notAttachedToArchived', () => {
  it('is empty when nothing is archived', () => {
    expect(notAttachedToArchived(new Map([['PERSON', []], ['PROJECT', []]]))).toEqual({});
  });

  it('excludes rows attached to each archived entity type', () => {
    expect(notAttachedToArchived(new Map([['PERSON', ['p1']], ['GROUP', []], ['PROJECT', ['x1', 'x2']]]))).toEqual({
      NOT: {
        OR: [
          { entityType: 'PERSON', entityId: { in: ['p1'] } },
          { entityType: 'PROJECT', entityId: { in: ['x1', 'x2'] } }
        ]
      }
    });
  });
});

describe('setArchived', () => {
  it('archives with the registry clock', async () => {
    const update = vi.fn().mockResolvedValue({});
    const reg = createTestRegistry({
      prisma: {
        project: { findUnique: vi.fn().mockResolvedValue({ name: 'Checkout', archivedAt: null }), update }
      } as unknown as Registry['prisma']
    });

    const result = await setArchived(reg, 'PROJECT', 'x1', true);
    expect(result).toEqual({ ok: true, value: { id: 'x1', archivedAt: new Date('2024-01-01T00:00:00Z') } });
    expect(update).toHaveBeenCalledWith({ where: { id: 'x1' }, data: { archivedAt: new Date('2024-01-01T00:00:00Z') } });
  });

  it('keeps the first date when archiving twice', async () => {
    const first = new Date('2023-06-01T00:00:00Z');
    const update = vi.fn();
    const reg = createTestRegistry({
      prisma: { goal: { findUnique: vi.fn().mockResolvedValue({ title: 'Grow', archivedAt: first }), update } } as unknown as Registry['prisma']
    });

    const result = await setArchived(reg, 'GOAL', 'g1', true);
    expect(result).toEqual({ ok: true, value: { id: 'g1', archivedAt: first } });
    expect(update).not.toHaveBeenCalled();
  });

  it('unarchives', async () => {
    const update = vi.fn().mockResolvedValue({});
    const reg = createTestRegistry({
      prisma: {
        person: { findUnique: vi.fn().mockResolvedValue({ name: 'Alice', archivedAt: new Date() }), update }
      } as unknown as Registry['prisma']
    });

    const result = await setArchived(reg, 'PERSON', 'p1', false);
    expect(result.ok && result.value.archivedAt).toBeNull();
    expect(update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { archivedAt: null } });
  });

  it('reports a missing entity', async () => {
    const reg = createTestRegistry({
      prisma: { page: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as Registry['prisma']
    });
    const result = await setArchived(reg, 'PAGE', 'nope', true);
    expect(result.ok).toBe(false);
  });
});

describe('ensureWritable', () => {
  const archivedTeam = () => createTestRegistry({
    prisma: {
      group: { findUnique: vi.fn().mockResolvedValue({ name: 'Platform', archivedAt: new Date() }) },
      person: { findUnique: vi.fn().mockResolvedValue({ name: 'Alice', archivedAt: null }) }
    } as unknown as Registry['prisma']
  });

  it('refuses an archived entity and says how to unarchive it', async () => {
    const result = await ensureWritable(archivedTeam(), 'GROUP', 't1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Group "Platform" is archived');
      expect(result.error.message).toContain('group.unarchive --id t1');
    }
  });

  it('passes active entities, missing ones and types that cannot be archived', async () => {
    const reg = archivedTeam();
    expect((await ensureWritable(reg, 'PERSON', 'p1')).ok).toBe(true);
    expect((await ensureWritable(reg, 'DOC', 'd1')).ok).toBe(true);
    const missing = createTestRegistry({
      prisma: { project: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as Registry['prisma']
    });
    expect((await ensureWritable(missing, 'PROJECT', 'nope')).ok).toBe(true);
  });

  it('fails when any of several entities is archived', async () => {
    const result = await ensureAllWritable(archivedTeam(), [['PERSON', 'p1'], ['GROUP', 't1']]);
    expect(result.ok).toBe(false);
  });
});
