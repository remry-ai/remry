// Procedure metadata (name, kind, input JSON Schema) for a tRPC router.
// Shared by the trpcMeta route and the CLI's `help`.

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AnyRouter } from '@trpc/server';

/** What a procedure declares with `.meta()`: a one-line description, which the CLI's help and the MCP tool list show. */
export interface ProcedureDoc {
  readonly description?: string;
}

export interface ProcedureMeta {
  readonly name: string;
  readonly type: 'query' | 'mutation';
  /** Null for a procedure without `.meta({ description })`. */
  readonly description: string | null;
  readonly inputSchema: unknown;
}

export const listProcedures = (
  router: AnyRouter,
  exclude: ReadonlySet<string> = new Set()
): readonly ProcedureMeta[] => {
  const procedures = (router as unknown as { _def: { procedures: Record<string, unknown> } })._def.procedures;
  return Object.entries(procedures)
    .filter(([path]) => !exclude.has(path))
    .map(([path, proc]) => {
      const def = (proc as { _def: { type?: 'query' | 'mutation'; inputs?: unknown[]; meta?: ProcedureDoc } })._def;
      const input = (def.inputs?.[0] as z.ZodTypeAny | undefined) ?? z.object({});
      return {
        name: path,
        type: def.type ?? 'query',
        description: def.meta?.description ?? null,
        inputSchema: zodToJsonSchema(input, { $refStrategy: 'none' })
      };
    });
};
