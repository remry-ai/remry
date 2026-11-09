// What deleting a person, group, project, goal or page takes with it, for the app's delete
// confirmation: a project's sub-projects or a page's sub-pages at any depth, everything attached
// to it and to them (the same rows planEntityCleanup deletes), a goal's check-ins, and what stays:
// a goal's sub-goals, which move up to its parent, and goals and projects owned, which lose their owner.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils/result';
import { fileLinkKey } from '$shared/utils/file-links';
import { collectAttached, subtreeIds } from '$api/_entity-cleanup';
import type { DeletePreview, NamedItem, PreviewableType } from '$shared/types/delete-preview';

interface Node {
  readonly name: string;
  readonly parentId: string | null;
}

const findNode = async (reg: Pick<Registry, 'prisma'>, type: PreviewableType, id: string): Promise<Node | null> => {
  const p = reg.prisma;
  switch (type) {
    case 'PERSON': {
      const row = await p.person.findUnique({ where: { id }, select: { name: true } });
      return row && { name: row.name, parentId: null };
    }
    case 'GROUP': {
      const row = await p.group.findUnique({ where: { id }, select: { name: true } });
      return row && { name: row.name, parentId: null };
    }
    case 'PROJECT': {
      const row = await p.project.findUnique({ where: { id }, select: { name: true, parentId: true } });
      return row && { name: row.name, parentId: row.parentId };
    }
    case 'GOAL': {
      const row = await p.goal.findUnique({ where: { id }, select: { title: true, parentId: true } });
      return row && { name: row.title, parentId: row.parentId };
    }
    case 'PAGE': {
      const row = await p.page.findUnique({ where: { id }, select: { title: true, parentId: true } });
      return row && { name: row.title, parentId: row.parentId };
    }
  }
};

/**
 * Sub-items: a project's sub-projects or a page's sub-pages at any depth, deleted with it; or a
 * goal's sub-goals, which move up to its parent (goals stay loose).
 */
const childrenOf = async (
  reg: Pick<Registry, 'prisma'>,
  type: PreviewableType,
  id: string,
  parentId: string | null
): Promise<{ readonly subtree: readonly string[]; readonly children: readonly NamedItem[]; readonly childrenDeleted: boolean; readonly movesTo: string | null }> => {
  const p = reg.prisma;
  if (type === 'PROJECT' || type === 'PAGE') {
    const subtree = await subtreeIds(reg, type, id);
    const below = subtree.slice(1);
    const rows = type === 'PROJECT'
      ? (await p.project.findMany({ where: { id: { in: [...below] } }, select: { id: true, name: true } })).map((r) => ({ id: r.id, title: r.name }))
      : await p.page.findMany({ where: { id: { in: [...below] } }, select: { id: true, title: true } });
    // In tree order, top down, as subtreeIds found them.
    const byId = new Map(rows.map((r) => [r.id, r]));
    return { subtree, children: below.flatMap((c) => byId.get(c) ?? []), childrenDeleted: true, movesTo: null };
  }
  if (type === 'GOAL') {
    const [children, parent] = await Promise.all([
      p.goal.findMany({ where: { parentId: id }, select: { id: true, title: true }, orderBy: { createdAt: 'asc' } }),
      parentId ? p.goal.findUnique({ where: { id: parentId }, select: { title: true } }) : null
    ]);
    return { subtree: [id], children, childrenDeleted: false, movesTo: parent?.title ?? null };
  }
  return { subtree: [id], children: [], childrenDeleted: false, movesTo: null };
};

export const previewDelete = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: PreviewableType,
  id: string
): Promise<Result<DeletePreview>> => {
  const node = await findNode(reg, entityType, id);
  if (!node) return err(new Error(`No ${entityType.toLowerCase()} with id ${id}`));
  const p = reg.prisma;
  const family = await childrenOf(reg, entityType, id, node.parentId);
  // What's attached to it and to every sub-item deleted with it.
  const { ids } = await collectAttached(reg, family.subtree.map((entityId) => ({ entityType, entityId })));
  const owner = { ownerType: entityType, ownerId: { in: [...family.subtree] } };
  const [docs, todos, links, checkIns, ownedProjects, ownedGoals] = await Promise.all([
    p.doc.findMany({ where: { id: { in: [...ids.DOC] } }, select: { id: true, title: true }, orderBy: { sortOrder: 'asc' } }),
    p.todo.findMany({ where: { id: { in: [...ids.TODO] } }, select: { id: true, title: true }, orderBy: { createdAt: 'asc' } }),
    p.link.findMany({ where: { id: { in: [...ids.LINK] } }, select: { id: true, title: true, url: true }, orderBy: { createdAt: 'asc' } }),
    entityType === 'GOAL' ? p.goalCheckIn.count({ where: { goalId: id } }) : 0,
    p.project.findMany({ where: owner, select: { id: true, name: true } }),
    p.goal.findMany({ where: owner, select: { id: true, title: true } })
  ]);
  const named = (l: { readonly id: string; readonly title: string | null; readonly url: string }): NamedItem => ({ id: l.id, title: l.title || l.url });
  return ok({
    name: node.name,
    docs,
    todos,
    files: links.filter((l) => fileLinkKey(l.url) !== null).map(named),
    links: links.filter((l) => fileLinkKey(l.url) === null).map(named),
    notes: ids.NOTE.length,
    comments: ids.COMMENT.length,
    checkIns,
    children: family.children,
    childrenDeleted: family.childrenDeleted,
    movesTo: family.movesTo,
    owned: [
      ...ownedProjects.map((o) => ({ type: 'PROJECT' as const, id: o.id, title: o.name })),
      ...ownedGoals.map((o) => ({ type: 'GOAL' as const, id: o.id, title: o.title }))
    ]
  });
};
