import type { PageServerLoad } from './$types';
import { trpc } from '$shared/trpc/client';
import { parseArchiveFilter } from '$shared/utils/archive';

// The wiki is a page tree.
export const load: PageServerLoad = async ({ fetch, url }) => {
  const client = trpc(fetch);
  const archived = parseArchiveFilter(url.searchParams.get('archived'));
  const pages = await client.page.list.query({ archived });
  return { pages: pages.ok ? pages.value : [] };
};
