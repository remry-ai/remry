// Starting the UI from the MCP server (the `app_open` tool), so a machine without a
// clone or a terminal habit can still open it: runs `remry app` in the background.
// The app keeps running after the MCP server exits, so a release also replaces an app
// left running by an older version (see planAppLaunch).

import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import pluginManifest from '../plugin/.claude-plugin/plugin.json';
import { APP_CONTROL_PATH, APP_HOST, APP_PORT, APP_STOP_PATH, DEV_PORT, LEGACY_APP_CONTROL_PATHS, LEGACY_APP_PORTS, LEGACY_APP_STOP_PATHS, LEGACY_LOCAL_HEADERS } from './app-ports';
import { LOCAL_HEADER } from '../src/shared/trpc/config';
import { isPortListening } from '../scripts/backup/port';
import { appMarkerPath, writeMarker } from './version-check';

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

/** The app's address on a port (a release's APP_PORT, or a clone's DEV_PORT), opening the given notebook. */
export const appUrl = (notebookId: string | null, port = APP_PORT): string =>
  `http://${APP_HOST}:${port}/app${notebookId ? `?notebook=${encodeURIComponent(notebookId)}` : ''}`;

/**
 * The address to give the user: `/open/app`, which a release server hands to the desktop
 * app's window when it's installed, and otherwise shows in the browser.
 */
export const appLinkUrl = (notebookId: string | null, port = APP_PORT): string =>
  appUrl(notebookId, port).replace('/app', '/open/app');

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

const base = (port: number): string => `http://${APP_HOST}:${port}`;
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

export const probeApp = async (port = APP_PORT): Promise<RunningApp> => {
  if (!(await isPortListening(port))) return null;
  try {
    for (const path of [APP_CONTROL_PATH, ...LEGACY_APP_CONTROL_PATHS]) {
      const response = await fetch(`${base(port)}${path}`, { signal: AbortSignal.timeout(1_000) });
      const body: unknown = response.ok ? await response.json().catch(() => null) : null;
      const version = typeof body === 'object' && body !== null ? (body as { version?: unknown }).version : undefined;
      if (typeof version === 'string') return { version };
    }
    return 'other';
  } catch {
    return 'other';
  }
};

const waitForPort = async (port: number, listening: boolean, timeoutMs: number): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await isPortListening(port)) === listening) return true;
    await sleep(250);
  }
  return false;
};

const stopApp = async (port = APP_PORT): Promise<void> => {
  // An app from before a rename has an old path and header.
  const headers = Object.fromEntries([LOCAL_HEADER, ...LEGACY_LOCAL_HEADERS].map((header) => [header, '1']));
  for (const path of [APP_STOP_PATH, ...LEGACY_APP_STOP_PATHS]) {
    const response = await fetch(`${base(port)}${path}`, { method: 'POST', headers, signal: AbortSignal.timeout(2_000) }).catch(() => null);
    if (response?.ok) break;
  }
  if (!(await waitForPort(port, false, 5_000))) {
    throw new Error(`An older Remry app is still running on ${APP_HOST}:${port}. Quit it, then open the app again.`);
  }
};

const startApp = async (launch: LaunchCommand, port: number, timeoutMs: number): Promise<void> => {
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
    if (await isPortListening(port)) {
      // Which version this app runs, so a later MCP server can tell it's stale (cli/version-check.ts).
      await writeMarker(appMarkerPath(), { version: pluginManifest.version }).catch(() => undefined);
      return;
    }
  }
  throw new Error(`Remry didn't start within ${timeoutMs / 1000} seconds. Run \`remry app\` in a terminal to see why.`);
};

export interface AppOwner {
  readonly launch: LaunchCommand;
  readonly standalone: boolean;
  readonly version: string;
  /** Where its app listens: APP_PORT for a release, DEV_PORT for a clone's dev server. */
  readonly port: number;
}

/** The app this process starts: a release's own binary, or a clone's dev server. */
export const currentAppOwner = (repoDir: string): AppOwner => {
  const standalone = process.env['REMRY_STANDALONE'] === '1';
  return {
    launch: appLaunchCommand({ standalone, execPath: process.execPath, repoDir }),
    standalone,
    version: pluginManifest.version,
    port: standalone ? APP_PORT : DEV_PORT
  };
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

/** Stops whatever Remry process listens on a port, by pid (for apps without the stop endpoint). */
const stopByPid = async (port: number): Promise<void> => {
  const pids = await listeningPids(port);
  for (const pid of pids) {
    const command = await commandLine(pid);
    if (!isRemryCommand(command)) {
      throw new Error(`Something other than Remry is using ${APP_HOST}:${port} (${command || `pid ${pid}`}). Quit it, then restart the app.`);
    }
    process.kill(pid, 'SIGTERM');
  }
  if (!(await waitForPort(port, false, 5_000))) {
    throw new Error(`The Remry app on ${APP_HOST}:${port} didn't stop. Quit it, then restart the app.`);
  }
};

/**
 * From a release: stops a release app left on a port apps used before 0.14.9, so it
 * doesn't run old code beside this one. Only an app that reports its version goes: that
 * port is also a clone's dev server, and anything else there is someone else's.
 */
const stopLegacyApps = async (owner: AppOwner): Promise<void> => {
  if (!owner.standalone) return;
  for (const port of LEGACY_APP_PORTS) {
    const running = await probeApp(port);
    if (running !== null && running !== 'other') await stopApp(port);
  }
};

/** Stops the running app on this owner's port, whatever version it is, and starts this one. Starts it if nothing was running. */
export const restartApp = async (owner: AppOwner, timeoutMs = 20_000): Promise<{ readonly stopped: boolean }> => {
  await stopLegacyApps(owner);
  const running = await probeApp(owner.port);
  if (running !== null) {
    if (running === 'other') await stopByPid(owner.port);
    else await stopApp(owner.port);
  }
  await startApp(owner.launch, owner.port, timeoutMs);
  return { stopped: running !== null };
};

export interface OpenAppResult {
  readonly started: boolean;
  readonly restarted: boolean;
}

export const openApp = async (owner: AppOwner, timeoutMs = 20_000): Promise<OpenAppResult> => {
  await stopLegacyApps(owner);
  const plan = planAppLaunch(await probeApp(owner.port), owner);
  if (plan === 'reuse') return { started: false, restarted: false };
  if (plan === 'restart') await stopApp(owner.port);
  await startApp(owner.launch, owner.port, timeoutMs);
  return { started: true, restarted: plan === 'restart' };
};

/**
 * When the MCP server starts: stops an app an older release left running, before this
 * process opens the data directory (which may still need moving from an earlier name,
 * Wonos or Working Notes). True if it stopped one; start this version's app then with startOwnApp.
 */
export const stopStaleApp = async (owner: AppOwner): Promise<boolean> => {
  await stopLegacyApps(owner);
  if (planAppLaunch(await probeApp(owner.port), owner) !== 'restart') return false;
  await stopApp(owner.port);
  return true;
};

export const startOwnApp = (owner: AppOwner): Promise<void> => startApp(owner.launch, owner.port, 20_000);
