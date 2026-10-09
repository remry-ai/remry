// Page arithmetic for Pager: pages are 1-based and live in one query parameter.

/** `?page=` as a page number; anything that isn't a whole number from 1 up is page 1. */
export const parsePageParam = (value: string | null): number => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
};

/** How many pages `total` items fill, never fewer than one. */
export const pageCount = (total: number, pageSize: number): number => Math.max(1, Math.ceil(total / pageSize));

/** The page to show: `page`, or the last one when `page` is past the end. */
export const clampPage = (page: number, total: number, pageSize: number): number =>
  Math.min(Math.max(1, page), pageCount(total, pageSize));
