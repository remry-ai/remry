// search.recall: everything the notebook knows about one entity, in one call,
// for Claude. Includes text elsewhere that names the entity without linking it,
// which no relation records.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import type { EntityType, RelatableType } from '$shared/types/enums';
import type { RelationGroup } from '$shared/types/relations';
import type { Recall, RecallList, SearchHit } from '$shared/types/search';
import { entityPath } from '$shared/utils/entity';
import { resolveEntityLabel } from '$api/_entity-labels';
import { listRelationsForEntity } from '$api/relation/operations';
import { getPerson } from '$api/person/operations';
import { getGroup } from '$api/group/operations';
import { getProject } from '$api/project/operations';
import { getGoal } from '$api/goal/operations';
import { getPage } from '$api/page/operations';
import { getDoc } from '$api/attached/doc/operations';
import { getReport } from '$api/attached/report/operations';
import { phraseQuery } from './fts-query';
import { archivedIdList, queryIndex, searchableTypes } from './operations';

export const RECALL_LIMITS = { defaultItems: 10, maxItems: 50, docExcerpt: 300 } as const;

const OWNER_TYPES: ReadonlySet<RelatableType> = new Set(['PERSON', 'GROUP']);

// ----- Pure helpers -----

/** The first `limit` items, flagged when more were fetched (queries ask for limit + 1). */
export const capped = <T>(rows: readonly T[], limit: number): RecallList<T> => ({
  items: rows.slice(0, limit),
  truncated: rows.length > limit
});

/** The start of a doc, cut at a word boundary. */
export const excerpt = (content: string, max: number = RECALL_LIMITS.docExcerpt): string => {
  const text = content.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

/** Sources that already link to the entity: their MENTIONS backlinks. */
export const mentioningIds = (relations: readonly RelationGroup[]): readonly string[] =>
  relations.flatMap((g) => g.items.filter((i) => i.kind === 'MENTIONS' && i.direction === 'incoming').map((i) => i.other.entityId));

// ----- Queries -----

/** What the type's own `get` returns, or the row for types without one. */
const loadEntity = async (reg: Pick<Registry, 'prisma'>, entityType: RelatableType, id: string): Promise<Result<unknown>> => {
  switch (entityType) {
    case 'PERSON': return getPerson(reg, id);
    case 'GROUP': return getGroup(reg, id);
    case 'PROJECT': return getProject(reg, id);
    case 'GOAL': return getGoal(reg, id);
    case 'PAGE': return getPage(reg, id);
    case 'DOC': return getDoc(reg, id);
    case 'REPORT': return getReport(reg, id);
    case 'NOTE': {
      const note = await reg.prisma.note.findUnique({ where: { id } });
      return note ? ok(note) : err(new Error(`No note with id ${id}`));
    }
    case 'TODO': {
      const todo = await reg.prisma.todo.findUnique({ where: { id } });
      return todo ? ok(todo) : err(new Error(`No todo with id ${id}`));
    }
  }
};

export const recallEntity = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: RelatableType,
  entityId: string,
  limit: number = RECALL_LIMITS.defaultItems
): Promise<Result<Recall>> => {
  const entity = await loadEntity(reg, entityType, entityId);
  if (!entity.ok) return err(entity.error);
  const name = (await resolveEntityLabel(reg, entityType, entityId)) ?? '';

  const attached = { entityType, entityId };
  const take = limit + 1;
  const p = reg.prisma;
  const owns = OWNER_TYPES.has(entityType);
  const [notes, comments, todos, docs, links, tags, relations, goals, projects, archivedIds] = await Promise.all([
    p.note.findMany({ where: attached, orderBy: { createdAt: 'desc' }, take, select: { id: true, content: true, parentId: true, createdAt: true } }),
    p.comment.findMany({ where: attached, orderBy: { createdAt: 'desc' }, take, select: { id: true, content: true, createdAt: true } }),
    p.todo.findMany({
      where: { ...attached, status: { in: ['PENDING', 'ACTIVE'] } },
      orderBy: [{ priority: 'desc' }, { targetDate: 'asc' }, { createdAt: 'asc' }],
      take,
      select: { id: true, title: true, description: true, status: true, priority: true, targetDate: true }
    }),
    p.doc.findMany({ where: attached, orderBy: { sortOrder: 'asc' }, take, select: { id: true, title: true, content: true, updatedAt: true } }),
    p.link.findMany({ where: attached, orderBy: { createdAt: 'asc' }, take, select: { id: true, url: true, title: true } }),
    p.tagAttachment.findMany({ where: attached, select: { tag: { select: { name: true } } } }),
    listRelationsForEntity(reg, entityType, entityId),
    owns
      ? p.goal.findMany({
        where: { ownerType: entityType, ownerId: entityId, archivedAt: null },
        orderBy: [{ period: 'desc' }, { sortOrder: 'asc' }],
        take,
        select: {
          id: true, title: true, status: true, period: true, target: true, unit: true,
          checkIns: { orderBy: { date: 'desc' }, take: 1, select: { date: true, value: true, status: true, comment: true } }
        }
      })
      : Promise.resolve([]),
    owns
      ? p.project.findMany({
        where: { ownerType: entityType, ownerId: entityId, archivedAt: null },
        orderBy: { name: 'asc' },
        take,
        select: { id: true, name: true, status: true }
      })
      : Promise.resolve([]),
    archivedIdList(reg)
  ]);
  const relationGroups = relations.ok ? relations.value : [];

  // Text elsewhere that names this entity: not the entity or what's attached to
  // it, not sources that already link to it, and nothing archived.
  const match = name ? phraseQuery(name) : null;
  const mentionRows: readonly SearchHit[] = match
    ? await queryIndex(reg, {
      match,
      types: searchableTypes(undefined),
      hiddenIds: [entityId, ...mentioningIds(relationGroups), ...archivedIds],
      limit: take
    })
    : [];

  return ok({
    entityType,
    entityId,
    name,
    path: entityPath(entityType as EntityType, entityId),
    archived: archivedIds.includes(entityId),
    entity: entity.value,
    notes: capped(notes, limit),
    comments: capped(comments, limit),
    todos: capped(todos, limit),
    docs: capped(docs.map((d) => ({ id: d.id, title: d.title, excerpt: excerpt(d.content), updatedAt: d.updatedAt })), limit),
    links: capped(links, limit),
    tags: tags.map((t) => t.tag.name).sort((a, b) => a.localeCompare(b)),
    relations: relationGroups,
    ownedGoals: capped(goals.map(({ checkIns, ...goal }) => ({ ...goal, latestCheckIn: checkIns[0] ?? null })), limit),
    ownedProjects: capped(projects, limit),
    unlinkedMentions: capped(mentionRows, limit)
  });
};
