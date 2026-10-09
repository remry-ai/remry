// Cross-domain helper (not a domain): Remry Pro. A Pro procedure runs only
// while this computer has an active license, and otherwise returns an error that
// says what to do, for the app's user or for Claude through a tool.

import type { Context } from '$shared/trpc/context.server';
import { isProActive, lockedMessage, type ProFeature } from '$shared/types/license';
import { err, type Result } from '$shared/utils/result';

export const gated = async <T>(
  ctx: Pick<Context, 'license'>,
  feature: ProFeature,
  run: () => Promise<Result<T>>
): Promise<Result<T>> => {
  const status = await ctx.license();
  if (!isProActive(status)) return err(new Error(lockedMessage(feature, status)));
  return run();
};
