// Starting the UI from the MCP server (the `app_open` tool), so a machine without a
// clone or a terminal habit can still open it: runs `remry app` in the background.
// The app keeps running after the MCP server exits, so a release also replaces an app
// left running by an older version (see planAppLaunch).

import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import pluginManifest from '../plugin/.claude-plugin/plugin.json';
import { APP_CONTROL_PATH, APP_HOST, APP_PORT, APP_STOP_PATH, LEGACY_APP_CONTROL_PATHS, LEGACY_APP_STOP_PATHS, LEGACY_LOCAL_HEADERS } from './app-server';
import { LOCAL_HEADER } from '../src/shared/trpc/config';
import { isPortListening } from '../scripts/backup/port';

export interface LaunchCommand {
  readonly command: string;
  readonly args: readonly string[];
  /** Working directory, when the command needs one. */
  readonly cwd?: string;
}

/**
 * A release runs its own binary. A clone runs bin/remry, which starts the dev server;
 * Windows can't run that shell script, so there Bun (this process) runs `bun run dev`
 * in the clone, which is what the script does.
 */
export const appLaunchCommand = (o: {
  readonly standalone: boolean;
  readonly execPath: string;
  readonly repoDir: string;
  readonly platform?: NodeJS.Platform;
}): LaunchCommand => {
  if (o.standalone) return { command: o.execPath, args: ['app'] };
  if ((o.platform ?? process.platform) === 'win32') return { command: o.execPath, args: ['run', 'dev'], cwd: o.repoDir };
  return { command: join(o.repoDir, 'bin', 'remry'), args: ['app'] };
};

/** The app's address, opening the given notebook. */
export const appUrl = (notebookId: string | null): string =>
  `http://${APP_HOST}:${APP_PORT}/app${notebookId ? `?notebook=${encodeURIComponent(notebookId)}` : ''}`;

/**
 * What's on the app port: nothing, a release app reporting its version, or something
 * else (a clone's dev server, or a release from before apps reported a version).
 */
export type RunningApp = null | { readonly version: string } | 'other';

export type AppLaunchPlan = 'start' | 'reuse' | 'restart';

/**
 * A release restarts a release app of a different version, so updating the plugin
 * updates the app. It never touches anything it can't identify, and a clone never
 * restarts anything (its dev server reloads by itself).
 */
export const planAppLaunch = (running: RunningApp, own: { readonly standalone: boolean; readonly version: string }): AppLaunchPlan => {
  if (running === null) return 'start';
  if (!own.standalone || running === 'other') return 'reuse';
  return running.version === own.version ? 'reuse' : 'restart';
};

const base = `http://${APP_HOST}:${APP_PORT}`;
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

export const probeApp = async (): Promise<RunningApp> => {
  if (!(await isPortListening(APP_PORT))) return null;
  try {
    for (const path of [APP_CONTROL_PATH, ...LEGACY_APP_CONTROL_PATHS]) {
      const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(1_000) });
      const body: unknown = response.ok ? await response.json().catch(() => null) : null;
      const version = typeof body === 'object' && body !== null ? (body as { version?: unknown }).version : undefined;
      if (typeof version === 'string') return { version };
    }
    return 'other';
  } catch {
    return 'other';
  }
};

const waitForPort = async (listening: boolean, timeoutMs: number): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await isPortListening(APP_PORT)) === listening) return true;
    await sleep(250);
  }
  return false;
};

const stopApp = async (): Promise<void> => {
  // An app from before a rename has an old path and header.
  const headers = Object.fromEntries([LOCAL_HEADER, ...LEGACY_LOCAL_HEADERS].map((header) => [header, '1']));
  for (const path of [APP_STOP_PATH, ...LEGACY_APP_STOP_PATHS]) {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers, signal: AbortSignal.timeout(2_000) }).catch(() => null);
    if (response?.ok) break;
  }
  if (!(await waitForPort(false, 5_000))) {
    throw new Error(`An older Remry app is still running on ${APP_HOST}:${APP_PORT}. Quit it, then open the app again.`);
  }
};

const startApp = async (launch: LaunchCommand, timeoutMs: number): Promise<void> => {
  let failure: Error | null = null;
  // windowsHide: no console window flashes up on Windows.
  const child = spawn(launch.command, [...launch.args], { detached: true, stdio: 'ignore', windowsHide: true, cwd: launch.cwd });
  child.on('error', (error) => {
    failure = error;
  });
  child.unref();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(250);
    if (failure) throw new Error(`Couldn't start Remry: ${(failure as Error).message}`);
    if (await isPortListening(APP_PORT)) return;
  }
  throw new Error(`Remry didn't start within ${timeoutMs / 1000} seconds. Run \`remry app\` in a terminal to see why.`);
};

export interface AppOwner {
  readonly launch: LaunchCommand;
  readonly standalone: boolean;
  readonly version: string;
}

/** The app this process starts: a release's own binary, or a clone's dev server. */
export const currentAppOwner = (repoDir: string): AppOwner => {
  const standalone = process.env['REMRY_STANDALONE'] === '1';
  return { launch: appLaunchCommand({ standalone, execPath: process.execPath, repoDir }), standalone, version: pluginManifest.version };
};

/**
 * Whether a process's command line is Remry: a release binary (`…/remry app`)
 * or a clone's dev server (vite, run from the remry folder). A restart stops
 * nothing else that happens to hold the port.
 */
export const isRemryCommand = (command: string): boolean =>
  /(^|[\\/"])(remry|wono|wnotes)(\.exe)?(["\s]|$)/i.test(command) || /[\\/](remry|wonos|working-notes)[^\\/]*[\\/]/i.test(command);

const run = promisify(execFile);

/** Pure. The pids in a command's output, one per line. */
export const parsePids = (output: string): readonly number[] =>
  output
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);

const powershell = (script: string): Promise<string> =>
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }).then((r) => r.stdout, () => '');

/** Pids listening on a local TCP port: lsof on macOS and Linux, PowerShell on Windows. */
const listeningPids = async (port: number): Promise<readonly number[]> =>
  parsePids(process.platform === 'win32'
    ? await powershell(`Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`)
    : await run('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN']).then((r) => r.stdout, () => ''));

/** A process's full command line. */
const commandLine = async (pid: number): Promise<string> =>
  (process.platform === 'win32'
    ? await powershell(`(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`)
    : await run('ps', ['-o', 'command=', '-p', String(pid)]).then((r) => r.stdout, () => '')
  ).trim();

/** Stops whatever Remry process listens on the app port, by pid (for apps without the stop endpoint). */
const stopByPid = async (): Promise<void> => {
  const pids = await listeningPids(APP_PORT);
  for (const pid of pids) {
    const command = await commandLine(pid);
    if (!isRemryCommand(command)) {
      throw new Error(`Something other than Remry is using ${APP_HOST}:${APP_PORT} (${command || `pid ${pid}`}). Quit it, then restart the app.`);
    }
    process.kill(pid, 'SIGTERM');
  }
  if (!(await waitForPort(false, 5_000))) {
    throw new Error(`The Remry app on ${APP_HOST}:${APP_PORT} didn't stop. Quit it, then restart the app.`);
  }
};

/** Stops the running app, whatever version it is, and starts this one. Starts it if nothing was running. */
export const restartApp = async (owner: AppOwner, timeoutMs = 20_000): Promise<{ readonly stopped: boolean }> => {
  const running = await probeApp();
  if (running !== null) {
    if (running === 'other') await stopByPid();
    else await stopApp();
  }
  await startApp(owner.launch, timeoutMs);
  return { stopped: running !== null };
};

export interface OpenAppResult {
  readonly started: boolean;
  readonly restarted: boolean;
}

export const openApp = async (owner: AppOwner, timeoutMs = 20_000): Promise<OpenAppResult> => {
  const plan = planAppLaunch(await probeApp(), owner);
  if (plan === 'reuse') return { started: false, restarted: false };
  if (plan === 'restart') await stopApp();
  await startApp(owner.launch, timeoutMs);
  return { started: true, restarted: plan === 'restart' };
};

/**
 * When the MCP server starts: stops an app an older release left running, before this
 * process opens the data directory (which may still need moving from an earlier name,
 * Wonos or Working Notes). True if it stopped one; start this version's app then with startOwnApp.
 */
export const stopStaleApp = async (owner: AppOwner): Promise<boolean> => {
  if (planAppLaunch(await probeApp(), owner) !== 'restart') return false;
  await stopApp();
  return true;
};

export const startOwnApp = (owner: AppOwner): Promise<void> => startApp(owner.launch, 20_000);
