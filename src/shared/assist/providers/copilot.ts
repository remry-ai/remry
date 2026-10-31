// GitHub Copilot CLI (`copilot -p`), the assistant most Windows users have: install it with
// `npm install -g @github/copilot` or `winget install GitHub.Copilot`, then run `copilot` once to
// sign in. It takes its prompt only as an argument, so the prompt goes in a file the argument
// points at (a chat prompt is far longer than Windows allows on a command line).
//
// Only reading, every time: `-p` refuses any tool it isn't allowed, and shell commands and file
// writes are denied outright. GitHub's own MCP server (which can write) is turned off, and the
// user's Copilot MCP servers are never allowed, so a sync reads links with web fetch only, from
// the hosts of its own links; a source only a connector can read comes back unread.

import { ok, err, type Result } from '$shared/utils/result';
import { FENCED, UNREADABLE_MARKER, pdfPrompt } from '../claude-cli';
import { PROMPT_DIR, PROMPT_FILE, type LlmInvocation, type LlmProvider, type LlmTask } from './provider';

/** The only prompt on the command line: it points at the real one. */
export const COPILOT_PROMPT = `Read the file ${PROMPT_DIR}/${PROMPT_FILE} and do exactly what it says. Reply with only what it asks for.`;

/** Flags for every run: the reply alone, no colours, no repo instructions, nothing that writes. */
const BASE = [
  '-s',
  '--no-color',
  '--no-custom-instructions',
  '--disable-builtin-mcps',
  '--add-dir',
  PROMPT_DIR,
  '--deny-tool',
  'shell',
  '--deny-tool',
  'write'
] as const;

export const buildCopilotArgs = (task: LlmTask): readonly string[] => [
  '-p',
  COPILOT_PROMPT,
  ...BASE,
  ...(task.kind === 'sync' ? task.hosts.flatMap((host) => ['--allow-url', host]) : [])
];

const promptOf = (task: LlmTask): string => {
  if (task.kind === 'convert') return pdfPrompt(task.fileName);
  if (task.kind === 'chat') return task.prompt;
  return [
    task.prompt,
    '',
    "You have no connectors here, only web fetch: a source you can't fetch is unread, with the reason."
  ].join('\n');
};

export const copilotInvocation = (task: LlmTask): LlmInvocation => ({
  args: buildCopilotArgs(task),
  promptFile: promptOf(task)
});

// Colour codes, in case a version prints them despite --no-color.
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

/** Reads `copilot -p -s` stdout (the reply as plain text) into markdown, or an error to show the user. */
export const parseCopilotOutput = (stdout: string, kind: LlmTask['kind']): Result<string> => {
  const text = stdout.replace(ANSI, '').trim();
  if (text === '') return err(new Error('Copilot sent an empty reply.'));
  if (kind !== 'convert') return ok(text);
  const markdown = (FENCED.exec(text)?.[1] ?? text).trim();
  if (markdown.startsWith(UNREADABLE_MARKER)) {
    const reason = markdown.slice(UNREADABLE_MARKER.length).trim();
    return err(new Error(`Copilot couldn't read the file${reason ? `: ${reason}` : '.'} Nothing was changed.`));
  }
  return ok(markdown);
};

/** The hosts of a sync's links, for `--allow-url`: http(s) only, each once. */
export const linkHosts = (urls: readonly string[]): readonly string[] => [
  ...new Set(
    urls.flatMap((url) => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? [parsed.hostname] : [];
      } catch {
        return [];
      }
    })
  )
];

export const copilotProvider: LlmProvider = {
  id: 'copilot',
  name: 'Copilot',
  product: 'GitHub Copilot CLI',
  binary: 'copilot',
  installHint: 'Install it (`npm install -g @github/copilot`, or `winget install GitHub.Copilot` on Windows) and run `copilot` once to sign in.',
  invocation: copilotInvocation,
  parse: parseCopilotOutput,
  listServersArgs: null,
  parseServers: () => []
};
