// "Sync now" on a sync doc or sync wiki page: the local Claude Code CLI reads every source and
// rewrites the text from the prompt. Pure: the prompt, the CLI's arguments and the reply's
// parsing. sync-runner.server.ts runs it; the app never calls a model or a source itself.

import { ok, err, type Result } from '$shared/utils/result';

export const SYNC_CLAUDE_NOT_FOUND =
  "Couldn't find the Claude Code CLI (`claude`). Install it and sign in, then choose Sync now again, or ask Claude in a chat to sync it.";

/** Text of one source given inline (a file link's saved text); longer is cut. */
export const SYNC_INLINE_LIMIT = 100_000;

export interface SyncSource {
  readonly id: string;
  readonly title: string | null;
  /** An outside address, read with its connector or web fetch. */
  readonly url: string | null;
  /** A file uploaded as a link, in the run's folder, read with Read when it has no saved text. */
  readonly fileName: string | null;
  /** A file link's saved text, given inline. */
  readonly text: string | null;
  readonly sourceEditedAt: Date | null;
}

export interface SyncPromptInput {
  readonly kind: 'doc' | 'wiki page';
  readonly title: string;
  /** What it's on, for a doc ("the project Checkout"). */
  readonly on: string | null;
  readonly prompt: string;
  readonly content: string;
  readonly sources: readonly SyncSource[];
}

const attr = (value: string): string => value.replace(/"/g, "'");

const sourceBlock = (s: SyncSource): string => {
  const head = `<source id="${s.id}" title="${attr(s.title ?? '')}"`;
  if (s.text !== null) {
    const text = s.text.length > SYNC_INLINE_LIMIT ? `${s.text.slice(0, SYNC_INLINE_LIMIT)}\n[… cut off]` : s.text;
    return `${head} kind="uploaded file, its text below">\n${text}\n</source>`;
  }
  if (s.fileName !== null) return `${head} kind="uploaded file" file="./${attr(s.fileName)}" />`;
  const edited = s.sourceEditedAt ? ` last-synced-version-edited="${s.sourceEditedAt.toISOString()}"` : '';
  return `${head} kind="link" url="${attr(s.url ?? '')}"${edited} />`;
};

export const syncPrompt = (input: SyncPromptInput): string =>
  [
    `You are rewriting a sync ${input.kind} in Remry, the user's private notebook: "${input.title}"${input.on ? `, on ${input.on}` : ''}.`,
    "A sync document is one write-up drawn from its sources, following the user's prompt, which says what to take from each.",
    '',
    'Read every source below. For a link, use the connector for its site (Notion, Linear, Google Drive, Confluence…) if you have one, else fetch it. For an uploaded file, use its text below, or read the file named. Only read: never create, change, comment on or delete anything, anywhere.',
    '',
    'Then write the whole text anew, in GitHub-flavoured markdown:',
    '- Take from each source only what the prompt asks for. Organise it by topic, not source by source, and say where each point comes from, inline: "Launch is 12 Nov (PRD; Linear agrees)".',
    '- End with "## Discrepancies": each place the sources disagree on what the prompt covers, quoting each side with its source and date, without picking a winner. With none, write "None found."',
    '- Keep what the current text says only where a source still supports it.',
    '',
    'Reply with only the new text (no introduction and no surrounding code fence), then, as the very last thing, this block, with one line per source:',
    '<!-- sources',
    "<source id> read <the source's own last-edited time as ISO 8601, or - if it has none>",
    '<source id> unread <why, in a few words>',
    '-->',
    '',
    '<prompt>',
    input.prompt,
    '</prompt>',
    '',
    '<current-text>',
    input.content || '(empty)',
    '</current-text>',
    '',
    '<sources>',
    ...input.sources.map(sourceBlock),
    '</sources>'
  ].join('\n');

// ----- Which tools the run may use -----

/** Servers the run never gets: Remry's own (it writes nothing to the notebook but the text it returns). */
const isRemryServer = (name: string): boolean => /remry|wono|working.notes/i.test(name);

/**
 * The connected MCP servers in `claude mcp list` output (`<name>: <address> - ✓ Connected`),
 * leaving out Remry's own and any that failed or need setting up.
 */
export const connectedMcpServers = (listing: string): readonly string[] =>
  listing
    .split('\n')
    .filter((line) => line.includes('✓'))
    .map((line) => /^(.+?):\s/.exec(line.trim())?.[1] ?? '')
    .filter((name) => name !== '' && !isRemryServer(name));

/** The allow rule for every tool of a server, as Claude Code names it (`claude.ai Notion` → `mcp__claude_ai_Notion`). */
export const mcpServerRule = (name: string): string => `mcp__${name.replace(/[^A-Za-z0-9_-]/g, '_')}`;

const WRITE_VERBS = [
  'create', 'update', 'delete', 'remove', 'write', 'edit', 'add', 'insert', 'append', 'replace', 'patch', 'put',
  'send', 'post', 'publish', 'move', 'archive', 'upload', 'comment', 'reply', 'assign', 'merge', 'close', 'reopen',
  'invite', 'share', 'rename', 'duplicate', 'restore', 'transition', 'submit', 'schedule', 'cancel', 'approve'
] as const;

const capitalised = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * Connector tools denied by name, on top of the prompt's "only read": any whose name says it
 * writes (`create_issue`, `notion-update-page`, `addComment`…). Deny rules win over allow rules.
 */
export const SYNC_DENIED_TOOLS: readonly string[] = WRITE_VERBS.flatMap((verb) => [
  `mcp__*__${verb}*`,
  `mcp__*__*_${verb}*`,
  `mcp__*__*-${verb}*`,
  `mcp__*__*${capitalised(verb)}*`
]);

/**
 * Arguments for a sync run: the prompt on stdin. Nothing is allowed unless named: built-in tools
 * are only Read and WebFetch, and the user's connected servers (`servers`, from
 * `connectedMcpServers`) are allowed one by one, minus `SYNC_DENIED_TOOLS`; anything else is
 * refused, since nobody is there to approve it. No settings files, so no hooks run.
 */
export const buildSyncArgs = (servers: readonly string[]): readonly string[] => [
  '-p',
  '--output-format',
  'json',
  '--tools',
  'Read,WebFetch',
  '--allowedTools',
  'Read',
  'WebFetch',
  ...servers.map(mcpServerRule),
  '--disallowedTools',
  ...SYNC_DENIED_TOOLS,
  '--permission-mode',
  'dontAsk',
  '--no-session-persistence',
  '--setting-sources',
  ''
];

// ----- The reply -----

export interface SyncReply {
  readonly markdown: string;
  readonly read: readonly { readonly id: string; readonly editedAt: Date | null }[];
  readonly unread: readonly { readonly id: string; readonly reason: string }[];
}

const BLOCK = /<!--\s*sources\s*\n([\s\S]*?)-->\s*$/;
const FENCED = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/;

/** Splits Claude's reply into the new text and which sources it read; only ids it was given count. */
export const parseSyncReply = (reply: string, sourceIds: readonly string[]): Result<SyncReply> => {
  const trimmed = reply.trim();
  const match = BLOCK.exec(trimmed);
  if (!match) return err(new Error("Claude's reply didn't say which sources it read, so nothing was changed."));
  const known = new Set(sourceIds);
  const read: { id: string; editedAt: Date | null }[] = [];
  const unread: { id: string; reason: string }[] = [];
  for (const line of (match[1] ?? '').split('\n')) {
    const [id, status, ...rest] = line.trim().split(/\s+/);
    if (!id || !known.has(id)) continue;
    if (status === 'read') {
      const date = rest[0] && rest[0] !== '-' ? new Date(rest[0]) : null;
      read.push({ id, editedAt: date && !Number.isNaN(date.getTime()) ? date : null });
    } else if (status === 'unread') {
      unread.push({ id, reason: rest.join(' ') || 'no reason given' });
    }
  }
  const body = trimmed.slice(0, match.index).trim();
  const markdown = (FENCED.exec(body)?.[1] ?? body).trim();
  if (read.length === 0) {
    const why = unread.map((u) => u.reason).join('; ');
    return err(new Error(`Claude couldn't read any of the sources${why ? ` (${why})` : ''}, so nothing was changed.`));
  }
  if (markdown === '') return err(new Error('Claude returned no text, so nothing was changed.'));
  return ok({ markdown, read, unread });
};
