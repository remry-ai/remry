import { describe, it, expect, vi } from 'vitest';
import { ok, err } from '$shared/utils/result';
import { createTestRegistry } from '$shared/registry.test';
import type { Registry } from '$shared/registry';
import type { PageChat, PageChatJob } from '$shared/types/page-chat';
import { CHAT_NOT_FOUND_WARNING, getChat, getChatStatus, parseMessages, saveChatReply, sendChat } from '../chat';

const fakeChat = (claudePath: string | null = '/opt/homebrew/bin/claude', busy = false) => {
  const jobs: PageChatJob[] = [];
  const pageChat: PageChat = {
    locate: () => claudePath,
    start: (job) => {
      if (busy) return err(new Error('Claude is still replying in this chat.'));
      jobs.push(job);
      return ok(undefined);
    },
    running: () => busy,
    status: vi.fn(() => ({ state: 'done' as const, reply: 'Hi' }))
  };
  return { pageChat, jobs };
};

interface Row {
  readonly id: string;
  readonly messages: string;
}

// An in-memory page_chat table (one row per entity) plus the group lookup `resolveEntityLabel` does.
const fakeRegistry = (initial: Row | null = null, teamExists = true) => {
  let row: Row | null = initial;
  const pageChat = {
    findUnique: vi.fn(async () => row),
    create: vi.fn(async ({ data }: { data: { messages: string } }) => (row = { id: 'chat-1', messages: data.messages })),
    update: vi.fn(async ({ data }: { data: { messages: string } }) => (row = { ...(row as Row), messages: data.messages }))
  };
  const group = { findUnique: vi.fn(async () => (teamExists ? { name: 'Platform' } : null)) };
  const reg = createTestRegistry({ prisma: { pageChat, group } as unknown as Registry['prisma'] });
  return { reg, stored: () => (row ? parseMessages(row.messages) : null) };
};

const input = {
  entityType: 'GROUP' as const,
  entityId: 'team-1',
  entityName: 'Platform',
  pageText: 'Owns the build',
  content: 'What does it own?'
};

const stored = (messages: readonly { role: string; content: string }[]): Row => ({ id: 'chat-1', messages: JSON.stringify(messages) });

describe('sendChat', () => {
  it('warns, and stores nothing, when claude is not installed or there is no chat (the CLI and MCP context)', async () => {
    const expected = { ok: true, value: { started: false, warning: CHAT_NOT_FOUND_WARNING } };
    const { reg, stored: rows } = fakeRegistry();
    expect(await sendChat(reg, fakeChat(null).pageChat, 'work', input)).toEqual(expected);
    expect(await sendChat(reg, undefined, 'work', input)).toEqual(expected);
    expect(rows()).toBeNull();
  });

  it('stores the message and starts a job keyed by notebook and chat, with the page in the prompt', async () => {
    const { pageChat, jobs } = fakeChat();
    const { reg, stored: rows } = fakeRegistry();
    expect(await sendChat(reg, pageChat, 'work', input)).toEqual({ ok: true, value: { started: true, chatId: 'chat-1' } });
    expect(rows()).toEqual([{ role: 'user', content: 'What does it own?' }]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.key).toBe('work/chat-1');
    expect(jobs[0]?.prompt).toContain('Owns the build');
    expect(jobs[0]?.prompt).toContain('What does it own?');
  });

  it('continues the saved conversation, and the job saves the reply to it', async () => {
    const { pageChat, jobs } = fakeChat();
    const { reg, stored: rows } = fakeRegistry(stored([
      { role: 'user', content: 'Who leads it?' },
      { role: 'assistant', content: 'Alice.' }
    ]));
    await sendChat(reg, pageChat, 'work', input);
    expect(jobs[0]?.prompt).toContain('Who leads it?');
    await jobs[0]?.saveReply('The build.');
    expect(rows()?.map((m) => m.content)).toEqual(['Who leads it?', 'Alice.', 'What does it own?', 'The build.']);
  });

  it('refuses while a reply is running, and for an entity that does not exist', async () => {
    const busy = await sendChat(fakeRegistry(stored([])).reg, fakeChat('/bin/claude', true).pageChat, 'work', input);
    expect(busy.ok).toBe(false);
    const missing = await sendChat(fakeRegistry(null, false).reg, fakeChat().pageChat, 'work', input);
    expect(missing.ok).toBe(false);
  });
});

describe('saveChatReply', () => {
  it('drops the reply when the chat was cleared meanwhile', async () => {
    const { reg, stored: rows } = fakeRegistry();
    await saveChatReply(reg, 'chat-1', 'Late reply');
    expect(rows()).toBeNull();
  });
});

describe('getChat', () => {
  it('returns the saved conversation and whether Claude is replying', async () => {
    const messages = [{ role: 'user', content: 'Hi' }];
    expect(await getChat(fakeRegistry(stored(messages)).reg, fakeChat('/bin/claude', true).pageChat, 'work', input))
      .toEqual({ ok: true, value: { chatId: 'chat-1', messages, replying: true } });
    expect(await getChat(fakeRegistry().reg, undefined, 'work', input))
      .toEqual({ ok: true, value: { chatId: null, messages: [], replying: false } });
  });
});

describe('parseMessages', () => {
  it('reads anything unexpected as an empty conversation', () => {
    expect(parseMessages('{not json')).toEqual([]);
    expect(parseMessages('[{"role":"system","content":"x"}]')).toEqual([]);
    expect(parseMessages('[{"role":"assistant","content":"x"}]')).toEqual([{ role: 'assistant', content: 'x' }]);
  });
});

describe('getChatStatus', () => {
  it('reads the job, or idle without a chat', () => {
    const { pageChat } = fakeChat();
    expect(getChatStatus(pageChat, 'work', 'chat-1')).toEqual({ ok: true, value: { state: 'done', reply: 'Hi' } });
    expect(pageChat.status).toHaveBeenCalledWith('work/chat-1');
    expect(getChatStatus(undefined, 'work', 'chat-1')).toEqual({ ok: true, value: { state: 'idle' } });
  });
});
