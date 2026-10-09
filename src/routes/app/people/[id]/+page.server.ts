import type { PageServerLoad } from './$types';
import { trpc } from '$shared/trpc/client';
import { loadEntityAssets } from '$shared/trpc/load-entity-assets';
import { notebookModel } from '$shared/modules/model';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ fetch, params, locals }) => {
  const client = trpc(fetch);
  const owner = { ownerType: 'PERSON', ownerId: params.id } as const;
  const withGoals = notebookModel(locals.notebook.profile).shows('GOAL');
  const [result, allPersons, allGroups, ownedGoals, ownedProjects, assets] = await Promise.all([
    client.person.get.query({ id: params.id }),
    client.person.list.query(),
    client.group.list.query(),
    withGoals ? client.goal.list.query(owner) : null,
    client.project.list.query(owner),
    loadEntityAssets(client, 'PERSON', params.id)
  ]);
  if (!result.ok) throw error(404, 'Person not found');
  return {
    person: result.value,
    allPersons: allPersons.ok ? allPersons.value : [],
    allGroups: allGroups.ok ? allGroups.value : [],
    ownedGoals: ownedGoals?.ok ? ownedGoals.value : [],
    ownedProjects: ownedProjects.ok ? ownedProjects.value : [],
    ...assets
  };
};
