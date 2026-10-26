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
  // One map, and each row's trail kept once worked out, so a big notebook stays fast
  // (ancestorsOf per row rebuilt the map each time: 3s at 5,000 rows).
  const byId = new Map(rows.map((row): [string, T] => [row.id, row]));
  const childNames = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentId || row.parentId === row.id) continue;
    const names = childNames.get(row.parentId);
    if (names) names.push(row.name);
    else childNames.set(row.parentId, [row.name]);
  }
  // A row's ancestors' titles, top first. The walk stops at a parent whose trail is known,
  // a missing parent, or a loop; a trail that ran into a loop isn't kept, since it depends
  // on where the walk started.
  const trails = new Map<string, readonly string[]>();
  const trailOf = (id: string): readonly string[] => {
    const known = trails.get(id);
    if (known) return known;
    const chain: string[] = []; // nearest parent first
    let base: readonly string[] = [];
    let looped = false;
    const seen = new Set([id]);
    let parentId = byId.get(id)?.parentId ?? null;
    while (parentId) {
      if (seen.has(parentId)) { looped = true; break; }
      const parent = byId.get(parentId);
      if (!parent) break;
      const parentTrail = trails.get(parentId);
      if (parentTrail) { base = [...parentTrail, parent.name]; break; }
      seen.add(parentId);
      chain.push(parent.name);
      parentId = parent.parentId ?? null;
    }
    const trail = [...base, ...chain.reverse()];
    if (!looped) trails.set(id, trail);
    return trail;
  };
  return rows.map((row) => {
    const trail = trailOf(row.id);
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
