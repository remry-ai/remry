import type { PageServerLoad } from './$types';
import { trpc } from '$shared/trpc/client';

export const load: PageServerLoad = async ({ fetch }) => {
  const kinds = await trpc(fetch).pageKind.list.query();
  return { kinds: kinds.ok ? kinds.value : [] };
};
