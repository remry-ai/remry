import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { trpc } from '$shared/trpc/client';
import { resolvePrintOptions } from '$lib/doc/print-options';
import { isProActive, lockedMessage, NO_LICENSE } from '$shared/types/license';

export const load: PageServerLoad = async ({ params, url, fetch }) => {
  const client = trpc(fetch);
  const [page, brandings, license] = await Promise.all([
    client.page.get.query({ id: params.id }),
    client.branding.list.query(),
    client.license.status.query()
  ]);
  if (!page.ok) error(404, 'Page not found');
  // PDF export is Remry Pro: without an active license the page explains instead.
  const status = license.ok ? license.value : NO_LICENSE;
  if (!isProActive(status)) {
    return { page: page.value, locked: lockedMessage('pdf-export', status, 'app'), fields: [], brandings: [], options: resolvePrintOptions(new URLSearchParams(), []), branding: null };
  }
  const kind = await client.pageKind.get.query({ key: page.value.kind });
  const brandingList = brandings.ok ? brandings.value : [];
  const options = resolvePrintOptions(url.searchParams, brandingList);
  const branding = options.brandingId ? await client.branding.get.query({ id: options.brandingId }) : null;
  return {
    page: page.value,
    locked: null,
    fields: kind.ok ? kind.value.fields : [],
    brandings: brandingList,
    options,
    branding: branding?.ok ? branding.value : null
  };
};
