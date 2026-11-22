// Hands an app page over to the desktop app's window (see handoff.ts).

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { settings } from '$shared/settings/server/index.server';
import { DESKTOP_MARKER_FILE, deepLink, desktopTakesLinks, handoffCommand, type HandoffHost } from './handoff';

const TIMEOUT_MS = 5000;

/** This process: its platform, whether it's a release, and whether the desktop app is recorded (checked each time). */
const thisHost = (): HandoffHost => ({
  platform: process.platform,
  standalone: process.env['REMRY_STANDALONE'] === '1',
  desktopInstalled: existsSync(resolve(settings.dataDir, DESKTOP_MARKER_FILE))
});

/** Whether a `remry://` link reaches the desktop app from here, so links can skip the browser. */
export const desktopLinksWork = (): boolean => desktopTakesLinks(thisHost());

/** Opens `target` (`/app/...`) in the desktop app. False when there's no desktop app, or the hand-over failed. */
export const handOff = (target: string): Promise<boolean> => {
  const command = handoffCommand(deepLink(target), thisHost());
  if (!command) return Promise.resolve(false);
  const [file, ...args] = command as [string, ...string[]];
  return new Promise((done) => {
    const timer = setTimeout(() => done(false), TIMEOUT_MS);
    const child = spawn(file, args, { stdio: 'ignore' });
    child.on('error', () => { clearTimeout(timer); done(false); });
    child.on('exit', (code) => { clearTimeout(timer); done(code === 0); });
  });
};
