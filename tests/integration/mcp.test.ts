// The MCP server as Claude desktop runs it: `remry mcp` over stdio, no server running.

import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { testLicenseKey } from '../license-test-key';

type Message = Record<string, unknown> & { result?: Record<string, unknown>; error?: { code: number; message: string } };

const server = spawn(resolve('bin/remry'), ['mcp'], { env: { ...process.env, APP_ENV: 'test' }, stdio: ['pipe', 'pipe', 'pipe'] });
const exited = new Promise<number | null>((done) => server.on('exit', done));

const nonProtocolLines: string[] = [];
const waiting = new Map<number, (message: Message) => void>();
createInterface({ input: server.stdout }).on('line', (line) => {
  let message: Message;
  try {
    message = JSON.parse(line) as Message;
  } catch {
    nonProtocolLines.push(line);
    return;
  }
  waiting.get(message['id'] as number)?.(message);
});

let nextId = 1;
const request = (method: string, params: Record<string, unknown> = {}): Promise<Message> =>
  new Promise((done) => {
    const id = nextId++;
    waiting.set(id, done);
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

const callTool = async (name: string, args: Record<string, unknown>) => {
  const result = (await request('tools/call', { name, arguments: args })).result as { content: Array<{ text: string }>; isError?: boolean };
  return { text: result.content[0]?.text ?? '', isError: result.isError === true };
};

afterAll(() => {
  if (server.exitCode === null) server.kill();
});

describe('remry mcp', () => {
  it('initializes and lists every procedure as a tool, plus snapshots', async () => {
    const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    expect(init.result?.['protocolVersion']).toBe('2025-06-18');
    expect(init.result?.['serverInfo']).toMatchObject({ name: 'remry' });
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

    const tools = (await request('tools/list')).result?.['tools'] as Array<{ name: string; inputSchema: { properties?: Record<string, unknown> }; annotations: { destructiveHint: boolean; readOnlyHint: boolean } }>;
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect(tools.length).toBeGreaterThan(60);
    expect(byName.get('person_list')?.annotations.readOnlyHint).toBe(true);
    expect(byName.get('search_query')?.annotations.readOnlyHint).toBe(true);
    expect(byName.get('search_recall')?.annotations.readOnlyHint).toBe(true);
    expect(byName.get('person_delete')?.annotations.destructiveHint).toBe(true);
    expect(byName.get('goal_delete')?.annotations.destructiveHint).toBe(true);
    expect(byName.get('relation_remove')?.annotations.destructiveHint).toBe(true);
    expect(byName.get('goal_checkIn')?.annotations.destructiveHint).toBe(false);
    expect(byName.has('backup_snapshot')).toBe(true);
    expect(byName.has('trpcMeta_list')).toBe(false);
    expect(byName.get('person_list')?.inputSchema.properties?.['notebook']).toBeDefined();
    expect(byName.get('backup_snapshot')?.inputSchema.properties?.['notebook']).toBeDefined();
    expect(byName.get('notebook_list')?.inputSchema.properties?.['notebook']).toBeUndefined();
  });

  it('works in the default notebook unless a call passes `notebook`', async () => {
    expect((await callTool('person_create', { name: 'Noor Other', notebook: 'other' })).isError).toBe(false);
    const names = async (args: Record<string, unknown>) =>
      (JSON.parse((await callTool('person_list', args)).text) as Array<{ name: string }>).map((p) => p.name);
    expect(await names({ notebook: 'Other' })).toEqual(['Noor Other']);
    expect(await names({})).not.toContain('Noor Other');

    const unknown = await callTool('person_list', { notebook: 'nope' });
    expect(unknown.isError).toBe(true);
    expect(unknown.text).toContain('There is no notebook "nope"');

    expect(JSON.parse((await callTool('backup_list', { notebook: 'other' })).text)).toEqual({ notebook: 'other', snapshots: [] });
  });

  it('writes and reads the notebook, keeping schema types', async () => {
    const created = await callTool('person_create', { name: '2024 Mika Tanaka', extensions: { org: { title: '2024' } } });
    expect(created.isError).toBe(false);
    const id = (JSON.parse(created.text) as { id: string }).id;

    const person = JSON.parse((await callTool('person_get', { id })).text) as { name: string };
    expect(person).toMatchObject({ name: '2024 Mika Tanaka', extensions: { org: { title: '2024' } } });

    // Full-text search is Remry Pro: refused, with the way out, until a license is added.
    const locked = await callTool('search_query', { q: 'tanaka' });
    expect(locked.isError).toBe(true);
    expect(locked.text).toContain('Remry Pro');
    expect(locked.text).toContain('license.activate');
    expect((await callTool('license_activate', { key: testLicenseKey() })).isError).toBe(false);

    const found = JSON.parse((await callTool('search_query', { q: 'tanaka' })).text) as { results: Array<{ entityId: string }> };
    expect(found.results.map((r) => r.entityId)).toContain(id);
    const recall = JSON.parse((await callTool('search_recall', { entityType: 'PERSON', entityId: id })).text) as { name: string };
    expect(recall.name).toBe('2024 Mika Tanaka');
  });

  it('returns invalid input and failed operations as tool errors', async () => {
    const missing = await callTool('person_create', { email: 'mika@example.com' });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('name');

    const chart = ['```chart', '{"type":"bar","labels":["a","b","c"],"series":[{"values":[1,2]}]}', '```'].join('\n');
    const bad = await callTool('page_create', { title: 'Q3 velocity', content: chart });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain('chart block at line 1');
  });

  it('keeps stdout to protocol messages and exits when stdin closes', async () => {
    expect(nonProtocolLines).toEqual([]);
    server.stdin.end();
    expect(await exited).toBe(0);
  });
});
