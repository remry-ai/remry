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
