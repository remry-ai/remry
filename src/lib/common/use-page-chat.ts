// Sends a page chat message and waits for Claude's reply, which the server
// produces in the background with the local Claude Code CLI (see
// src/api/assist/chat.ts). The server saves the conversation per entity, so a
// reload picks it up again with `chat.get`, and `waitForReply` resumes a reply
// still being written.

import { submitOrThrow } from '$lib/ui/submit';
import type { PageChatStatus, SendChatResult } from '$shared/types/page-chat';
import type { Result } from '$shared/utils/result';

export interface ChatRequest {
  readonly entityType: string;
  readonly entityId: string;
  readonly entityName: string;
  readonly pageText: string;
  /** The user's new message. */
  readonly content: string;
}

export interface ChatTrpc {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly send: { readonly mutate: (input: any) => Promise<Result<SendChatResult>> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly status: { readonly query: (input: any) => Promise<Result<PageChatStatus>> };
}

export type ChatReply =
  /** `content` is null when the reply was saved but read elsewhere: reload the chat. */
  | { readonly kind: 'reply'; readonly content: string | null }
  | { readonly kind: 'warning'; readonly message: string };

export interface PollOptions {
  readonly wait?: (ms: number) => Promise<void>;
  readonly pollMs?: number;
  /** Stops polling, e.g. when the chat closes; the reply is still saved. */
  readonly signal?: AbortSignal;
}

const defaultWait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls until the chat's reply is done and returns it. Null when polling was
 * stopped, or when the chat went idle without handing this caller the reply
 * (another tab took it, or the app restarted): reload the chat then. Throws
 * with a message on failure.
 */
export const waitForReply = async (
  chat: ChatTrpc,
  chatId: string,
  { wait = defaultWait, pollMs = 1000, signal }: PollOptions = {}
): Promise<string | null> => {
  for (;;) {
    await wait(pollMs);
    if (signal?.aborted) return null;
    const status = await submitOrThrow(() => chat.status.query({ chatId }));
    if (status.state === 'running') continue;
    if (status.state === 'idle') return null;
    if (status.state === 'done' && status.reply) return status.reply;
    throw new Error(status.message ?? "Claude didn't reply. Try again.");
  }
};

/** Resolves with Claude's reply, or a warning when `claude` isn't installed; throws with a message on failure. */
export const askAboutPage = async (
  chat: ChatTrpc,
  request: ChatRequest,
  options: PollOptions = {}
): Promise<ChatReply> => {
  const started = await submitOrThrow(() => chat.send.mutate(request));
  if (!started.started) return { kind: 'warning', message: started.warning };
  return { kind: 'reply', content: await waitForReply(chat, started.chatId, options) };
};
