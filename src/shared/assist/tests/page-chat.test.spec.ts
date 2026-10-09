import { afterAll, describe, it, expect, vi } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PageChat, PageChatStatus } from '$shared/types/page-chat';
import { createPageChat } from '../page-chat.server';

// A stand-in for `claude` that saves its stdin and prints a fixed reply.
const dir = mkdtempSync(join(tmpdir(), 'wn-page-chat-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const fakeClaude = (name: string, stdout: string): string => {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\ncat > '${join(dir, `${name}.stdin`)}'\ncat <<'EOF'\n${stdout}\nEOF\n`);
  chmodSync(path, 0o755);
  return path;
};

const settle = async (chat: PageChat, key: string): Promise<PageChatStatus> => {
  for (let i = 0; i < 200; i++) {
    const status = chat.status(key);
    if (status.state !== 'running') return status;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('job did not finish');
};

const noSave = (): Promise<void> => Promise.resolve();

describe('createPageChat', () => {
  it('sends the prompt on stdin and reports the reply once', async () => {
    const claudePath = fakeClaude('ok', JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Hello **there**' }));
    const chat = createPageChat();
    const saveReply = vi.fn(noSave);

    expect(chat.start({ key: 'work/c1', claudePath, prompt: 'the prompt', saveReply }).ok).toBe(true);
    expect(chat.running('work/c1')).toBe(true);
    expect(chat.start({ key: 'work/c1', claudePath, prompt: 'again', saveReply }).ok).toBe(false);

    expect(await settle(chat, 'work/c1')).toEqual({ state: 'done', reply: 'Hello **there**' });
    expect(saveReply).toHaveBeenCalledWith('Hello **there**');
    expect(chat.running('work/c1')).toBe(false);
    expect(chat.status('work/c1')).toEqual({ state: 'idle' });
    expect(readFileSync(join(dir, 'ok.stdin'), 'utf8')).toBe('the prompt');
  });

  it("reports Claude's error once", async () => {
    const claudePath = fakeClaude('expired', JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'OAuth session expired' }));
    const chat = createPageChat();

    const saveReply = vi.fn(noSave);

    chat.start({ key: 'work/c2', claudePath, prompt: 'p', saveReply });
    const status = await settle(chat, 'work/c2');

    expect(status.state).toBe('failed');
    expect(status.message).toContain('OAuth session expired');
    expect(saveReply).not.toHaveBeenCalled();
    expect(chat.status('work/c2')).toEqual({ state: 'idle' });
  });

  it('fails when claude prints nothing', async () => {
    const claudePath = join(dir, 'silent');
    writeFileSync(claudePath, "#!/bin/sh\ncat > /dev/null\necho 'not signed in' >&2\nexit 1\n");
    chmodSync(claudePath, 0o755);
    const chat = createPageChat();

    chat.start({ key: 'work/c3', claudePath, prompt: 'p', saveReply: noSave });
    expect(await settle(chat, 'work/c3')).toEqual({ state: 'failed', message: 'Claude exited without a reply: not signed in.' });
  });

  it("fails when the reply can't be saved", async () => {
    const claudePath = fakeClaude('unsaved', JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Hi' }));
    const chat = createPageChat();

    chat.start({ key: 'work/c4', claudePath, prompt: 'p', saveReply: () => Promise.reject(new Error('database is locked')) });
    expect(await settle(chat, 'work/c4')).toEqual({
      state: 'failed',
      message: "Claude replied, but the reply couldn't be saved: database is locked"
    });
  });
});
