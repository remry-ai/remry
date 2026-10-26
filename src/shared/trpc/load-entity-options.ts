// Every active person, group, project, goal and wiki page as a search option:
// id `TYPE:id`, scope the type. The add-link form leaves out the entity it's on;
// the ⌘K finder takes them all. A type the notebook doesn't have (goals in a home
// notebook) is refused by its procedure and simply left out. A project, goal or
// page under another carries its parents' titles, so a lookup matches them too.

import type { CreateTRPCClient } from '@trpc/client';
import type { AppRouter } from './router';
import type { RelatableType } from '$shared/types/enums';
import { typedIdValue } from '$shared/utils/entity';
import { ancestorsOf } from '$shared/utils/hierarchy';

export interface EntityOption {
  readonly id: string;
  readonly name: string;
  readonly scope: RelatableType;
  /** A group's kind key (TEAM). */
  readonly groupKind?: string;
  /** Its parents' titles, the top one first ("Platform / Q3"), for a project, goal or page under another. */
  readonly parents?: string;
}

interface TreeRow {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string | null;
}

/** Each row's parents' titles, the top one first, joined by " / "; none for a top-level row. Pure. */
export const withParents = <T extends TreeRow>(rows: readonly T[]): readonly (T & { readonly parents?: string })[] =>
  rows.map((row) => {
    const trail = ancestorsOf(rows, row.id, (r) => r.parentId).map((r) => r.name);
    return trail.length > 0 ? { ...row, parents: trail.join(' / ') } : row;
  });

export const loadEntityOptions = async (
  client: CreateTRPCClient<AppRouter>,
  exclude: { readonly entityType: RelatableType; readonly entityId: string } | null = null
): Promise<readonly EntityOption[]> => {
  const none = () => null;
  const [people, groups, projects, goals, pages] = await Promise.all([
    client.person.list.query().catch(none),
    client.group.list.query().catch(none),
    client.project.list.query({ closed: 'include' }).catch(none),
    client.goal.list.query({ closed: 'include' }).catch(none),
    client.page.list.query().catch(none)
  ]);
  // Parents are worked out before the excluded row is dropped, so its children keep them.
  const options = (type: RelatableType, rows: readonly TreeRow[]) =>
    withParents(rows)
      .filter((row) => !(type === exclude?.entityType && row.id === exclude.entityId))
      .map((row) => ({ id: typedIdValue(type, row.id), name: row.name, scope: type, ...(row.parents && { parents: row.parents }) }));
  const titled = (rows: readonly { readonly id: string; readonly title: string; readonly parentId?: string | null }[]) =>
    rows.map((row) => ({ id: row.id, name: row.title, parentId: row.parentId }));
  return [
    ...options('PERSON', people?.ok ? people.value : []),
    ...(groups?.ok ? groups.value : [])
      .filter((row) => !(exclude?.entityType === 'GROUP' && row.id === exclude.entityId))
      .map((row) => ({ id: typedIdValue('GROUP', row.id), name: row.name, scope: 'GROUP' as const, groupKind: row.kind })),
    ...options('PROJECT', projects?.ok ? projects.value : []),
    ...options('GOAL', goals?.ok ? titled(goals.value) : []),
    ...options('PAGE', pages?.ok ? titled(pages.value) : [])
  ];
};
