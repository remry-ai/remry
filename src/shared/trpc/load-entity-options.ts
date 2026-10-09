// Every active person, group, project, goal and wiki page as a search option:
// id `TYPE:id`, scope the type. The add-link form leaves out the entity it's on;
// the ⌘K finder takes them all. A type the notebook doesn't have (goals in a home
// notebook) is refused by its procedure and simply left out.

import type { CreateTRPCClient } from '@trpc/client';
import type { AppRouter } from './router';
import type { RelatableType } from '$shared/types/enums';
import { typedIdValue } from '$shared/utils/entity';

export interface EntityOption {
  readonly id: string;
  readonly name: string;
  readonly scope: RelatableType;
}

export const loadEntityOptions = async (
  client: CreateTRPCClient<AppRouter>,
  exclude: { readonly entityType: RelatableType; readonly entityId: string } | null = null
): Promise<readonly EntityOption[]> => {
  const none = () => null;
  const [people, groups, projects, goals, pages] = await Promise.all([
    client.person.list.query().catch(none),
    client.group.list.query().catch(none),
    client.project.list.query().catch(none),
    client.goal.list.query().catch(none),
    client.page.list.query().catch(none)
  ]);
  const options = (type: RelatableType, rows: readonly { readonly id: string; readonly name: string }[]) =>
    rows
      .filter((row) => !(type === exclude?.entityType && row.id === exclude.entityId))
      .map((row) => ({ id: typedIdValue(type, row.id), name: row.name, scope: type }));
  const titled = (rows: readonly { readonly id: string; readonly title: string }[]) =>
    rows.map((row) => ({ id: row.id, name: row.title }));
  return [
    ...options('PERSON', people?.ok ? people.value : []),
    ...options('GROUP', groups?.ok ? groups.value : []),
    ...options('PROJECT', projects?.ok ? projects.value : []),
    ...options('GOAL', goals?.ok ? titled(goals.value) : []),
    ...options('PAGE', pages?.ok ? titled(pages.value) : [])
  ];
};
