import { ARCHIVE_FILTERS, type ArchiveFilter } from '$shared/types/enums';

/** Reads a list page's `?archived=` parameter. Anything unrecognised means the default, active only. */
export const parseArchiveFilter = (value: string | null | undefined): ArchiveFilter =>
  (ARCHIVE_FILTERS as readonly string[]).includes(value ?? '') ? (value as ArchiveFilter) : 'exclude';

export const ARCHIVE_FILTER_LABELS: Readonly<Record<ArchiveFilter, string>> = {
  exclude: 'Active',
  only: 'Archived',
  include: 'Active and archived'
};

/**
 * The `?archived=` value for closed items (projects done or abandoned, goals done or dropped)
 * on the Projects and Goals pages.
 */
export const CLOSED_FILTER = 'closed';

export interface StatusListFilters {
  readonly archived: ArchiveFilter;
  /** Closed items: left out (the default), only them, or both. */
  readonly closed: ArchiveFilter;
}

/** What `project.list` / `goal.list` get for the page's `?archived=`: Active leaves closed items out, Closed shows only those not archived, Archived and All show every status. */
export const statusListFilters = (value: string | null | undefined): StatusListFilters => {
  if (value === CLOSED_FILTER) return { archived: 'exclude', closed: 'only' };
  const archived = parseArchiveFilter(value);
  return { archived, closed: archived === 'exclude' ? 'exclude' : 'include' };
};

/** Fired on window after an archive or unarchive, so cached lists (the quick finder) reload. */
export const ARCHIVE_CHANGED_EVENT = 'wn:archive-changed';
