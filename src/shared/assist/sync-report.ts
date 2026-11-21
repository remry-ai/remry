// What the user is told about Sync now: before a run, which sources the assistant on this computer
// can open only if they're public; after one, which it couldn't read and why. It reads private
// pages only through the servers and claude.ai connectors it loads, each signed in for it, and
// only with the user's Claude account (an API key loads no connectors). So each tool it can't
// reach gets the reason it reported at start-up (`ConnectorProbe`) and what to do, and there's
// always the other way: ask Claude to sync it, from a chat with the user's connectors. Pure.

import type { ConnectorProbe } from '$shared/types/sync-now';
import { linkLabel, linkSource, missingConnector } from '$shared/utils/link-source';

export interface ReportSource {
  readonly id: string;
  readonly title: string | null;
  /** An outside address; null for a file uploaded as a link. */
  readonly url: string | null;
}

/** How a source is named to the user: "Notion: Checkout PRD", or a file's name. */
export const sourceName = (source: Pick<ReportSource, 'title' | 'url'>): string => {
  if (!source.url) return source.title ?? 'a file';
  const tool = linkSource(source.url);
  const label = linkLabel(source.title, source.url, tool);
  return tool ? `${tool.name}: ${label}` : label;
};

const orList = (items: readonly string[]): string =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;

export const ASK_CLAUDE = 'Or choose Trigger sync: the next Claude chat that uses Remry (Cowork, Claude desktop) syncs it with your claude.ai connectors.';

export interface Reach {
  /** The sources it can open only if they're public, by name. */
  readonly unreachable: readonly string[];
  /** Why, a line for each reason, and what to do. Empty when it can reach them all. */
  readonly advice: readonly string[];
}

/**
 * Which of these sources the assistant can't read privately, and why, from what it loaded: a
 * connector that needs signing in or failed, one it doesn't have, or no connectors at all because
 * it's signed in with an API key. Sources on a tool it has a connected server for, files, and
 * addresses on no known tool (read as any page) aren't listed.
 */
export const connectorReach = (assistant: string, probe: ConnectorProbe | null, sources: readonly Pick<ReportSource, 'title' | 'url'>[]): Reach => {
  const connected = probe ? probe.servers.filter((s) => s.status === 'connected').map((s) => s.name) : [];
  const missing = sources.flatMap((source) => {
    const tool = source.url ? missingConnector(source.url, connected) : null;
    return tool ? [{ source, tool }] : [];
  });
  if (missing.length === 0) return { unreachable: [], advice: [] };

  const advice: string[] = [];
  const absent: string[] = [];
  for (const toolName of [...new Set(missing.map((m) => m.tool.name))]) {
    const tool = missing.find((m) => m.tool.name === toolName)!.tool;
    const server = probe?.servers.find((s) => tool.connector.test(s.name));
    if (server?.status === 'needs-auth') {
      advice.push(`${server.name} isn't signed in for ${assistant}: run claude mcp login "${server.name}" in a terminal, or /mcp in Claude Code.`);
    } else if (server && server.status !== 'connected') {
      advice.push(`${server.name} didn't connect in ${assistant} (${server.status}): check it with /mcp in Claude Code.`);
    } else {
      absent.push(toolName);
    }
  }
  if (absent.length > 0) {
    const signedInWithKey = probe?.apiKeySource && probe.apiKeySource !== 'none';
    advice.push(signedInWithKey
      ? `${assistant} is signed in with an API key (${probe?.apiKeySource}), so it doesn't load your claude.ai connectors, ${orList(absent)} among them. Sign it in with your Claude account (/login in Claude Code) to use them.`
      : probe === null
        ? `${assistant} reads links as public pages only: it has no ${orList(absent)} connector.`
        : `${assistant} has no ${orList(absent)} connector. Add it at claude.ai (Settings, Connectors): ${assistant} gets your claude.ai connectors when it's signed in with your Claude account.`);
  }
  advice.push(ASK_CLAUDE);
  return { unreachable: missing.map((m) => sourceName(m.source)), advice };
};

export interface SyncReportInput {
  /** The assistant's name: "Claude Code". */
  readonly assistant: string;
  /** What it loaded for the run; null when unknown or it uses no servers. */
  readonly probe: ConnectorProbe | null;
  readonly sources: readonly ReportSource[];
  readonly read: readonly string[];
  readonly unread: readonly { readonly id: string; readonly reason: string }[];
}

/**
 * The note for a sync that didn't read every source, one point a line: how many it read, each it
 * couldn't and why, and what to do. Null when it read them all.
 */
export const syncReportNote = (input: SyncReportInput): string | null => {
  const read = new Set(input.read);
  const reasons = new Map(input.unread.map((u) => [u.id, u.reason]));
  const missed = input.sources.filter((s) => !read.has(s.id));
  if (missed.length === 0) return null;

  const reach = connectorReach(input.assistant, input.probe, missed);
  return [
    read.size === 0
      ? `${input.assistant} couldn't read any of the sources, so nothing was changed.`
      : `Synced from ${read.size} of ${input.sources.length} sources.`,
    `Couldn't read: ${missed.map((s) => `${sourceName(s)} (${reasons.get(s.id) ?? 'not reported'})`).join('; ')}.`,
    ...(reach.advice.length > 0 ? reach.advice : [ASK_CLAUDE])
  ].join('\n');
};
