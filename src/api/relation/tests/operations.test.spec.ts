import { describe, it, expect, vi } from 'vitest';
import { createTestRegistry } from '$shared/registry.test';
import type { Registry } from '$shared/registry';
import type { RelationItem } from '$shared/types/relations';
import { addRelation, groupRelations, listRelationsForEntity, removeRelation } from '../operations';

const item = (overrides: Partial<RelationItem>): RelationItem => ({
  id: 'rel',
  kind: 'RELATED',
  direction: 'outgoing',
  label: 'Related to',
  other: { entityType: 'GROUP', entityId: 't1', label: 'Payments', path: '/app/groups/t1' },
  note: null,
  createdAt: new Date(0),
  ...overrides
});

describe('groupRelations', () => {
  it('orders groups by kind, outgoing before incoming, with mentions last', () => {
    const groups = groupRelations([
      item({ id: '1', kind: 'MENTIONS', direction: 'incoming', label: 'Mentioned in' }),
      item({ id: '2', kind: 'DEPENDS_ON', direction: 'incoming', label: 'Needed by' }),
      item({ id: '3', kind: 'RELATED', direction: 'outgoing', label: 'Related to' }),
      item({ id: '4', kind: 'DEPENDS_ON', direction: 'outgoing', label: 'Depends on' }),
      item({ id: '5', kind: 'DEPENDS_ON', direction: 'incoming', label: 'Needed by' }),
      item({ id: '6', kind: 'RELATED', direction: 'incoming', label: 'Related to' })
    ], []);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Related to', ['3', '6']],
      ['Depends on', ['4']],
      ['Needed by', ['2', '5']],
      ['Mentioned in', ['1']]
    ]);
  });
});

describe('groupRelations with people', () => {
  it('puts relationships between people first, in their kinds\' order', () => {
    const kinds = [
      { key: 'PARENT_OF', label: 'Parent of', inverseLabel: 'Child of', symmetric: false, exclusive: false, sortOrder: 1 },
      { key: 'LEAD_OF', label: 'Lead of', inverseLabel: 'Reports to', symmetric: false, exclusive: true, sortOrder: 0 }
    ];
    const groups = groupRelations([
      item({ id: '1', kind: 'RELATED', label: 'Related to' }),
      item({ id: '2', kind: 'PARENT_OF', direction: 'incoming', label: 'Child of', personRelation: true }),
      item({ id: '3', kind: 'LEAD_OF', direction: 'incoming', label: 'Reports to', personRelation: true })
    ], kinds);
    expect(groups.map((g) => g.label)).toEqual(['Reports to', 'Child of', 'Related to']);
  });
});

describe('addRelation', () => {
  const input = { fromType: 'PAGE', fromId: 'p1', toType: 'GROUP', toId: 't1', kind: 'DEPENDS_ON' } as const;
  const labels = {
    page: { findUnique: vi.fn().mockResolvedValue({ title: 'Checkout' }) },
    group: { findUnique: vi.fn().mockResolvedValue({ name: 'Payments' }) }
  };

  it('treats RELATED in the other direction as the same link', async () => {
    const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'rel_2' });
    const create = vi.fn();
    const reg = createTestRegistry({
      prisma: { ...labels, relation: { findUnique, create } } as unknown as Registry['prisma']
    });
    const result = await addRelation(reg, { ...input, kind: 'RELATED' });
    expect(!result.ok && result.error.message).toContain('relation rel_2');
    expect(findUnique).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { fromType_fromId_toType_toId_kind: { fromType: 'GROUP', fromId: 't1', toType: 'PAGE', toId: 'p1', kind: 'RELATED' } }
    }));
    expect(create).not.toHaveBeenCalled();
  });

  it('lets DEPENDS_ON run both ways', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({ id: 'rel_3' });
    const reg = createTestRegistry({
      prisma: { ...labels, relation: { findUnique, create } } as unknown as Registry['prisma']
    });
    const result = await addRelation(reg, input);
    expect(result.ok && result.value).toEqual({ id: 'rel_3' });
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('rejects a relation from an entity to itself', async () => {
    const reg = createTestRegistry();
    const result = await addRelation(reg, { ...input, toType: 'PAGE', toId: 'p1' });
    expect(!result.ok && result.error.message).toContain('two different entities');
  });

  it('refuses MENTIONS, which come from content', async () => {
    const result = await addRelation(createTestRegistry(), { ...input, kind: 'MENTIONS' });
    expect(!result.ok && result.error.message).toContain('links in content');
  });

  it('names the end that does not exist, without writing', async () => {
    const create = vi.fn();
    const reg = createTestRegistry({
      prisma: {
        page: { findUnique: vi.fn().mockResolvedValue(null) },
        group: { findUnique: vi.fn().mockResolvedValue({ name: 'Payments' }) },
        relation: { findUnique: vi.fn(), create }
      } as unknown as Registry['prisma']
    });
    const result = await addRelation(reg, input);
    expect(!result.ok && result.error.message).toBe('PAGE p1 not found');
    expect(create).not.toHaveBeenCalled();
  });

  it('points at relation.update when the relation already exists', async () => {
    const reg = createTestRegistry({
      prisma: {
        page: { findUnique: vi.fn().mockResolvedValue({ title: 'Checkout' }) },
        group: { findUnique: vi.fn().mockResolvedValue({ name: 'Payments' }) },
        relation: { findUnique: vi.fn().mockResolvedValue({ id: 'rel_1' }), create: vi.fn() }
      } as unknown as Registry['prisma']
    });
    const result = await addRelation(reg, input);
    expect(!result.ok && result.error.message).toContain('relation rel_1');
    expect(!result.ok && result.error.message).toContain('relation.update');
  });
});

describe('removeRelation', () => {
  it('refuses to remove a MENTIONS relation', async () => {
    const del = vi.fn();
    const reg = createTestRegistry({
      prisma: {
        relation: { findUnique: vi.fn().mockResolvedValue({ id: 'rel_1', kind: 'MENTIONS' }), delete: del }
      } as unknown as Registry['prisma']
    });
    const result = await removeRelation(reg, 'rel_1');
    expect(!result.ok && result.error.message).toContain('remove the link from the content');
    expect(del).not.toHaveBeenCalled();
  });
});

describe('listRelationsForEntity', () => {
  it('links a todo to its popup on the page it belongs to', async () => {
    const reg = createTestRegistry({
      prisma: {
        relation: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'rel_1', fromType: 'TODO', fromId: 'td1', toType: 'GROUP', toId: 't1', kind: 'RELATED', note: null, createdAt: new Date(0) }
          ])
        },
        todo: {
          findUnique: vi.fn().mockImplementation(({ select }: { select: Record<string, boolean> }) =>
            Promise.resolve(select.title ? { title: 'Book 1:1' } : { entityType: 'PROJECT', entityId: 'p1' }))
        }
      } as unknown as Registry['prisma']
    });
    const result = await listRelationsForEntity(reg, 'GROUP', 't1');
    expect(result.ok && result.value[0]?.items[0]?.other).toEqual({
      entityType: 'TODO',
      entityId: 'td1',
      label: 'Book 1:1',
      path: '/app/projects/p1?popup=todo&todo=td1'
    });
  });
});
