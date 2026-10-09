import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { trpc } from '$shared/trpc/client';
import { features } from '$shared/settings/base/features';

export const load: PageServerLoad = async ({ params, fetch }) => {
  if (!features.reports) error(404, 'Not found');
  const client = trpc(fetch);
  const [report, brandings] = await Promise.all([
    client.report.get.query({ id: params.id }),
    client.branding.list.query()
  ]);
  if (!report.ok) error(404, 'Report not found');
  const brandingList = brandings.ok ? brandings.value : [];
  return {
    report: report.value,
    brandings: brandingList,
    defaultBrandingId: brandingList.find((b) => b.isDefault)?.id ?? null
  };
};
