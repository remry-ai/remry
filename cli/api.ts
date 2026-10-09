// The app's tRPC procedures, called in-process against a local notebook.
// Shared by the CLI (main.ts) and its MCP server (mcp.ts). Import it only after
// the entry point has changed to the repo directory, because settings resolve paths from there.

import { TRPCError } from '@trpc/server';
import { appRouter } from '$shared/trpc/router';
import { createCallerFactory } from '$shared/trpc/init';
import { createNotebookContext } from '$shared/trpc/context.server';
import { listProcedures, type ProcedureMeta } from '$shared/trpc/meta';
import { resolveCurrentNotebook } from '$shared/notebooks/current.server';
import { notebookFromEnv } from '$shared/notebooks/resolve';
import { closeRegistries } from '$shared/registry.server';
import { features } from '$shared/settings/base/features';

// doc.convertPdf, doc.pdfConversion and chat.* run the Claude Code CLI for the web app;
// from the CLI or MCP, Claude reads the PDF (or the page) itself. report.* stays out while reports are switched off.
export const procedures: readonly ProcedureMeta[] = listProcedures(
  appRouter,
  new Set(['trpcMeta.list', 'doc.convertPdf', 'doc.pdfConversion', 'chat.get', 'chat.send', 'chat.status', 'chat.clear'])
).filter((p) => features.reports || !p.name.startsWith('report.'));

export interface InputIssue {
  /** Dotted path of the offending field; empty for the input as a whole. */
  readonly path: string;
  readonly message: string;
}

export type CallOutcome =
  | { readonly kind: 'result'; readonly result: unknown; readonly failed: boolean }
  | { readonly kind: 'invalid'; readonly issues: readonly InputIssue[] };

export interface CallOptions {
  /** Notebook id or name. Otherwise REMRY_NOTEBOOK, then the default notebook. */
  readonly notebook?: string;
}

const zodIssues = (error: unknown): readonly InputIssue[] => {
  const issues = (error as { issues?: ReadonlyArray<{ path: readonly (string | number)[]; message: string }> } | undefined)?.issues ?? [];
  return issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
};

/** Calls a procedure by name. Invalid input comes back as issues; an unknown notebook or any other error throws. */
export const callProcedure = async (name: string, input: unknown, options: CallOptions = {}): Promise<CallOutcome> => {
  if (!procedures.some((p) => p.name === name)) throw new Error(`Unknown procedure: ${name}`);

  // Resolved on every call, so a long-running MCP server sees notebook.setDefault.
  const notebook = await resolveCurrentNotebook({ explicit: options.notebook, env: notebookFromEnv(process.env) });
  if (!notebook.ok) throw notebook.error;

  const caller = createCallerFactory(appRouter)(await createNotebookContext(notebook.value));
  const call = name
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], caller) as (value: unknown) => Promise<unknown>;

  try {
    const result = await call(input);
    const failed = result !== null && typeof result === 'object' && 'ok' in result && result.ok === false;
    return { kind: 'result', result, failed };
  } catch (error) {
    const issues = error instanceof TRPCError ? zodIssues(error.cause) : [];
    if (issues.length) return { kind: 'invalid', issues };
    throw error;
  }
};

export const disconnect = (): Promise<void> => closeRegistries();
