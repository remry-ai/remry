import type { PageServerLoad } from './$types';
import { trpc } from '$shared/trpc/client';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, fetch }) => {
  const client = trpc(fetch);
  const result = await client.branding.get.query({ id: params.id });
  if (!result.ok) error(404, result.error.message);
  return { brand: result.value };
};
