import { z } from 'zod';
import { router, procedure } from '$shared/trpc/init';
import { setTailnetHost, tailnetAccess } from '$shared/remote/store.server';
import { readTailscale, shareOnTailnet, stopSharing } from '$shared/remote/tailscale.server';
import { DEFAULT_APP_PORT } from '$shared/remote/tailscale';
import { setStartAtLogin, startAtLoginStatus } from '$shared/startup/login-agent.server';
import { ok, err } from '$shared/utils/result';

// Opening Remry from other devices belongs to the computer, not a notebook: the tailnet name
// ($shared/remote/tailnet.ts), the user's Tailscale ($shared/remote/tailscale.ts) and starting
// the app server at login ($shared/startup/login-agent.ts).

const port = z.number().int().min(1).max(65535).optional()
  .describe(`The app server's port: ${DEFAULT_APP_PORT}, the desktop app's, unless you run a dev server.`);

export const remoteAccessRouter = router({
  status: procedure
    .meta({ description: 'Whether other devices on your tailnet can open the app, what Tailscale on this computer is missing for it, and whether the app starts at login.' })
    .input(z.object({ port }).optional())
    .query(async ({ input }) => ok({
      ...(await tailnetAccess()),
      tailscale: await readTailscale(input?.port ?? DEFAULT_APP_PORT),
      startAtLogin: startAtLoginStatus()
    })),

  set: procedure
    .meta({ description: 'Turns on tailnet access through this computer\'s Tailscale (`tailscale: true` shares the app with `tailscale serve` and saves its name; false turns it off), or sets the ts.net name by hand, and/or starts the app at login (macOS desktop app).' })
    .input(z.object({
      tailscale: z.boolean().optional().describe('true: share the app on your tailnet with this computer\'s Tailscale and let other devices open it; false: turn that off.'),
      hostname: z.string().min(1).max(300).nullable().optional().describe('Set this computer\'s MagicDNS name yourself (my-mac.tail1234.ts.net), when you run `tailscale serve` yourself; null turns tailnet access off.'),
      startAtLogin: z.boolean().optional().describe('Start the app server, with no window, when you log in to this Mac.'),
      port
    }))
    .mutation(async ({ input }) => {
      if (input.tailscale === undefined && input.hostname === undefined && input.startAtLogin === undefined) {
        return err(new Error('Give tailscale, hostname or startAtLogin.'));
      }
      if (input.tailscale !== undefined && input.hostname !== undefined) return err(new Error('Give tailscale or hostname, not both.'));
      const appPort = input.port ?? DEFAULT_APP_PORT;
      if (input.tailscale !== undefined) {
        const shared = input.tailscale ? await shareOnTailnet(appPort) : await stopSharing(appPort);
        if (!shared.ok) return shared;
      }
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
