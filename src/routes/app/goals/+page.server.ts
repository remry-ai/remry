import type { PageServerLoad } from './$types';
import { trpc } from '$shared/trpc/client';
import { statusListFilters } from '$shared/utils/archive';
import { loadOwnerOptions } from '$shared/trpc/load-owner-options';

export const load: PageServerLoad = async ({ fetch, url }) => {
  const client = trpc(fetch);
  const [goals, ownerOptions] = await Promise.all([client.goal.list.query(statusListFilters(url.searchParams.get('archived'))), loadOwnerOptions(client)]);
  return { goals: goals.ok ? goals.value : [], ownerOptions };
};
