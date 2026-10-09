// The hourly backup LaunchAgent (macOS).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { appDataDir, appLogsDir } from '$shared/settings/server/app-dirs';
import { ok, err, type Result } from '$shared/utils/result';

export const LABEL = 'dev.jweatherby.remry.backup';
/** The agent's labels before the renames to Remry and Wonos. */
export const LEGACY_LABELS: readonly string[] = ['dev.jweatherby.wonos.backup', 'dev.jweatherby.working-notes.backup'];

/** What the LaunchAgent runs. */
export interface BackupCommand {
  readonly programArguments: readonly string[];
  readonly workingDirectory: string;
  readonly path: string;
}

export interface PlistOptions extends BackupCommand {
  readonly label: string;
  readonly logFile: string;
  readonly intervalSeconds: number;
}

export interface BackupCommandInputs {
  /** The standalone binary to run, when this is a release rather than a clone. */
  readonly standaloneBinary: string | null;
  readonly dataDir: string;
  readonly bunPath: string;
  readonly repoDir: string;
}

/**
 * Pure. A release runs its binary through `<data dir>/App/current`, which the plugin
 * shim repoints on every update; a clone runs the backup script with Bun.
 */
export const backupCommand = (i: BackupCommandInputs): BackupCommand =>
  i.standaloneBinary
    ? { programArguments: [i.standaloneBinary, 'backup'], workingDirectory: i.dataDir, path: '/usr/bin:/bin' }
    : { programArguments: [i.bunPath, 'scripts/backup/main.ts'], workingDirectory: i.repoDir, path: `${dirname(i.bunPath)}:/usr/local/bin:/usr/bin:/bin` };

const xml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const renderPlist = (o: PlistOptions): string => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(o.label)}</string>
  <key>ProgramArguments</key>
  <array>
${o.programArguments.map((arg) => `    <string>${xml(arg)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(o.workingDirectory)}</string>
  <key>StartInterval</key>
  <integer>${o.intervalSeconds}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>LowPriorityIO</key>
  <true/>
  <key>Nice</key>
  <integer>10</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xml(o.path)}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${xml(o.logFile)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(o.logFile)}</string>
</dict>
</plist>
`;

export const plistPath = (label = LABEL): string => join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);

/** What this process would schedule: its release binary (through App/current), or this clone's backup script. */
export const thisBackupCommand = (): BackupCommand => {
  // A release runs through App/current, which the plugin shim repoints on every update.
  const current = join(appDataDir(), 'App', 'current', process.platform === 'win32' ? 'remry.exe' : 'remry');
  return backupCommand({
    standaloneBinary: process.env['REMRY_STANDALONE'] === '1' ? (existsSync(current) ? current : process.execPath) : null,
    dataDir: appDataDir(),
    // The Homebrew symlink survives `brew upgrade`; process.execPath points into a versioned Cellar folder.
    bunPath: Bun.which('bun') ?? process.execPath,
    repoDir: setupClone() ?? resolve(import.meta.dir, '..', '..')
  });
};

/**
 * The clone `bun run setup` points the plugin at (`<data dir>/app-path`). The agent
 * runs that one, so a second clone or a git worktree never takes the backups over.
 */
const setupClone = (): string | null => {
  try {
    const path = readFileSync(join(appDataDir(), 'app-path'), 'utf8').trim();
    return path && existsSync(join(path, 'scripts', 'backup', 'main.ts')) ? path : null;
  } catch {
    return null;
  }
};

export const backupLogFile = (): string => resolve(appLogsDir(), 'backup.log');

const domain = (): string => `gui/${process.getuid?.() ?? 501}`;

export const installAgent = async (
  command: BackupCommand,
  logFile: string
): Promise<Result<{ readonly plist: string }>> => {
  if (platform() !== 'darwin') return err(new Error('The backup LaunchAgent is macOS-only; schedule `remry backup` with cron instead'));

  const plist = plistPath();
  await mkdir(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });
  await mkdir(dirname(logFile), { recursive: true });
  await writeFile(plist, renderPlist({ ...command, label: LABEL, logFile, intervalSeconds: 3600 }));

  spawnSync('launchctl', ['bootout', `${domain()}/${LABEL}`]);
  const loaded = spawnSync('launchctl', ['bootstrap', domain(), plist], { encoding: 'utf8' });
  if (loaded.status !== 0) return err(new Error(`launchctl bootstrap failed: ${loaded.stderr.trim()}`));
  return ok({ plist });
};

export const uninstallAgent = async (label = LABEL): Promise<Result<{ readonly removed: boolean }>> => {
  if (platform() !== 'darwin') return ok({ removed: false });
  spawnSync('launchctl', ['bootout', `${domain()}/${label}`]);
  await rm(plistPath(label), { force: true });
  return ok({ removed: true });
};

/**
 * Replaces the agents from before the renames, which run an old binary against the old
 * data folder, with this one. Nothing to do if there's none.
 */
export const replaceLegacyAgent = async (): Promise<Result<{ readonly replaced: boolean }>> => {
  // Tests and test-data dev servers must never rewrite the user's real LaunchAgent.
  if (process.env['APP_ENV'] === 'test') return ok({ replaced: false });
  const legacy = LEGACY_LABELS.filter((label) => existsSync(plistPath(label)));
  if (platform() !== 'darwin' || legacy.length === 0) return ok({ replaced: false });
  for (const label of legacy) await uninstallAgent(label);
  const installed = await installAgent(thisBackupCommand(), backupLogFile());
  return installed.ok ? ok({ replaced: true }) : installed;
};
