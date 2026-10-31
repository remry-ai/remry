// An AI assistant the web app can run: a local CLI the user installed and signed in to. Each
// provider says how to run one task (its arguments, and whether the prompt goes on stdin or in a
// file) and how to read its reply. Pure: the runners in `src/shared/assist/*.server.ts` run it.
// Adding an assistant is one file here and an entry in `registry.ts`.

import type { Result } from '$shared/utils/result';
import type { LlmProviderId } from '$shared/types/llm';

/** What the web app asks an assistant to do. */
export type LlmTask =
  /** Write a file (in the working directory) as markdown, reading only it. */
  | { readonly kind: 'convert'; readonly fileName: string }
  /** Answer a prompt, with no tools: the page chat and /ask. */
  | { readonly kind: 'chat'; readonly prompt: string }
  /**
   * Rewrite a sync doc or page from its sources, only reading: `servers` are the connectors the
   * provider listed (`listServers`), `hosts` the web hosts of its links.
   */
  | {
    readonly kind: 'sync';
    readonly prompt: string;
    readonly servers: readonly string[];
    readonly hosts: readonly string[];
  };

export type LlmTaskKind = LlmTask['kind'];

/** Stands for the private folder the runner makes for `promptFile`, in `args`. */
export const PROMPT_DIR = '{{remry-prompt-dir}}';

/** The name of the prompt file inside that folder. */
export const PROMPT_FILE = 'prompt.md';

export interface LlmInvocation {
  readonly args: readonly string[];
  /** Written to stdin, then closed. */
  readonly stdin?: string;
  /**
   * Written to `prompt.md` in a new private folder, removed after the run, for a CLI that only
   * takes its prompt as an argument (Windows caps a command line at a few thousand characters).
   * `PROMPT_DIR` in `args` becomes that folder's path.
   */
  readonly promptFile?: string;
}

export interface LlmProvider {
  readonly id: LlmProviderId;
  /** Shown in the choice popup and in messages ("Claude", "Copilot"). */
  readonly name: string;
  /** The full product name, for the popup ("Claude Code", "GitHub Copilot CLI"). */
  readonly product: string;
  /** The command, without an extension (`claude`, `copilot`). */
  readonly binary: string;
  /** How to install and sign in, one sentence. */
  readonly installHint: string;
  readonly invocation: (task: LlmTask) => LlmInvocation;
  /** Reads the CLI's stdout into the reply's text, or an error to show the user. */
  readonly parse: (stdout: string, kind: LlmTaskKind) => Result<string>;
  /** Arguments that list the user's connected MCP servers, for sync; null when it uses none. */
  readonly listServersArgs: readonly string[] | null;
  readonly parseServers: (stdout: string) => readonly string[];
}

/** "Couldn't find …": the warning when the default assistant's CLI isn't installed. `retry` ends the sentence. */
export const notFoundWarning = (provider: LlmProvider, retry: string): string =>
  `Couldn't find the ${provider.product} (\`${provider.binary}\`). ${provider.installHint} Then ${retry}`;
