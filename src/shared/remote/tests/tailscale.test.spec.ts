import { describe, it, expect } from 'vitest';
import { checkTailscale, linkIn, parseServe, parseStatus } from '../tailscale';

const HOST = 'jamies-macbook-pro.tailfdecbe.ts.net';

const status = (over: Record<string, unknown> = {}): string => JSON.stringify({
  BackendState: 'Running',
  Self: { DNSName: `${HOST}.`, Online: true },
  CertDomains: [HOST],
  ...over
});

/** What `tailscale serve --bg 7369` leaves, as `tailscale serve status --json` prints it. */
const served = (proxy = 'http://127.0.0.1:7369', extra: Record<string, unknown> = {}): string => JSON.stringify({
  TCP: { '443': { HTTPS: true } },
  Web: { [`${HOST}:443`]: { Handlers: { '/': { Proxy: proxy }, ...extra } } }
});

const check = (statusOut: string, serve?: string) =>
  checkTailscale({ cli: '/usr/local/bin/tailscale', status: { ok: true, stdout: statusOut }, serve, port: 7369 });

describe('parseStatus', () => {
  it('reads the state, the name without its dot, and the certificate names', () => {
    expect(parseStatus(status())).toEqual({ backendState: 'Running', hostname: HOST, certDomains: [HOST] });
    expect(parseStatus('not json')).toBeNull();
  });
});

describe('parseServe', () => {
  it('sees Remry shared at the root of the address', () => {
    expect(parseServe(served(), HOST, 7369)).toEqual({ serving: 'remry', onlyRemry: true, funnel: false });
    expect(parseServe(served('localhost:7369'), HOST, 7369).serving).toBe('remry');
  });

  it('tells Remry on another port, or something else, apart', () => {
    expect(parseServe(served('http://127.0.0.1:5173'), HOST, 7369).serving).toBe('other');
    expect(parseServe(served('http://127.0.0.1:7369/sub'), HOST, 7369).serving).toBe('other');
    expect(parseServe(JSON.stringify({ Web: { [`${HOST}:443`]: { Handlers: { '/grafana': { Proxy: 'http://127.0.0.1:3000' } } } } }), HOST, 7369).serving).toBe('other');
  });

  it('notices other paths beside Remry, and Funnel', () => {
    expect(parseServe(served('http://127.0.0.1:7369', { '/x': { Proxy: 'http://127.0.0.1:9000' } }), HOST, 7369)).toMatchObject({ serving: 'remry', onlyRemry: false });
    expect(parseServe(JSON.stringify({ ...JSON.parse(served()), AllowFunnel: { [`${HOST}:443`]: true } }), HOST, 7369).funnel).toBe(true);
  });

  it('reads nothing served from empty output', () => {
    expect(parseServe('', HOST, 7369)).toEqual({ serving: 'off', onlyRemry: false, funnel: false });
    expect(parseServe('{}', HOST, 7369).serving).toBe('off');
  });
});

describe('checkTailscale', () => {
  it('walks the states in order', () => {
    expect(checkTailscale({ cli: null, status: { ok: false, detail: '' }, port: 7369 })).toEqual({ state: 'missing' });
    expect(checkTailscale({ cli: 'ts', status: { ok: false, detail: 'failed to connect to local Tailscale service' }, port: 7369 }).state).toBe('not-running');
    expect(check(status({ BackendState: 'NeedsLogin', Self: { DNSName: '' } })).state).toBe('signed-out');
    expect(check(status({ BackendState: 'Stopped' })).state).toBe('disconnected');
    expect(check(status({ CertDomains: null }))).toEqual({ state: 'no-https', hostname: HOST });
    expect(check(status(), '')).toMatchObject({ state: 'ready', hostname: HOST, serving: 'off' });
    expect(check(status(), served())).toMatchObject({ state: 'ready', serving: 'remry', onlyRemry: true });
  });
});

describe('unreadable output', () => {
  it('reads a status past warning lines around it', () => {
    expect(check(`Warning: client version "1.90" != tailscaled server version "1.88"\n${status()}\n`).state).toBe('ready');
  });

  it('says what came back when it is not a status', () => {
    expect(check('')).toEqual({ state: 'unreadable', cli: '/usr/local/bin/tailscale', detail: 'it printed nothing' });
    expect(check('The Tailscale app is starting')).toMatchObject({ state: 'unreadable', detail: 'it printed "The Tailscale app is starting"' });
  });
});

describe('linkIn', () => {
  it('finds the page Tailscale says turns a feature on', () => {
    expect(linkIn('Serve is not enabled on your tailnet.\n\n         https://login.tailscale.com/f/serve?node=abc\n')).toBe('https://login.tailscale.com/f/serve?node=abc');
    expect(linkIn('Serve started')).toBeNull();
  });
});
