// What `bun run setup` does, decided from the current state. Pure, so it can be
// tested without touching ~/.claude, PATH or the claude CLI.

export const MARKETPLACE = 'remry';
export const PLUGIN_ID = `remry@${MARKETPLACE}`;
/** The marketplaces and plugins under earlier names (Wonos, Working Notes), which setup replaces. */
export const LEGACY_MARKETPLACES: readonly string[] = ['wonos', 'working-notes'];
export const LEGACY_PLUGIN_IDS: readonly string[] = LEGACY_MARKETPLACES.map((name) => `${name}@${name}`);

export interface ClaudePlugins {
  /** Marketplace names from `claude plugin marketplace list`. */
  readonly marketplaces: readonly string[];
  /** Plugin ids (`name@marketplace`) from `claude plugin list`. */
  readonly plugins: readonly string[];
}

/** What is at the PATH link location now. */
export type BinLink =
  | { readonly kind: 'missing' }
  | { readonly kind: 'symlink'; readonly target: string }
  | { readonly kind: 'other' };

export interface SetupState {
  /** Absolute path of this clone. */
  readonly repoDir: string;
  /** `<data dir>/app-path`, which the plugin's `remry` shim reads. */
  readonly pointerFile: string;
  /** The pointer file's contents, or null if it doesn't exist. */
  readonly pointer: string | null;
  /** `<Bun's global bin dir>/remry`, which puts the CLI on PATH. */
  readonly binLinkPath: string;
  readonly binLink: BinLink;
  /** Whether the directory holding binLinkPath is on PATH. */
  readonly binDirOnPath: boolean;
  /** `~/.claude/skills/working-notes`, where the old installer linked the skill. */
  readonly legacySkillPath: string;
  /** The absolute target of that path if it's a symlink, otherwise null. */
  readonly legacySkillTarget: string | null;
  /** What the claude CLI reports, or null if `claude` isn't on PATH. */
  readonly claude: ClaudePlugins | null;
}

export type SetupStep =
  | { readonly kind: 'write'; readonly path: string; readonly contents: string }
  | { readonly kind: 'remove'; readonly path: string }
  | { readonly kind: 'link'; readonly path: string; readonly target: string }
  | { readonly kind: 'pack'; readonly pluginDir: string; readonly output: string }
  | { readonly kind: 'claude'; readonly args: readonly string[] }
  | { readonly kind: 'note'; readonly message: string };

export interface RepoPaths {
  readonly cli: string;
  readonly pluginDir: string;
  /** The plugin zipped for Claude desktop (Chat and Cowork). */
  readonly pluginZip: string;
}

export const repoPaths = (repoDir: string): RepoPaths => ({
  cli: `${repoDir}/bin/remry`,
  pluginDir: `${repoDir}/plugin`,
  pluginZip: `${repoDir}/dist/remry.zip`
});

const isInside = (path: string, dir: string): boolean => path === dir || path.startsWith(`${dir}/`);

const shellQuote = (arg: string): string => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`);

const legacyLink = (s: SetupState): readonly SetupStep[] =>
  s.legacySkillTarget !== null && isInside(s.legacySkillTarget, s.repoDir) ? [{ kind: 'remove', path: s.legacySkillPath }] : [];

const binLinkSteps = (s: SetupState): readonly SetupStep[] => {
  const { cli } = repoPaths(s.repoDir);
  const link: SetupStep = { kind: 'link', path: s.binLinkPath, target: cli };
  const dir = s.binLinkPath.slice(0, s.binLinkPath.lastIndexOf('/'));
  const onPath: readonly SetupStep[] = s.binDirOnPath ? [] : [{ kind: 'note', message: `${dir} isn't on your PATH. Add it to run \`remry\` in a terminal.` }];
  const occupied: SetupStep = { kind: 'note', message: `${s.binLinkPath} already exists and isn't a Remry link, so it was left alone. Run ${cli} directly instead.` };
  switch (s.binLink.kind) {
    case 'missing':
      return [link, ...onPath];
    case 'symlink':
      if (s.binLink.target === cli) return onPath;
      // Another clone's link is ours to move; some other package's `remry` isn't.
      return s.binLink.target.endsWith('/bin/remry') && !s.binLink.target.includes('/node_modules/') ? [link, ...onPath] : [occupied];
    case 'other':
      return [occupied];
  }
};

export const planInstall = (s: SetupState): readonly SetupStep[] => {
  const { pluginDir, pluginZip } = repoPaths(s.repoDir);
  const pointer: readonly SetupStep[] = s.pointer === s.repoDir ? [] : [{ kind: 'write', path: s.pointerFile, contents: s.repoDir }];
  const local: readonly SetupStep[] = [...pointer, ...binLinkSteps(s), ...legacyLink(s), { kind: 'pack', pluginDir, output: pluginZip }];
  const addMarketplace = ['plugin', 'marketplace', 'add', s.repoDir];
  const installPlugin = ['plugin', 'install', PLUGIN_ID];

  if (!s.claude) {
    const commands = [addMarketplace, installPlugin].map((args) => `  claude ${args.map(shellQuote).join(' ')}`).join('\n');
    return [...local, { kind: 'note', message: `claude isn't on PATH. To install the plugin in Claude Code, run:\n${commands}` }];
  }

  const marketplace = s.claude.marketplaces.includes(MARKETPLACE) ? ['plugin', 'marketplace', 'update', MARKETPLACE] : addMarketplace;
  const plugin = s.claude.plugins.includes(PLUGIN_ID) ? ['plugin', 'update', PLUGIN_ID] : installPlugin;
  return [...local, ...legacyPlugin(s.claude), { kind: 'claude', args: marketplace }, { kind: 'claude', args: plugin }];
};

/** Removes the plugins and marketplaces from before the renames, so Claude doesn't run two. */
const legacyPlugin = (claude: ClaudePlugins | null): readonly SetupStep[] => [
  ...LEGACY_PLUGIN_IDS.filter((id) => claude?.plugins.includes(id)).map((id): SetupStep => ({ kind: 'claude', args: ['plugin', 'uninstall', id] })),
  ...LEGACY_MARKETPLACES.filter((name) => claude?.marketplaces.includes(name)).map(
    (name): SetupStep => ({ kind: 'claude', args: ['plugin', 'marketplace', 'remove', name] })
  )
];

export const planUninstall = (s: SetupState): readonly SetupStep[] => [
  ...(s.claude?.plugins.includes(PLUGIN_ID) ? [{ kind: 'claude', args: ['plugin', 'uninstall', PLUGIN_ID] } as const] : []),
  ...(s.claude?.marketplaces.includes(MARKETPLACE) ? [{ kind: 'claude', args: ['plugin', 'marketplace', 'remove', MARKETPLACE] } as const] : []),
  ...legacyPlugin(s.claude),
  // Another clone may have claimed the pointer or the PATH link since; leave those alone.
  ...(s.pointer === s.repoDir ? [{ kind: 'remove', path: s.pointerFile } as const] : []),
  ...(s.binLink.kind === 'symlink' && s.binLink.target === repoPaths(s.repoDir).cli ? [{ kind: 'remove', path: s.binLinkPath } as const] : []),
  ...legacyLink(s)
];
