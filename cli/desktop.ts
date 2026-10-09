// Commands the desktop app (desktop/, Tauri) runs on the binary it bundles. They
// work from any release binary:
//   remry install                          copy this binary, its migrations and VERSION into
//                                           <data dir>/App/<version> and point App/current at it,
//                                           as the plugin shim does
//   remry app ensure                       start the app, or reuse or replace a running one,
//                                           and print its address
//   remry connect claude-desktop|claude-code
//                                           register App/current/remry as the remry MCP server
// Each prints one JSON result, like a procedure: {"ok": true, "value": ...} or {"ok": false, "error": ...}.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, cp, copyFile, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { dataDirFor, type AppDirsHost } from '../src/shared/settings/server/app-dirs';
import { LEGACY_MCP_SERVER_NAMES, MCP_SERVER_NAME, claudeDesktopConfigPath, installedBinary, withMcpServer } from './desktop-plan';

const host = (): AppDirsHost => ({ platform: platform(), home: homedir(), env: process.env });
const binaryName = process.platform === 'win32' ? 'remry.exe' : 'remry';

const readVersion = async (): Promise<string> =>
  process.env['REMRY_VERSION'] ?? (await readFile(join(dirname(process.execPath), 'VERSION'), 'utf8')).trim();

/** Points App/current at a version folder: a relative symlink, or a junction on Windows (no admin rights needed). */
const pointCurrent = async (appDir: string, version: string): Promise<void> => {
  const current = join(appDir, 'current');
  await rm(current, { force: true, recursive: false }).catch(() => undefined);
  if (process.platform === 'win32') await symlink(join(appDir, version), current, 'junction');
  else await symlink(version, current);
};

const install = async (): Promise<{ readonly version: string; readonly binary: string; readonly installed: boolean }> => {
  const version = await readVersion();
  const migrations = process.env['REMRY_MIGRATIONS_DIR'] ?? join(dirname(process.execPath), 'migrations');
  if (!existsSync(migrations)) throw new Error(`No migrations at ${migrations}`);
  const appDir = join(dataDirFor(host()), 'App');
  const dest = join(appDir, version);
  let installed = false;
  if (!existsSync(join(dest, binaryName))) {
    const staging = join(appDir, `.install-${version}-${process.pid}`);
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    // On macOS, write the bytes rather than copy the file: a copy keeps the quarantine
    // flag of a downloaded app, which would stop the copy from running (the plugin
    // shim uses cat for the same reason).
    if (process.platform === 'darwin') {
      await writeFile(join(staging, binaryName), await readFile(process.execPath));
      await chmod(join(staging, binaryName), 0o755);
    } else {
      await copyFile(process.execPath, join(staging, binaryName));
    }
    await cp(migrations, join(staging, 'migrations'), { recursive: true });
    await writeFile(join(staging, 'VERSION'), `${version}\n`);
    // Another start may have installed this version meanwhile.
    if (existsSync(join(dest, binaryName))) await rm(staging, { recursive: true, force: true });
    else {
      await rename(staging, dest);
      installed = true;
    }
  }
  await pointCurrent(appDir, version);
  return { version, binary: installedBinary(host()), installed };
};

const ensureApp = async (): Promise<{ readonly url: string; readonly started: boolean; readonly restarted: boolean }> => {
  const { appUrl, currentAppOwner, openApp } = await import('./app-launch');
  const opened = await openApp(currentAppOwner(process.cwd()));
  return { url: appUrl(null), ...opened };
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

/** Runs one desktop command and prints its JSON result. Returns the exit code. */
export const runDesktopCommand = async (command: string, args: readonly string[]): Promise<number> => {
  try {
    const value = command === 'install' ? await install() : command === 'ensure' ? await ensureApp() : await connect(args[0]);
    process.stdout.write(`${JSON.stringify({ ok: true, value })}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: { message: error instanceof Error ? error.message : String(error) } })}\n`);
    return 1;
  }
};
