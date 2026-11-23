// What a doc's or wiki page's print page shows, read from and written to its URL:
// ?branding=<id> picks a branding, ?branding=none turns it off (left out = the default),
// and ?header=1 adds the branded header, which is off until the user turns it on.
// ?format=markdown or ?format=remry exports markdown instead of a PDF (left out = PDF).

export const NO_BRANDING = 'none';

/** What Export makes: a PDF, portable markdown with its pictures drawn, or Remry's own markdown. */
export const EXPORT_FORMATS = ['pdf', 'markdown', 'remry'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_FORMAT_LABELS: Readonly<Record<ExportFormat, string>> = {
  pdf: 'PDF',
  markdown: 'Markdown',
  remry: 'Remry markdown'
};

export const EXPORT_FORMAT_HINTS: Readonly<Record<ExportFormat, string>> = {
  pdf: 'A printable, paged PDF',
  markdown: 'Plain markdown to read anywhere: charts, diagrams and drawings as images',
  remry: 'The text as Remry keeps it, with its images, to read back into Remry'
};

/** The format a URL asks for; anything unknown is a PDF. */
export const exportFormatOf = (params: URLSearchParams): ExportFormat => {
  const value = params.get('format');
  return value === 'markdown' || value === 'remry' ? value : 'pdf';
};

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
  const header = params.get('header') === '1';
  const requested = params.get('branding') ?? '';
  if (requested === NO_BRANDING) return { choice: NO_BRANDING, brandingId: null, header };
  // An unknown id (a deleted branding) falls back to the default.
  if (requested && brandings.some((b) => b.id === requested)) return { choice: requested, brandingId: requested, header };
  return { choice: '', brandingId: defaultId, header };
};

export interface PrintBrandingChoice<B extends BrandingRef> {
  /** The brandings to offer: none without Remry Pro. */
  readonly brandings: readonly B[];
  readonly options: PrintOptions;
  /** Branded export is Remry Pro: the page prints plain, and the branding choice shows it's locked. */
  readonly brandingLocked: boolean;
}

/**
 * What a print page offers. Plain PDF export is free; choosing a branding or its letterhead is
 * Remry Pro, so without it the page ignores ?branding and ?header and prints without a branding.
 */
export const printBrandingChoice = <B extends BrandingRef>(
  params: URLSearchParams,
  brandings: readonly B[],
  pro: boolean
): PrintBrandingChoice<B> =>
  pro
    ? { brandings, options: resolvePrintOptions(params, brandings), brandingLocked: false }
    : { brandings: [], options: { choice: '', brandingId: null, header: false }, brandingLocked: true };

const printPath = (base: string, choice: string, header: boolean, format: ExportFormat): string => {
  const params = new URLSearchParams();
  if (format !== 'pdf') params.set('format', format);
  if (choice) params.set('branding', choice);
  if (header) params.set('header', '1');
  const query = params.toString();
  return `${base}/print${query ? `?${query}` : ''}`;
};

/** A doc's export page (its "Export"). */
export const printUrl = (docId: string, choice = '', header = false, format: ExportFormat = 'pdf'): string =>
  printPath(`/app/docs/${encodeURIComponent(docId)}`, choice, header, format);

/** A wiki page's export page, with the same options as a doc's. */
export const wikiPrintUrl = (pageId: string, choice = '', header = false, format: ExportFormat = 'pdf'): string =>
  printPath(`/app/wiki/${encodeURIComponent(pageId)}`, choice, header, format);

/** A project's export page: markdown only (a project has no one body to print). */
export const projectExportUrl = (projectId: string, format: Exclude<ExportFormat, 'pdf'> = 'markdown'): string =>
  `/app/projects/${encodeURIComponent(projectId)}/export${format === 'markdown' ? '' : `?format=${format}`}`;

/** Drops a first-line `# Title` that repeats the doc's title, which the print header already shows. */
export const withoutLeadingTitle = (content: string, title: string): string => {
  const match = /^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n|$)/.exec(content);
  return match && match[1]!.trim().toLowerCase() === title.trim().toLowerCase() ? content.slice(match[0].length) : content;
};
