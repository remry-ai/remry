import type { Registry } from '$shared/registry';
import { ok, type Result } from '$shared/utils';
import type { EntityType, TodoRecurrence, TodoStatus } from '$shared/types/enums';
import type { HomeTodoPage, HomeTodoSort, RecentUpdate, UpdateKind } from '$shared/types/home';
import { docPath, entityPath } from '$shared/utils/entity';
import { features } from '$shared/settings/base/features';
import { resolveEntityLabel } from '$api/_entity-labels';
import { loadArchivedIds, notAttachedToArchived } from '$api/_archive';
import type { TodoSummary } from '$api/attached/todo/operations';

// ----- Pure helpers -----

interface RawUpdate {
  readonly kind: UpdateKind;
  readonly id: string;
  readonly title: string;
  readonly parent: { readonly entityType: EntityType; readonly entityId: string } | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Newest first, capped at `limit`. */
export const mergeUpdates = (
  groups: readonly (readonly RawUpdate[])[],
  limit: number
): readonly RawUpdate[] =>
  groups
    .flat()
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit);

/** First non-empty line of markdown, stripped of heading/list markers, truncated. */
export const summarizeContent = (content: string, max = 80): string => {
  const line = content
    .split('\n')
    .map((l) => l.replace(/^[#>*\-\s]+/, '').trim())
    .find((l) => l.length > 0) ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line || '(empty)';
};

const updateHref = (u: RawUpdate): string => {
  switch (u.kind) {
    case 'PERSON':
    case 'GROUP':
    case 'PROJECT':
    case 'GOAL':
    case 'PAGE':
    case 'REPORT':
      return entityPath(u.kind, u.id);
    case 'TODO':
      return u.parent
        ? `${entityPath(u.parent.entityType, u.parent.entityId)}?popup=todo&todo=${u.id}`
        : `/app/todos?popup=todo&todo=${u.id}`;
    case 'DOC':
      return u.parent ? docPath(u.parent.entityType, u.parent.entityId, u.id) : '/app';
    default:
      return u.parent ? entityPath(u.parent.entityType, u.parent.entityId) : '/app';
  }
};

// ----- Operations -----

const OPEN_STATUSES: readonly TodoStatus[] = ['ACTIVE', 'PENDING'];

export const listOpenTodos = async (
  reg: Pick<Registry, 'prisma'>,
  limit = 25,
  sort: HomeTodoSort = 'priority',
  offset = 0
): Promise<Result<HomeTodoPage<TodoSummary>>> => {
  const where = { status: { in: [...OPEN_STATUSES] }, ...notAttachedToArchived(await loadArchivedIds(reg)) };
  const [todos, total] = await Promise.all([reg.prisma.todo.findMany({
    where,
    // By status, ACTIVE sorts before PENDING, as in todo.list.
    orderBy:
      sort === 'status'
        ? [{ status: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }]
        : [{ priority: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
    skip: offset,
    take: limit
  }), reg.prisma.todo.count({ where })]);

  const labels = await Promise.all(
    todos.map((t) => resolveEntityLabel(reg, t.entityType as EntityType, t.entityId))
  );

  return ok({
    total,
    items: todos.map((t, i) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status as TodoStatus,
      priority: t.priority,
      entityType: t.entityType as EntityType,
      entityId: t.entityId,
      entityLabel: labels[i] ?? null,
      entityPath: entityPath(t.entityType as EntityType, t.entityId),
      targetDate: t.targetDate,
      recurrence: t.recurrence as TodoRecurrence | null,
      completedAt: t.completedAt,
      createdAt: t.createdAt
    }))
  });
};

export const listRecentUpdates = async (
  reg: Pick<Registry, 'prisma'>,
  limit = 30
): Promise<Result<readonly RecentUpdate[]>> => {
  const recent = { orderBy: { updatedAt: 'desc' as const }, take: limit };
  const p = reg.prisma;
  // Archived entities, and what's attached to them, stay out of the feed.
  const active = { ...recent, where: { archivedAt: null } };
  const attached = notAttachedToArchived(await loadArchivedIds(reg));

  // People and notes about people are left out: the feed is for everything else.
  const titled = { ...active, select: { id: true, title: true, createdAt: true, updatedAt: true } };
  const [groups, projects, goals, pages, docs, notes, reports, todos] = await Promise.all([
    p.group.findMany(active),
    p.project.findMany(active),
    p.goal.findMany(titled),
    p.page.findMany(titled),
    p.doc.findMany({ ...recent, where: attached, select: { id: true, title: true, entityType: true, entityId: true, createdAt: true, updatedAt: true } }),
    p.note.findMany({ ...recent, where: { entityType: { not: 'PERSON' }, ...attached } }),
    p.report.findMany({ ...recent, where: attached, select: { id: true, title: true, entityType: true, entityId: true, createdAt: true, updatedAt: true } }),
    p.todo.findMany({ ...recent, where: attached })
  ]);

  const parentOf = (x: { entityType: string; entityId: string }) => ({
    entityType: x.entityType as EntityType,
    entityId: x.entityId
  });
  const base = (x: { id: string; createdAt: Date; updatedAt: Date }) => ({
    id: x.id,
    createdAt: x.createdAt,
    updatedAt: x.updatedAt
  });

  const merged = mergeUpdates(
    [
      groups.map((x) => ({ ...base(x), kind: 'GROUP' as const, title: x.name, parent: null })),
      projects.map((x) => ({ ...base(x), kind: 'PROJECT' as const, title: x.name, parent: null })),
      goals.map((x) => ({ ...base(x), kind: 'GOAL' as const, title: x.title, parent: null })),
      pages.map((x) => ({ ...base(x), kind: 'PAGE' as const, title: x.title, parent: null })),
      docs.map((x) => ({ ...base(x), kind: 'DOC' as const, title: x.title, parent: parentOf(x) })),
      notes.map((x) => ({ ...base(x), kind: 'NOTE' as const, title: summarizeContent(x.content), parent: parentOf(x) })),
      features.reports ? reports.map((x) => ({ ...base(x), kind: 'REPORT' as const, title: x.title, parent: parentOf(x) })) : [],
      todos.map((x) => ({ ...base(x), kind: 'TODO' as const, title: x.title, parent: parentOf(x) }))
    ],
    limit
  );

  const labels = await Promise.all(
    merged.map((u) => (u.parent ? resolveEntityLabel(reg, u.parent.entityType, u.parent.entityId) : null))
  );

  return ok(
    merged.map((u, i) => ({
      kind: u.kind,
      id: u.id,
      title: u.title,
      parentLabel: labels[i] ?? null,
      href: updateHref(u),
      at: u.updatedAt,
      isNew: Math.abs(u.updatedAt.getTime() - u.createdAt.getTime()) < 1000
    }))
  );
};
