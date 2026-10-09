import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { trpc } from '$shared/trpc/client';
import { features } from '$shared/settings/base/features';

export const load: PageServerLoad = async ({ fetch }) => {
  if (!features.reports) error(404, 'Not found');
  const result = await trpc(fetch).report.list.query();
  return { reports: result.ok ? result.value : [] };
};
