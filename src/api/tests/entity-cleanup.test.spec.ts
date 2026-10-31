import { describe, it, expect } from 'vitest';
import { createTestRegistry } from '$shared/registry.test';
import type { Registry } from '$shared/registry';
import { CLEANUP_BATCH, planEntityCleanup } from '../_entity-cleanup';
import { cleanupPrisma } from './cleanup-prisma';

describe('planEntityCleanup', () => {
  it('reaches what is attached to attachments, at any depth, and their files', async () => {
    const prisma = cleanupPrisma({
      note: [
        { id: 'n1', entityType: 'PERSON', entityId: 'p1' },
        { id: 'n2', entityType: 'PERSON', entityId: 'p1', parentId: 'n1' },
        { id: 'other', entityType: 'PERSON', entityId: 'p2' }
      ],
      comment: [{ id: 'c1', entityType: 'NOTE', entityId: 'n2' }],
      todo: [{ id: 't1', entityType: 'COMMENT', entityId: 'c1' }],
      doc: [{ id: 'd1', entityType: 'TODO', entityId: 't1' }]
    });
    const reg = createTestRegistry({ prisma: prisma as unknown as Registry['prisma'] });

    const cleanup = await planEntityCleanup(reg, 'PERSON', 'p1');

    // The person's own folder (its file links' files) and each deleted doc's (images, file links) go too.
    expect(cleanup.folders).toEqual(['people/p1', 'docs/d1']);
    expect(prisma.note.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['n1', 'n2'] } } });
    expect(prisma.comment.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['c1'] } } });
    expect(prisma.todo.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['t1'] } } });
    expect(prisma.doc.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['d1'] } } });

    // Tags, emoji and relations go for the entity and for everything attached to it.
    // One statement per type, each with a batch of its ids.
    const wheres = (calls: readonly unknown[][]) => calls.map((call) => (call[0] as { where: unknown }).where);
    expect(wheres(prisma.tagAttachment.deleteMany.mock.calls)).toEqual(expect.arrayContaining([
      { entityType: 'PERSON', entityId: { in: ['p1'] } },
      { entityType: 'NOTE', entityId: { in: ['n1', 'n2'] } },
      { entityType: 'COMMENT', entityId: { in: ['c1'] } },
      { entityType: 'TODO', entityId: { in: ['t1'] } },
      { entityType: 'DOC', entityId: { in: ['d1'] } }
    ]));
    expect(wheres(prisma.relation.deleteMany.mock.calls)).toEqual(expect.arrayContaining([
      { fromType: 'NOTE', fromId: { in: ['n1', 'n2'] } },
      { toType: 'DOC', toId: { in: ['d1'] } }
    ]));
  });

  it('starts from an attached item too, taking replies to a note', async () => {
    const prisma = cleanupPrisma({
      note: [
        { id: 'n1', entityType: 'PERSON', entityId: 'p1' },
        { id: 'n2', entityType: 'PERSON', entityId: 'p1', parentId: 'n1' }
      ]
    });
    const reg = createTestRegistry({ prisma: prisma as unknown as Registry['prisma'] });

    await planEntityCleanup(reg, 'NOTE', 'n1');

    expect(prisma.note.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['n2'] } } });
  });

  it('removes the deleted entity\'s own folder, for every type that keeps files', async () => {
    const reg = createTestRegistry({ prisma: cleanupPrisma() as unknown as Registry['prisma'] });
    expect((await planEntityCleanup(reg, 'PAGE', 'pg1')).folders).toEqual(['pages/pg1']);
    expect((await planEntityCleanup(reg, 'DOC', 'd9')).folders).toEqual(['docs/d9']);
    expect((await planEntityCleanup(reg, 'PERSON', 'p1')).folders).toEqual(['people/p1']);
    expect((await planEntityCleanup(reg, 'PROJECT', 'pr1')).folders).toEqual(['projects/pr1']);
    expect((await planEntityCleanup(reg, 'NOTE', 'n1')).folders).toEqual([]);
  });
});

describe('planEntityCleanup batches', () => {
  it('splits a long list of ids across statements', async () => {
    const notes = Array.from({ length: CLEANUP_BATCH * 2 + 1 }, (_, i) => ({ id: `n${i}`, entityType: 'PERSON', entityId: 'p1' }));
    const prisma = cleanupPrisma({ note: notes });
    const reg = createTestRegistry({ prisma: prisma as unknown as Registry['prisma'] });
    await prisma.$transaction((await planEntityCleanup(reg, 'PERSON', 'p1')).ops as unknown as Promise<unknown>[]);

    const sizes = (calls: readonly unknown[][], key: 'id' | 'entityId' | 'fromId') =>
      calls.map((call) => ((call[0] as { where: Record<string, { in: string[] }> }).where[key]?.in.length ?? 0)).filter((n) => n > 0);
    expect(sizes(prisma.note.deleteMany.mock.calls, 'id')).toEqual([CLEANUP_BATCH, CLEANUP_BATCH, 1]);
    expect(Math.max(...sizes(prisma.tagAttachment.deleteMany.mock.calls, 'entityId'))).toBe(CLEANUP_BATCH);
    expect(Math.max(...sizes(prisma.relation.deleteMany.mock.calls, 'fromId'))).toBe(CLEANUP_BATCH);
  });
});
