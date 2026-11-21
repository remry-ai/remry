// Runs the default assistant's CLI for "Sync now", one background job per doc or page. Like the
// file converter and the page chat, only the web app's tRPC context holds this; jobs live in memory.

import { existsSync } from 'node:fs';
import { lastStderrLine, listLlmServers, probeLlm, runLlm } from './claude-process.server';
import { connectedServers } from './sync-cli';
import { lookupLlm } from './llm-choice.server';
import { linkHosts } from './providers/copilot';
import { llmProvider } from './providers/registry';
import { ok, err } from '$shared/utils/result';
import type { ConnectorProbe, SyncNowJob, SyncNowStatus, SyncRunner } from '$shared/types/sync-now';
import type { LocatedLlm } from '$shared/types/llm';

// Several sources, each read over the network.
const TIMEOUT_MS = 15 * 60 * 1000;
const LIST_TIMEOUT_MS = 2 * 60 * 1000;
// Starting it as a sync would, up to its first event: servers connect before that.
const PROBE_TIMEOUT_MS = 60 * 1000;

// `claude mcp list` checks every server, which takes seconds: the banner asks before each sync.
const CONNECTORS_TTL_MS = 5 * 60 * 1000;

type Connectors = (llm: LocatedLlm) => Promise<ConnectorProbe | null>;

const run = async (job: SyncNowJob, connectors: Connectors): Promise<SyncNowStatus> => {
  const provider = llmProvider(job.llm.provider);
  // The user's connected MCP servers and connectors, so the run can be allowed each by name.
  const probe = await connectors(job.llm);
  const servers = connectedServers(probe);
  const { code, stdout, stderr } = await runLlm(
    job.llm,
    { kind: 'sync', prompt: job.prompt, servers, hosts: linkHosts(job.urls) },
    { cwd: job.cwd && existsSync(job.cwd) ? job.cwd : null, timeoutMs: TIMEOUT_MS }
  );
  if (stdout.trim() === '') {
    const detail = lastStderrLine(stderr);
    return {
      state: 'failed',
      message: code === null
        ? `${provider.name} took longer than 15 minutes, so nothing was changed.`
        : `${provider.name} exited without a reply${detail ? `: ${detail}` : ''}.`
    };
  }
  const reply = provider.parse(stdout, 'sync');
  if (!reply.ok) return { state: 'failed', message: reply.error.message };
  const saved = await job.onReply(reply.value, { probe });
  if (!saved.ok) return { state: 'failed', message: saved.error.message };
  return saved.value ? { state: 'done', message: saved.value } : { state: 'done' };
};

export const createSyncRunner = (now: () => number = Date.now): SyncRunner => {
  const jobs = new Map<string, SyncNowStatus>();
  const listed = new Map<string, { readonly at: number; readonly probe: Promise<ConnectorProbe | null> }>();
  const connectors: Connectors = (llm) => {
    const provider = llmProvider(llm.provider);
    if (provider.probeArgs === null && provider.listServersArgs === null) return Promise.resolve(null);
    const key = `${llm.provider}:${llm.path}`;
    const cached = listed.get(key);
    if (cached && now() - cached.at < CONNECTORS_TTL_MS) return cached.probe;
    // Its start-up event says what a sync run would load, each with its status; an older CLI
    // without one falls back to its list of connected servers.
    const probe = probeLlm(llm, PROBE_TIMEOUT_MS)
      .then(async (found): Promise<ConnectorProbe | null> => found ?? {
        servers: (await listLlmServers(llm, LIST_TIMEOUT_MS)).map((name) => ({ name, status: 'connected' })),
        apiKeySource: null
      })
      .catch(() => {
        listed.delete(key);
        return null;
      });
    listed.set(key, { at: now(), probe });
    return probe;
  };
  return {
    connectors,
    locate: lookupLlm,
    start: (job) => {
      if (jobs.get(job.key)?.state === 'running') return err(new Error(`${llmProvider(job.llm.provider).name} is already syncing this.`));
      jobs.set(job.key, { state: 'running' });
      run(job, connectors)
        .catch((error: unknown): SyncNowStatus => ({
          state: 'failed',
          message: `Couldn't run ${llmProvider(job.llm.provider).name}: ${error instanceof Error ? error.message : String(error)}`
        }))
        .then(async (status) => {
          // Saved before it reads as finished, so the page reloads onto the new last sync.
          await job.onFinish?.(status).catch(() => undefined);
          jobs.set(job.key, status);
        });
      return ok(undefined);
    },
    status: (key) => {
      const status = jobs.get(key) ?? { state: 'idle' };
      if (status.state === 'failed' || status.state === 'done') jobs.delete(key);
      return status;
    }
  };
};

let runner: SyncRunner | null = null;

export const getSyncRunner = (): SyncRunner => {
  runner ??= createSyncRunner();
  return runner;
};
