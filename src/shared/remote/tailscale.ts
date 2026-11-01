// Reading the user's own Tailscale, so the Other devices page can set up tailnet access in one
// step: is Tailscale installed, connected and signed in, are HTTPS certificates on for the
// tailnet, and is this computer already sharing Remry with `tailscale serve`? Pure: the server
// side runs `tailscale status --json` and `tailscale serve status --json` and hands their output
// here. Field names follow Tailscale's ipnstate.Status and ipn.ServeConfig.

/** The desktop app's port (cli/app-ports.ts APP_PORT), which other devices are given. */
export const DEFAULT_APP_PORT = 7369;

/** Where the tailnet's HTTPS certificates are turned on. */
export const TAILSCALE_HTTPS_SETTINGS = 'https://login.tailscale.com/admin/dns';
export const TAILSCALE_DOWNLOAD = 'https://tailscale.com/download';

/** What `tailscale serve` is doing at this computer's https://<name>/. */
export type ServeState = 'off' | 'remry' | 'other';

export type TailscaleCheck =
  | { readonly state: 'missing' }
  /** Installed, but the CLI couldn't reach Tailscale: the app isn't open. */
  | { readonly state: 'not-running'; readonly detail: string }
  | { readonly state: 'signed-out' }
  | { readonly state: 'disconnected' }
  | { readonly state: 'no-https'; readonly hostname: string }
  | {
      readonly state: 'ready';
      readonly hostname: string;
      readonly serving: ServeState;
      /** Only Remry is served on port 443, so turning it off removes nothing else. */
      readonly onlyRemry: boolean;
      /** Funnel is on for that address: Remry refuses its requests, but say so. */
      readonly funnel: boolean;
    };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export interface TailscaleStatus {
  readonly backendState: string;
  /** This computer's MagicDNS name, without the trailing dot, or null before sign-in. */
  readonly hostname: string | null;
  readonly certDomains: readonly string[];
}

/** `tailscale status --json`, or null when it isn't that. */
export const parseStatus = (text: string): TailscaleStatus | null => {
  const data = parseJson(text);
  if (!isRecord(data) || typeof data['BackendState'] !== 'string') return null;
  const self = isRecord(data['Self']) ? data['Self'] : {};
  const dnsName = typeof self['DNSName'] === 'string' ? self['DNSName'].replace(/\.$/, '').toLowerCase() : '';
  const certDomains = Array.isArray(data['CertDomains']) ? data['CertDomains'].filter((d): d is string => typeof d === 'string') : [];
  return { backendState: data['BackendState'], hostname: dnsName || null, certDomains };
};

/** The address a serve handler proxies to is this port on loopback. */
const proxiesTo = (proxy: string, port: number): boolean => {
  try {
    const url = new URL(/^[a-z+]+:\/\//.test(proxy) ? proxy : `http://${proxy}`);
    return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && Number(url.port) === port && url.pathname === '/';
  } catch {
    return false;
  }
};

export interface ServeSummary {
  readonly serving: ServeState;
  readonly onlyRemry: boolean;
  readonly funnel: boolean;
}

/** `tailscale serve status --json`: what https://<hostname>/ serves. Empty output means nothing. */
export const parseServe = (text: string, hostname: string, port: number): ServeSummary => {
  const data = parseJson(text.trim() || '{}');
  const config = isRecord(data) ? data : {};
  const hostPort = `${hostname}:443`;
  const web = isRecord(config['Web']) ? config['Web'] : {};
  const site = isRecord(web[hostPort]) ? web[hostPort] : null;
  const handlers = site && isRecord(site['Handlers']) ? site['Handlers'] : {};
  const root = isRecord(handlers['/']) ? handlers['/'] : null;
  const funnel = isRecord(config['AllowFunnel']) && config['AllowFunnel'][hostPort] === true;
  if (!root) return { serving: Object.keys(handlers).length > 0 ? 'other' : 'off', onlyRemry: false, funnel };
  const ours = typeof root['Proxy'] === 'string' && proxiesTo(root['Proxy'], port);
  return { serving: ours ? 'remry' : 'other', onlyRemry: ours && Object.keys(handlers).length === 1, funnel };
};

export interface CheckInputs {
  /** Where the tailscale CLI is, or null when it isn't installed. */
  readonly cli: string | null;
  /** `tailscale status --json`: its output, or why it failed. */
  readonly status: { readonly ok: true; readonly stdout: string } | { readonly ok: false; readonly detail: string };
  /** `tailscale serve status --json`, asked only once the status is ready. */
  readonly serve?: string;
  readonly port: number;
}

/** What state Tailscale is in, from the CLI's output. */
export const checkTailscale = (i: CheckInputs): TailscaleCheck => {
  if (!i.cli) return { state: 'missing' };
  if (!i.status.ok) return { state: 'not-running', detail: i.status.detail };
  const status = parseStatus(i.status.stdout);
  if (!status) return { state: 'not-running', detail: 'Tailscale gave an answer Remry could not read.' };
  if (status.backendState === 'NeedsLogin' || status.backendState === 'NeedsMachineAuth' || status.backendState === 'NoState') return { state: 'signed-out' };
  if (status.backendState !== 'Running' || !status.hostname) return { state: 'disconnected' };
  if (!status.certDomains.includes(status.hostname)) return { state: 'no-https', hostname: status.hostname };
  return { state: 'ready', hostname: status.hostname, ...parseServe(i.serve ?? '', status.hostname, i.port) };
};

/** Where the tailscale CLI may be beyond PATH: the Mac app's own binary works as the CLI. */
export const tailscaleCandidates = (platform: string): readonly string[] => {
  if (platform === 'darwin') return ['/Applications/Tailscale.app/Contents/MacOS/Tailscale'];
  if (platform === 'win32') return ['C:\\Program Files\\Tailscale\\tailscale.exe'];
  return ['/usr/bin/tailscale', '/usr/sbin/tailscale'];
};

/** A link in what `tailscale serve` printed (the page that turns a feature on), if any. */
export const linkIn = (output: string): string | null => output.match(/https:\/\/login\.tailscale\.com\/\S+/)?.[0] ?? null;
