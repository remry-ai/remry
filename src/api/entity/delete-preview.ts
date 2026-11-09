// What deleting a person, group, project, goal or page takes with it, for the app's delete
// confirmation: everything attached to it at any depth (the same rows planEntityCleanup
// deletes), a goal's check-ins, and what stays: sub-items, which move up to its parent, and
// projects and goals it owned, which lose their owner.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils/result';
import { fileLinkKey } from '$shared/utils/file-links';
import { collectAttached } from '$api/_entity-cleanup';
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

/** Sub-items of a page, project or goal, and the name of the parent they move up to. */
const childrenOf = async (
  reg: Pick<Registry, 'prisma'>,
  type: PreviewableType,
  id: string,
  parentId: string | null
): Promise<{ readonly children: readonly NamedItem[]; readonly movesTo: string | null }> => {
  const p = reg.prisma;
  const orderBy = { createdAt: 'asc' } as const;
  if (type === 'PROJECT') {
    const [children, parent] = await Promise.all([
      p.project.findMany({ where: { parentId: id }, select: { id: true, name: true }, orderBy }),
      parentId ? p.project.findUnique({ where: { id: parentId }, select: { name: true } }) : null
    ]);
    return { children: children.map((c) => ({ id: c.id, title: c.name })), movesTo: parent?.name ?? null };
  }
  if (type === 'GOAL') {
    const [children, parent] = await Promise.all([
      p.goal.findMany({ where: { parentId: id }, select: { id: true, title: true }, orderBy }),
      parentId ? p.goal.findUnique({ where: { id: parentId }, select: { title: true } }) : null
    ]);
    return { children, movesTo: parent?.title ?? null };
  }
  if (type === 'PAGE') {
    const [children, parent] = await Promise.all([
      p.page.findMany({ where: { parentId: id }, select: { id: true, title: true }, orderBy }),
      parentId ? p.page.findUnique({ where: { id: parentId }, select: { title: true } }) : null
    ]);
    return { children, movesTo: parent?.title ?? null };
  }
  return { children: [], movesTo: null };
};

export const previewDelete = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: PreviewableType,
  id: string
): Promise<Result<DeletePreview>> => {
  const node = await findNode(reg, entityType, id);
  if (!node) return err(new Error(`No ${entityType.toLowerCase()} with id ${id}`));
  const p = reg.prisma;
  const { ids } = await collectAttached(reg, [{ entityType, entityId: id }]);
  const owner = { ownerType: entityType, ownerId: id };
  const [docs, todos, links, checkIns, family, ownedProjects, ownedGoals] = await Promise.all([
    p.doc.findMany({ where: { id: { in: [...ids.DOC] } }, select: { id: true, title: true }, orderBy: { sortOrder: 'asc' } }),
    p.todo.findMany({ where: { id: { in: [...ids.TODO] } }, select: { id: true, title: true }, orderBy: { createdAt: 'asc' } }),
    p.link.findMany({ where: { id: { in: [...ids.LINK] } }, select: { id: true, title: true, url: true }, orderBy: { createdAt: 'asc' } }),
    entityType === 'GOAL' ? p.goalCheckIn.count({ where: { goalId: id } }) : 0,
    childrenOf(reg, entityType, id, node.parentId),
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
    movesTo: family.movesTo,
    owned: [
      ...ownedProjects.map((o) => ({ type: 'PROJECT' as const, id: o.id, title: o.name })),
      ...ownedGoals.map((o) => ({ type: 'GOAL' as const, id: o.id, title: o.title }))
    ]
  });
};
