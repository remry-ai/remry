// Which tool a link points at, for the sidebar's Links list. Pure; the icon is
// a letter mark, so no logos or remote favicons are needed.

export interface LinkSource {
  /** The tool's name, for the tooltip: "Linear". */
  readonly name: string;
  /** One or two letters drawn in the icon: "L". */
  readonly mark: string;
}

interface SourceRule {
  readonly host: RegExp;
  readonly path?: RegExp;
  readonly source: LinkSource;
}

// First match wins, so the path-specific rules for a host come before its catch-all.
const RULES: readonly SourceRule[] = [
  { host: /(^|\.)linear\.app$/, source: { name: 'Linear', mark: 'L' } },
  { host: /(^|\.)notion\.(so|site)$/, source: { name: 'Notion', mark: 'N' } },
  { host: /(^|\.)github\.com$/, source: { name: 'GitHub', mark: 'GH' } },
  { host: /(^|\.)gitlab\.com$/, source: { name: 'GitLab', mark: 'GL' } },
  { host: /\.atlassian\.net$/, path: /^\/wiki(\/|$)/, source: { name: 'Confluence', mark: 'C' } },
  { host: /\.atlassian\.net$/, source: { name: 'Jira', mark: 'J' } },
  { host: /^docs\.google\.com$/, path: /^\/spreadsheets\//, source: { name: 'Google Sheets', mark: 'S' } },
  { host: /^docs\.google\.com$/, path: /^\/presentation\//, source: { name: 'Google Slides', mark: 'S' } },
  { host: /^docs\.google\.com$/, source: { name: 'Google Docs', mark: 'D' } },
  { host: /^drive\.google\.com$/, source: { name: 'Google Drive', mark: 'D' } },
  { host: /(^|\.)figma\.com$/, source: { name: 'Figma', mark: 'F' } },
  { host: /(^|\.)slack\.com$/, source: { name: 'Slack', mark: 'S' } },
  { host: /(^|\.)asana\.com$/, source: { name: 'Asana', mark: 'A' } },
  { host: /(^|\.)trello\.com$/, source: { name: 'Trello', mark: 'T' } },
  { host: /(^|\.)airtable\.com$/, source: { name: 'Airtable', mark: 'A' } }
];

const parse = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

/** The known tool a URL belongs to, or null for any other address. */
export const linkSource = (url: string): LinkSource | null => {
  const parsed = parse(url);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const rule = RULES.find((r) => r.host.test(host) && (!r.path || r.path.test(parsed.pathname)));
  return rule?.source ?? null;
};

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * What to show for a link: its title, or else its host and path. With a source,
 * a leading "Linear:" (the tool's name) is dropped, since the icon shows it.
 */
export const linkLabel = (title: string | null, url: string, source: LinkSource | null = null): string => {
  const trimmed = title?.trim();
  if (trimmed) {
    if (!source) return trimmed;
    const stripped = trimmed.replace(new RegExp(`^${escapeRegExp(source.name)}\\s*[:\\-–—]\\s*`, 'i'), '');
    return stripped || trimmed;
  }
  const parsed = parse(url);
  if (!parsed) return url;
  const path = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.hostname.replace(/^www\./, '')}${path}`;
};

/** Days after which a synced link reads as out of date; the skill re-syncs past this too. */
export const SYNC_STALE_DAYS = 7;

/** True when the entity was last synced from this link more than `SYNC_STALE_DAYS` ago. */
export const isSyncStale = (syncedAt: Date | string, now: Date = new Date()): boolean => {
  const at = typeof syncedAt === 'string' ? new Date(syncedAt) : syncedAt;
  return now.getTime() - at.getTime() > SYNC_STALE_DAYS * 24 * 60 * 60 * 1000;
};
