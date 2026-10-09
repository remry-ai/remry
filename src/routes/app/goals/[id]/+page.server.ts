import type { PageServerLoad } from './$types';
import { trpc } from '$shared/trpc/client';
import { loadEntityAssets } from '$shared/trpc/load-entity-assets';
import { loadOwnerOptions } from '$shared/trpc/load-owner-options';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ fetch, params }) => {
  const client = trpc(fetch);
  const [result, allGoals, allProjects, ownerOptions, assets] = await Promise.all([
    client.goal.get.query({ id: params.id }),
    // Archived goals too, so an archived parent still shows in the breadcrumb.
    client.goal.list.query({ archived: 'include' }),
    client.project.list.query(),
    loadOwnerOptions(client),
    loadEntityAssets(client, 'GOAL', params.id)
  ]);
  if (!result.ok) throw error(404, 'Goal not found');
  return {
    goal: result.value,
    allGoals: allGoals.ok ? allGoals.value : [],
    allProjects: allProjects.ok ? allProjects.value : [],
    ownerOptions,
    ...assets
  };
};
