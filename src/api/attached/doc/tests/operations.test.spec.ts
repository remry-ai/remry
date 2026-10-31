import { describe, it, expect, vi } from 'vitest';
import { createTestRegistry } from '$shared/registry.test';
import type { Registry } from '$shared/registry';
import { addDoc, getDoc, removeDoc, updateDoc, uploadDocImage } from '../operations';
import { cleanupPrisma } from '$api/tests/cleanup-prisma';

const storageMock = (overrides: Partial<Registry['storage']> = {}): Registry['storage'] => ({
  putObject: vi.fn().mockResolvedValue(undefined),
  readObject: vi.fn().mockResolvedValue(null),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  deleteFolder: vi.fn().mockResolvedValue(undefined),
  listFolder: vi.fn().mockResolvedValue([]),
  moveObject: vi.fn().mockResolvedValue(undefined),
  pathFor: vi.fn(() => null),
  ...overrides
});

// Removing a doc or saving its content also touches its relations.
const relationMock = () => ({ deleteMany: vi.fn().mockResolvedValue({ count: 0 }) });

describe('addDoc', () => {
  it('refuses a wiki page without writing', async () => {
    const create = vi.fn();
    const reg = createTestRegistry({
      prisma: { doc: { create } } as unknown as Registry['prisma']
    });

    const result = await addDoc(reg, 'PAGE', 'page_1', { title: 'Notes' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("Wiki pages don't take docs");
    expect(create).not.toHaveBeenCalled();
  });
});

describe('getDoc', () => {
  it('adds the entity name and path', async () => {
    const now = new Date();
    const reg = createTestRegistry({
      prisma: {
        doc: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'doc_1', title: 'Plan', content: '# Plan', sortOrder: 1,
            createdAt: now, updatedAt: now, entityType: 'GROUP', entityId: 'team_1'
          })
        },
        group: { findUnique: vi.fn().mockResolvedValue({ name: 'Payments' }) }
      } as unknown as Registry['prisma']
    });

    const result = await getDoc(reg, 'doc_1');

    expect(result.ok && [result.value.entityName, result.value.entityPath]).toEqual(['Payments', '/app/groups/team_1']);
  });

  it('fails for an unknown doc', async () => {
    const reg = createTestRegistry({
      prisma: { doc: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as Registry['prisma']
    });

    const result = await getDoc(reg, 'doc_missing');

    expect(!result.ok && result.error.message).toBe('Doc not found');
  });
});

describe('removeDoc', () => {
  const docPrisma = (_unused: null, attached = {}) => {
    const del = vi.fn().mockResolvedValue({});
    const prisma = cleanupPrisma(attached);
    return {
      del,
      prisma: { ...prisma, doc: { ...prisma.doc, findUnique: vi.fn().mockResolvedValue({ id: 'doc_1' }), delete: del } }
    };
  };

  it('deletes the doc, its relations and its folder (images and file links)', async () => {
    const deleteFolder = vi.fn().mockResolvedValue(undefined);
    const { del, prisma } = docPrisma(null);
    const reg = createTestRegistry({ prisma: prisma as unknown as Registry['prisma'], storage: storageMock({ deleteFolder }) });

    const result = await removeDoc(reg, 'doc_1');

    expect(result.ok).toBe(true);
    expect(deleteFolder).toHaveBeenCalledWith('docs/doc_1');
    expect(del).toHaveBeenCalledWith({ where: { id: 'doc_1' } });
    expect(prisma.relation.deleteMany).toHaveBeenCalledWith({ where: { fromType: 'DOC', fromId: { in: ['doc_1'] } } });
    expect(prisma.relation.deleteMany).toHaveBeenCalledWith({ where: { toType: 'DOC', toId: { in: ['doc_1'] } } });
  });

  it('deletes what is attached to the doc, in the same transaction', async () => {
    const { prisma } = docPrisma(null, { comment: [{ id: 'c1', entityType: 'DOC', entityId: 'doc_1' }] });
    const reg = createTestRegistry({ prisma: prisma as unknown as Registry['prisma'], storage: storageMock() });

    await removeDoc(reg, 'doc_1');
    expect(prisma.comment.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['c1'] } } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('still deletes the doc row when storage deletion fails', async () => {
    const { del, prisma } = docPrisma(null);
    const reg = createTestRegistry({
      prisma: prisma as unknown as Registry['prisma'],
      storage: storageMock({ deleteFolder: vi.fn().mockRejectedValue(new Error('disk full')) })
    });

    const result = await removeDoc(reg, 'doc_1');
    expect(result.ok).toBe(true);
    expect(del).toHaveBeenCalledWith({ where: { id: 'doc_1' } });
  });
});

describe('updateDoc', () => {
  it('saves only what changed, and clears mentions for content without links', async () => {
    const update = vi.fn().mockResolvedValue({});
    const relation = relationMock();
    const reg = createTestRegistry({
      prisma: {
        doc: { findUnique: vi.fn().mockResolvedValue({ id: 'doc_1' }), update },
        relation
      } as unknown as Registry['prisma']
    });

    await updateDoc(reg, 'doc_1', { content: 'x' });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'doc_1' },
      data: { content: 'x' }
    });
    expect(relation.deleteMany).toHaveBeenCalledWith({
      where: { fromType: 'DOC', fromId: 'doc_1', kind: 'MENTIONS' }
    });
  });
});

describe('uploadDocImage', () => {
  it('stores the image under the doc and returns its key', async () => {
    const putObject = vi.fn().mockResolvedValue(undefined);
    const reg = createTestRegistry({
      prisma: {
        doc: { findUnique: vi.fn().mockResolvedValue({ id: 'doc_1', entityType: 'PROJECT', entityId: 'proj_1' }) },
        project: { findUnique: vi.fn().mockResolvedValue({ archivedAt: null }) }
      } as unknown as Registry['prisma'],
      storage: storageMock({ putObject }),
      uuid: () => 'uuid-abc'
    });

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02]);
    const result = await uploadDocImage(reg, 'doc_1', `data:image/jpeg;base64,${jpeg.toString('base64')}`);

    expect(result).toEqual({ ok: true, value: { key: 'docs/doc_1/image-uuid-abc.jpg', markdown: '![](storage://docs/doc_1/image-uuid-abc.jpg)' } });
    const [key, body, contentType] = putObject.mock.calls[0]!;
    expect(key).toBe('docs/doc_1/image-uuid-abc.jpg');
    expect(contentType).toBe('image/jpeg');
    expect(Buffer.from(body)).toEqual(jpeg);
  });

  it('refuses a missing doc without writing', async () => {
    const putObject = vi.fn();
    const reg = createTestRegistry({
      prisma: { doc: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as Registry['prisma'],
      storage: storageMock({ putObject })
    });

    const result = await uploadDocImage(reg, 'doc_x', '');

    expect(result.ok).toBe(false);
    expect(putObject).not.toHaveBeenCalled();
  });
});
