import { z } from 'zod';
import { router, procedure } from '$shared/trpc/init';
import { activateLicense, removeLicense } from '$shared/license/store.server';
import { ok } from '$shared/utils/result';

// The license belongs to the computer, not a notebook: these work the same from any notebook.
export const licenseRouter = router({
  status: procedure.query(async ({ ctx }) => ok(await ctx.license())),

  activate: procedure
    .input(z.object({ key: z.string().min(1).max(4000).describe('The license key, starting WN1.') }))
    .mutation(({ input }) => activateLicense(input.key)),

  remove: procedure.mutation(() => removeLicense())
});
