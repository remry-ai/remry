// Tailnet access: the one way to open the app from another device. The server still binds to
// 127.0.0.1; `tailscale serve` on this computer proxies the tailnet name to it, keeping the
// name as the request's Host. The guard in hooks.server.ts lets that one name through when
// it's set (`tailnetHost` in <data dir>/settings.json), and nothing else:
// - only a `*.ts.net` name, which only Tailscale resolves, so DNS rebinding can't borrow it
// - never a Funnel request: Tailscale marks those (Tailscale-Funnel-Request) and strips the
//   header from anything else, so the public internet can't reach the app even if Funnel is on
// - the x-remry header on the API, as on loopback
// Pure.

export const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Set by `tailscale serve` on traffic that came through Tailscale Funnel, from the internet. */
export const FUNNEL_HEADER = 'tailscale-funnel-request';

export const isLoopbackHostname = (hostname: string): boolean => LOOPBACK_HOSTNAMES.has(hostname);

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** A full MagicDNS name: `<machine>.<tailnet>.ts.net`, lowercase. */
export const isTailnetHostname = (hostname: string): boolean => {
  if (hostname.length > 253 || !hostname.endsWith('.ts.net')) return false;
  const labels = hostname.split('.');
  return labels.length >= 4 && labels.every((label) => LABEL.test(label));
};

/**
 * The hostname in what the user typed (`my-mac.tail1234.ts.net`, or the https address
 * `tailscale serve` printed), or null when it isn't a full tailnet name.
 */
export const parseTailnetHost = (input: string): string | null => {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  let hostname: string;
  try {
    hostname = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return null;
  }
  return isTailnetHostname(hostname) ? hostname : null;
};

/** The stored setting, or null when it's missing or not a tailnet name. */
export const storedTailnetHost = (value: unknown): string | null =>
  typeof value === 'string' && isTailnetHostname(value) ? value : null;

export interface GuardRequest {
  readonly hostname: string;
  readonly pathname: string;
  /** Header lookup, as `Headers.get`. */
  readonly header: (name: string) => string | null;
}

/** Whether the request needs the tailnet setting: its hostname isn't loopback. */
export const isRemoteRequest = (request: Pick<GuardRequest, 'hostname'>): boolean => !isLoopbackHostname(request.hostname);

/**
 * Whether the guard lets a request through. `tailnetHost` is the stored setting (null when off);
 * it's only read for a request that isn't on loopback.
 */
export const allowRequest = (request: GuardRequest, tailnetHost: string | null, api: { readonly basePath: string; readonly localHeader: string }): boolean => {
  if (isRemoteRequest(request)) {
    if (tailnetHost === null || request.hostname !== tailnetHost) return false;
    if (request.header(FUNNEL_HEADER) !== null) return false;
  }
  return !request.pathname.startsWith(api.basePath) || request.header(api.localHeader) === '1';
};
