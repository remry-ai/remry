// Finding and running the local Claude Code CLI. Shared by the PDF converter
// and the page chat; both keep their jobs in memory, one local process.

import { spawn } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import { findClaude } from './claude-cli';

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

export const locateClaude = (): string | null =>
  findClaude({ PATH: process.env.PATH, HOME: process.env.HOME }, isExecutable);

export const runClaude = (claudePath: string, args: readonly string[], options: ClaudeRunOptions): Promise<ClaudeRun> =>
  new Promise((resolve, reject) => {
    const child = spawn(claudePath, [...args], {
      cwd: options.cwd,
      stdio: [options.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe']
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

/** The last stderr line, for a reply that never came. */
export const lastStderrLine = (stderr: string): string => stderr.trim().split('\n').at(-1) ?? '';
