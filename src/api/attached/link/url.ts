// Pure helpers for matching links by URL.

const TRACKING_PARAM = /^(utm_\w+|ref|ref_src|fbclid|gclid)$/i;

/**
 * A comparable form of a URL, so the same page matches however it was pasted:
 * no protocol, lower-case host without `www.`, no fragment, no tracking
 * parameters, no trailing slash. Returns the trimmed input when it isn't a URL.
 */
export const normalizeLinkUrl = (raw: string): string => {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const port = url.port ? `:${url.port}` : '';
  const path = url.pathname.replace(/\/+$/, '');
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM.test(key))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  return `${host}${port}${path}${query}`;
};

/**
 * The part of a URL to narrow a database search with before comparing
 * normalized forms: the path when there is one, otherwise the host.
 */
export const linkSearchKey = (raw: string): string => {
  const normalized = normalizeLinkUrl(raw);
  const slash = normalized.indexOf('/');
  const key = slash === -1 ? normalized : normalized.slice(slash);
  const query = key.indexOf('?');
  return query === -1 ? key : key.slice(0, query);
};
