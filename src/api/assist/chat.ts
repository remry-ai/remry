// Chatting about the current page in the web app, with the local Claude Code
// CLI. The PageChat comes from the HTTP tRPC context, never the Registry; the
// CLI and MCP have none. Each entity has one saved conversation (`PageChat`
// table): sending stores the user's message, and the background job appends
// Claude's reply when it's done, so a reload never loses either.

import { z } from 'zod';
import { ok, err, type Result } from '$shared/utils/result';
import { CHAT_LIMITS, chatPrompt } from '$shared/assist/claude-cli';
import { resolveEntityLabel } from '$api/_entity-labels';
import type { Registry } from '$shared/registry';
import type { EntityType } from '$shared/types/enums';
import type {
  ChatMessage,
  PageChat,
  PageChatStatus,
  SendChatResult,
  StoredPageChat
} from '$shared/types/page-chat';

export const CHAT_NOT_FOUND_WARNING =
  "Couldn't find the Claude Code CLI (`claude`). Install it and sign in, then send your message again.";

export const chatJobKey = (notebookId: string, chatId: string): string => `${notebookId}/${chatId}`;

export interface ChatEntity {
  readonly entityType: EntityType;
  readonly entityId: string;
}

export interface SendChatInput extends ChatEntity {
  readonly entityName: string;
  readonly pageText: string;
  /** The user's new message. */
  readonly content: string;
}

const messagesSchema = z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }));

/** The stored JSON as messages; anything unreadable reads as an empty conversation. */
export const parseMessages = (json: string): readonly ChatMessage[] => {
  try {
    const parsed = messagesSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
};

const entityKey = (entity: ChatEntity) => ({
  entityType_entityId: { entityType: entity.entityType, entityId: entity.entityId }
});

export const getChat = async (
  reg: Pick<Registry, 'prisma'>,
  pageChat: PageChat | undefined,
  notebookId: string,
  entity: ChatEntity
): Promise<Result<StoredPageChat>> => {
  const row = await reg.prisma.pageChat.findUnique({ where: entityKey(entity) });
  if (!row) return ok({ chatId: null, messages: [], replying: false });
  return ok({
    chatId: row.id,
    messages: parseMessages(row.messages),
    replying: pageChat?.running(chatJobKey(notebookId, row.id)) ?? false
  });
};

/** Appends Claude's reply, unless the chat was cleared while Claude was replying. */
export const saveChatReply = async (
  reg: Pick<Registry, 'prisma'>,
  chatId: string,
  reply: string
): Promise<void> => {
  const row = await reg.prisma.pageChat.findUnique({ where: { id: chatId } });
  if (!row) return;
  const messages: readonly ChatMessage[] = [...parseMessages(row.messages), { role: 'assistant', content: reply }];
  await reg.prisma.pageChat.update({ where: { id: chatId }, data: { messages: JSON.stringify(messages) } });
};

/**
 * Stores the user's message and starts Claude's reply in the background,
 * returning at once. Poll `getChatStatus` for the reply. Without `claude`, a
 * warning, and nothing is stored.
 */
export const sendChat = async (
  reg: Pick<Registry, 'prisma'>,
  pageChat: PageChat | undefined,
  notebookId: string,
  input: SendChatInput
): Promise<Result<SendChatResult>> => {
  const claudePath = pageChat?.locate() ?? null;
  if (!pageChat || !claudePath) return ok({ started: false, warning: CHAT_NOT_FOUND_WARNING });
  if ((await resolveEntityLabel(reg, input.entityType, input.entityId)) === null) {
    return err(new Error(`No ${input.entityType.toLowerCase()} with id ${input.entityId}.`));
  }

  const existing = await reg.prisma.pageChat.findUnique({ where: entityKey(input) });
  if (existing && pageChat.running(chatJobKey(notebookId, existing.id))) {
    return err(new Error('Claude is still replying in this chat.'));
  }
  const messages: readonly ChatMessage[] = [
    ...(existing ? parseMessages(existing.messages) : []),
    { role: 'user', content: input.content }
  ];
  const json = JSON.stringify(messages);
  const row = existing
    ? await reg.prisma.pageChat.update({ where: { id: existing.id }, data: { messages: json } })
    : await reg.prisma.pageChat.create({ data: { entityType: input.entityType, entityId: input.entityId, messages: json } });

  const started = pageChat.start({
    key: chatJobKey(notebookId, row.id),
    claudePath,
    // The prompt carries the most recent messages only; the whole conversation stays stored.
    prompt: chatPrompt({ ...input, messages: messages.slice(-CHAT_LIMITS.messages) }),
    saveReply: (reply) => saveChatReply(reg, row.id, reply)
  });
  return started.ok ? ok({ started: true, chatId: row.id }) : err(started.error);
};

export const getChatStatus = (
  pageChat: PageChat | undefined,
  notebookId: string,
  chatId: string
): Result<PageChatStatus> =>
  ok(pageChat ? pageChat.status(chatJobKey(notebookId, chatId)) : { state: 'idle' });

/** Forgets the page's conversation. A reply still being written is dropped when it arrives. */
export const clearChat = async (
  reg: Pick<Registry, 'prisma'>,
  entity: ChatEntity
): Promise<Result<{ readonly cleared: boolean }>> => {
  const { count } = await reg.prisma.pageChat.deleteMany({ where: { entityType: entity.entityType, entityId: entity.entityId } });
  return ok({ cleared: count > 0 });
};
