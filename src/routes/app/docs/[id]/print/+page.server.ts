import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { trpc } from '$shared/trpc/client';
import { resolvePrintOptions } from '$lib/doc/print-options';
import { isProActive, lockedMessage, NO_LICENSE } from '$shared/types/license';

export const load: PageServerLoad = async ({ params, url, fetch }) => {
  const client = trpc(fetch);
  const [doc, brandings, license] = await Promise.all([
    client.doc.get.query({ id: params.id }),
    client.branding.list.query(),
    client.license.status.query()
  ]);
  if (!doc.ok) error(404, 'Doc not found');
  // PDF export is Remry Pro: without an active license the page explains instead.
  const status = license.ok ? license.value : NO_LICENSE;
  if (!isProActive(status)) {
    return { doc: doc.value, locked: lockedMessage('pdf-export', status, 'app'), brandings: [], options: resolvePrintOptions(new URLSearchParams(), []), branding: null };
  }
  const brandingList = brandings.ok ? brandings.value : [];
  const options = resolvePrintOptions(url.searchParams, brandingList);
  const branding = options.brandingId ? await client.branding.get.query({ id: options.brandingId }) : null;
  return {
    doc: doc.value,
    locked: null,
    brandings: brandingList,
    options,
    branding: branding?.ok ? branding.value : null
  };
};
