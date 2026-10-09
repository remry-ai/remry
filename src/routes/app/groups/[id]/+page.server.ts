import type { PageServerLoad } from './$types';
import { trpc } from '$shared/trpc/client';
import { loadEntityAssets } from '$shared/trpc/load-entity-assets';
import { notebookModel } from '$shared/modules/model';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ fetch, params, locals }) => {
  const client = trpc(fetch);
  const owner = { ownerType: 'GROUP', ownerId: params.id } as const;
  const withGoals = notebookModel(locals.notebook.profile).shows('GOAL');
  const [result, kinds, allPersons, ownedGoals, ownedProjects, assets] = await Promise.all([
    client.group.get.query({ id: params.id }),
    client.groupKind.list.query(),
    client.person.list.query(),
    withGoals ? client.goal.list.query(owner) : null,
    client.project.list.query(owner),
    loadEntityAssets(client, 'GROUP', params.id)
  ]);
  if (!result.ok) throw error(404, 'Group not found');
  return {
    group: result.value,
    kinds: kinds.ok ? kinds.value : [],
    allPersons: allPersons.ok ? allPersons.value : [],
    ownedGoals: ownedGoals?.ok ? ownedGoals.value : [],
    ownedProjects: ownedProjects.ok ? ownedProjects.value : [],
    ...assets
  };
};
