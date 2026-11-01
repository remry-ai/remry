// Other devices: tailnet access (see $shared/remote/tailnet.ts). The port is this server's own,
// so the `tailscale serve` command shown matches the app being looked at (7369, or 5173 for a dev server).

import { tailnetAccess } from '$shared/remote/store.server';
import { isLoopbackHostname } from '$shared/remote/tailnet';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const remote = !isLoopbackHostname(url.hostname);
  return {
    access: await tailnetAccess(),
    remote,
    port: remote ? null : url.port || '80'
  };
};
