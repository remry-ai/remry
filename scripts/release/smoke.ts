#!/usr/bin/env bun
// Smoke-tests a built plugin the way a machine without a clone uses it:
//   - the shim installs the binary into a fresh data directory and runs a procedure
//   - `remry mcp` answers over stdio with the notebook argument on its tools
//   - `remry app` serves a page, the API, and the guard
// Uses APP_ENV=test, so data goes to ./data/test inside a temporary directory.
//   bun scripts/release/smoke.ts [dist/plugin]

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { dataDirFor } from '../../src/shared/settings/server/app-dirs';

const windows = process.platform === 'win32';
const plugin = resolve(process.argv[2] ?? 'dist/plugin');
// This machine's binary: a merged plugin carries one per platform.
const hostBinary = `remry-${windows ? 'windows' : process.platform}-${process.arch}${windows ? '.exe' : ''}`;
const binary = readdirSync(join(plugin, 'server')).find((name) => name === hostBinary);
if (!binary) throw new Error(`No ${hostBinary} in ${plugin}/server`);

const cwd = mkdtempSync(join(tmpdir(), 'remry-smoke-'));
const home = mkdtempSync(join(tmpdir(), 'remry-home-'));
// No Bun on PATH, so nothing can fall back to a clone. Windows keeps its PATH for system tools.
const env = windows
  ? { ...process.env, APP_ENV: 'test', USERPROFILE: home, LOCALAPPDATA: join(home, 'AppData', 'Local') }
  : { ...process.env, APP_ENV: 'test', HOME: home, PATH: '/usr/bin:/bin' };
const check = (label: string, passed: boolean, detail = ''): void => {
  console.log(`${passed ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!passed) process.exitCode = 1;
};

// 1. Through the shim, with no Bun on PATH and no clone.
const listed = windows
  ? spawnSync('cmd.exe', ['/d', '/c', join(plugin, 'scripts', 'remry.cmd'), 'notebook.list'], { cwd, env, encoding: 'utf8' })
  : spawnSync('sh', [join(plugin, 'scripts', 'remry'), 'notebook.list'], { cwd, env, encoding: 'utf8' });
const notebooks = (() => {
  try {
    return JSON.parse(listed.stdout) as { ok: boolean; value: Array<{ id: string }> };
  } catch {
    return null;
  }
})();
check('shim runs notebook.list', listed.status === 0 && notebooks?.ok === true && notebooks.value[0]?.id === 'notebook', listed.stderr.trim().split('\n').at(-1));
const version = (await Bun.file(join(plugin, 'server', 'VERSION')).text()).trim();
const installed = dataDirFor({ platform: process.platform, home, env });
const exeName = windows ? 'remry.exe' : 'remry';
check('shim installed the binary', existsSync(join(installed, 'App', version, exeName)) && existsSync(join(installed, 'App', 'current', exeName)));

// 2. The MCP server.
const exe = join(plugin, 'server', binary);
const mcp = spawn(exe, ['mcp'], { cwd, env, stdio: ['pipe', 'pipe', 'inherit'] });
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

// 3. The UI.
const port = 51000 + Math.floor(Math.random() * 1000);
const app = spawn(exe, ['app'], { cwd, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'inherit', 'inherit'] });
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
const expectedVersion = (await Bun.file(join(plugin, 'server', 'VERSION')).text()).trim();
const reported = await fetch(`${base}/__remry/app`).then((r) => r.json() as Promise<{ version?: string }>).catch(() => null);
check('app reports its version', reported?.version === expectedVersion, `${reported?.version ?? 'none'} (expected ${expectedVersion})`);
check('app refuses to stop without the local header', (await fetch(`${base}/__remry/app/stop`, { method: 'POST' })).status === 403);
const stopped = await fetch(`${base}/__remry/app/stop`, { method: 'POST', headers: { 'x-remry': '1' } });
await Bun.sleep(500);
check('app stops for a newer version', stopped.status === 202 && (await fetch(`${base}/app`).catch(() => null)) === null);
app.kill();

process.exit(process.exitCode ?? 0);
