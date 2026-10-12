import { z } from 'zod';
import { router, procedure } from '$shared/trpc/init';
import { activateLicense, removeLicense } from '$shared/license/store.server';
import { ok } from '$shared/utils/result';

// The license belongs to the computer, not a notebook: these work the same from any notebook.
export const licenseRouter = router({
  status: procedure
    .meta({ description: 'Whether a Remry Pro license is active, and until when.' })
    .query(async ({ ctx }) => ok(await ctx.license())),

  activate: procedure
    .meta({ description: 'Activates a Remry Pro license key on this computer.' })
    .input(z.object({ key: z.string().min(1).max(4000).describe('The license key, starting WN1.') }))
    .mutation(({ input }) => activateLicense(input.key)),

  remove: procedure
    .meta({ description: 'Removes the Remry Pro license from this computer.' })
    .mutation(() => removeLicense())
});
