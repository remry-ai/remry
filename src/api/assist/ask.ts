// The ⌘K finder's /ask: one question about the whole notebook, answered by the
// local Claude Code CLI with no tools, from what a full-text search finds. Not
// a conversation and nothing is saved: the reply comes back once through
// `chat.status`, like a page chat reply. Web app only, like the page chat.

import { ok, type Result } from '$shared/utils/result';
import { askPrompt, ASK_LIMITS } from '$shared/assist/claude-cli';
import { buildFtsQuery } from '$api/search/fts-query';
import { archivedIdList, queryIndex, searchableTypes } from '$api/search/operations';
import type { Registry } from '$shared/registry';
import type { PageChat, SendChatResult } from '$shared/types/page-chat';
import { chatJobKey } from './chat';

export const ASK_NOT_FOUND_WARNING =
  "Couldn't find the Claude Code CLI (`claude`). Install it and sign in, then ask again.";

// Words too common to find anything with.
const STOP_WORDS = new Set([
  'about', 'all', 'and', 'any', 'are', 'can', 'did', 'does', 'for', 'from', 'had', 'has', 'have', 'how',
  'into', 'its', 'not', 'our', 'that', 'the', 'their', 'them', 'there', 'they', 'this', 'was', 'were',
  'what', 'when', 'where', 'which', 'who', 'whom', 'why', 'will', 'with', 'you', 'your', 'tell', 'know', 'give', 'show'
]);

/** A question as a search for any of its meaningful words ("who owns billing?" → "owns OR billing"). Null when none are left. */
export const askSearchQuery = (question: string): string | null => {
  const words = (question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((w) => (w.length >= 3 || /\d/.test(w)) && !STOP_WORDS.has(w));
  const unique = [...new Set(words)];
  return unique.length > 0 ? unique.join(' OR ') : null;
};

/** Starts Claude's answer in the background; poll `chat.status` with the returned id. */
export const askNotebook = async (
  reg: Pick<Registry, 'prisma' | 'uuid'>,
  pageChat: PageChat | undefined,
  notebookId: string,
  question: string
): Promise<Result<SendChatResult>> => {
  const claudePath = pageChat?.locate() ?? null;
  if (!pageChat || !claudePath) return ok({ started: false, warning: ASK_NOT_FOUND_WARNING });

  const words = askSearchQuery(question);
  const match = words ? buildFtsQuery(words) : null;
  const hits = match?.ok
    ? await queryIndex(reg, {
      match: match.value,
      types: searchableTypes(undefined),
      hiddenIds: await archivedIdList(reg),
      limit: ASK_LIMITS.sources,
      snippetTokens: 64
    })
    : [];

  const chatId = `ask-${reg.uuid()}`;
  const started = pageChat.start({
    key: chatJobKey(notebookId, chatId),
    claudePath,
    prompt: askPrompt(question, hits.map((h) => ({ name: h.name, path: h.path, on: h.on?.name ?? null, snippet: h.snippet }))),
    saveReply: async () => { /* an answer isn't kept */ }
  });
  return started.ok ? ok({ started: true, chatId }) : started;
};
