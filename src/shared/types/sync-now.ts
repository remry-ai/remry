// "Sync now": rewriting a sync doc or wiki page from its sources with the local Claude Code CLI.
// Only the web app's tRPC context carries a SyncRunner; the CLI and MCP don't.

import type { Result } from '$shared/utils/result';

export interface SyncNowStatus {
  readonly state: 'idle' | 'running' | 'failed' | 'done';
  /** Why it failed, or, when done, what it couldn't read. */
  readonly message?: string;
}

export interface SyncNowJob {
  /** `<notebookId>/SYNC:<DOC|PAGE>:<id>`: one at a time per doc or page. */
  readonly key: string;
  readonly claudePath: string;
  /** Where uploaded files are (the doc's or page's folder); somewhere empty when it has none. */
  readonly cwd: string | null;
  readonly prompt: string;
  /** Saves the reply; ok with a note for the user (sources it couldn't read), or null. */
  readonly onReply: (reply: string) => Promise<Result<string | null>>;
}

export interface SyncRunner {
  /** Looks for the `claude` executable on every call; null when it isn't installed. */
  readonly locate: () => string | null;
  /** Starts the job, or an error when one is already running for `key`. */
  readonly start: (job: SyncNowJob) => Result<void>;
  /** A failed or done status is reported once, then it reads as idle. */
  readonly status: (key: string) => SyncNowStatus;
}
