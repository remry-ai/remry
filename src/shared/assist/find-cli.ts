// Finding an assistant's CLI on this computer, on macOS, Linux and Windows. Pure: the caller
// supplies the environment, the platform and the filesystem check.

export interface CliLookupEnv {
  readonly PATH?: string;
  readonly HOME?: string;
  /** Windows: `%APPDATA%`, where `npm install -g` puts its `.cmd` shims. */
  readonly APPDATA?: string;
  /** Windows: `%LOCALAPPDATA%`, where winget links its commands. */
  readonly LOCALAPPDATA?: string;
  /** Windows: the home folder. */
  readonly USERPROFILE?: string;
}

export type CliPlatform = 'posix' | 'win32';

/** Where installers put a CLI, for apps started with a minimal PATH. */
const posixFallbacks = (binary: string, home: string | undefined): readonly string[] => [
  ...(home ? [`${home}/.${binary}/local/${binary}`, `${home}/.local/bin/${binary}`, `${home}/.npm-global/bin/${binary}`] : []),
  `/opt/homebrew/bin/${binary}`,
  `/usr/local/bin/${binary}`
];

const winFallbackDirs = (env: CliLookupEnv): readonly string[] => [
  ...(env.USERPROFILE ? [`${env.USERPROFILE}\\.local\\bin`] : []),
  ...(env.APPDATA ? [`${env.APPDATA}\\npm`] : []),
  ...(env.LOCALAPPDATA ? [`${env.LOCALAPPDATA}\\Microsoft\\WinGet\\Links`] : [])
];

/** Windows runs `copilot.exe` or the `copilot.cmd` npm writes, never a bare `copilot`. */
const WIN_EXTENSIONS = ['.exe', '.cmd', '.bat'] as const;

export const findExecutable = (
  binary: string,
  env: CliLookupEnv,
  platform: CliPlatform,
  isExecutable: (path: string) => boolean
): string | null => {
  if (platform === 'win32') {
    const dirs = [
      ...(env.PATH ?? '').split(';').map((dir) => dir.trim().replace(/[\\/]+$/, '')).filter((dir) => dir !== ''),
      ...winFallbackDirs(env)
    ];
    return dirs.flatMap((dir) => WIN_EXTENSIONS.map((ext) => `${dir}\\${binary}${ext}`)).find(isExecutable) ?? null;
  }
  const onPath = (env.PATH ?? '')
    .split(':')
    .filter((dir) => dir !== '')
    .map((dir) => `${dir.replace(/\/+$/, '')}/${binary}`);
  return [...onPath, ...posixFallbacks(binary, env.HOME)].find(isExecutable) ?? null;
};

/**
 * One `cmd.exe /c` command line for a `.cmd` or `.bat` file, which Windows can only run through
 * cmd. Every argument is quoted; `"` and `%` can't be quoted safely for cmd, so they're refused
 * (callers pass long prompts in a file or on stdin, never as an argument).
 */
export const cmdCommandLine = (path: string, args: readonly string[]): string | null => {
  const all = [path, ...args];
  if (all.some((a) => a.includes('"') || a.includes('%') || /[\r\n]/.test(a))) return null;
  return `"${all.map((a) => `"${a}"`).join(' ')}"`;
};
