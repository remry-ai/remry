// Pure planning for `remry connect chatgpt`: where the ChatGPT desktop app and the Codex
// CLI keep their MCP servers (one shared config.toml), and how to add or remove the Remry
// server there. The file is edited line by line, not parsed and re-printed, so the user's
// comments, order and other servers stay exactly as they wrote them.

import { posix, win32 } from 'node:path';
import { ok, err, type Result } from '../src/shared/utils/result';
import type { AppDirsHost } from '../src/shared/settings/server/app-dirs';
import type { ConfigChange, McpServerEntry } from './desktop-plan';

/** `$CODEX_HOME/config.toml`, or `~/.codex/config.toml` on every platform. */
export const chatGptConfigPath = (host: AppDirsHost): string => {
  const path = host.platform === 'win32' ? win32 : posix;
  const codexHome = host.env['CODEX_HOME'];
  return path.join(codexHome ? codexHome : path.join(host.home, '.codex'), 'config.toml');
};

interface TomlLine {
  readonly text: string;
  /** The table path when this line is a `[table]` or `[[array]]` header, else null. */
  readonly header: readonly string[] | null;
  /** The table this line sits in ([] before the first header). */
  readonly table: readonly string[];
  /** Inside a multi-line string, where nothing is a header or a key. */
  readonly inString: boolean;
}

/** Pure. A dotted key's segments, quotes removed: `mcp_servers."remry"` → ['mcp_servers', 'remry']. */
const keySegments = (key: string): readonly string[] =>
  (key.match(/"(?:[^"\\]|\\.)*"|'[^']*'|[^.\s]+/g) ?? []).map((segment) =>
    segment.startsWith('"') || segment.startsWith("'") ? segment.slice(1, -1) : segment
  );

const HEADER = /^\s*\[(\[?)\s*([^[\]]+?)\s*\]\]?\s*(#.*)?$/;
const KEY = /^\s*((?:"(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_-]+)(?:\s*\.\s*(?:"(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_-]+))*)\s*=/;

const tomlLines = (text: string): readonly TomlLine[] => {
  let table: readonly string[] = [];
  let inString = false;
  return text.split(/\r?\n/).map((line): TomlLine => {
    const startsInString = inString;
    // An odd count of triple quotes opens or closes a multi-line string.
    if (((line.match(/"""|'''/g) ?? []).length) % 2 === 1) inString = !inString;
    if (startsInString) return { text: line, header: null, table, inString: true };
    const header = HEADER.exec(line);
    if (header) {
      table = keySegments(header[2] ?? '');
      return { text: line, header: table, table, inString: false };
    }
    return { text: line, header: null, table, inString: false };
  });
};

const startsWith = (path: readonly string[], prefix: readonly string[]): boolean =>
  prefix.length <= path.length && prefix.every((segment, i) => path[i] === segment);

const sameKey = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && startsWith(a, b);

/** The key a `key = value` line sets, as segments, or null. */
const keyOf = (line: TomlLine): readonly string[] | null => {
  if (line.inString || line.header) return null;
  const match = KEY.exec(line.text);
  return match ? keySegments(match[1] ?? '') : null;
};

/** Pure. A TOML string value (basic or literal), or null for anything else. */
const decodeString = (value: string): string | null => {
  const trimmed = value.trim();
  if (/^'[^']*'$/.test(trimmed)) return trimmed.slice(1, -1);
  if (/^"(?:[^"\\]|\\.)*"$/.test(trimmed)) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return null;
    }
  }
  return null;
};

/** Pure. A one-line array of strings, or null. */
const decodeStrings = (value: string): readonly string[] | null => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const inner = trimmed.slice(1, -1).trim().replace(/,\s*$/, '');
  if (inner === '') return [];
  const parts = inner.split(/\s*,\s*(?=["'])/);
  const decoded = parts.map(decodeString);
  return decoded.every((part): part is string => part !== null) ? decoded : null;
};

/** The value text after `=`, without a trailing comment on a simple value. */
const valueOf = (line: string): string => line.slice(line.indexOf('=') + 1).replace(/\s+#[^"']*$/, '');

/** Where a server's table is, and what it runs. */
interface ServerTable {
  readonly header: number;
  /** One past the last line of the table and of its subtables (`[mcp_servers.remry.env]`). */
  readonly end: number;
  /** One past the last line of the table itself. */
  readonly bodyEnd: number;
  readonly command: string | null;
  readonly args: readonly string[] | null;
}

/** Finds `[mcp_servers.<name>]`, or says why the config defines it some other way. */
const findServer = (lines: readonly TomlLine[], name: string): Result<ServerTable | null> => {
  const path = ['mcp_servers', name];
  // Defined as a dotted key or an inline table instead of its own table: not ours to rewrite.
  const elsewhere = lines.some((line) => {
    const key = keyOf(line);
    return key !== null && !startsWith(line.table, path) && startsWith([...line.table, ...key], path);
  });
  if (elsewhere) {
    return err(new Error(`Your ChatGPT config sets mcp_servers.${name} outside its own [mcp_servers.${name}] table. Remove that entry, then connect again.`));
  }
  const header = lines.findIndex((line) => line.header !== null && sameKey(line.header, path));
  if (header === -1) return ok(null);
  const nextHeader = (from: number, inside: (table: readonly string[]) => boolean): number => {
    const found = lines.findIndex((line, i) => i > from && line.header !== null && !inside(line.header));
    return found === -1 ? lines.length : found;
  };
  const bodyEnd = nextHeader(header, () => false);
  const end = nextHeader(header, (table) => startsWith(table, path));
  const body = lines.slice(header + 1, bodyEnd);
  const value = (key: string): string | null => {
    const line = body.find((candidate) => sameKey(keyOf(candidate) ?? [], [key]));
    return line ? valueOf(line.text) : null;
  };
  const command = value('command');
  const args = value('args');
  return ok({
    header,
    end,
    bodyEnd,
    command: command === null ? null : decodeString(command),
    args: args === null ? null : decodeStrings(args)
  });
};

const eolOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n');

/** JSON's string escapes are valid in a TOML basic string, Windows backslashes included. */
const tomlString = (value: string): string => JSON.stringify(value);

const entryLines = (entry: McpServerEntry): readonly string[] => [
  `command = ${tomlString(entry.command)}`,
  `args = [${entry.args.map(tomlString).join(', ')}]`
];

const sameArgs = (a: readonly string[] | null, b: readonly string[]): boolean =>
  a !== null && a.length === b.length && a.every((arg, i) => arg === b[i]);

/**
 * Pure. ChatGPT's config.toml with `[mcp_servers.<name>]` running `entry`. Its other keys
 * (timeouts, `env`, `enabled`) and everything else in the file stay. Refuses a config that
 * defines the server some other way rather than guess.
 */
export const withChatGptMcpServer = (
  existing: string | null,
  name: string,
  entry: McpServerEntry
): Result<{ readonly text: string; readonly change: ConfigChange }> => {
  const text = existing ?? '';
  const eol = eolOf(text);
  const lines = tomlLines(text);
  const found = findServer(lines, name);
  if (!found.ok) return found;
  const server = found.value;

  if (server === null) {
    const kept = text.replace(/\s+$/, '');
    const block = [`[mcp_servers.${name}]`, ...entryLines(entry)].join(eol);
    return ok({ text: `${kept === '' ? '' : `${kept}${eol}${eol}`}${block}${eol}`, change: 'added' });
  }
  if (server.command === entry.command && sameArgs(server.args, entry.args)) return ok({ text, change: 'unchanged' });

  // Replace command and args (a multi-line args array included), keep the table's other keys.
  const body: string[] = [];
  let skippingArray = false;
  for (const line of lines.slice(server.header + 1, server.bodyEnd)) {
    if (skippingArray) {
      if (line.text.includes(']')) skippingArray = false;
      continue;
    }
    const key = keyOf(line);
    if (key !== null && (sameKey(key, ['command']) || sameKey(key, ['args']))) {
      const value = valueOf(line.text).trim();
      skippingArray = sameKey(key, ['args']) && value.startsWith('[') && !value.includes(']');
      continue;
    }
    body.push(line.text);
  }
  const next = [
    ...lines.slice(0, server.header + 1).map((line) => line.text),
    ...entryLines(entry),
    ...body,
    ...lines.slice(server.bodyEnd).map((line) => line.text)
  ].join(eol);
  return ok({ text: next.endsWith(eol) ? next : `${next}${eol}`, change: 'updated' });
};

/**
 * Pure. ChatGPT's config.toml without `[mcp_servers.<name>]` and its subtables, when it runs
 * `binary`. A server of that name that runs anything else is the user's, and stays. Null when
 * there's nothing to change.
 */
export const withoutChatGptMcpServer = (existing: string | null, name: string, binary: string): Result<string | null> => {
  if (!existing?.trim()) return ok(null);
  const eol = eolOf(existing);
  const lines = tomlLines(existing);
  const found = findServer(lines, name);
  if (!found.ok) return err(new Error(`Your ChatGPT config sets ${name} in a way Remry won't rewrite. Remove the "${name}" server from it by hand.`));
  const server = found.value;
  if (server === null || server.command !== binary) return ok(null);
  const before = lines.slice(0, server.header).map((line) => line.text);
  while (before.length > 0 && before[before.length - 1]?.trim() === '') before.pop();
  const after = lines.slice(server.end).map((line) => line.text);
  while (after.length > 0 && after[0]?.trim() === '') after.shift();
  const joined = [...before, ...(before.length > 0 && after.length > 0 ? [''] : []), ...after].join(eol).replace(/\s+$/, '');
  return ok(joined === '' ? '' : `${joined}${eol}`);
};
