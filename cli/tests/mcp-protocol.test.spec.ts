import { describe, it, expect } from 'vitest';
import { PROTOCOL_VERSIONS, handleMessage, notebookArgumentSchema, resultFromOutcome, splitNotebookArgument, toolFromProcedure, type McpContext } from '../mcp-protocol';

const personCreate = toolFromProcedure({
  name: 'person.create',
  type: 'mutation',
  inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false, $schema: 'http://json-schema.org/draft-07/schema#' }
});

const calls: Array<{ name: string; args: unknown }> = [];
const ctx: McpContext = {
  info: { name: 'remry', version: '1.2.3', instructions: 'Be careful.' },
  tools: [personCreate, toolFromProcedure({ name: 'boom.now', type: 'mutation', inputSchema: { type: 'object' } })],
  callTool: async (name, args) => {
    if (name === 'boom_now') throw new Error('database is locked');
    calls.push({ name, args });
    return { content: [{ type: 'text', text: 'done' }] };
  }
};

const request = (method: string, params?: unknown, id: string | number = 1) => handleMessage({ jsonrpc: '2.0', id, method, params }, ctx);

describe('toolFromProcedure', () => {
  it('names the tool with underscores, drops $schema and adds the optional notebook argument', () => {
    expect(personCreate.name).toBe('person_create');
    expect(personCreate.inputSchema).toEqual({
      type: 'object',
      properties: { name: { type: 'string' }, notebook: notebookArgumentSchema },
      required: ['name'],
      additionalProperties: false
    });
    expect(personCreate.description).toContain('`remry person.create`');
  });

  it('adds the notebook argument to procedures without inputs, but not to the notebook procedures', () => {
    expect(toolFromProcedure({ name: 'home.todos', type: 'query', inputSchema: { type: 'object' } }).inputSchema).toEqual({
      type: 'object',
      properties: { notebook: notebookArgumentSchema }
    });
    const create = toolFromProcedure({ name: 'notebook.create', type: 'mutation', inputSchema: { type: 'object', properties: { name: { type: 'string' } } } });
    expect(create.inputSchema).toEqual({ type: 'object', properties: { name: { type: 'string' } } });
    expect(create.description).toContain('Manages');
  });

  it('marks queries read-only and deletes, removes and detaches destructive', () => {
    const tool = (name: string, type: 'query' | 'mutation') => toolFromProcedure({ name, type, inputSchema: {} }).annotations;
    expect(tool('person.list', 'query')).toEqual({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    expect(personCreate.annotations.destructiveHint).toBe(false);
    for (const name of ['person.delete', 'note.remove', 'team.removeMember', 'tag.detach']) {
      expect(tool(name, 'mutation').destructiveHint).toBe(true);
    }
  });
});

describe('splitNotebookArgument', () => {
  it('takes notebook out of the arguments', () => {
    expect(splitNotebookArgument({ name: 'Dana', notebook: 'work' })).toEqual({ notebook: 'work', args: { name: 'Dana' } });
    expect(splitNotebookArgument({ name: 'Dana' })).toEqual({ args: { name: 'Dana' } });
    expect(splitNotebookArgument({ name: 'Dana', notebook: '' })).toEqual({ args: { name: 'Dana' } });
  });

  it('rejects a notebook that is not a string', () => {
    expect(splitNotebookArgument({ notebook: 3 })).toEqual({ error: 'notebook must be a notebook id or name' });
  });
});

describe('handleMessage', () => {
  it('negotiates the protocol version and describes the server', async () => {
    const response = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    expect(response?.result).toEqual({
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'remry', version: '1.2.3' },
      instructions: 'Be careful.'
    });
    const unknown = await request('initialize', { protocolVersion: '1999-01-01' });
    expect((unknown?.result as { protocolVersion: string }).protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
  });

  it('answers ping and lists tools', async () => {
    expect(await request('ping')).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
    expect((await request('tools/list', {}, 'a'))?.result).toEqual({ tools: ctx.tools });
  });

  it('calls a tool with its arguments', async () => {
    const response = await request('tools/call', { name: 'person_create', arguments: { name: 'Dana' } }, 7);
    expect(response).toEqual({ jsonrpc: '2.0', id: 7, result: { content: [{ type: 'text', text: 'done' }] } });
    expect(calls.at(-1)).toEqual({ name: 'person_create', args: { name: 'Dana' } });
  });

  it('reports a tool that throws as a tool error, not a protocol error', async () => {
    const response = await request('tools/call', { name: 'boom_now' });
    expect(response?.error).toBeUndefined();
    expect(response?.result).toEqual({ content: [{ type: 'text', text: 'Error: database is locked' }], isError: true });
  });

  it('rejects unknown tools, bad arguments, unknown methods and malformed requests', async () => {
    expect((await request('tools/call', { name: 'nope' }))?.error?.code).toBe(-32602);
    expect((await request('tools/call', { name: 'person_create', arguments: [1] }))?.error?.code).toBe(-32602);
    expect((await request('resources/list'))?.error?.code).toBe(-32601);
    expect((await handleMessage([1, 2], ctx))?.error?.code).toBe(-32600);
    expect((await handleMessage({ jsonrpc: '2.0', id: 3 }, ctx))?.error?.code).toBe(-32600);
  });

  it('does not reply to notifications or to client responses', async () => {
    expect(await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx)).toBeNull();
    expect(await handleMessage({ jsonrpc: '2.0', id: 9, result: {} }, ctx)).toBeNull();
  });
});

describe('resultFromOutcome', () => {
  it('returns the value of a successful Result', () => {
    expect(resultFromOutcome({ kind: 'result', result: { ok: true, value: { id: 'p1' } }, failed: false })).toEqual({
      content: [{ type: 'text', text: '{\n  "id": "p1"\n}' }]
    });
  });

  it('returns the message of a failed Result as an error', () => {
    const outcome = { kind: 'result', result: { ok: false, error: { message: 'chart block at line 3: bad' } }, failed: true } as const;
    expect(resultFromOutcome(outcome)).toEqual({ content: [{ type: 'text', text: 'chart block at line 3: bad' }], isError: true });
  });

  it('lists input issues', () => {
    const result = resultFromOutcome({ kind: 'invalid', issues: [{ path: 'name', message: 'Required' }, { path: '', message: 'Expected object' }] });
    expect(result).toEqual({ content: [{ type: 'text', text: 'Invalid input:\n  name: Required\n  (input): Expected object' }], isError: true });
  });
});
