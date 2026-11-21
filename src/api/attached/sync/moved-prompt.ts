// `prompt` used to be set on doc.update and page.update. A Claude session that started before
// Remry updated keeps those tools (its MCP server hands each call to the newer `remry`, see
// cli/newer-install.ts), and Zod drops a key it doesn't know, so the call would succeed and change
// nothing. These inputs refuse it instead, saying where it went.

import { z } from 'zod';

export const PROMPT_MOVED = 'A sync prompt is set on the entity now, not on a doc or page: sync.setPrompt --entityType <type> --entityId <id> --prompt "<prompt>", which makes its sync doc. If this session has no sync tools, Remry was updated while it ran: start a new Claude session.';

/** The input object, refusing a `prompt` key with where it went; other unknown keys are dropped as before. */
export const refusingPrompt = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).passthrough().superRefine((value, ctx) => {
    if ('prompt' in value) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['prompt'], message: PROMPT_MOVED });
  }).transform((value) => {
    const known: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) if (key in value) known[key] = (value as Record<string, unknown>)[key];
    return known as z.infer<z.ZodObject<T>>;
  });
