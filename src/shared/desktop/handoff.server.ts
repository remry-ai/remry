// Hands an app page over to the desktop app's window (see handoff.ts).

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { settings } from '$shared/settings/server/index.server';
import { DESKTOP_MARKER_FILE, deepLink, handoffCommand } from './handoff';

const TIMEOUT_MS = 5000;

/** Opens `target` (`/app/...`) in the desktop app. False when there's no desktop app, or the hand-over failed. */
export const handOff = (target: string): Promise<boolean> => {
  const command = handoffCommand(deepLink(target), {
    platform: process.platform,
    standalone: process.env['REMRY_STANDALONE'] === '1',
    desktopInstalled: existsSync(resolve(settings.dataDir, DESKTOP_MARKER_FILE))
  });
  if (!command) return Promise.resolve(false);
  const [file, ...args] = command as [string, ...string[]];
  return new Promise((done) => {
    const timer = setTimeout(() => done(false), TIMEOUT_MS);
    const child = spawn(file, args, { stdio: 'ignore' });
    child.on('error', () => { clearTimeout(timer); done(false); });
    child.on('exit', (code) => { clearTimeout(timer); done(code === 0); });
  });
};
