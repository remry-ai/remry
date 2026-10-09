import type { PageServerLoad } from './$types';
import { trpc } from '$shared/trpc/client';
import { parseArchiveFilter } from '$shared/utils/archive';

export const load: PageServerLoad = async ({ fetch, url }) => {
  const client = trpc(fetch);
  const kind = url.searchParams.get('kind') || undefined;
  const [groups, kinds] = await Promise.all([
    client.group.list.query({ kind, archived: parseArchiveFilter(url.searchParams.get('archived')) }),
    client.groupKind.list.query()
  ]);
  return { groups: groups.ok ? groups.value : [], kinds: kinds.ok ? kinds.value : [], kind: kind ?? null };
};
