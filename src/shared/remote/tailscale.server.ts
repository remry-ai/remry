// Runs the user's own `tailscale` CLI (see tailscale.ts): only `status --json`, `serve status
// --json`, `serve --bg --yes <port>` and `serve --https=443 off`, each with a timeout. The app
// makes no request itself; Tailscale's own daemon does, as it always does.

import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { findExecutable } from '../assist/find-cli';
import { setTailnetHost, tailnetAccess, type TailnetAccess } from './store.server';
import { ok, err, type Result } from '../utils/result';
import { checkTailscale, linkIn, tailscaleCandidates, TAILSCALE_DOWNLOAD, TAILSCALE_HTTPS_SETTINGS, type TailscaleCheck } from './tailscale';

const TIMEOUT_MS = 15_000;

const isExecutable = (path: string): boolean => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

export const locateTailscale = (): string | null =>
  tailscaleCandidates(process.platform).find(isExecutable) ??
  findExecutable('tailscale', { PATH: process.env.PATH ?? process.env.Path, HOME: process.env.HOME, LOCALAPPDATA: process.env.LOCALAPPDATA, USERPROFILE: process.env.USERPROFILE }, process.platform === 'win32' ? 'win32' : 'posix', isExecutable);

interface Run {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const run = (cli: string, args: readonly string[]): Promise<Run> =>
  new Promise((done) => {
    const child = spawn(cli, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    // A serve waiting for a feature to be turned on blocks; what it printed says where.
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.on('error', (error) => { clearTimeout(timer); done({ code: null, stdout, stderr: error.message }); });
    child.on('close', (code) => { clearTimeout(timer); done({ code, stdout, stderr }); });
  });

const lastLine = (text: string): string => text.trim().split('\n').at(-1)?.trim() ?? '';

/** Tailscale's state on this computer, as the page and Claude see it. */
export const readTailscale = async (port: number): Promise<TailscaleCheck> => {
  const cli = locateTailscale();
  if (!cli) return checkTailscale({ cli, status: { ok: false, detail: '' }, port });
  const status = await run(cli, ['status', '--json']);
  const first = checkTailscale({
    cli,
    status: status.code === 0 ? { ok: true, stdout: status.stdout } : { ok: false, detail: lastLine(status.stderr) || lastLine(status.stdout) },
    port
  });
  if (first.state !== 'ready') return first;
  const serve = await run(cli, ['serve', 'status', '--json']);
  return checkTailscale({ cli, status: { ok: true, stdout: status.stdout }, serve: serve.code === 0 ? serve.stdout : '', port });
};

/** What to do next, for a state that isn't ready. */
const notReady = (check: TailscaleCheck): string => {
  switch (check.state) {
    case 'missing': return `Tailscale isn't installed on this computer. Install it from ${TAILSCALE_DOWNLOAD}, sign in, then try again.`;
    case 'not-running': return `Tailscale is installed but isn't running. Open the Tailscale app, then try again.${check.detail ? ` (${check.detail})` : ''}`;
    case 'signed-out': return 'Tailscale is signed out. Sign in from its menu bar icon, then try again.';
    case 'disconnected': return 'Tailscale is disconnected. Connect it from its menu bar icon, then try again.';
    case 'no-https': return `HTTPS certificates are off for your tailnet. Turn on "HTTPS Certificates" at ${TAILSCALE_HTTPS_SETTINGS}, then try again.`;
    case 'ready': return '';
  }
};

/**
 * Shares the app on the tailnet: `tailscale serve --bg --yes <port>` unless it's already
 * shared, then saves this computer's tailnet name. Refuses to replace something else
 * Tailscale already serves at that address.
 */
export const shareOnTailnet = async (port: number): Promise<Result<TailnetAccess>> => {
  const check = await readTailscale(port);
  if (check.state !== 'ready') return err(new Error(notReady(check)));
  if (check.serving === 'other') {
    return err(new Error(`Tailscale already serves something else at https://${check.hostname}/. Run \`tailscale serve status\` to see it, and \`tailscale serve reset\` if you no longer need it.`));
  }
  if (check.serving === 'off') {
    const cli = locateTailscale();
    if (!cli) return err(new Error(notReady({ state: 'missing' })));
    const served = await run(cli, ['serve', '--bg', '--yes', String(port)]);
    const after = await readTailscale(port);
    if (after.state !== 'ready' || after.serving !== 'remry') {
      const output = `${served.stdout}\n${served.stderr}`;
      const link = linkIn(output);
      return err(new Error(link
        ? `Tailscale needs one more thing turned on for your tailnet first: open ${link}, then try again.`
        : `\`tailscale serve\` didn't start sharing Remry${lastLine(output) ? `: ${lastLine(output)}` : '.'}`));
    }
  }
  const saved = await setTailnetHost(check.hostname);
  return saved.ok ? ok(saved.value) : saved;
};

/**
 * Turns tailnet access off, then stops Tailscale sharing it when Remry is all it serves at that
 * address. Anything else the user serves there is left alone.
 */
export const stopSharing = async (port: number): Promise<Result<TailnetAccess>> => {
  const cleared = await setTailnetHost(null);
  if (!cleared.ok) return cleared;
  const check = await readTailscale(port);
  const cli = locateTailscale();
  if (cli && check.state === 'ready' && check.serving === 'remry' && check.onlyRemry) {
    await run(cli, ['serve', '--https=443', 'off']);
  }
  return ok(await tailnetAccess());
};
