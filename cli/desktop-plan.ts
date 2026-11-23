// Pure planning for cli/desktop.ts: where the installed binary and Claude's
// configuration live, and how to add the Remry MCP server to that config.

import { posix, win32 } from 'node:path';
import { ok, err, type Result } from '../src/shared/utils/result';
import { dataDirFor, type AppDirsHost } from '../src/shared/settings/server/app-dirs';

/** The name the MCP server is registered under, as the plugin's .mcp.json does. */
export const MCP_SERVER_NAME = 'remry';
/** Its names before the renames (Wonos, Working Notes), which connecting replaces. */
export const LEGACY_MCP_SERVER_NAMES: readonly string[] = ['wonos', 'working-notes'];

/** Pure. Whether a command is a pre-rename binary of ours (`…/wono` or `…/wnotes`). */
const isLegacyBinary = (command: string): boolean => /(^|[\\/])(wono|wnotes)(\.exe)?$/i.test(command);

/** A server entry that runs a pre-rename binary (`…/wono mcp`), so ours to replace. */
const isLegacyEntry = (value: unknown): boolean => isObject(value) && typeof value['command'] === 'string' && isLegacyBinary(value['command']);

const pathFor = (host: AppDirsHost): typeof posix => (host.platform === 'win32' ? win32 : posix);

/** The installed binary every client should run: `<data dir>/App/current/remry`, which survives updates. */
export const installedBinary = (host: AppDirsHost): string =>
  pathFor(host).join(dataDirFor(host), 'App', 'current', host.platform === 'win32' ? 'remry.exe' : 'remry');

/** Where Claude desktop keeps its MCP servers. */
export const claudeDesktopConfigPath = (host: AppDirsHost): string => {
  const path = pathFor(host);
  if (host.platform === 'darwin') return path.join(host.home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  if (host.platform === 'win32') return path.join(host.env['APPDATA'] || path.join(host.home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  return path.join(host.env['XDG_CONFIG_HOME'] || path.join(host.home, '.config'), 'Claude', 'claude_desktop_config.json');
};

export interface McpServerEntry {
  readonly command: string;
  readonly args: readonly string[];
}

export type ConfigChange = 'added' | 'updated' | 'unchanged';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Claude desktop's config with the server set to `entry`, keeping everything else,
 * except pre-rename entries of ours under `legacyNames`. Refuses a file that isn't a
 * JSON object rather than overwriting it.
 */
export const withMcpServer = (
  existing: string | null,
  name: string,
  entry: McpServerEntry,
  legacyNames: readonly string[] = []
): Result<{ readonly text: string; readonly change: ConfigChange }> => {
  let config: unknown = {};
  if (existing?.trim()) {
    try {
      config = JSON.parse(existing);
    } catch (error) {
      return err(new Error(`Claude desktop's config isn't valid JSON (${error instanceof Error ? error.message : String(error)}). Fix or remove it, then connect again.`));
    }
  }
  if (!isObject(config)) return err(new Error("Claude desktop's config isn't a JSON object. Fix or remove it, then connect again."));
  const servers = config['mcpServers'] ?? {};
  if (!isObject(servers)) return err(new Error("Claude desktop's config has an mcpServers value that isn't an object. Fix it, then connect again."));

  const previous = servers[name];
  const dropped = legacyNames.filter((legacyName) => legacyName !== name && isLegacyEntry(servers[legacyName]));
  const dropLegacy = dropped.length > 0;
  const kept = Object.fromEntries(Object.entries(servers).filter(([key]) => !dropped.includes(key)));
  const change: ConfigChange =
    previous === undefined ? 'added' : JSON.stringify(previous) === JSON.stringify(entry) && !dropLegacy ? 'unchanged' : 'updated';
  const next = { ...config, mcpServers: { ...kept, [name]: { command: entry.command, args: [...entry.args] } } };
  return ok({ text: `${JSON.stringify(next, null, 2)}\n`, change });
};

/**
 * Pure. How `remry install` puts a release binary in place on this system:
 * - `link` (macOS): App/current points at the folder the binary is already in, inside the
 *   installed app. Nothing is copied, so what runs is the signed, notarized file the user
 *   installed, quarantine flag and all, and removing the app removes it.
 * - `copy` (Windows, Linux): the binary is copied into App/<version>. Windows can't replace an
 *   exe that's running, and Claude keeps MCP servers running, so the installer could never
 *   update a binary they run from the install folder. The per-user installer puts that folder
 *   under %LOCALAPPDATA% too, so a copy beside it changes nothing for allow-listing.
 */
export type InstallMode = 'link' | 'copy';

export const installModeFor = (platform: NodeJS.Platform): InstallMode => (platform === 'darwin' ? 'link' : 'copy');

/**
 * Pure. Why the app can't be linked from where it is now, or null when it can. A disk image
 * or a translocated copy (macOS runs a downloaded app that wasn't moved from a temporary,
 * read-only path) goes away when the app quits, and every client would lose the binary.
 */
export const unlinkableReason = (binaryPath: string): string | null => {
  if (binaryPath.includes('/AppTranslocation/')) {
    return 'Remry is running from where it was downloaded, which macOS keeps only while it runs. Move Remry to your Applications folder, then open it again.';
  }
  if (binaryPath.startsWith('/Volumes/')) {
    return 'Remry is running from a disk image or another drive. Drag it to your Applications folder, then open it from there.';
  }
  return null;
};

/** Pure. Where a release's VERSION and migrations sit: beside the binary, or in a macOS app's Contents/Resources. */
export const resourceDirsFor = (binaryDir: string, path: typeof posix | typeof win32 = posix): readonly string[] => [binaryDir, path.join(binaryDir, '..', 'Resources')];

/**
 * Pure. The App/<version> folders to delete after an install: every version folder except
 * the one App/current now uses and the one it used just before (a Claude session's MCP server
 * may still be running it). Staging folders and anything else are left alone.
 */
export const staleAppFolders = (
  entries: readonly string[],
  keep: readonly (string | null)[],
  isVersion: (name: string) => boolean
): readonly string[] => entries.filter((name) => isVersion(name) && !keep.includes(name));

/** Pure. The App/<version> folder name an App/current link points at, or null for anything else (a link into the app). */
export const versionFolderOf = (target: string | null, appDir: string, path: typeof posix | typeof win32 = posix): string | null => {
  if (target === null) return null;
  const absolute = path.isAbsolute(target) ? target : path.join(appDir, target);
  return path.dirname(path.normalize(absolute)) === path.normalize(appDir) ? path.basename(absolute) : null;
};

/**
 * Pure. Claude desktop's config without our server, when it runs `binary`. Anything else the
 * user registered under that name is theirs, and stays. Null when there's nothing to change.
 */
export const withoutMcpServer = (existing: string | null, name: string, binary: string): Result<string | null> => {
  if (!existing?.trim()) return ok(null);
  let config: unknown;
  try {
    config = JSON.parse(existing);
  } catch (error) {
    return err(new Error(`Claude desktop's config isn't valid JSON (${error instanceof Error ? error.message : String(error)}). Remove the "${name}" server from it by hand.`));
  }
  if (!isObject(config) || !isObject(config['mcpServers'])) return ok(null);
  const servers = config['mcpServers'];
  const entry = servers[name];
  if (!isObject(entry) || entry['command'] !== binary) return ok(null);
  const { [name]: _removed, ...rest } = servers;
  return ok(`${JSON.stringify({ ...config, mcpServers: rest }, null, 2)}\n`);
};
