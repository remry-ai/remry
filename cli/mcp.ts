#!/usr/bin/env bun
// Remry MCP server: `remry mcp`. Serves every procedure, plus snapshots and
// opening the app, as MCP tools over stdio for Claude desktop Chat, Cowork and Claude Code.
// Local only: no network, and it runs with the permissions of whoever starts it.
// The protocol itself is in mcp-protocol.ts.

import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import pluginManifest from '../plugin/.claude-plugin/plugin.json';
import {
  PARSE_ERROR,
  handleMessage,
  notebookArgumentSchema,
  resultFromOutcome,
  splitNotebookArgument,
  textResult,
  toolFromProcedure,
  toolName,
  type McpContext,
  type McpTool,
  type ToolResult
} from './mcp-protocol';

const REPO = resolve(import.meta.dir, '..');
const standalone = process.env['REMRY_STANDALONE'] === '1';
if (!standalone) process.chdir(REPO);

// stdout carries protocol messages only. Anything else the app prints goes to stderr.
const writeProtocol = process.stdout.write.bind(process.stdout);
process.stdout.write = ((...args: Parameters<typeof process.stderr.write>) => process.stderr.write(...args)) as typeof process.stdout.write;
console.log = console.info = console.debug = (...args: unknown[]): void => console.error(...args);

// Before anything opens the data directory: an app an older release left running is
// stopped now (and this version's started below), so updating the plugin updates the app.
const { appUrl, currentAppOwner, openApp, restartApp, startOwnApp, stopStaleApp } = await import('./app-launch');
const appOwner = currentAppOwner(REPO);
const staleAppStopped = await stopStaleApp(appOwner).catch((error: unknown) => {
  console.error(error);
  return false;
});

const { procedures, callProcedure, disconnect } = await import('./api');
const { createSnapshot, listSnapshots } = await import('../scripts/backup/snapshot');
const { resolveCurrentNotebook } = await import('../src/shared/notebooks/current.server');
const { notebookFromEnv } = await import('../src/shared/notebooks/resolve');
if (staleAppStopped) void startOwnApp(appOwner).catch((error: unknown) => console.error(error));
// Hourly snapshots while Claude has the server open, on every platform (see scripts/backup/schedule.ts).
const { startBackupSchedule } = await import('../scripts/backup/schedule');
startBackupSchedule((message) => console.error(message));

const INSTRUCTIONS = [
  "Remry holds the user's local notebooks. Each notebook (for example work, home life, or a personal project) has its own people and groups (group_*; a group has a kind the notebook defines: Team, Department, Family, Friends), projects, and what its profile's modules add: a work notebook has the org chart (a person's title and lead) and goals with check-ins; a home notebook has birthdays and how you know someone. Module fields go under `extensions` in person_create and person_update. A notebook also has wiki pages of kinds the notebook defines (pageKind_*; expenses, recipes, places and the like), which page_query filters, groups and totals, relations between entities (relation_*: related to, depends on), relationships between people (personRelation_*, of kinds the notebook defines with personRelationKind_*: Lead of / Reports to, Parent of / Child of, Partner of, Friend of; a person's lead is a LEAD_OF relationship, and adding one replaces their old lead), one person marked as the user (person_setMe; person_list shows how each person relates to them in `toMe`), notes, docs, recurring todos and tags.",
  'Before creating a page kind, check pageKind_list and propose its fields to the user.',
  "Every tool except notebook_* works on one notebook: the default, unless you pass `notebook` (an id or name). Call notebook_list first. If there is more than one notebook and the user hasn't made clear which one they mean, ask. Say which notebook you read or wrote.",
  'Each tool is one procedure: person_create is person.create. Find ids with the list and get tools before writing, and never create a second person, group or project with an existing name, or a second goal or page with an existing title, in the same notebook.',
  'To find anything by what it says (notes, docs, wiki pages, todos, comments, names), call search_query. For "what do I know about X", call search_recall with the entity: it returns its notes, todos, docs, links, tags, relations, owned goals and projects, and text elsewhere that names it without linking it. Both need Remry Pro; without a license they say so, and then you answer with the list and get tools instead.',
  'Confirm with the user before any delete, remove or detach tool, and call backup_snapshot first before deletes or more than about five writes in one go.',
  'To show the user something in the app, call app_open and give them the link.',
  'After any write, end your reply with a markdown link to each item you created or changed: the app address from app_open, plus the item\'s path (the `path` in the result, or /app/people/<id>, /app/groups/<id>, /app/projects/<id>, /app/goals/<id>, /app/wiki/<id>; a doc is its entity\'s path with ?doc=<id>; a todo is /app/todos?popup=todo&todo=<id>; notes, tags and relations link to their entity), with notebook=<notebook id> in the query.',
  'When bringing in items from another tool (Linear, Notion, Jira), call link_find with the item URL first and update the entity it finds; attach a link to the source on anything you create.',
  "Reach Remry only through these tools. Never read its data folder (~/Library/Application Support/Remry on macOS, %LOCALAPPDATA%\\Remry on Windows) or database directly, and don't ask the user to attach that folder: a sandbox such as Cowork's can't see it, and the database must not be opened from two places at once.",
  'Report back by name, not id. The remry skill has the full rules and recipes.'
].join(' ');

const extraTools: readonly McpTool[] = [
  {
    name: 'backup_snapshot',
    description: 'Takes a snapshot of one Remry notebook now (the default unless you pass `notebook`), kept on this computer. Do this before deleting anything or making more than about five changes in one go.',
    inputSchema: {
      type: 'object',
      properties: {
        reason: { type: 'string', minLength: 1, maxLength: 200, description: 'Why, for example "before merging duplicate people"' },
        notebook: notebookArgumentSchema
      },
      required: ['reason'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'backup_list',
    description: "Lists a Remry notebook's snapshots with their reasons and counts. Only the user restores one, with `remry backup restore <id> --notebook <notebook>` while the app is closed.",
    inputSchema: { type: 'object', properties: { notebook: notebookArgumentSchema }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'app_open',
    description: "Starts the Remry app on this computer if it isn't running, and returns its address, opening the given notebook (or the default). Give the user the link. The app keeps running afterwards.",
    inputSchema: { type: 'object', properties: { notebook: notebookArgumentSchema }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'app_restart',
    description: "Stops the Remry app on this computer, whatever version is running, and starts it again, then returns its address for the given notebook (or the default). Use it when the user asks to restart the app, or when it's stuck or showing an old version. Nothing is lost: data lives in the notebook, not the app.",
    inputSchema: { type: 'object', properties: { notebook: notebookArgumentSchema }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  }
];

const procedureByTool = new Map(procedures.map((p) => [toolName(p.name), p.name]));

const callExtraTool = async (name: string, args: Readonly<Record<string, unknown>>, notebookName: string | undefined): Promise<ToolResult> => {
  const notebook = await resolveCurrentNotebook({ explicit: notebookName, env: notebookFromEnv(process.env) });
  if (!notebook.ok) return textResult(notebook.error.message, true);
  const id = notebook.value.id;

  if (name === 'app_open') {
    const launched = await openApp(appOwner);
    return textResult({ url: appUrl(id), notebook: id, started: launched.started, restarted: launched.restarted });
  }
  if (name === 'app_restart') {
    try {
      const { stopped } = await restartApp(appOwner);
      return textResult({ url: appUrl(id), notebook: id, restarted: stopped, started: !stopped });
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true);
    }
  }
  if (name === 'backup_snapshot') {
    const reason = typeof args['reason'] === 'string' ? args['reason'].trim() : '';
    if (!reason) return textResult('Invalid input:\n  reason: Required', true);
    const outcome = await createSnapshot({ notebook: id, force: true, reason });
    return textResult({ notebook: id, status: outcome.status, id: outcome.snapshot?.id ?? null, pruned: outcome.pruned.length });
  }
  const snapshots = await listSnapshots(id);
  return textResult({
    notebook: id,
    snapshots: snapshots.map((s) => ({ id: s.id, createdAt: s.manifest.createdAt, reason: s.manifest.reason, counts: s.manifest.counts }))
  });
};

const callTool = async (name: string, rawArgs: Readonly<Record<string, unknown>>): Promise<ToolResult> => {
  const split = splitNotebookArgument(rawArgs);
  if ('error' in split) return textResult(`Invalid input:\n  notebook: ${split.error}`, true);

  if (extraTools.some((t) => t.name === name)) return callExtraTool(name, split.args, split.notebook);
  const procedure = procedureByTool.get(name);
  return procedure
    ? resultFromOutcome(await callProcedure(procedure, split.args, { notebook: split.notebook }))
    : textResult(`Unknown tool: ${name}`, true);
};

const ctx: McpContext = {
  info: { name: 'remry', version: pluginManifest.version, instructions: INSTRUCTIONS },
  tools: [...procedures.map(toolFromProcedure), ...extraTools],
  callTool
};

const send = (message: unknown): void => {
  writeProtocol(`${JSON.stringify(message)}\n`);
};

const inFlight = new Set<Promise<void>>();

const receive = async (line: string): Promise<void> => {
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: PARSE_ERROR, message: 'Parse error' } });
    return;
  }
  const response = await handleMessage(message, ctx);
  if (response) send(response);
};

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', (line) => {
  if (!line.trim()) return;
  const task: Promise<void> = receive(line)
    .catch((error: unknown) => console.error(error))
    .finally(() => inFlight.delete(task));
  inFlight.add(task);
});
lines.on('close', () => {
  void Promise.allSettled(inFlight)
    .then(() => disconnect())
    .finally(() => process.exit(0));
});
