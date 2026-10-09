// Runs the local Claude Code CLI for a page chat reply, one background job per
// chat. Like the PDF converter, only the web app's tRPC context holds this. Job
// states live in memory; the job saves the reply to the notebook when it's done.

import { tmpdir } from 'node:os';
import { buildChatArgs, parseChatOutput } from './claude-cli';
import { lastStderrLine, locateClaude, runClaude } from './claude-process.server';
import { ok, err } from '$shared/utils/result';
import type { PageChat, PageChatJob, PageChatStatus } from '$shared/types/page-chat';

const TIMEOUT_MS = 5 * 60 * 1000;

const reply = async (job: PageChatJob): Promise<PageChatStatus> => {
  // No tools, so the working directory is only somewhere without a CLAUDE.md.
  const { code, stdout, stderr } = await runClaude(job.claudePath, buildChatArgs(), {
    cwd: tmpdir(),
    timeoutMs: TIMEOUT_MS,
    stdin: job.prompt
  });
  if (stdout.trim() === '') {
    const detail = lastStderrLine(stderr);
    return {
      state: 'failed',
      message: code === null
        ? 'Claude took longer than 5 minutes to reply.'
        : `Claude exited without a reply${detail ? `: ${detail}` : ''}.`
    };
  }
  const parsed = parseChatOutput(stdout);
  if (!parsed.ok) return { state: 'failed', message: parsed.error.message };
  try {
    await job.saveReply(parsed.value);
  } catch (error: unknown) {
    return { state: 'failed', message: `Claude replied, but the reply couldn't be saved: ${error instanceof Error ? error.message : String(error)}` };
  }
  return { state: 'done', reply: parsed.value };
};

export const createPageChat = (): PageChat => {
  const jobs = new Map<string, PageChatStatus>();

  return {
    locate: locateClaude,

    start: (job) => {
      if (jobs.get(job.key)?.state === 'running') return err(new Error('Claude is still replying in this chat.'));
      jobs.set(job.key, { state: 'running' });
      reply(job)
        .catch((error: unknown): PageChatStatus => ({
          state: 'failed',
          message: `Couldn't run Claude: ${error instanceof Error ? error.message : String(error)}`
        }))
        .then((status) => { jobs.set(job.key, status); });
      return ok(undefined);
    },

    running: (key) => jobs.get(key)?.state === 'running',

    status: (key) => {
      const status = jobs.get(key) ?? { state: 'idle' };
      if (status.state === 'failed' || status.state === 'done') jobs.delete(key);
      return status;
    }
  };
};

let pageChat: PageChat | null = null;

export const getPageChat = (): PageChat => {
  pageChat ??= createPageChat();
  return pageChat;
};
