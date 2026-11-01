import { z } from 'zod';
import { router, procedure } from '$shared/trpc/init';
import { setTailnetHost, tailnetAccess } from '$shared/remote/store.server';
import { ok } from '$shared/utils/result';

// Tailnet access belongs to the computer, not a notebook (see $shared/remote/tailnet.ts).
export const remoteAccessRouter = router({
  status: procedure
    .meta({ description: 'The tailnet name the app answers on for other devices, or null when only this computer can open it.' })
    .query(async () => ok(await tailnetAccess())),

  set: procedure
    .meta({ description: 'Lets other devices on your tailnet open the app at this computer\'s ts.net name (served with `tailscale serve`); null turns it off.' })
    .input(z.object({
      hostname: z.string().min(1).max(300).nullable().describe('This computer\'s MagicDNS name, like my-mac.tail1234.ts.net, or null to turn tailnet access off.')
    }))
    .mutation(({ input }) => setTailnetHost(input.hostname))
});
