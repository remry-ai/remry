import type { PageServerLoad } from './$types';
import { trpc } from '$shared/trpc/client';
import { loadEntityAssets } from '$shared/trpc/load-entity-assets';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ fetch, params }) => {
  const client = trpc(fetch);
  const [result, allPages, kinds, assets] = await Promise.all([
    client.page.get.query({ id: params.id }),
    // Archived pages too, so an archived parent still shows in the breadcrumb.
    client.page.list.query({ archived: 'include' }),
    client.pageKind.list.query(),
    loadEntityAssets(client, 'PAGE', params.id)
  ]);
  if (!result.ok) throw error(404, 'Page not found');
  return {
    page: result.value,
    allPages: allPages.ok ? allPages.value : [],
    kinds: kinds.ok ? kinds.value : [],
    ...assets
  };
};
