// The tailnet name this computer serves the app on: `tailnetHost` in <data dir>/settings.json
// (see tailnet.ts). Read on each remote request, so turning it off takes effect at once.

import { settings } from '../settings/server/index.server';
import { readRootSettings, updateRootSettings } from '../settings/server/root-settings.server';
import { ok, err, type Result } from '../utils/result';
import { parseTailnetHost, storedTailnetHost } from './tailnet';

export interface TailnetAccess {
  /** The tailnet name the app answers on, or null when only this computer can open it. */
  readonly hostname: string | null;
  /** The address to open from another device. */
  readonly url: string | null;
}

const describe = (hostname: string | null): TailnetAccess => ({ hostname, url: hostname ? `https://${hostname}/app` : null });

export const readTailnetHost = async (): Promise<string | null> => storedTailnetHost((await readRootSettings(settings))['tailnetHost']);

export const tailnetAccess = async (): Promise<TailnetAccess> => describe(await readTailnetHost());

/** Sets the tailnet name, or turns tailnet access off with null. */
export const setTailnetHost = async (input: string | null): Promise<Result<TailnetAccess>> => {
  if (input === null) {
    await updateRootSettings(settings, { tailnetHost: undefined });
    return ok(describe(null));
  }
  const hostname = parseTailnetHost(input);
  if (!hostname) {
    return err(new Error(`"${input}" isn't a tailnet name. Use this computer's full MagicDNS name, like my-mac.tail1234.ts.net (run \`tailscale status --self\` or see the Tailscale admin console).`));
  }
  await updateRootSettings(settings, { tailnetHost: hostname });
  return ok(describe(hostname));
};
