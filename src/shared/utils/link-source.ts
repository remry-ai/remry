// Which tool a link points at: for the Links lists (the icon is a letter mark, so no logos or
// remote favicons are needed), and for Sync now, which reads a private page only through a
// connector for its tool. Pure.

export interface LinkSource {
  /** The tool's name, for the tooltip: "Linear". */
  readonly name: string;
  /** One or two letters drawn in the icon: "L". */
  readonly mark: string;
  /** Matches the name of an MCP server or connector that reads it ("Notion", "claude.ai Google Drive"). */
  readonly connector: RegExp;
}

interface SourceRule {
  readonly host: RegExp;
  readonly path?: RegExp;
  readonly source: LinkSource;
}

// First match wins, so the path-specific rules for a host come before its catch-all.
const RULES: readonly SourceRule[] = [
  { host: /(^|\.)linear\.app$/, source: { name: 'Linear', mark: 'L', connector: /linear/i } },
  { host: /(^|\.)notion\.(so|site)$/, source: { name: 'Notion', mark: 'N', connector: /notion/i } },
  { host: /(^|\.)github\.com$/, source: { name: 'GitHub', mark: 'GH', connector: /github/i } },
  { host: /(^|\.)gitlab\.com$/, source: { name: 'GitLab', mark: 'GL', connector: /gitlab/i } },
  { host: /\.atlassian\.net$/, path: /^\/wiki(\/|$)/, source: { name: 'Confluence', mark: 'C', connector: /atlassian|confluence/i } },
  { host: /\.atlassian\.net$/, source: { name: 'Jira', mark: 'J', connector: /atlassian|jira/i } },
  { host: /^docs\.google\.com$/, path: /^\/spreadsheets\//, source: { name: 'Google Sheets', mark: 'S', connector: /google|drive|sheets/i } },
  { host: /^docs\.google\.com$/, path: /^\/presentation\//, source: { name: 'Google Slides', mark: 'S', connector: /google|drive|slides/i } },
  { host: /^docs\.google\.com$/, source: { name: 'Google Docs', mark: 'D', connector: /google|drive|docs/i } },
  { host: /^drive\.google\.com$/, source: { name: 'Google Drive', mark: 'D', connector: /google|drive/i } },
  { host: /(^|\.)figma\.com$/, source: { name: 'Figma', mark: 'F', connector: /figma/i } },
  { host: /(^|\.)slack\.com$/, source: { name: 'Slack', mark: 'S', connector: /slack/i } },
  { host: /(^|\.)asana\.com$/, source: { name: 'Asana', mark: 'A', connector: /asana/i } },
  { host: /(^|\.)trello\.com$/, source: { name: 'Trello', mark: 'T', connector: /trello/i } },
  { host: /(^|\.)airtable\.com$/, source: { name: 'Airtable', mark: 'A', connector: /airtable/i } }
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


/**
 * The tool a link belongs to when none of `servers` (the assistant's connected MCP servers)
 * can read it, so a private page there can only be fetched as a public one; null when one can,
 * or when it isn't a known tool (any page is fetched as it is).
 */
export const missingConnector = (url: string, servers: readonly string[]): LinkSource | null => {
  const source = linkSource(url);
  if (!source) return null;
  return servers.some((name) => source.connector.test(name)) ? null : source;
};
