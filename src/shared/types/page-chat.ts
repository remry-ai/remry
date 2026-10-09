// Chatting about the page the user is looking at, with the local Claude Code CLI.
// Only the web app's tRPC context carries a PageChat; the CLI and MCP don't.

import type { Result } from '$shared/utils/result';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  readonly role: ChatRole;
  readonly content: string;
}

export interface PageChatStatus {
  readonly state: 'idle' | 'running' | 'failed' | 'done';
  /** The error, when failed. */
  readonly message?: string;
  /** Claude's reply, when done. */
  readonly reply?: string;
}

export interface PageChatJob {
  /** `<notebookId>/<chatId>`: one reply at a time per chat. */
  readonly key: string;
  readonly claudePath: string;
  /** The whole prompt: page contents and the conversation so far. */
  readonly prompt: string;
  /** Stores the reply. It runs before the job reads as done, so a reload after that finds it. */
  readonly saveReply: (reply: string) => Promise<void>;
}

export interface PageChat {
  /** Looks for the `claude` executable on every call; null when it isn't installed. */
  readonly locate: () => string | null;
  /** Starts the job, or returns an error if one is already running for `key`. */
  readonly start: (job: PageChatJob) => Result<void>;
  /** Whether a reply is being written for `key`; unlike `status`, this doesn't use up a finished status. */
  readonly running: (key: string) => boolean;
  /** A failed or done status is reported once, then the chat reads as idle. */
  readonly status: (key: string) => PageChatStatus;
}

/** A page's saved conversation, and whether Claude is still replying to it. */
export interface StoredPageChat {
  /** Null until the first message is sent. */
  readonly chatId: string | null;
  readonly messages: readonly ChatMessage[];
  readonly replying: boolean;
}

export type SendChatResult =
  | { readonly started: true; readonly chatId: string }
  | { readonly started: false; readonly warning: string };
