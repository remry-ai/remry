// Every active person, group, project, goal and wiki page as a search option:
// id `TYPE:id`, scope the type. The add-link form leaves out the entity it's on;
// the ⌘K finder takes them all. A type the notebook doesn't have (goals in a home
// notebook) is refused by its procedure and simply left out. A project, goal or
// page under another carries its parents' titles, and one with sub-items its
// children's titles, so a lookup matches them too.

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
  /** Its direct children's titles, for a project, goal or page with sub-items. */
  readonly children?: readonly string[];
}

interface TreeRow {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string | null;
}

/**
 * Each row's parents' titles, the top one first, joined by " / " (none for a top-level row),
 * and its direct children's titles (none for a row without any). Pure.
 */
export const withFamily = <T extends TreeRow>(
  rows: readonly T[]
): readonly (T & { readonly parents?: string; readonly children?: readonly string[] })[] => {
  const childNames = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentId || row.parentId === row.id) continue;
    childNames.set(row.parentId, [...(childNames.get(row.parentId) ?? []), row.name]);
  }
  return rows.map((row) => {
    const trail = ancestorsOf(rows, row.id, (r) => r.parentId).map((r) => r.name);
    const children = childNames.get(row.id);
    return {
      ...row,
      ...(trail.length > 0 && { parents: trail.join(' / ') }),
      ...(children && { children })
    };
  });
};

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
  // Parents and children are worked out before the excluded row is dropped, so its relatives keep them.
  const options = (type: RelatableType, rows: readonly TreeRow[]) =>
    withFamily(rows)
      .filter((row) => !(type === exclude?.entityType && row.id === exclude.entityId))
      .map((row) => ({
        id: typedIdValue(type, row.id),
        name: row.name,
        scope: type,
        ...(row.parents && { parents: row.parents }),
        ...(row.children && { children: row.children })
      }));
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
