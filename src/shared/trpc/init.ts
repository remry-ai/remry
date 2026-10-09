// tRPC initialization. Exports the primitives used by every domain router.
// Local-only and single-user: there is no auth. The security boundary is the
// network guard in hooks.server.ts (loopback Host + LOCAL_HEADER).

import { initTRPC, TRPCError } from '@trpc/server';
import { notInModelMessage } from '$shared/modules/model';
import type { Context } from './context.server';

const t = initTRPC.context<Context>().create();

/** Procedures a module owns (goal.*) are refused in a notebook without that module. */
const moduleGate = t.middleware(({ ctx, path, next }) => {
  const owner = ctx.model.procedureOwner(path);
  if (owner) throw new TRPCError({ code: 'FORBIDDEN', message: notInModelMessage(ctx.model, owner, path) });
  return next();
});

export const router = t.router;
export const middleware = t.middleware;
export const procedure = t.procedure.use(moduleGate);
/** In-process callers (the CLI) run procedures with the same validation, without HTTP. */
export const createCallerFactory = t.createCallerFactory;
