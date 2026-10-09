// What a doc's or wiki page's print page shows, read from and written to its URL:
// ?branding=<id> picks a branding, ?branding=none turns it off (left out = the default),
// and ?header=0 hides the branded header.

export const NO_BRANDING = 'none';

export interface PrintOptions {
  /** '' is the notebook's default branding, NO_BRANDING is none, anything else a branding id. */
  readonly choice: string;
  /** The branding to render with, after resolving the default; null for none. */
  readonly brandingId: string | null;
  readonly header: boolean;
}

interface BrandingRef {
  readonly id: string;
  readonly isDefault: boolean;
}

export const resolvePrintOptions = (
  params: URLSearchParams,
  brandings: readonly BrandingRef[]
): PrintOptions => {
  const defaultId = brandings.find((b) => b.isDefault)?.id ?? null;
  const header = params.get('header') !== '0';
  const requested = params.get('branding') ?? '';
  if (requested === NO_BRANDING) return { choice: NO_BRANDING, brandingId: null, header };
  // An unknown id (a deleted branding) falls back to the default.
  if (requested && brandings.some((b) => b.id === requested)) return { choice: requested, brandingId: requested, header };
  return { choice: '', brandingId: defaultId, header };
};

const printPath = (base: string, choice: string, header: boolean): string => {
  const params = new URLSearchParams();
  if (choice) params.set('branding', choice);
  if (!header) params.set('header', '0');
  const query = params.toString();
  return `${base}/print${query ? `?${query}` : ''}`;
};

/** A doc's print page (its "Export PDF"). */
export const printUrl = (docId: string, choice = '', header = true): string =>
  printPath(`/app/docs/${encodeURIComponent(docId)}`, choice, header);

/** A wiki page's print page, with the same options as a doc's. */
export const wikiPrintUrl = (pageId: string, choice = '', header = true): string =>
  printPath(`/app/wiki/${encodeURIComponent(pageId)}`, choice, header);

/** Drops a first-line `# Title` that repeats the doc's title, which the print header already shows. */
export const withoutLeadingTitle = (content: string, title: string): string => {
  const match = /^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n|$)/.exec(content);
  return match && match[1]!.trim().toLowerCase() === title.trim().toLowerCase() ? content.slice(match[0].length) : content;
};
