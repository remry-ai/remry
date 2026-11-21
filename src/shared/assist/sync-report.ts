// What the user is told after Sync now: which sources the local assistant couldn't read and why,
// and what to do about it. The assistant on this computer reads private pages only through its
// own connectors (`claude mcp list`), which aren't the claude.ai connectors Cowork and Claude
// desktop use, so a source Cowork reads can be out of its reach. Pure.

import { linkLabel, linkSource, missingConnector } from '$shared/utils/link-source';

export interface ReportSource {
  readonly id: string;
  readonly title: string | null;
  /** An outside address; null for a file uploaded as a link. */
  readonly url: string | null;
}

export interface SyncReportInput {
  /** The assistant's name: "Claude Code". */
  readonly assistant: string;
  /** Its connected MCP servers; null when it wasn't asked (or doesn't use any). */
  readonly servers: readonly string[] | null;
  readonly sources: readonly ReportSource[];
  readonly read: readonly string[];
  readonly unread: readonly { readonly id: string; readonly reason: string }[];
}

/** How a source is named to the user: "Notion: Checkout PRD", or a file's name. */
export const sourceName = (source: ReportSource): string => {
  if (!source.url) return source.title ?? 'a file';
  const tool = linkSource(source.url);
  const label = linkLabel(source.title, source.url, tool);
  return tool ? `${tool.name}: ${label}` : label;
};

const list = (items: readonly string[]): string =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;

/**
 * The note for a sync that didn't read every source, one point a line: how many it read, each it
 * couldn't and why, and what to do. Null when it read them all.
 */
export const syncReportNote = (input: SyncReportInput): string | null => {
  const read = new Set(input.read);
  const reasons = new Map(input.unread.map((u) => [u.id, u.reason]));
  const missed = input.sources.filter((s) => !read.has(s.id));
  if (missed.length === 0) return null;

  const lines = [
    read.size === 0
      ? `${input.assistant} couldn't read any of the sources, so nothing was changed.`
      : `Synced from ${read.size} of ${input.sources.length} sources.`,
    `Couldn't read: ${missed.map((s) => `${sourceName(s)} (${reasons.get(s.id) ?? 'not reported'})`).join('; ')}.`
  ];
  const tools = [...new Set(missed.flatMap((s) => {
    const tool = s.url && input.servers ? missingConnector(s.url, input.servers) : null;
    return tool ? [tool.name] : [];
  }))];
  lines.push(tools.length > 0
    ? `${input.assistant} on this computer has no ${list(tools)} connector, so it can only open public pages there. Connect ${tools.length === 1 ? 'it' : 'them'} to ${input.assistant}, or ask Claude in Cowork or Claude desktop to sync this: they use your claude.ai connectors.`
    : `Ask Claude in Cowork or Claude desktop to sync this: they use your claude.ai connectors, which ${input.assistant} on this computer doesn't have.`);
  return lines.join('\n');
};
