import type { PageServerLoad } from './$types';
import { trpc } from '$shared/trpc/client';
import { loadEntityAssets } from '$shared/trpc/load-entity-assets';
import { loadOwnerOptions } from '$shared/trpc/load-owner-options';
import { notebookModel } from '$shared/modules/model';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ fetch, params, locals }) => {
  const client = trpc(fetch);
  // goal.* is refused in a notebook without the goals module (a home notebook), and a refused call throws.
  const withGoals = notebookModel(locals.notebook.profile).shows('GOAL');
  const [result, allProjects, allGoals, linkedGoals, ownerOptions, assets] = await Promise.all([
    client.project.get.query({ id: params.id }),
    // Archived projects too, so an archived parent still shows in the breadcrumb.
    client.project.list.query({ archived: 'include', closed: 'include' }),
    withGoals ? client.goal.list.query({ closed: 'include' }) : null,
    withGoals ? client.goal.list.query({ projectId: params.id, closed: 'include' }) : null,
    loadOwnerOptions(client),
    loadEntityAssets(client, 'PROJECT', params.id)
  ]);
  if (!result.ok) throw error(404, 'Project not found');
  return {
    project: result.value,
    allProjects: allProjects.ok ? allProjects.value : [],
    allGoals: allGoals?.ok ? allGoals.value : [],
    linkedGoals: linkedGoals?.ok ? linkedGoals.value : [],
    ownerOptions,
    ...assets
  };
};
