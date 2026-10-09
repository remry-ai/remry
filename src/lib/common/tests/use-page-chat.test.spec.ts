import { describe, it, expect, vi } from 'vitest';
import { askAboutPage, waitForReply, type ChatTrpc } from '../use-page-chat';

const request = {
  entityType: 'PERSON',
  entityId: 'p1',
  entityName: 'Alice',
  pageText: 'Staff Engineer',
  content: 'Role?'
};
const noWait = (): Promise<void> => Promise.resolve();

const chatTrpc = (started: unknown, statuses: readonly unknown[]): ChatTrpc => {
  const query = vi.fn();
  statuses.forEach((s) => query.mockResolvedValueOnce({ ok: true, value: s }));
  return { send: { mutate: vi.fn().mockResolvedValue({ ok: true, value: started }) }, status: { query } };
};

describe('askAboutPage', () => {
  it('polls until the reply is done', async () => {
    const chat = chatTrpc({ started: true, chatId: 'c1' }, [{ state: 'running' }, { state: 'done', reply: 'Staff Engineer.' }]);
    expect(await askAboutPage(chat, request, { wait: noWait })).toEqual({ kind: 'reply', content: 'Staff Engineer.' });
    expect(chat.send.mutate).toHaveBeenCalledWith(request);
    expect(chat.status.query).toHaveBeenCalledTimes(2);
    expect(chat.status.query).toHaveBeenCalledWith({ chatId: 'c1' });
  });

  it('returns the warning when claude is missing, without polling', async () => {
    const chat = chatTrpc({ started: false, warning: 'Install claude' }, []);
    expect(await askAboutPage(chat, request, { wait: noWait })).toEqual({ kind: 'warning', message: 'Install claude' });
    expect(chat.status.query).not.toHaveBeenCalled();
  });

  it('throws the failure message', async () => {
    const chat = chatTrpc({ started: true, chatId: 'c1' }, [{ state: 'failed', message: 'OAuth session expired' }]);
    await expect(askAboutPage(chat, request, { wait: noWait })).rejects.toThrow('OAuth session expired');
  });

  it('throws when the send itself fails', async () => {
    const chat: ChatTrpc = {
      send: { mutate: vi.fn().mockResolvedValue({ ok: false, error: new Error('Claude is still replying in this chat.') }) },
      status: { query: vi.fn() }
    };
    await expect(askAboutPage(chat, request, { wait: noWait })).rejects.toThrow('still replying');
  });
});

describe('waitForReply', () => {
  it('resumes polling a chat whose reply is still running', async () => {
    const chat = chatTrpc(null, [{ state: 'running' }, { state: 'done', reply: 'Done.' }]);
    expect(await waitForReply(chat, 'c1', { wait: noWait })).toBe('Done.');
    expect(chat.send.mutate).not.toHaveBeenCalled();
  });

  it('returns null when the chat went idle or polling was stopped', async () => {
    expect(await waitForReply(chatTrpc(null, [{ state: 'idle' }]), 'c1', { wait: noWait })).toBeNull();
    const stopped = chatTrpc(null, []);
    expect(await waitForReply(stopped, 'c1', { wait: noWait, signal: AbortSignal.abort() })).toBeNull();
    expect(stopped.status.query).not.toHaveBeenCalled();
  });
});
