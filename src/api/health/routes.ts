// Health domain - tRPC router. Liveness + database check.

import { router, procedure } from '$shared/trpc/init';
import { getStatus } from './operations';

export const healthRouter = router({
  status: procedure.query(({ ctx }) => getStatus(ctx.reg))
});
