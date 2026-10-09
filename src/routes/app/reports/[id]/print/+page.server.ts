import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { trpc } from '$shared/trpc/client';
import { features } from '$shared/settings/base/features';

export const load: PageServerLoad = async ({ params, fetch }) => {
  if (!features.reports) error(404, 'Not found');
  const result = await trpc(fetch).report.get.query({ id: params.id });
  if (!result.ok) error(404, 'Report not found');
  return { report: result.value };
};
