// A Claude session's MCP server keeps running the version it started with. When Remry updates
// meanwhile (the desktop app installs a new App/current, or a clone pulls), the new version
// migrates the notebooks the first time it opens them, and the old server's queries then name
// columns that are gone (0.16.42 dropped page.kind). So before each procedure call the server
// checks what's installed now, and when that's newer than itself, it runs the call through the
// newer `remry` instead, as a CLI call: same procedure, same input, same JSON result.

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, platform, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { installedBinary } from './desktop-plan';
import { compareVersions, isVersion } from '../scripts/release/versions';
import type { CallOutcome } from './api';
import type { LaunchCommand } from './app-launch';

export interface Installed {
  /** The version installed now: App/current/VERSION for a release, the clone's plugin.json for a clone. */
  readonly version: string;
  /** What runs a procedure with that version. */
  readonly command: LaunchCommand;
}

/** Pure. Whether to hand calls to what's installed: only when it's a newer version than this process. */
export const shouldHandOff = (running: string, installed: string | null): boolean =>
  isVersion(running) && isVersion(installed) && compareVersions(installed, running) > 0;

/**
 * Pure. The command for one procedure call: a release runs the installed binary; a clone runs
 * its cli/main.ts with Bun (this process), which reads the clone's files as they are now.
 */
export const handOffCommand = (o: {
  readonly standalone: boolean;
  readonly binary: string;
  readonly execPath: string;
  readonly repoDir: string;
}): LaunchCommand =>
  o.standalone ? { command: o.binary, args: [] } : { command: o.execPath, args: [join(o.repoDir, 'cli', 'main.ts')] };

/**
 * Pure. A CLI call's outcome from its exit code and output: stdout is the procedure's JSON
 * result (also on exit 1, when the result is `ok: false`); anything else is an error on stderr.
 */
export const outcomeFromCli = (code: number, stdout: string, stderr: string): CallOutcome => {
  try {
    return { kind: 'result', result: JSON.parse(stdout) as unknown, failed: code !== 0 };
  } catch {
    throw new Error(stderr.trim().replace(/^Error: /, '') || `remry exited with code ${code}`);
  }
};

const readVersion = async (path: string, json: boolean): Promise<string | null> => {
  const text = await readFile(path, 'utf8').catch(() => null);
  if (text === null) return null;
  if (!json) return text.trim();
  try {
    const version = (JSON.parse(text) as { version?: unknown }).version;
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
};

/** What's installed now, read on each call (two small files), or null when nothing is. */
export const installedNow = async (o: { readonly standalone: boolean; readonly repoDir: string }): Promise<Installed | null> => {
  const binary = installedBinary({ platform: platform(), home: homedir(), env: process.env });
  const version = o.standalone
    ? await readVersion(join(dirname(binary), 'VERSION'), false)
    : await readVersion(join(o.repoDir, 'plugin', '.claude-plugin', 'plugin.json'), true);
  if (version === null) return null;
  return { version, command: handOffCommand({ standalone: o.standalone, binary, execPath: process.execPath, repoDir: o.repoDir }) };
};

/**
 * Pure. The environment for the installed `remry`: this one, without what a release binary sets
 * for itself. Kept, REMRY_MIGRATIONS_DIR would point the newer binary at this version's migrations.
 */
export const handOffEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const { REMRY_STANDALONE: _standalone, REMRY_MIGRATIONS_DIR: _migrations, REMRY_VERSION: _version, ...rest } = env;
  return rest;
};

/**
 * Runs one procedure with the installed `remry`. The input goes in a private temporary file
 * (--input-file), since a long doc would pass Windows' command-line limit.
 */
export const callInstalled = async (
  installed: Installed,
  procedure: string,
  input: unknown,
  notebook: string | undefined
): Promise<CallOutcome> => {
  const dir = await mkdtemp(join(tmpdir(), 'remry-call-'));
  try {
    const inputFile = join(dir, 'input.json');
    await writeFile(inputFile, JSON.stringify(input ?? {}), { mode: 0o600 });
    const args = [...installed.command.args, procedure, '--input-file', inputFile, ...(notebook ? ['--notebook', notebook] : [])];
    const { code, stdout, stderr } = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      execFile(installed.command.command, args, { env: handOffEnv(process.env), maxBuffer: 256 * 1024 * 1024, windowsHide: true }, (error, out, errOut) => {
        const exit = error && typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : error ? 1 : 0;
        resolve({ code: exit, stdout: String(out), stderr: String(errOut || (error && !out ? error.message : '')) });
      });
    });
    return outcomeFromCli(code, stdout, stderr);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
