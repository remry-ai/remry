#!/usr/bin/env bun
// Smoke-tests a release build the way the desktop app and a computer without a clone use it:
//   - `remry install` puts the binary in place in a fresh data directory (the desktop app's first
//     step): on macOS App/current links to it where it is, elsewhere it's copied into App/<version>
//   - the plugin shim runs that installed copy, with no Bun and no clone
//   - `remry mcp` answers over stdio with the notebook argument on its tools
//   - `remry app` serves a page, the API, and the guard
// Uses APP_ENV=test, so data goes to ./data/test inside a temporary directory.
//   bun run release:smoke [dist/app]

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { dataDirFor } from '../../src/shared/settings/server/app-dirs';

const windows = process.platform === 'win32';
const built = resolve(process.argv[2] ?? 'dist/app');
const exe = join(built, `remry-${windows ? 'windows' : process.platform}-${process.arch}${windows ? '.exe' : ''}`);
if (!existsSync(exe)) throw new Error(`No ${exe}. Run \`bun run release:build\` first.`);
const plugin = resolve('plugin');

const cwd = mkdtempSync(join(tmpdir(), 'remry-smoke-'));
const home = mkdtempSync(join(tmpdir(), 'remry-home-'));
// No Bun on PATH, so nothing can fall back to a clone. Windows keeps its PATH for system tools.
const env = windows
  ? { ...process.env, APP_ENV: 'test', USERPROFILE: home, LOCALAPPDATA: join(home, 'AppData', 'Local') }
  : { ...process.env, APP_ENV: 'test', HOME: home, PATH: '/usr/bin:/bin' };
// Every child is ours to stop, and nothing may hang the release: a stuck child once held a
// Windows build for half an hour. Children's output comes through pipes rather than the job's
// own handles, which a stray process could otherwise keep open after this script exits.
const children: ChildProcess[] = [];
const forward = (child: ChildProcess): ChildProcess => {
  children.push(child);
  child.stdout?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
  child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
  return child;
};
const finish = (code: number): never => {
  for (const child of children) child.kill();
  process.exit(code);
};
const WATCHDOG_MS = 3 * 60_000;
setTimeout(() => {
  console.log(`✗ smoke test still running after ${WATCHDOG_MS / 60_000} minutes; stopping it`);
  finish(1);
}, WATCHDOG_MS);
/** spawnSync blocks the watchdog, so each call gets its own limit. */
const SYNC_TIMEOUT_MS = 60_000;

const check = (label: string, passed: boolean, detail = ''): void => {
  console.log(`${passed ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!passed) process.exitCode = 1;
};
// A procedure prints indented JSON; a desktop command prints one line.
const json = (text: string): { ok?: boolean; value?: unknown } | null => {
  try {
    return JSON.parse(text) as { ok?: boolean; value?: unknown };
  } catch {
    return null;
  }
};

// 1. `remry install`, as the desktop app runs it. On macOS, from the layout Remry.app has
// (Contents/MacOS/remry, with VERSION and migrations in Contents/Resources), since it links to it.
const version = (await Bun.file(join(built, 'VERSION')).text()).trim();
const installFrom = (() => {
  if (process.platform !== 'darwin') return exe;
  const contents = mkdtempSync(join(tmpdir(), 'remry-contents-'));
  mkdirSync(join(contents, 'MacOS'));
  mkdirSync(join(contents, 'Resources'));
  cpSync(exe, join(contents, 'MacOS', 'remry'));
  cpSync(join(built, 'VERSION'), join(contents, 'Resources', 'VERSION'));
  cpSync(join(built, 'migrations'), join(contents, 'Resources', 'migrations'), { recursive: true });
  return join(contents, 'MacOS', 'remry');
})();
const install = spawnSync(installFrom, ['install'], { cwd, env, encoding: 'utf8', timeout: SYNC_TIMEOUT_MS });
const installed = dataDirFor({ platform: process.platform, home, env });
const exeName = windows ? 'remry.exe' : 'remry';
check('remry install', install.status === 0 && json(install.stdout)?.ok === true, install.stderr.trim().split('\n').at(-1));
if (process.platform === 'darwin') {
  // Linked, not copied: App/current is the folder the binary is in.
  const linked = (() => {
    try {
      return realpathSync(join(installed, 'App', 'current', exeName)) === realpathSync(installFrom);
    } catch {
      return false;
    }
  })();
  check('App/current links to the binary where it is, with no copy', linked && !existsSync(join(installed, 'App', version)));
} else {
  check('installed the binary and App/current', existsSync(join(installed, 'App', version, exeName)) && existsSync(join(installed, 'App', 'current', exeName)));
}

// The automatic update check's setting, which install reports to the desktop app.
const off = spawnSync(exe, ['updates', 'off'], { cwd, env, encoding: 'utf8', timeout: SYNC_TIMEOUT_MS });
const reinstall = spawnSync(installFrom, ['install'], { cwd, env, encoding: 'utf8', timeout: SYNC_TIMEOUT_MS });
const updateSetting = (json(reinstall.stdout)?.value ?? {}) as { checkForUpdates?: unknown };
check('remry updates off, and install reports it', json(off.stdout)?.ok === true && updateSetting.checkForUpdates === false, off.stderr.trim().split('\n').at(-1));
spawnSync(exe, ['updates', 'on'], { cwd, env, encoding: 'utf8', timeout: SYNC_TIMEOUT_MS });

// 2. The plugin shim runs the installed binary.
const listed = windows
  ? spawnSync('cmd.exe', ['/d', '/c', join(plugin, 'scripts', 'remry.cmd'), 'notebook.list'], { cwd, env, encoding: 'utf8', timeout: SYNC_TIMEOUT_MS })
  : spawnSync('sh', [join(plugin, 'scripts', 'remry'), 'notebook.list'], { cwd, env, encoding: 'utf8', timeout: SYNC_TIMEOUT_MS });
const notebooks = json(listed.stdout) as { ok?: boolean; value?: Array<{ id: string }> } | null;
check('plugin shim runs the installed binary', listed.status === 0 && notebooks?.ok === true && notebooks.value?.[0]?.id === 'notebook', listed.stderr.trim().split('\n').at(-1));

// 2. The MCP server.
const mcp = spawn(exe, ['mcp'], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
children.push(mcp);
mcp.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk));
const replies = new Map<number, (message: Record<string, unknown>) => void>();
createInterface({ input: mcp.stdout }).on('line', (line) => {
  const message = JSON.parse(line) as Record<string, unknown>;
  replies.get(message['id'] as number)?.(message);
});
const request = (id: number, method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> =>
  new Promise((done) => {
    replies.set(id, done);
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
await request(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
const tools = ((await request(2, 'tools/list')).result as { tools: Array<{ name: string; inputSchema: { properties?: Record<string, unknown> } }> }).tools;
check('MCP lists tools with the notebook argument', tools.some((t) => t.name === 'person_list' && t.inputSchema.properties?.['notebook']) && tools.some((t) => t.name === 'app_open'), `${tools.length} tools`);
mcp.stdin.end();
mcp.kill();

// 3. The UI.
const port = 51000 + Math.floor(Math.random() * 1000);
forward(spawn(exe, ['app'], { cwd, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] }));
const base = `http://127.0.0.1:${port}`;
let page: Response | null = null;
for (let i = 0; i < 60 && !page; i++) {
  await Bun.sleep(250);
  page = await fetch(`${base}/app`).catch(() => null);
}
const html = page ? await page.text() : '';
check('app serves /app', page?.status === 200 && html.includes('nav-brand'), `status ${page?.status ?? 'none'}`);
const asset = html.match(/\/_app\/immutable\/[^"]+\.js/)?.[0];
check('app serves static assets', !!asset && (await fetch(`${base}${asset}`)).status === 200);
check('API answers with the local header', (await fetch(`${base}/api/trpc/notebook.list`, { headers: { 'x-remry': '1' } })).status === 200);
check('API refuses without it', (await fetch(`${base}/api/trpc/notebook.list`)).status === 403);
const expectedVersion = version;
const reported = await fetch(`${base}/__remry/app`).then((r) => r.json() as Promise<{ version?: string }>).catch(() => null);
check('app reports its version', reported?.version === expectedVersion, `${reported?.version ?? 'none'} (expected ${expectedVersion})`);
check('app refuses to stop without the local header', (await fetch(`${base}/__remry/app/stop`, { method: 'POST' })).status === 403);
const stopped = await fetch(`${base}/__remry/app/stop`, { method: 'POST', headers: { 'x-remry': '1' } });
await Bun.sleep(500);
check('app stops for a newer version', stopped.status === 202 && (await fetch(`${base}/app`).catch(() => null)) === null);

// 4. `remry uninstall` removes App/ and keeps the notebooks.
const removed = spawnSync(exe, ['uninstall'], { cwd, env, encoding: 'utf8', timeout: SYNC_TIMEOUT_MS });
check('remry uninstall', removed.status === 0 && json(removed.stdout)?.ok === true, removed.stderr.trim().split('\n').at(-1));
check('uninstall removes App/ and keeps the notebooks', !existsSync(join(installed, 'App')) && existsSync(join(cwd, 'data', 'test', 'Notebooks')));
finish(Number(process.exitCode ?? 0));
