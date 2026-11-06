// "Sync now": rewriting a sync doc or wiki page from its sources with the local AI assistant CLI (Claude Code, Copilot…).
// Only the web app's tRPC context carries a SyncRunner; the CLI and MCP don't.

import type { Result } from '$shared/utils/result';
import type { LlmLookup, LocatedLlm } from './llm';
import type { SyncOutcome, SyncRunnerKind } from './enums';

export interface SyncNowStatus {
  readonly state: 'idle' | 'running' | 'failed' | 'done';
  /** Why it failed, or, when done, what it couldn't read. */
  readonly message?: string;
}

export interface SyncNowJob {
  /** `<notebookId>/SYNC:<DOC|PAGE>:<id>`: one at a time per doc or page. */
  readonly key: string;
  /** The default assistant's CLI. */
  readonly llm: LocatedLlm;
  /** Where uploaded files are (the doc's or page's folder); somewhere empty when it has none. */
  readonly cwd: string | null;
  readonly prompt: string;
  /** The web addresses among its sources, for an assistant allowed only their hosts. */
  readonly urls: readonly string[];
  /** Saves the reply; ok with a note for the user (sources it couldn't read), or null. */
  readonly onReply: (reply: string) => Promise<Result<string | null>>;
  /** Called once the job ends, done or failed, to save how it went. */
  readonly onFinish?: (status: SyncNowStatus) => Promise<void>;
}

export interface SyncRunner {
  /** The default assistant's CLI, looked up on every call (see llm-choice.server.ts). */
  readonly locate: () => Promise<LlmLookup>;
  /** Starts the job, or an error when one is already running for `key`. */
  readonly start: (job: SyncNowJob) => Result<void>;
  /** A failed or done status is reported once, then it reads as idle. */
  readonly status: (key: string) => SyncNowStatus;
}

/** A sync doc's or page's last sync, saved so the banner can say when it ran, by what, and how it went. */
export interface LastSync {
  readonly at: Date;
  /** Null for a sync from before they were recorded, when only each source's time was saved. */
  readonly by: SyncRunnerKind | null;
  readonly outcome: SyncOutcome;
  /** Why it failed, or the sources a partial sync couldn't read. */
  readonly message: string | null;
}

/** Why a sync doc or page wants syncing: never synced, its last sync failed, or it's over a week old. */
export type SyncNeed = 'never' | 'failed' | 'stale';
