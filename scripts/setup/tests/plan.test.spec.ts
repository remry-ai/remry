import { describe, it, expect } from 'vitest';
import { PLUGIN_ID, planInstall, planUninstall, type SetupState } from '../plan';

const repo = '/Users/me/code/remry';
const cli = `${repo}/bin/remry`;
const pack = { kind: 'pack', pluginDir: `${repo}/plugin`, output: `${repo}/dist/remry.zip` } as const;

const base: SetupState = {
  repoDir: repo,
  pointerFile: '/data/app-path',
  pointer: null,
  binLinkPath: '/Users/me/.bun/bin/remry',
  binLink: { kind: 'missing' },
  binDirOnPath: true,
  legacySkillPath: '/Users/me/.claude/skills/working-notes',
  legacySkillTarget: null,
  claude: { marketplaces: [], plugins: [] }
};

const installed: SetupState = {
  ...base,
  pointer: repo,
  binLink: { kind: 'symlink', target: cli },
  claude: { marketplaces: ['remry'], plugins: [PLUGIN_ID] }
};

describe('planInstall', () => {
  it('writes the pointer, links remry, builds the zip, adds the marketplace and installs on a fresh machine', () => {
    expect(planInstall(base)).toEqual([
      { kind: 'write', path: '/data/app-path', contents: repo },
      { kind: 'link', path: '/Users/me/.bun/bin/remry', target: cli },
      pack,
      { kind: 'claude', args: ['plugin', 'marketplace', 'add', repo] },
      { kind: 'claude', args: ['plugin', 'install', PLUGIN_ID] }
    ]);
  });

  it('only rebuilds the zip and updates when everything is already in place', () => {
    expect(planInstall(installed)).toEqual([
      pack,
      { kind: 'claude', args: ['plugin', 'marketplace', 'update', 'remry'] },
      { kind: 'claude', args: ['plugin', 'update', PLUGIN_ID] }
    ]);
  });

  it("moves another clone's PATH link, but leaves other commands named remry alone", () => {
    const moved = planInstall({ ...installed, binLink: { kind: 'symlink', target: '/Users/me/old/remry/bin/remry' } });
    expect(moved).toContainEqual({ kind: 'link', path: '/Users/me/.bun/bin/remry', target: cli });

    for (const binLink of [{ kind: 'other' }, { kind: 'symlink', target: '/Users/me/.bun/install/global/node_modules/remry/bin/remry' }] as const) {
      const steps = planInstall({ ...installed, binLink });
      expect(steps.some((s) => s.kind === 'link')).toBe(false);
      expect(steps).toContainEqual({ kind: 'note', message: expect.stringContaining("isn't a Remry link") });
    }
  });

  it("says when the link's directory isn't on PATH", () => {
    expect(planInstall({ ...installed, binDirOnPath: false })).toContainEqual({ kind: 'note', message: expect.stringContaining("/Users/me/.bun/bin isn't on your PATH") });
  });

  it('removes the old skill symlink only when it points into this repo', () => {
    const ours = planInstall({ ...base, legacySkillTarget: `${repo}/skills/remry` });
    expect(ours).toContainEqual({ kind: 'remove', path: base.legacySkillPath });

    const theirs = planInstall({ ...base, legacySkillTarget: '/Users/me/code/remry-fork/skills/remry' });
    expect(theirs.some((s) => s.kind === 'remove')).toBe(false);
  });

  it('prints the commands, quoted, when claude is not on PATH', () => {
    const steps = planInstall({ ...base, repoDir: '/Users/me/My Code/remry', claude: null });
    expect(steps.some((s) => s.kind === 'claude')).toBe(false);
    const note = steps.find((s) => s.kind === 'note');
    expect(note?.kind === 'note' && note.message).toContain(`claude plugin marketplace add '/Users/me/My Code/remry'`);
    expect(note?.kind === 'note' && note.message).toContain(`claude plugin install ${PLUGIN_ID}`);
  });
});

describe('planUninstall', () => {
  it('uninstalls the plugin and marketplace and removes our pointer and PATH link', () => {
    expect(planUninstall(installed)).toEqual([
      { kind: 'claude', args: ['plugin', 'uninstall', PLUGIN_ID] },
      { kind: 'claude', args: ['plugin', 'marketplace', 'remove', 'remry'] },
      { kind: 'remove', path: '/data/app-path' },
      { kind: 'remove', path: '/Users/me/.bun/bin/remry' }
    ]);
  });

  it('keeps a pointer or link that another clone owns, and does nothing when nothing is installed', () => {
    expect(planUninstall({ ...base, pointer: '/elsewhere/remry', binLink: { kind: 'symlink', target: '/elsewhere/remry/bin/remry' } })).toEqual([]);
  });
});

describe('the plugins from before the renames to Wonos and Remry', () => {
  const legacy: SetupState = {
    ...installed,
    claude: { marketplaces: ['working-notes', 'wonos', 'remry'], plugins: ['working-notes@working-notes', 'wonos@wonos', PLUGIN_ID] }
  };

  it('are removed on install, before the new one is updated', () => {
    const claude = planInstall(legacy).flatMap((step) => (step.kind === 'claude' ? [step.args.join(' ')] : []));
    expect(claude).toEqual([
      'plugin uninstall wonos@wonos',
      'plugin uninstall working-notes@working-notes',
      'plugin marketplace remove wonos',
      'plugin marketplace remove working-notes',
      'plugin marketplace update remry',
      `plugin update ${PLUGIN_ID}`
    ]);
  });

  it('are removed on uninstall too', () => {
    const claude = planUninstall(legacy).flatMap((step) => (step.kind === 'claude' ? [step.args.join(' ')] : []));
    expect(claude).toContain('plugin uninstall wonos@wonos');
    expect(claude).toContain('plugin marketplace remove wonos');
    expect(claude).toContain('plugin uninstall working-notes@working-notes');
    expect(claude).toContain('plugin marketplace remove working-notes');
  });
});
