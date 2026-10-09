// The Chat tab's saved conversations against the real database: a message and
// its reply are stored per entity, Clear deletes them, and so does deleting the
// entity. A fake PageChat stands in for `claude` and saves its reply at once.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { clearChat, getChat, sendChat } from '../../src/api/assist/chat';
import { deletePerson } from '../../src/api/person/operations';
import { ok } from '../../src/shared/utils/result';
import type { PageChat, PageChatJob } from '../../src/shared/types/page-chat';
import { TEST_NOTEBOOK } from './test-notebooks';

const replyingChat = (reply: string): { readonly pageChat: PageChat; readonly done: Promise<void>[] } => {
  const done: Promise<void>[] = [];
  const pageChat: PageChat = {
    locate: () => '/usr/local/bin/claude',
    start: (job: PageChatJob) => {
      done.push(job.saveReply(reply));
      return ok(undefined);
    },
    running: () => false,
    status: () => ({ state: 'idle' })
  };
  return { pageChat, done };
};

const alice = { entityType: 'PERSON' as const, entityId: 'person_alice' };
const ask = (content: string) => ({ ...alice, entityName: 'Alice', pageText: 'Staff Engineer', content });

describe('page chat', () => {
  it('stores the conversation per entity, and Clear deletes it', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const { pageChat, done } = replyingChat('Staff Engineer.');

    const sent = await sendChat(reg, pageChat, TEST_NOTEBOOK, ask('Role?'));
    expect(sent.ok && sent.value.started).toBe(true);
    await Promise.all(done);
    await sendChat(reg, pageChat, TEST_NOTEBOOK, ask('Since when?'));
    await Promise.all(done);

    const saved = await getChat(reg, pageChat, TEST_NOTEBOOK, alice);
    expect(saved.ok && saved.value.messages.map((m) => `${m.role}: ${m.content}`)).toEqual([
      'user: Role?',
      'assistant: Staff Engineer.',
      'user: Since when?',
      'assistant: Staff Engineer.'
    ]);
    const bob = await getChat(reg, pageChat, TEST_NOTEBOOK, { entityType: 'PERSON', entityId: 'person_bob' });
    expect(bob.ok && bob.value.messages).toEqual([]);

    expect(await clearChat(reg, alice)).toEqual({ ok: true, value: { cleared: true } });
    const cleared = await getChat(reg, pageChat, TEST_NOTEBOOK, alice);
    expect(cleared.ok && cleared.value).toEqual({ chatId: null, messages: [], replying: false });
  });

  it('refuses an entity that does not exist, and deleting the entity deletes its chat', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const { pageChat, done } = replyingChat('Hi');

    const missing = await sendChat(reg, pageChat, TEST_NOTEBOOK, { ...ask('Hi'), entityId: 'person_nobody' });
    expect(missing.ok).toBe(false);

    const carol = { entityType: 'PERSON' as const, entityId: 'person_carol' };
    await sendChat(reg, pageChat, TEST_NOTEBOOK, { ...ask('Hi'), ...carol });
    await Promise.all(done);
    expect(await reg.prisma.pageChat.count({ where: carol })).toBe(1);

    expect((await deletePerson(reg, 'person_carol')).ok).toBe(true);
    expect(await reg.prisma.pageChat.count({ where: carol })).toBe(0);
  });
});
