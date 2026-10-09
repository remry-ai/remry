// Reflects over the tRPC appRouter to expose procedure metadata.

import { router, procedure } from '$shared/trpc/init';
import { listProcedures, type ProcedureMeta } from '$shared/trpc/meta';

const EXCLUDE = new Set(['trpcMeta.list']);

export const trpcMetaRouter = router({
  list: procedure.query((): readonly ProcedureMeta[] => {
    // Import lazily to avoid a circular dependency at module level
    const { appRouter } = require('$shared/trpc/router');
    return listProcedures(appRouter, EXCLUDE);
  })
});
