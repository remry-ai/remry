// What `bun run setup` does, decided from the current state. Pure, so it can be
// tested without touching ~/.claude, PATH or the claude CLI.

/**
 * The released plugin. Chat and Cowork get it from claude.ai, and Claude desktop checks it
 * for updates through Claude Code's `remry` marketplace, so that stays registered, from
 * GitHub. The plugin itself isn't installed in Claude Code: remry-dev is.
 */
export const MARKETPLACE = 'remry';
export const PLUGIN_ID = `remry@${MARKETPLACE}`;
export const MARKETPLACE_REPO = 'remry-ai/remry';
/**
 * What setup installs in Claude Code: this clone's plugin under its own name, from a
 * marketplace setup writes into dist/, so it isn't mistaken for the released `remry`.
 */
export const DEV_NAME = 'remry-dev';
export const DEV_PLUGIN_ID = `${DEV_NAME}@${DEV_NAME}`;
/**
 * The plugin folder's entries the dev copy is made of. Copied, not linked: Claude Code's
 * plugin cache leaves links out, so a linked skill went missing.
 */
export const DEV_PLUGIN_ENTRIES: readonly string[] = ['skills', 'scripts', '.mcp.json'];
/** The marketplaces and plugins under earlier names (Wonos, Working Notes), which setup replaces. */
export const LEGACY_MARKETPLACES: readonly string[] = ['wonos', 'working-notes'];
export const LEGACY_PLUGIN_IDS: readonly string[] = LEGACY_MARKETPLACES.map((name) => `${name}@${name}`);

export interface ClaudePlugins {
  /** Marketplace names from `claude plugin marketplace list`. */
  readonly marketplaces: readonly string[];
  /** Plugin ids (`name@marketplace`) from `claude plugin list`. */
  readonly plugins: readonly string[];
  /** The marketplaces added from a local folder (`"source": "directory"`). */
  readonly localMarketplaces: readonly string[];
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
  /** Writes the remry-dev marketplace into `dir`, its plugin a renamed copy of `pluginDir` (devMarketplaceFiles). */
  | { readonly kind: 'devMarketplace'; readonly dir: string; readonly pluginDir: string }
  | { readonly kind: 'claude'; readonly args: readonly string[] }
  | { readonly kind: 'note'; readonly message: string };

export interface RepoPaths {
  readonly cli: string;
  readonly pluginDir: string;
  /** The plugin zipped for Claude desktop (Chat and Cowork). */
  readonly pluginZip: string;
  /** The remry-dev marketplace setup writes for Claude Code. */
  readonly devMarketplace: string;
}

export const repoPaths = (repoDir: string): RepoPaths => ({
  cli: `${repoDir}/bin/remry`,
  pluginDir: `${repoDir}/plugin`,
  pluginZip: `${repoDir}/dist/remry.zip`,
  devMarketplace: `${repoDir}/dist/dev-marketplace`
});

export interface DevMarketplaceFiles {
  /** `<dir>/.claude-plugin/marketplace.json` */
  readonly marketplace: string;
  /** `<dir>/remry-dev/.claude-plugin/plugin.json`: the plugin's manifest, renamed. */
  readonly plugin: string;
}

/** The two files of the remry-dev marketplace, from the clone's plugin.json. */
export const devMarketplaceFiles = (manifest: Readonly<Record<string, unknown>>): DevMarketplaceFiles => {
  const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
  const description = 'Remry from this clone, for development.';
  return {
    marketplace: json({
      name: DEV_NAME,
      owner: { name: 'jweatherby' },
      metadata: { description },
      plugins: [{ name: DEV_NAME, source: `./${DEV_NAME}`, description, version: manifest['version'] }]
    }),
    plugin: json({ ...manifest, name: DEV_NAME })
  };
};

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
  const { pluginDir, pluginZip, devMarketplace } = repoPaths(s.repoDir);
  const pointer: readonly SetupStep[] = s.pointer === s.repoDir ? [] : [{ kind: 'write', path: s.pointerFile, contents: s.repoDir }];
  const local: readonly SetupStep[] = [
    ...pointer,
    ...binLinkSteps(s),
    ...legacyLink(s),
    { kind: 'pack', pluginDir, output: pluginZip },
    { kind: 'devMarketplace', dir: devMarketplace, pluginDir }
  ];
  const addMarketplace = ['plugin', 'marketplace', 'add', devMarketplace];
  const installPlugin = ['plugin', 'install', DEV_PLUGIN_ID];

  if (!s.claude) {
    const commands = [addMarketplace, installPlugin].map((args) => `  claude ${args.map(shellQuote).join(' ')}`).join('\n');
    return [...local, { kind: 'note', message: `claude isn't on PATH. To install the plugin in Claude Code, run:\n${commands}` }];
  }

  // Reinstalled each run: the version rarely changes between runs, and Claude Code only
  // refreshes its cached copy of the skill on a new version or a fresh install.
  const marketplace = s.claude.marketplaces.includes(DEV_NAME) ? ['plugin', 'marketplace', 'update', DEV_NAME] : addMarketplace;
  const plugin: readonly SetupStep[] = [
    ...(s.claude.plugins.includes(DEV_PLUGIN_ID) ? [{ kind: 'claude', args: ['plugin', 'uninstall', DEV_PLUGIN_ID] } as const] : []),
    { kind: 'claude', args: installPlugin }
  ];
  return [...local, ...legacyPlugin(s.claude), ...released(s.claude), { kind: 'claude', args: marketplace }, ...plugin];
};

/**
 * Removes the released `remry` plugin an earlier setup installed in Claude Code, so it
 * doesn't run beside remry-dev, and keeps its marketplace registered from GitHub (an
 * earlier setup added it from this clone's folder): without it, Claude desktop can't
 * check the released plugin for updates.
 */
const released = (claude: ClaudePlugins): readonly SetupStep[] => {
  const local = claude.localMarketplaces.includes(MARKETPLACE);
  return [
    ...(claude.plugins.includes(PLUGIN_ID) ? [{ kind: 'claude', args: ['plugin', 'uninstall', PLUGIN_ID] } as const] : []),
    ...(local ? [{ kind: 'claude', args: ['plugin', 'marketplace', 'remove', MARKETPLACE] } as const] : []),
    ...(local || !claude.marketplaces.includes(MARKETPLACE) ? [{ kind: 'claude', args: ['plugin', 'marketplace', 'add', MARKETPLACE_REPO] } as const] : [])
  ];
};

/** Removes the plugins and marketplaces from before the renames, so Claude doesn't run two. */
const legacyPlugin = (claude: ClaudePlugins | null): readonly SetupStep[] => [
  ...LEGACY_PLUGIN_IDS.filter((id) => claude?.plugins.includes(id)).map((id): SetupStep => ({ kind: 'claude', args: ['plugin', 'uninstall', id] })),
  ...LEGACY_MARKETPLACES.filter((name) => claude?.marketplaces.includes(name)).map(
    (name): SetupStep => ({ kind: 'claude', args: ['plugin', 'marketplace', 'remove', name] })
  )
];

export const planUninstall = (s: SetupState): readonly SetupStep[] => [
  ...(s.claude?.plugins.includes(DEV_PLUGIN_ID) ? [{ kind: 'claude', args: ['plugin', 'uninstall', DEV_PLUGIN_ID] } as const] : []),
  ...(s.claude?.marketplaces.includes(DEV_NAME) ? [{ kind: 'claude', args: ['plugin', 'marketplace', 'remove', DEV_NAME] } as const] : []),
  // The GitHub `remry` marketplace stays: Claude desktop checks the released plugin through it.
  ...legacyPlugin(s.claude),
  // Another clone may have claimed the pointer or the PATH link since; leave those alone.
  ...(s.pointer === s.repoDir ? [{ kind: 'remove', path: s.pointerFile } as const] : []),
  ...(s.binLink.kind === 'symlink' && s.binLink.target === repoPaths(s.repoDir).cli ? [{ kind: 'remove', path: s.binLinkPath } as const] : []),
  ...legacyLink(s)
];
