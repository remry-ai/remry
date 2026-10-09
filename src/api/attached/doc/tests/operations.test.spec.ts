import { describe, it, expect, vi } from 'vitest';
import { createTestRegistry } from '$shared/registry.test';
import type { Registry } from '$shared/registry';
import { addDoc, attachSourcePdf, getDoc, getDocReadUrl, removeDoc, updateDoc, uploadDocImage } from '../operations';

const storageMock = (overrides: Partial<Registry['storage']> = {}): Registry['storage'] => ({
  putObject: vi.fn().mockResolvedValue(undefined),
  readObject: vi.fn().mockResolvedValue(null),
  deleteObject: vi.fn().mockResolvedValue(undefined),
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
            id: 'doc_1', title: 'Plan', content: '# Plan', sourceUrl: null, sortOrder: 1,
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

describe('attachSourcePdf', () => {
  it('stores the PDF and sets sourceUrl without touching content', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'doc_1', sourceUrl: null });
    const update = vi.fn().mockResolvedValue({});
    const putObject = vi.fn().mockResolvedValue(undefined);
    const reg = createTestRegistry({
      prisma: { doc: { findUnique, update } } as unknown as Registry['prisma'],
      storage: storageMock({ putObject }),
      uuid: () => 'uuid-abc'
    });

    const dataBase64 = Buffer.from('hello pdf').toString('base64');
    const result = await attachSourcePdf(reg, 'doc_1', 'application/pdf', dataBase64);

    expect(result.ok).toBe(true);
    const [key, body, contentType] = putObject.mock.calls[0]!;
    expect(key).toBe('docs/doc_1/source-uuid-abc.pdf');
    expect(contentType).toBe('application/pdf');
    expect(Buffer.from(body).toString('utf8')).toBe('hello pdf');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'doc_1' },
      data: { sourceUrl: 'docs/doc_1/source-uuid-abc.pdf' }
    });
  });

  it('deletes the previously attached PDF', async () => {
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const reg = createTestRegistry({
      prisma: {
        doc: {
          findUnique: vi.fn().mockResolvedValue({ id: 'doc_1', sourceUrl: 'docs/doc_1/source-old.pdf' }),
          update: vi.fn().mockResolvedValue({})
        }
      } as unknown as Registry['prisma'],
      storage: storageMock({ deleteObject })
    });

    await attachSourcePdf(reg, 'doc_1', 'application/pdf', 'abc');
    expect(deleteObject).toHaveBeenCalledWith('docs/doc_1/source-old.pdf');
  });

  it('returns err when doc is not found', async () => {
    const reg = createTestRegistry({
      prisma: { doc: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } } as unknown as Registry['prisma']
    });

    const result = await attachSourcePdf(reg, 'doc_missing', 'application/pdf', 'abc');
    expect(result.ok).toBe(false);
  });
});

describe('getDocReadUrl', () => {
  it('returns a local /files URL for the source PDF', async () => {
    const reg = createTestRegistry({
      prisma: {
        doc: { findUnique: vi.fn().mockResolvedValue({ id: 'doc_1', sourceUrl: 'docs/doc_1/source-a.pdf' }) }
      } as unknown as Registry['prisma']
    });

    const result = await getDocReadUrl(reg, 'doc_1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.url).toBe('/files/docs/doc_1/source-a.pdf');
  });
});

describe('removeDoc', () => {
  it('deletes the doc, its relations and its PDF from storage when sourceUrl is set', async () => {
    const del = vi.fn().mockResolvedValue({});
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const relation = relationMock();
    const reg = createTestRegistry({
      prisma: {
        doc: {
          findUnique: vi.fn().mockResolvedValue({ id: 'doc_1', sourceUrl: 'docs/doc_1/source.pdf' }),
          delete: del
        },
        relation
      } as unknown as Registry['prisma'],
      storage: storageMock({ deleteObject })
    });

    const result = await removeDoc(reg, 'doc_1');

    expect(result.ok).toBe(true);
    expect(deleteObject).toHaveBeenCalledWith('docs/doc_1/source.pdf');
    expect(del).toHaveBeenCalledWith({ where: { id: 'doc_1' } });
    expect(relation.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ fromType: 'DOC', fromId: 'doc_1' }, { toType: 'DOC', toId: 'doc_1' }] }
    });
  });

  it('does not call storage when sourceUrl is null', async () => {
    const deleteObject = vi.fn();
    const reg = createTestRegistry({
      prisma: {
        doc: {
          findUnique: vi.fn().mockResolvedValue({ id: 'doc_1', sourceUrl: null }),
          delete: vi.fn().mockResolvedValue({})
        },
        relation: relationMock()
      } as unknown as Registry['prisma'],
      storage: storageMock({ deleteObject })
    });

    await removeDoc(reg, 'doc_1');
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('still deletes the doc row when storage deletion fails', async () => {
    const del = vi.fn().mockResolvedValue({});
    const reg = createTestRegistry({
      prisma: {
        doc: {
          findUnique: vi.fn().mockResolvedValue({ id: 'doc_1', sourceUrl: 'docs/doc_1/source.pdf' }),
          delete: del
        },
        relation: relationMock()
      } as unknown as Registry['prisma'],
      storage: storageMock({ deleteObject: vi.fn().mockRejectedValue(new Error('disk full')) })
    });

    const result = await removeDoc(reg, 'doc_1');
    expect(result.ok).toBe(true);
    expect(del).toHaveBeenCalledWith({ where: { id: 'doc_1' } });
  });
});

describe('updateDoc', () => {
  it('forwards sourceUrl to prisma when provided', async () => {
    const update = vi.fn().mockResolvedValue({});
    const reg = createTestRegistry({
      prisma: {
        doc: { findUnique: vi.fn().mockResolvedValue({ id: 'doc_1' }), update }
      } as unknown as Registry['prisma']
    });

    const result = await updateDoc(reg, 'doc_1', { sourceUrl: 'docs/doc_1/source.pdf' });

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'doc_1' },
      data: { sourceUrl: 'docs/doc_1/source.pdf' }
    });
  });

  it('does not touch sourceUrl when omitted, and clears mentions for content without links', async () => {
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

    const result = await uploadDocImage(reg, 'doc_1', 'image/jpeg', Buffer.from('jpg bytes').toString('base64'));

    expect(result).toEqual({ ok: true, value: { key: 'docs/doc_1/image-uuid-abc.jpg' } });
    const [key, body, contentType] = putObject.mock.calls[0]!;
    expect(key).toBe('docs/doc_1/image-uuid-abc.jpg');
    expect(contentType).toBe('image/jpeg');
    expect(Buffer.from(body).toString('utf8')).toBe('jpg bytes');
  });

  it('refuses a missing doc without writing', async () => {
    const putObject = vi.fn();
    const reg = createTestRegistry({
      prisma: { doc: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as Registry['prisma'],
      storage: storageMock({ putObject })
    });

    const result = await uploadDocImage(reg, 'doc_x', 'image/png', '');

    expect(result.ok).toBe(false);
    expect(putObject).not.toHaveBeenCalled();
  });
});
