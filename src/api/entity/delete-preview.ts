// What deleting a person, group, project, goal or page takes with it, for the app's delete
// confirmation: its sub-projects, sub-goals or sub-pages at any depth, everything attached to it
// and to them (the same rows planEntityCleanup deletes), goals' check-ins, and what stays: projects
// and goals it owned, which lose their owner.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils/result';
import { fileLinkKey } from '$shared/utils/file-links';
import { collectAttached, subtreeIds } from '$api/_entity-cleanup';
import type { DeletePreview, NamedItem, PreviewableType } from '$shared/types/delete-preview';

interface Node {
  readonly name: string;
}

const findNode = async (reg: Pick<Registry, 'prisma'>, type: PreviewableType, id: string): Promise<Node | null> => {
  const p = reg.prisma;
  switch (type) {
    case 'PERSON': {
      const row = await p.person.findUnique({ where: { id }, select: { name: true } });
      return row && { name: row.name };
    }
    case 'GROUP': {
      const row = await p.group.findUnique({ where: { id }, select: { name: true } });
      return row && { name: row.name };
    }
    case 'PROJECT': {
      const row = await p.project.findUnique({ where: { id }, select: { name: true } });
      return row && { name: row.name };
    }
    case 'GOAL': {
      const row = await p.goal.findUnique({ where: { id }, select: { title: true } });
      return row && { name: row.title };
    }
    case 'PAGE': {
      const row = await p.page.findUnique({ where: { id }, select: { title: true } });
      return row && { name: row.title };
    }
  }
};

/** A project's sub-projects, a goal's sub-goals or a page's sub-pages at any depth, deleted with it. */
const subItemsOf = async (
  reg: Pick<Registry, 'prisma'>,
  type: PreviewableType,
  id: string
): Promise<{ readonly subtree: readonly string[]; readonly children: readonly NamedItem[] }> => {
  if (type !== 'PROJECT' && type !== 'GOAL' && type !== 'PAGE') return { subtree: [id], children: [] };
  const p = reg.prisma;
  const subtree = await subtreeIds(reg, type, id);
  const where = { id: { in: subtree.slice(1) } };
  const rows = type === 'PROJECT'
    ? (await p.project.findMany({ where, select: { id: true, name: true } })).map((r) => ({ id: r.id, title: r.name }))
    : type === 'GOAL'
      ? await p.goal.findMany({ where, select: { id: true, title: true } })
      : await p.page.findMany({ where, select: { id: true, title: true } });
  // In tree order, top down, as subtreeIds found them.
  const byId = new Map(rows.map((r) => [r.id, r]));
  return { subtree, children: subtree.slice(1).flatMap((c) => byId.get(c) ?? []) };
};

export const previewDelete = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: PreviewableType,
  id: string
): Promise<Result<DeletePreview>> => {
  const node = await findNode(reg, entityType, id);
  if (!node) return err(new Error(`No ${entityType.toLowerCase()} with id ${id}`));
  const p = reg.prisma;
  const family = await subItemsOf(reg, entityType, id);
  // What's attached to it and to every sub-item deleted with it.
  const { ids } = await collectAttached(reg, family.subtree.map((entityId) => ({ entityType, entityId })));
  const owner = { ownerType: entityType, ownerId: { in: [...family.subtree] } };
  const [docs, todos, links, checkIns, ownedProjects, ownedGoals] = await Promise.all([
    p.doc.findMany({ where: { id: { in: [...ids.DOC] } }, select: { id: true, title: true }, orderBy: { sortOrder: 'asc' } }),
    p.todo.findMany({ where: { id: { in: [...ids.TODO] } }, select: { id: true, title: true }, orderBy: { createdAt: 'asc' } }),
    p.link.findMany({ where: { id: { in: [...ids.LINK] } }, select: { id: true, title: true, url: true }, orderBy: { createdAt: 'asc' } }),
    entityType === 'GOAL' ? p.goalCheckIn.count({ where: { goalId: { in: [...family.subtree] } } }) : 0,
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
    owned: [
      ...ownedProjects.map((o) => ({ type: 'PROJECT' as const, id: o.id, title: o.name })),
      ...ownedGoals.map((o) => ({ type: 'GOAL' as const, id: o.id, title: o.title }))
    ]
  });
};
