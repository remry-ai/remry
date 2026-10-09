#!/usr/bin/env bun
// Remry CLI. Calls any tRPC procedure in-process against a local
// notebook, with the router's own validation. The app does not need to be running.
//   remry help                        list procedures
//   remry help <procedure>            show a procedure's inputs
//   remry <procedure> [--key value]   call it; the JSON result goes to stdout
//   --notebook <id>                    on any call: use that notebook (else REMRY_NOTEBOOK, else the default)
// See cli/args.ts for --<key>-file, --input and value coercion, and cli/mcp.ts for `remry mcp`.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { JsonSchema } from './args';

// From a clone, paths (migrations, test data) resolve from the repo. The standalone
// binary has no repo and finds its migrations itself. Files named in arguments
// resolve from wherever the command was run.
const callerCwd = process.cwd();
if (!process.env['REMRY_STANDALONE']) process.chdir(resolve(import.meta.dir, '..'));

// App logs go to stderr so stdout carries only the JSON result.
console.log = console.info = console.debug = (...args: unknown[]): void => console.error(...args);

const { coerceArgs, splitGlobalArgs, typesOf } = await import('./args');
const { procedures, callProcedure, disconnect } = await import('./api');

const describeType = (prop: JsonSchema): string => {
  const types = [...typesOf(prop)].filter((t) => t !== 'null');
  const values = prop.enum?.filter((v) => v !== null);
  const base = values?.length ? values.join('|') : types.join('|') || 'any';
  return typesOf(prop).has('null') ? `${base}|null` : base;
};

const printHelp = (name: string | undefined): number => {
  if (!name) {
    console.error('Procedures (remry help <procedure> for inputs):\n');
    for (const p of procedures) {
      const props = Object.keys((p.inputSchema as JsonSchema).properties ?? {});
      process.stdout.write(`  ${p.name} (${p.type})${props.length ? `  --${props.join(' --')}` : ''}\n`);
    }
    console.error('\nNotebooks: every call uses the default notebook unless you add --notebook <id> (or set REMRY_NOTEBOOK). remry notebook.list shows them.');
    console.error('Also: remry backup [list | restore <id|latest> | --force --reason <why> | install | uninstall] [--notebook <id>], remry app (the UI), remry app restart, and remry mcp (the MCP server).');
    return 0;
  }
  const meta = procedures.find((p) => p.name === name);
  if (!meta) {
    console.error(`Unknown procedure: ${name}`);
    return 1;
  }
  const schema = meta.inputSchema as JsonSchema;
  const required = new Set(schema.required ?? []);
  process.stdout.write(`${meta.name} (${meta.type})\n`);
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const limits = [
      prop.minimum !== undefined ? `min ${prop.minimum}` : '',
      prop.maximum !== undefined ? `max ${prop.maximum}` : '',
      prop.maxLength !== undefined ? `max length ${prop.maxLength}` : '',
      prop.format ? prop.format : ''
    ].filter(Boolean).join(', ');
    process.stdout.write(`  --${key}  ${describeType(prop)}${required.has(key) ? '  (required)' : ''}${limits ? `  [${limits}]` : ''}\n`);
  }
  return 0;
};

const run = async (): Promise<number> => {
  const globals = splitGlobalArgs(process.argv.slice(2));
  if (!globals.ok) {
    console.error(`Error: ${globals.error.message}`);
    return 1;
  }
  const [command, ...rest] = globals.value.rest;
  if (!command || command === 'help' || command === '--help') return printHelp(rest[0]);

  const meta = procedures.find((p) => p.name === command);
  if (!meta) {
    console.error(`Unknown procedure: ${command}. Run \`remry help\` to list them.`);
    return 1;
  }

  const input = coerceArgs(rest, meta.inputSchema, (path) => readFileSync(resolve(callerCwd, path), 'utf8'));
  if (!input.ok) {
    console.error(`Error: ${input.error.message}. Run \`remry help ${command}\` for its inputs.`);
    return 1;
  }

  const outcome = await callProcedure(command, input.value, { notebook: globals.value.notebook });
  if (outcome.kind === 'invalid') {
    console.error(`Invalid input for ${command}:\n${outcome.issues.map((i) => `  --${i.path || '(input)'}: ${i.message}`).join('\n')}`);
    return 1;
  }
  process.stdout.write(`${JSON.stringify(outcome.result, null, 2)}\n`);
  return outcome.failed ? 1 : 0;
};

let code = 1;
try {
  code = await run();
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await disconnect();
}
process.exit(code);
