// Commands the desktop app (desktop/, Tauri) runs on the binary it bundles. They
// work from any release binary:
//   remry install                          put this binary in place as <data dir>/App/current:
//                                           on macOS a link to the folder it's in (inside
//                                           Remry.app), elsewhere a copy in App/<version>
//                                           (installModeFor); then delete older copies. With
//                                           REMRY_DESKTOP=1, also record the desktop app in
//                                           <data dir>/desktop.json
//   remry app ensure                       start the app, or reuse or replace a running one,
//                                           and print its address
//   remry connect claude-desktop|claude-code
//                                           register App/current/remry as the remry MCP server
//   remry updates on|off                   whether the desktop app checks for a new release when
//                                           it opens (`checkForUpdates` in settings.json); install
//                                           reports it as `checkForUpdates`
//   remry uninstall                        undo install and connect: stop the app, remove the
//                                           LaunchAgents, the MCP registrations and App/,
//                                           and leave the notebooks
// Each prints one JSON result, like a procedure: {"ok": true, "value": ...} or {"ok": false, "error": ...}.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, copyFile, mkdir, readFile, readdir, readlink, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import path, { dirname, join } from 'node:path';
import { DESKTOP_MARKER_FILE } from '../src/shared/desktop/handoff';
import { dataDirFor, type AppDirsHost } from '../src/shared/settings/server/app-dirs';
import { isVersion } from '../scripts/release/versions';
import {
  LEGACY_MCP_SERVER_NAMES,
  MCP_SERVER_NAME,
  claudeDesktopConfigPath,
  installModeFor,
  installedBinary,
  staleAppFolders,
  unlinkableReason,
  versionFolderOf,
  withMcpServer,
  withoutMcpServer
} from './desktop-plan';
import { findReleaseFile, realBinaryPath } from './release-resources';
import { readUpdateCheck, setUpdateCheck } from '../src/shared/desktop/update-check.server';

const host = (): AppDirsHost => ({ platform: platform(), home: homedir(), env: process.env });
const binaryName = process.platform === 'win32' ? 'remry.exe' : 'remry';

const readVersion = async (): Promise<string> => {
  if (process.env['REMRY_VERSION']) return process.env['REMRY_VERSION'];
  const file = findReleaseFile('VERSION');
  if (file === null) throw new Error(`No VERSION file beside ${realBinaryPath()}. Reinstall Remry.`);
  return (await readFile(file, 'utf8')).trim();
};

/** Where App/current points now, or null when it's missing. */
const currentTarget = async (current: string): Promise<string | null> => readlink(current).catch(() => null);

/**
 * Points App/current at a folder: a symlink, or a junction on Windows (no admin rights needed).
 * Made beside it and renamed over it, so a client starting meanwhile never finds it missing.
 */
const pointCurrent = async (appDir: string, target: string): Promise<void> => {
  const current = join(appDir, 'current');
  if ((await currentTarget(current)) === target) return;
  const next = join(appDir, `.current-${process.pid}`);
  await rm(next, { force: true }).catch(() => undefined);
  if (process.platform === 'win32') {
    // A junction can't be renamed over another, so replace it in place.
    await rm(current, { force: true, recursive: false }).catch(() => undefined);
    await symlink(target, current, 'junction');
    return;
  }
  await symlink(target, next);
  await rename(next, current);
};

/** Copies this binary, its migrations and VERSION into App/<version>, unless it's there already. */
const copyRelease = async (appDir: string, version: string, migrations: string): Promise<boolean> => {
  const dest = join(appDir, version);
  if (existsSync(join(dest, binaryName))) return false;
  const staging = join(appDir, `.install-${version}-${process.pid}`);
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  await copyFile(process.execPath, join(staging, binaryName));
  await cp(migrations, join(staging, 'migrations'), { recursive: true });
  await writeFile(join(staging, 'VERSION'), `${version}\n`);
  // Another start may have installed this version meanwhile.
  if (existsSync(join(dest, binaryName))) {
    await rm(staging, { recursive: true, force: true });
    return false;
  }
  await rename(staging, dest);
  return true;
};

/** Deletes App/<version> copies nothing should run any more. One still running stays, and goes on a later install. */
const pruneCopies = async (appDir: string, keep: readonly (string | null)[]): Promise<readonly string[]> => {
  const entries = await readdir(appDir).catch(() => [] as string[]);
  const removed: string[] = [];
  for (const name of staleAppFolders(entries, keep, isVersion)) {
    const done = await rm(join(appDir, name), { recursive: true, force: true }).then(() => true, () => false);
    if (done) removed.push(name);
  }
  return removed;
};

interface InstallResult {
  readonly version: string;
  readonly binary: string;
  readonly installed: boolean;
  readonly removed: readonly string[];
  /** Whether the desktop app checks for updates when it opens. */
  readonly checkForUpdates: boolean;
}

const install = async (): Promise<InstallResult> => {
  const version = await readVersion();
  const migrations = process.env['REMRY_MIGRATIONS_DIR'] ?? findReleaseFile('migrations');
  if (!migrations || !existsSync(migrations)) throw new Error(`No migrations beside ${realBinaryPath()}. Reinstall Remry.`);
  const appDir = join(dataDirFor(host()), 'App');
  await mkdir(appDir, { recursive: true });
  const before = versionFolderOf(await currentTarget(join(appDir, 'current')), appDir, process.platform === 'win32' ? path.win32 : path.posix);

  let installed = false;
  let keep: readonly (string | null)[];
  if (installModeFor(process.platform) === 'link') {
    // Run what the user installed, where they installed it: no copy, so nothing strips its quarantine flag or outlives the app.
    const binary = realBinaryPath();
    const refused = unlinkableReason(binary);
    if (refused) throw new Error(refused);
    // App/current/remry is what every client runs, so the binary must have that name (as in Remry.app).
    if (path.basename(binary) !== binaryName) throw new Error(`${binary} must be named ${binaryName} to install, as it is in Remry.app.`);
    const target = dirname(binary);
    installed = (await currentTarget(join(appDir, 'current'))) !== target;
    await pointCurrent(appDir, target);
    keep = [before];
  } else {
    installed = await copyRelease(appDir, version, migrations);
    await pointCurrent(appDir, join(appDir, version));
    keep = [version, before];
  }
  const removed = await pruneCopies(appDir, keep);

  // Run by the desktop app (it sets REMRY_DESKTOP): the server then hands the links Claude
  // gives (/open/app/...) to its window, as remry:// links (src/shared/desktop/handoff.ts).
  if (process.env['REMRY_DESKTOP'] === '1') {
    await writeFile(join(dataDirFor(host()), DESKTOP_MARKER_FILE), `${JSON.stringify({ scheme: 'remry', version })}\n`);
  }
  return { version, binary: installedBinary(host()), installed, removed, checkForUpdates: await readUpdateCheck() };
};

const ensureApp = async (): Promise<{ readonly url: string; readonly started: boolean; readonly restarted: boolean }> => {
  const { appUrl, currentAppOwner, openApp } = await import('./app-launch');
  const owner = currentAppOwner(process.cwd());
  const opened = await openApp(owner);
  return { url: appUrl(null, owner.port), ...opened };
};

const connectClaudeDesktop = async (binary: string): Promise<{ readonly change: string; readonly configPath: string }> => {
  const configPath = claudeDesktopConfigPath(host());
  const existing = existsSync(configPath) ? await readFile(configPath, 'utf8') : null;
  const next = withMcpServer(existing, MCP_SERVER_NAME, { command: binary, args: ['mcp'] }, LEGACY_MCP_SERVER_NAMES);
  if (!next.ok) throw next.error;
  if (next.value.change !== 'unchanged') {
    await mkdir(dirname(configPath), { recursive: true });
    // Keep the old file beside it once, in case the user wants it back.
    if (existing !== null && !existsSync(`${configPath}.bak`)) await writeFile(`${configPath}.bak`, existing);
    await writeFile(configPath, next.value.text);
  }
  return { change: next.value.change, configPath };
};

const connectClaudeCode = (binary: string): { readonly change: string } => {
  // `claude` may be claude.cmd on Windows, which only runs through a shell.
  const claude = (args: readonly string[]) =>
    spawnSync('claude', [...args], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  const existing = claude(['mcp', 'get', MCP_SERVER_NAME]);
  if (existing.error) throw new Error("Claude Code's `claude` command isn't on PATH. Install Claude Code, or add the server yourself.");
  // The pre-rename servers, if they run our old binary.
  for (const name of LEGACY_MCP_SERVER_NAMES) {
    const legacy = claude(['mcp', 'get', name]);
    if (legacy.status === 0 && /[\\/](wono|wnotes)(\.exe)?\b/i.test(legacy.stdout)) claude(['mcp', 'remove', '--scope', 'user', name]);
  }
  if (existing.status === 0) {
    if (existing.stdout.includes(binary)) return { change: 'unchanged' };
    claude(['mcp', 'remove', '--scope', 'user', MCP_SERVER_NAME]);
  }
  const added = claude(['mcp', 'add', '--scope', 'user', MCP_SERVER_NAME, '--', binary, 'mcp']);
  if (added.status !== 0) throw new Error(`claude mcp add failed: ${(added.stderr || added.stdout).trim()}`);
  return { change: existing.status === 0 ? 'updated' : 'added' };
};

const connect = async (target: string | undefined): Promise<unknown> => {
  const binary = installedBinary(host());
  if (!existsSync(binary)) throw new Error(`Remry isn't installed at ${binary}. Run \`remry install\` first.`);
  if (target === 'claude-desktop') return connectClaudeDesktop(binary);
  if (target === 'claude-code') return connectClaudeCode(binary);
  throw new Error('Say what to connect: `remry connect claude-desktop` or `remry connect claude-code`.');
};

type Removal = 'removed' | 'none' | 'skipped';

/** Removes our server from Claude desktop's config, only where it runs this install's binary. */
const disconnectClaudeDesktop = async (binary: string): Promise<Removal> => {
  const configPath = claudeDesktopConfigPath(host());
  const existing = existsSync(configPath) ? await readFile(configPath, 'utf8') : null;
  const next = withoutMcpServer(existing, MCP_SERVER_NAME, binary);
  if (!next.ok) throw next.error;
  if (next.value === null) return 'none';
  if (existing !== null && !existsSync(`${configPath}.bak`)) await writeFile(`${configPath}.bak`, existing);
  await writeFile(configPath, next.value);
  return 'removed';
};

/** Removes our server from Claude Code's user config, only where it runs this install's binary. */
const disconnectClaudeCode = (binary: string): Removal => {
  const claude = (args: readonly string[]) =>
    spawnSync('claude', [...args], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  const existing = claude(['mcp', 'get', MCP_SERVER_NAME]);
  if (existing.error) return 'skipped';
  if (existing.status !== 0 || !existing.stdout.includes(binary)) return 'none';
  return claude(['mcp', 'remove', '--scope', 'user', MCP_SERVER_NAME]).status === 0 ? 'removed' : 'skipped';
};

/**
 * Undoes `install` and `connect`, for removing Remry: stops the app, removes the LaunchAgents,
 * the MCP registrations that run this install's binary and App/. The notebooks, backups and
 * settings stay: the user deletes the data folder when they mean to.
 */
const uninstall = async (): Promise<unknown> => {
  const binary = installedBinary(host());
  const { APP_PORT } = await import('./app-ports');
  const { probeApp, stopApp } = await import('./app-launch');
  const running = await probeApp(APP_PORT);
  // Only a release app that reports its version; anything else on the port isn't ours to stop.
  const stoppedApp = running !== null && typeof running === 'object' ? await stopApp(APP_PORT).then(() => true, () => false) : false;

  const launchAgents: string[] = [];
  if (process.platform === 'darwin') {
    const { LABEL, LEGACY_LABELS, plistPath, uninstallAgent } = await import('../scripts/backup/launchd');
    const { LOGIN_AGENT_LABEL } = await import('../src/shared/startup/login-agent');
    for (const label of [LOGIN_AGENT_LABEL, LABEL, ...LEGACY_LABELS]) {
      if (!existsSync(plistPath(label))) continue;
      const result = await uninstallAgent(label);
      if (result.ok && result.value.removed) launchAgents.push(label);
    }
  }

  const claudeDesktop = await disconnectClaudeDesktop(binary);
  const claudeCode = disconnectClaudeCode(binary);

  const dataDir = dataDirFor(host());
  await rm(join(dataDir, DESKTOP_MARKER_FILE), { force: true });
  // On Windows this process may be running from App/, which then stays until it exits.
  const removedApp = await rm(join(dataDir, 'App'), { recursive: true, force: true }).then(() => true, () => false);
  return { stoppedApp, launchAgents, claudeDesktop, claudeCode, removedApp, kept: dataDir };
};

/** Turns the desktop app's check for updates at launch on or off. */
const updates = async (choice: string | undefined): Promise<{ readonly checkForUpdates: boolean }> => {
  if (choice === 'on' || choice === 'off') return { checkForUpdates: await setUpdateCheck(choice === 'on') };
  if (choice === undefined || choice === 'status') return { checkForUpdates: await readUpdateCheck() };
  throw new Error('Say `remry updates on`, `remry updates off` or `remry updates status`.');
};

/** Runs one desktop command and prints its JSON result. Returns the exit code. */
export const runDesktopCommand = async (command: string, args: readonly string[]): Promise<number> => {
  try {
    const value =
      command === 'install' ? await install()
      : command === 'uninstall' ? await uninstall()
      : command === 'updates' ? await updates(args[0])
      : command === 'ensure' ? await ensureApp()
      : await connect(args[0]);
    process.stdout.write(`${JSON.stringify({ ok: true, value })}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: { message: error instanceof Error ? error.message : String(error) } })}\n`);
    return 1;
  }
};
