// Other devices: tailnet access (see $shared/remote/tailnet.ts) and this computer's Tailscale
// (tailscale.ts). The port is this server's own, so Tailscale shares the app being looked at
// (7369, or 5173 for a dev server). From another device the page only shows the status.

import { tailnetAccess } from '$shared/remote/store.server';
import { isLoopbackHostname } from '$shared/remote/tailnet';
import { readTailscale } from '$shared/remote/tailscale.server';
import { DEFAULT_APP_PORT } from '$shared/remote/tailscale';
import { startAtLoginStatus } from '$shared/startup/login-agent.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const remote = !isLoopbackHostname(url.hostname);
  const port = Number(url.port) || DEFAULT_APP_PORT;
  return {
    access: await tailnetAccess(),
    tailscale: remote ? null : await readTailscale(port),
    startAtLogin: startAtLoginStatus(),
    remote,
    port
  };
};
