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
 * The `?archived=` value for done items (a project that's done, a goal that's DONE) on a
 * list whose rows have a status. The list call treats it as the default (not archived),
 * and the page keeps only the done rows.
 */
export const DONE_FILTER = 'done';

export type DoneShown = 'hide' | 'only' | 'any';

/** Which done rows a status list shows: Active hides them, Done shows only them, the others show both. */
export const doneShown = (value: string | null | undefined): DoneShown => {
  if (value === DONE_FILTER) return 'only';
  return parseArchiveFilter(value) === 'exclude' ? 'hide' : 'any';
};

export const matchesDone = (done: boolean, shown: DoneShown): boolean => shown === 'any' || (shown === 'only') === done;

/** Fired on window after an archive or unarchive, so cached lists (the quick finder) reload. */
export const ARCHIVE_CHANGED_EVENT = 'wn:archive-changed';
