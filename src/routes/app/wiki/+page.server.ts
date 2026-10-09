import type { PageServerLoad } from './$types';
import { trpc } from '$shared/trpc/client';
import { parseArchiveFilter } from '$shared/utils/archive';
import { readDatasetParams } from '$lib/page/dataset-url';

// Without ?kind= the wiki is a page tree. With it, the kind's pages are a
// dataset: the view (filters, sort, group, totals) lives in the URL and runs
// through page.query, the same code the CLI uses.
export const load: PageServerLoad = async ({ fetch, url }) => {
  const client = trpc(fetch);
  const archived = parseArchiveFilter(url.searchParams.get('archived'));
  const kind = url.searchParams.get('kind');
  const [pages, kinds, dataset] = await Promise.all([
    client.page.list.query({ archived }),
    client.pageKind.list.query(),
    kind ? client.page.query.query({ kind, archived, ...readDatasetParams(url.searchParams) }) : Promise.resolve(null)
  ]);
  return {
    pages: pages.ok ? pages.value : [],
    kinds: kinds.ok ? kinds.value : [],
    kind,
    dataset: dataset === null ? null : dataset.ok ? { ok: true as const, value: dataset.value } : { ok: false as const, error: dataset.error.message }
  };
};
