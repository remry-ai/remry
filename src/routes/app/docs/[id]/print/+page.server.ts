import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { trpc } from '$shared/trpc/client';
import { printBrandingChoice } from '$lib/doc/print-options';
import { isProActive, NO_LICENSE } from '$shared/types/license';

export const load: PageServerLoad = async ({ params, url, fetch }) => {
  const client = trpc(fetch);
  const [doc, brandings, license] = await Promise.all([
    client.doc.get.query({ id: params.id }),
    client.branding.list.query(),
    client.license.status.query()
  ]);
  if (!doc.ok) error(404, 'Doc not found');
  // Plain PDF export is free; a branding and its letterhead are Remry Pro.
  const pro = isProActive(license.ok ? license.value : NO_LICENSE);
  const choice = printBrandingChoice(url.searchParams, brandings.ok ? brandings.value : [], pro);
  const branding = choice.options.brandingId ? await client.branding.get.query({ id: choice.options.brandingId }) : null;
  return {
    doc: doc.value,
    brandings: choice.brandings,
    options: choice.options,
    brandingLocked: choice.brandingLocked,
    branding: branding?.ok ? branding.value : null
  };
};
