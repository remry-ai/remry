// Writes and removes the start-at-login LaunchAgent (see login-agent.ts). It only writes the
// file: launchd loads it at the next login. Turning it off removes the file and leaves a
// running server alone, since stopping it would cut off the page that asked.

import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { appDataDir, appLogsDir } from '../settings/server/app-dirs';
import { ok, err, type Result } from '../utils/result';
import { LOGIN_AGENT_LABEL, loginUnsupportedReason, renderLoginPlist, type StartAtLogin } from './login-agent';

const plistPath = (): string => join(homedir(), 'Library', 'LaunchAgents', `${LOGIN_AGENT_LABEL}.plist`);
const installedBinary = (): string => join(appDataDir(), 'App', 'current', 'remry');

const unsupportedReason = (): string | null =>
  loginUnsupportedReason({ platform: process.platform, installed: existsSync(installedBinary()), test: process.env['APP_ENV'] === 'test' });

export const startAtLoginStatus = (): StartAtLogin => {
  const reason = unsupportedReason();
  if (reason) return { supported: false, enabled: false, reason };
  return { supported: true, enabled: existsSync(plistPath()) };
};

export const setStartAtLogin = async (enabled: boolean): Promise<Result<StartAtLogin>> => {
  const reason = unsupportedReason();
  if (reason) return err(new Error(reason));
  if (enabled) {
    await mkdir(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });
    await mkdir(appLogsDir(), { recursive: true });
    await writeFile(plistPath(), renderLoginPlist({ binary: installedBinary(), workingDirectory: appDataDir(), logFile: join(appLogsDir(), 'app.log') }));
  } else {
    await rm(plistPath(), { force: true });
  }
  return ok(startAtLoginStatus());
};
