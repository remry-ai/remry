// A dataset view in the wiki's URL: ?kind=EXPENSE&f=category:anyOf:Food|Rent
// &sort=amount:desc&group=frequency&agg=amount:sum. The values are page.query's
// string forms ($shared/utils/dataset), so a view can be bookmarked, linked
// from a page, or repeated from the CLI.

export const DATASET_PARAMS = { filter: 'f', sort: 'sort', group: 'group', aggregate: 'agg' } as const;

export interface DatasetParams {
  readonly filters: readonly string[];
  readonly sort?: string;
  readonly groupBy?: string;
  readonly aggregates: readonly string[];
}

export const readDatasetParams = (params: URLSearchParams): DatasetParams => ({
  filters: params.getAll(DATASET_PARAMS.filter).filter(Boolean),
  sort: params.get(DATASET_PARAMS.sort) || undefined,
  groupBy: params.get(DATASET_PARAMS.group) || undefined,
  aggregates: params.getAll(DATASET_PARAMS.aggregate).filter(Boolean)
});

/** The URL with one view parameter replaced (null or an empty list removes it). */
export const withDatasetParam = (url: URL, param: string, value: string | readonly string[] | null): URL => {
  const next = new URL(url);
  next.searchParams.delete(param);
  for (const v of value === null ? [] : typeof value === 'string' ? [value] : value) next.searchParams.append(param, v);
  return next;
};
