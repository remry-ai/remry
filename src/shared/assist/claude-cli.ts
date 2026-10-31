// Finding and calling the local Claude Code CLI to turn a PDF into markdown.
// Pure: pdf-converter.server.ts supplies the environment, the filesystem check
// and the process. The app never calls a model API itself.

import { ok, err, type Result } from '$shared/utils/result';

export const CLAUDE_NOT_FOUND_WARNING =
  "Couldn't find the Claude Code CLI (`claude`). Install it and sign in, then choose Convert with Claude again. The PDF is attached.";

export interface ClaudeLookupEnv {
  readonly PATH?: string;
  readonly HOME?: string;
}

/** Where installers put `claude`, for apps started with a minimal PATH. */
const fallbackLocations = (home: string | undefined): readonly string[] => [
  ...(home ? [`${home}/.claude/local/claude`, `${home}/.local/bin/claude`] : []),
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude'
];

export const findClaude = (
  env: ClaudeLookupEnv,
  isExecutable: (path: string) => boolean
): string | null => {
  const onPath = (env.PATH ?? '')
    .split(':')
    .filter((dir) => dir !== '')
    .map((dir) => `${dir.replace(/\/+$/, '')}/claude`);
  return [...onPath, ...fallbackLocations(env.HOME)].find(isExecutable) ?? null;
};

/** How Claude says it couldn't read the file, so its apology is never saved as the file's text. */
export const UNREADABLE_MARKER = 'CANNOT_READ:';

export const pdfPrompt = (fileName: string): string =>
  [
    `Read the file ./${fileName} (a PDF, an image or a text file) and convert it to GitHub-flavoured markdown.`,
    'Keep all of its text, in order. Use headings for its headings, markdown tables for its tables and lists for its lists.',
    "Where something can't be written as text (a chart, a diagram, a photo, a signature, handwriting you can't read), put one line in square brackets saying what it is and what it shows, such as [Figure: revenue by quarter, rising from 2.1M to 3.4M], so a reader knows to look at the original.",
    'Reply with only the markdown: no introduction, no commentary and no surrounding code fence.',
    `If you can't read the file (it's empty, corrupt or not what its name says), reply with only ${UNREADABLE_MARKER} and the reason in one sentence.`
  ].join(' ');

/** Arguments for `claude`, run with the source file's folder as the working directory. */
export const buildClaudeArgs = (fileName: string): readonly string[] => [
  '-p',
  pdfPrompt(fileName),
  '--output-format',
  'json',
  '--tools',
  'Read',
  '--allowedTools',
  'Read',
  '--permission-mode',
  'dontAsk',
  '--no-session-persistence',
  '--strict-mcp-config',
  '--setting-sources',
  ''
];

const FENCED = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Reads `claude -p --output-format json` stdout into the markdown, or an error to show the user. */
export const parseClaudeOutput = (stdout: string): Result<string> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return err(new Error("Claude's reply wasn't the JSON the app expected, so the doc wasn't changed."));
  }
  if (!isRecord(parsed)) {
    return err(new Error("Claude's reply wasn't the JSON the app expected, so the doc wasn't changed."));
  }
  const result = typeof parsed.result === 'string' ? parsed.result.trim() : '';
  if (parsed.is_error === true || parsed.subtype !== 'success') {
    const reason = result || String(parsed.subtype ?? 'unknown error');
    return err(new Error(`Claude couldn't convert the file: ${reason}`));
  }
  const markdown = (FENCED.exec(result)?.[1] ?? result).trim();
  if (markdown === '') return err(new Error('Claude returned no markdown for this PDF, so the doc wasn\'t changed.'));
  if (markdown.startsWith(UNREADABLE_MARKER)) {
    const reason = markdown.slice(UNREADABLE_MARKER.length).trim();
    return err(new Error(`Claude couldn't read the file${reason ? `: ${reason}` : '.'} Nothing was changed.`));
  }
  return ok(markdown);
};

// ----- Page chat -----

export const CHAT_LIMITS = {
  /** Characters of page text sent with each message; more is cut off. */
  pageText: 200_000,
  message: 20_000,
  messages: 50
} as const;

export interface ChatPromptInput {
  readonly entityType: string;
  readonly entityName: string;
  readonly pageText: string;
  readonly messages: readonly { readonly role: 'user' | 'assistant'; readonly content: string }[];
}

/**
 * The whole conversation as one prompt: `claude -p` keeps no session, so each
 * reply gets the page and every earlier message again.
 */
export const chatPrompt = (input: ChatPromptInput): string => {
  const page = input.pageText.length > CHAT_LIMITS.pageText
    ? `${input.pageText.slice(0, CHAT_LIMITS.pageText)}\n[… the rest of the page was cut off]`
    : input.pageText;
  const transcript = input.messages
    .map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`)
    .join('\n');
  return [
    'You are helping the user think about a page in Remry, their private notebook of people, teams, projects, goals and wiki pages.',
    `The page is the ${input.entityType.toLowerCase()} "${input.entityName}". Its text, as the user sees it, is below.`,
    'You cannot change the notebook or use tools. Answer from the page, and say when the page does not contain what is asked.',
    'Reply to the last user message only, in concise GitHub-flavoured markdown, without repeating the transcript tags.',
    '',
    '<page>',
    page,
    '</page>',
    '',
    '<conversation>',
    transcript,
    '</conversation>'
  ].join('\n');
};

// ----- Ask (the ⌘K finder's /ask) -----

export const ASK_LIMITS = {
  question: 2000,
  /** Search hits given to Claude as sources. */
  sources: 25
} as const;

export interface AskSource {
  readonly name: string;
  /** App path, for the answer's links. */
  readonly path: string;
  /** What it's attached to, for a note, doc, todo or comment. */
  readonly on: string | null;
  /** Matching text, with matches in **bold**. */
  readonly snippet: string;
}

/** One question about the whole notebook, answered from search hits, with links to them. */
export const askPrompt = (question: string, sources: readonly AskSource[]): string =>
  [
    'You are answering a question about Remry, the user\'s private notebook of people, teams, projects, goals, wiki pages, docs, notes and todos.',
    'Below are the notebook entries a full-text search found for the question, each with its app path and the text that matched.',
    'You cannot use tools, and the user cannot reply: answer once, from these entries only, and say plainly when they do not answer the question.',
    'Link every entry you mention as a markdown link to its exact path, such as [Dana Park](/app/people/abc). Never invent a path.',
    'Reply in concise GitHub-flavoured markdown.',
    '',
    '<entries>',
    ...(sources.length === 0
      ? ['(none found)']
      : sources.map((s) => `- [${s.name}](${s.path})${s.on ? ` on ${s.on}` : ''}: ${s.snippet.replace(/\s+/g, ' ')}`)),
    '</entries>',
    '',
    '<question>',
    question,
    '</question>'
  ].join('\n');

/** Arguments for a chat reply: the prompt comes on stdin, and no tools at all. */
export const buildChatArgs = (): readonly string[] => [
  '-p',
  '--output-format',
  'json',
  '--tools',
  '',
  '--permission-mode',
  'dontAsk',
  '--no-session-persistence',
  '--strict-mcp-config',
  '--setting-sources',
  ''
];

/** Reads `claude -p --output-format json` stdout into the chat reply, or an error to show the user. */
export const parseChatOutput = (stdout: string): Result<string> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return err(new Error("Claude's reply wasn't the JSON the app expected."));
  }
  if (!isRecord(parsed)) return err(new Error("Claude's reply wasn't the JSON the app expected."));
  const result = typeof parsed.result === 'string' ? parsed.result.trim() : '';
  if (parsed.is_error === true || parsed.subtype !== 'success') {
    return err(new Error(`Claude couldn't reply: ${result || String(parsed.subtype ?? 'unknown error')}`));
  }
  if (result === '') return err(new Error('Claude sent an empty reply.'));
  return ok(result);
};
