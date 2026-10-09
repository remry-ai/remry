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

export const pdfPrompt = (fileName: string): string =>
  [
    `Read the PDF file ./${fileName} and convert it to GitHub-flavoured markdown.`,
    'Keep all of its text, in order. Use headings for its headings, markdown tables for its tables and lists for its lists.',
    'Reply with only the markdown: no introduction, no commentary and no surrounding code fence.'
  ].join(' ');

/** Arguments for `claude`, run with the PDF's folder as the working directory. */
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
    return err(new Error(`Claude couldn't convert the PDF: ${reason}`));
  }
  const markdown = (FENCED.exec(result)?.[1] ?? result).trim();
  if (markdown === '') return err(new Error('Claude returned no markdown for this PDF, so the doc wasn\'t changed.'));
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
