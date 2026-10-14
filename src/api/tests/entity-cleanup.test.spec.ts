import { describe, it, expect } from 'vitest';
import { createTestRegistry } from '$shared/registry.test';
import type { Registry } from '$shared/registry';
import { planEntityCleanup } from '../_entity-cleanup';
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
      doc: [{ id: 'd1', entityType: 'TODO', entityId: 't1', sourceUrl: 'docs/d1/source.pdf' }]
    });
    const reg = createTestRegistry({ prisma: prisma as unknown as Registry['prisma'] });

    const cleanup = await planEntityCleanup(reg, 'PERSON', 'p1');

    expect(cleanup.files).toEqual(['docs/d1/source.pdf']);
    // Each deleted doc's own folder (its pasted images and PDF) goes too.
    expect(cleanup.folders).toEqual(['docs/d1']);
    expect(prisma.note.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['n1', 'n2'] } } });
    expect(prisma.comment.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['c1'] } } });
    expect(prisma.todo.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['t1'] } } });
    expect(prisma.doc.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['d1'] } } });

    // Tags, emoji and relations go for the entity and for everything attached to it.
    const tagged = (prisma.tagAttachment.deleteMany.mock.calls[0] as unknown as [{ where: { OR: { entityType: string; entityId: { in: string[] } }[] } }])[0].where.OR;
    expect(tagged).toEqual(expect.arrayContaining([
      { entityType: 'PERSON', entityId: { in: ['p1'] } },
      { entityType: 'NOTE', entityId: { in: ['n1', 'n2'] } },
      { entityType: 'COMMENT', entityId: { in: ['c1'] } },
      { entityType: 'TODO', entityId: { in: ['t1'] } },
      { entityType: 'DOC', entityId: { in: ['d1'] } }
    ]));
    const relationWhere = (prisma.relation.deleteMany.mock.calls[0] as unknown as [{ where: { OR: unknown[] } }])[0].where.OR;
    expect(relationWhere).toEqual(expect.arrayContaining([
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

  it('removes a deleted page\'s or doc\'s own folder', async () => {
    const reg = createTestRegistry({ prisma: cleanupPrisma() as unknown as Registry['prisma'] });
    expect((await planEntityCleanup(reg, 'PAGE', 'pg1')).folders).toEqual(['pages/pg1']);
    expect((await planEntityCleanup(reg, 'DOC', 'd9')).folders).toEqual(['docs/d9']);
    expect((await planEntityCleanup(reg, 'PERSON', 'p1')).folders).toEqual([]);
  });
});
