// Health domain - tRPC router. Liveness + database check.

import { router, procedure } from '$shared/trpc/init';
import { getStatus } from './operations';

export const healthRouter = router({
  status: procedure
    .meta({ description: 'Whether the notebook\'s database is reachable, and the app\'s version. For diagnosing problems.' })
    .query(({ ctx }) => getStatus(ctx.reg))
});
