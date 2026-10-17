// The Model Context Protocol side of `remry mcp`: newline-delimited JSON-RPC 2.0
// over stdio, serving the notebook's procedures as tools. Pure: the tool call is
// passed in, so this is tested without a database or a process.

import type { ProcedureMeta } from '$shared/trpc/meta';
import type { CallOutcome } from './api';

/** Newest first. A client asking for one of these gets it; otherwise it gets the newest. */
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;

export interface ToolAnnotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly openWorldHint: boolean;
}

export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly annotations: ToolAnnotations;
}

export interface ToolResult {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[];
  readonly isError?: boolean;
}

export interface ServerInfo {
  readonly name: string;
  readonly version: string;
  readonly instructions: string;
}

export interface McpContext {
  readonly info: ServerInfo;
  readonly tools: readonly McpTool[];
  readonly callTool: (name: string, args: Readonly<Record<string, unknown>>) => Promise<ToolResult>;
}

export interface JsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly id: string | number | null;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
}

export const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

const DESTRUCTIVE = /\.(delete|remove|detach)\w*$/;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** MCP tool names can't contain dots: `person.create` is served as `person_create`. */
export const toolName = (procedure: string): string => procedure.replaceAll('.', '_');

/** Every tool that works inside a notebook takes this optional argument. */
export const NOTEBOOK_ARGUMENT = 'notebook';

/**
 * No description: the server instructions say once what `notebook` is (an id or name, the
 * default when left out). Repeated on all 97 tools that take it, the sentence was ~1.6k of the
 * tool list's ~16k tokens.
 */
export const notebookArgumentSchema = { type: 'string' } as const;

/** The `notebook.*` procedures manage notebooks themselves, so they take no notebook argument. */
const isNotebookScoped = (procedure: string): boolean => !procedure.startsWith('notebook.');

export const toolFromProcedure = (procedure: ProcedureMeta): McpTool => {
  const reads = procedure.type === 'query';
  const destructive = !reads && DESTRUCTIVE.test(procedure.name);
  const schema = isRecord(procedure.inputSchema) ? procedure.inputSchema : {};
  const base: Record<string, unknown> = { type: 'object', ...Object.fromEntries(Object.entries(schema).filter(([key]) => key !== '$schema')) };
  const scoped = isNotebookScoped(procedure.name);
  if (scoped) {
    base['properties'] = { ...(isRecord(base['properties']) ? base['properties'] : {}), [NOTEBOOK_ARGUMENT]: notebookArgumentSchema };
  }
  return {
    name: toolName(procedure.name),
    // The procedure's own description; the server instructions say the rest once, not 100 times.
    description: procedure.description ?? `The \`${procedure.name}\` procedure, with the same inputs as \`remry ${procedure.name}\`.`,
    inputSchema: base,
    annotations: { readOnlyHint: reads, destructiveHint: destructive, openWorldHint: false }
  };
};

export interface NotebookArgument {
  readonly notebook?: string;
  /** The tool's arguments without `notebook`. */
  readonly args: Readonly<Record<string, unknown>>;
}

/** Takes the `notebook` argument out of a tool call's arguments. */
export const splitNotebookArgument = (args: Readonly<Record<string, unknown>>): NotebookArgument | { readonly error: string } => {
  const { [NOTEBOOK_ARGUMENT]: notebook, ...rest } = args;
  if (notebook === undefined || notebook === null || notebook === '') return { args: rest };
  return typeof notebook === 'string' ? { notebook, args: rest } : { error: 'notebook must be a notebook id or name' };
};

/** JSON without indentation: every space in a result is a token Claude reads. */
export const textResult = (value: unknown, isError = false): ToolResult => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
  ...(isError ? { isError: true } : {})
});

const isPlainRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Leaves out an object's fields that are null or an empty list, at any depth, so a result says
 * only what's there (the server instructions tell Claude a missing field is empty). Entries of
 * a list are kept as they are, since a null there can hold a place (a sheet's cells), and so
 * is anything that isn't a plain object or list (a Date). A null or empty result stays.
 */
export const leaveOutEmpty = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(leaveOutEmpty);
  if (!isPlainRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === null || child === undefined || (Array.isArray(child) && child.length === 0)) continue;
    out[key] = leaveOutEmpty(child);
  }
  return out;
};

/** A procedure's outcome as a tool result: the value on success, the message on failure. */
export const resultFromOutcome = (outcome: CallOutcome): ToolResult => {
  if (outcome.kind === 'invalid') {
    return textResult(`Invalid input:\n${outcome.issues.map((i) => `  ${i.path || '(input)'}: ${i.message}`).join('\n')}`, true);
  }
  const result = outcome.result;
  if (outcome.failed) {
    const message = isRecord(result) && isRecord(result['error']) ? result['error']['message'] : undefined;
    return textResult(typeof message === 'string' ? message : result, true);
  }
  return textResult(leaveOutEmpty(isRecord(result) && result['ok'] === true && 'value' in result ? result['value'] : result));
};

const reply = (id: string | number, result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result });
const failure = (id: string | number | null, code: number, message: string): JsonRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } });

/** Handles one parsed JSON-RPC message. Notifications and client responses get no reply. */
export const handleMessage = async (message: unknown, ctx: McpContext): Promise<JsonRpcResponse | null> => {
  if (!isRecord(message)) return failure(null, INVALID_REQUEST, 'Invalid request');
  const id = message['id'];
  const validId = typeof id === 'string' || typeof id === 'number' ? id : null;
  if (typeof message['method'] !== 'string') {
    // We never send requests, so a result or error from the client needs nothing.
    return 'result' in message || 'error' in message ? null : failure(validId, INVALID_REQUEST, 'Invalid request');
  }
  if (id === undefined) return null;
  if (validId === null) return failure(null, INVALID_REQUEST, 'Invalid request id');
  const params = isRecord(message['params']) ? message['params'] : {};

  switch (message['method']) {
    case 'initialize': {
      const requested = params['protocolVersion'];
      return reply(validId, {
        protocolVersion: PROTOCOL_VERSIONS.find((v) => v === requested) ?? PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: ctx.info.name, version: ctx.info.version },
        instructions: ctx.info.instructions
      });
    }
    case 'ping':
      return reply(validId, {});
    case 'tools/list':
      return reply(validId, { tools: ctx.tools });
    case 'tools/call': {
      const tool = ctx.tools.find((t) => t.name === params['name']);
      if (!tool) return failure(validId, INVALID_PARAMS, `Unknown tool: ${String(params['name'])}`);
      const args = params['arguments'] ?? {};
      if (!isRecord(args)) return failure(validId, INVALID_PARAMS, 'Tool arguments must be an object');
      try {
        return reply(validId, await ctx.callTool(tool.name, args));
      } catch (error) {
        return reply(validId, textResult(`Error: ${error instanceof Error ? error.message : String(error)}`, true));
      }
    }
    default:
      return failure(validId, METHOD_NOT_FOUND, `Method not found: ${message['method']}`);
  }
};
