import { ARCHIVE_FILTERS, type ArchiveFilter } from '$shared/types/enums';

/** Reads a list page's `?archived=` parameter. Anything unrecognised means the default, active only. */
export const parseArchiveFilter = (value: string | null | undefined): ArchiveFilter =>
  (ARCHIVE_FILTERS as readonly string[]).includes(value ?? '') ? (value as ArchiveFilter) : 'exclude';

export const ARCHIVE_FILTER_LABELS: Readonly<Record<ArchiveFilter, string>> = {
  exclude: 'Active',
  only: 'Archived',
  include: 'Active and archived'
};

/** Fired on window after an archive or unarchive, so cached lists (the quick finder) reload. */
export const ARCHIVE_CHANGED_EVENT = 'wn:archive-changed';
