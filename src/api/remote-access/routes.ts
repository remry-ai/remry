import { z } from 'zod';
import { router, procedure } from '$shared/trpc/init';
import { setTailnetHost, tailnetAccess } from '$shared/remote/store.server';
import { setStartAtLogin, startAtLoginStatus } from '$shared/startup/login-agent.server';
import { ok, err } from '$shared/utils/result';

// Opening Remry from other devices belongs to the computer, not a notebook: the tailnet name
// ($shared/remote/tailnet.ts) and starting the app server at login ($shared/startup/login-agent.ts).
export const remoteAccessRouter = router({
  status: procedure
    .meta({ description: 'The tailnet name other devices open the app on (null when only this computer can), and whether the app server starts at login.' })
    .query(async () => ok({ ...(await tailnetAccess()), startAtLogin: startAtLoginStatus() })),

  set: procedure
    .meta({ description: 'Lets other devices on your tailnet open the app at this computer\'s ts.net name (served with `tailscale serve`; null turns it off), and/or starts the app server at login (macOS desktop app).' })
    .input(z.object({
      hostname: z.string().min(1).max(300).nullable().optional().describe('This computer\'s MagicDNS name, like my-mac.tail1234.ts.net, or null to turn tailnet access off.'),
      startAtLogin: z.boolean().optional().describe('Start the app server, with no window, when you log in to this Mac.')
    }))
    .mutation(async ({ input }) => {
      if (input.hostname === undefined && input.startAtLogin === undefined) return err(new Error('Give hostname, startAtLogin, or both.'));
      if (input.hostname !== undefined) {
        const set = await setTailnetHost(input.hostname);
        if (!set.ok) return set;
      }
      if (input.startAtLogin !== undefined) {
        const login = await setStartAtLogin(input.startAtLogin);
        if (!login.ok) return login;
      }
      return ok({ ...(await tailnetAccess()), startAtLogin: startAtLoginStatus() });
    })
});
