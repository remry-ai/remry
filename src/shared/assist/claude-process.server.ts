// Finding and running the local assistant CLI (Claude Code, GitHub Copilot…). Shared by the file
// converter, the page chat and Sync now; each keeps its jobs in memory, one local process.

import { spawn } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdCommandLine, findExecutable } from './find-cli';
import { llmProvider } from './providers/registry';
import { PROMPT_DIR, PROMPT_FILE, type LlmTask } from './providers/provider';
import type { LlmProviderId, LocatedLlm } from '$shared/types/llm';
import type { ConnectorProbe } from '$shared/types/sync-now';

export interface ClaudeRun {
  /** Null when the process was killed (the timeout). */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ClaudeRunOptions {
  readonly cwd: string;
  readonly timeoutMs: number;
  /** Written to stdin, then closed. Without it stdin is ignored. */
  readonly stdin?: string;
}

const isExecutable = (path: string): boolean => {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/** The assistant's CLI on this computer, or null when it isn't installed. */
export const locateCli = (id: LlmProviderId): string | null =>
  findExecutable(
    llmProvider(id).binary,
    {
      PATH: process.env.PATH ?? process.env.Path,
      HOME: process.env.HOME,
      APPDATA: process.env.APPDATA,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      USERPROFILE: process.env.USERPROFILE
    },
    process.platform === 'win32' ? 'win32' : 'posix',
    isExecutable
  );

export const locateClaude = (): string | null => locateCli('claude');

/** How to start `path`: directly, or through cmd.exe for a Windows `.cmd` (npm's shims). */
const command = (path: string, args: readonly string[]): { file: string; args: readonly string[]; verbatim: boolean } => {
  if (process.platform !== 'win32' || !/\.(cmd|bat)$/i.test(path)) return { file: path, args, verbatim: false };
  const line = cmdCommandLine(path, args);
  if (line === null) throw new Error('an argument has a character Windows can\'t pass to it');
  return { file: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', line], verbatim: true };
};

export const runClaude = (cliPath: string, args: readonly string[], options: ClaudeRunOptions): Promise<ClaudeRun> =>
  new Promise((resolve, reject) => {
    const cmd = command(cliPath, args);
    const child = spawn(cmd.file, [...cmd.args], {
      cwd: options.cwd,
      stdio: [options.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      windowsVerbatimArguments: cmd.verbatim,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), options.timeoutMs);
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    if (options.stdin !== undefined && child.stdin) {
      child.stdin.on('error', () => { /* the process exited early; close reports it */ });
      child.stdin.end(options.stdin);
    }
  });

export interface LlmRunOptions {
  /** Where it runs; a task with a prompt file and no folder of its own runs in the prompt's folder. */
  readonly cwd: string | null;
  readonly timeoutMs: number;
}

/**
 * Runs one task with the located assistant: its arguments, and its prompt on stdin or in a
 * private temporary file, removed afterwards.
 */
export const runLlm = async (llm: LocatedLlm, task: LlmTask, options: LlmRunOptions): Promise<ClaudeRun> => {
  const invocation = llmProvider(llm.provider).invocation(task);
  if (invocation.promptFile === undefined) {
    return runClaude(llm.path, invocation.args, { cwd: options.cwd ?? tmpdir(), timeoutMs: options.timeoutMs, stdin: invocation.stdin });
  }
  const dir = await mkdtemp(join(tmpdir(), 'remry-prompt-'));
  try {
    await writeFile(join(dir, PROMPT_FILE), invocation.promptFile, { encoding: 'utf8', mode: 0o600 });
    const args = invocation.args.map((arg) => arg.split(PROMPT_DIR).join(dir));
    return await runClaude(llm.path, args, { cwd: options.cwd ?? dir, timeoutMs: options.timeoutMs, stdin: invocation.stdin });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/**
 * Starts the assistant as a sync run would and reads what it loaded (its servers and connectors,
 * each with its status, and how it's signed in) from its first event, then stops it before it
 * asks the model anything. Null when it reports nothing in time (an older CLI), or uses no servers.
 */
export const probeLlm = (llm: LocatedLlm, timeoutMs: number): Promise<ConnectorProbe | null> => {
  const provider = llmProvider(llm.provider);
  const probeArgs = provider.probeArgs;
  if (probeArgs === null) return Promise.resolve(null);
  return new Promise((resolve) => {
    const cmd = command(llm.path, probeArgs);
    const child = spawn(cmd.file, [...cmd.args], { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'ignore'], windowsVerbatimArguments: cmd.verbatim, windowsHide: true });
    let buffer = '';
    let settled = false;
    const finish = (probe: ConnectorProbe | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      resolve(probe);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let end = buffer.indexOf('\n');
      while (end !== -1) {
        const probe = provider.parseProbeLine(buffer.slice(0, end));
        if (probe) { finish(probe); return; }
        buffer = buffer.slice(end + 1);
        end = buffer.indexOf('\n');
      }
    });
    child.on('error', () => finish(null));
    child.on('close', () => finish(null));
    child.stdin?.on('error', () => { /* it exited early */ });
    child.stdin?.end('Reply with: ok');
  });
};

/** The connectors the assistant may read with, for sync; none when it lists none. */
export const listLlmServers = async (llm: LocatedLlm, timeoutMs: number): Promise<readonly string[]> => {
  const provider = llmProvider(llm.provider);
  if (provider.listServersArgs === null) return [];
  const { stdout } = await runClaude(llm.path, provider.listServersArgs, { cwd: tmpdir(), timeoutMs });
  return provider.parseServers(stdout);
};

/** The last stderr line, for a reply that never came. */
export const lastStderrLine = (stderr: string): string => stderr.trim().split('\n').at(-1) ?? '';
