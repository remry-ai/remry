#!/usr/bin/env bun
// Remry setup. Safe to re-run; do so after `git pull`.
//   bun run setup              point the plugin at this clone, put `remry` on PATH, build
//                              dist/remry.zip for Claude desktop, and install or update
//                              the Claude Code plugin
//   bun run setup uninstall    undo that (your notebook data is untouched)

import { spawnSync } from 'node:child_process';
import { cp, lstat, mkdir, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { appDataDir } from '$shared/settings/server/app-dirs';
import { DEV_NAME, DEV_PLUGIN_ENTRIES, devMarketplaceFiles, planInstall, planUninstall, repoPaths, type BinLink, type SetupState, type SetupStep } from './plan';

const REPO = resolve(import.meta.dir, '..', '..');

/** Runs a `claude … --json` listing. Null means `claude` isn't on PATH. */
const claudeList = (args: readonly string[]): readonly unknown[] | null => {
  // Setup never needs input, so the claude CLI doesn't get our stdin.
  const r = spawnSync('claude', [...args, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error) return null;
  const parsed: unknown = r.status === 0 ? JSON.parse(r.stdout) : null;
  if (!Array.isArray(parsed)) {
    console.error(`\`claude ${args.join(' ')} --json\` failed:\n${r.stderr.trim()}`);
    process.exit(1);
  }
  return parsed;
};

const strings = (items: readonly unknown[], key: string): readonly string[] =>
  items.flatMap((item) => {
    const value = typeof item === 'object' && item !== null ? (item as Record<string, unknown>)[key] : undefined;
    return typeof value === 'string' ? [value] : [];
  });

/** Bun's global bin directory (`~/.bun/bin` by default), where `bun add -g` puts commands. */
const bunGlobalBin = (): string => {
  const r = spawnSync(process.execPath, ['pm', 'bin', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : join(homedir(), '.bun', 'bin');
};

const readLink = async (path: string): Promise<BinLink> => {
  const stats = await lstat(path).catch(() => null);
  if (!stats) return { kind: 'missing' };
  if (!stats.isSymbolicLink()) return { kind: 'other' };
  return { kind: 'symlink', target: resolve(dirname(path), await readlink(path)) };
};

const readState = async (): Promise<SetupState> => {
  const pointerFile = join(appDataDir(), 'app-path');
  const binDir = bunGlobalBin();
  const legacySkillPath = join(homedir(), '.claude', 'skills', 'working-notes');
  const legacy = await readLink(legacySkillPath);
  const marketplaces = claudeList(['plugin', 'marketplace', 'list']);
  const plugins = marketplaces && claudeList(['plugin', 'list']);
  return {
    repoDir: REPO,
    pointerFile,
    pointer: await readFile(pointerFile, 'utf8').then((s) => s.trim()).catch(() => null),
    binLinkPath: join(binDir, 'remry'),
    binLink: await readLink(join(binDir, 'remry')),
    binDirOnPath: (process.env.PATH ?? '').split(delimiter).includes(binDir),
    legacySkillPath,
    legacySkillTarget: legacy.kind === 'symlink' ? legacy.target : null,
    claude: marketplaces && plugins
      ? {
          marketplaces: strings(marketplaces, 'name'),
          plugins: strings(plugins, 'id'),
          localMarketplaces: strings(marketplaces.filter((m) => strings([m], 'source').includes('directory')), 'name')
        }
      : null
  };
};

const runStep = async (step: SetupStep): Promise<boolean> => {
  switch (step.kind) {
    case 'write':
      await mkdir(dirname(step.path), { recursive: true });
      await writeFile(step.path, step.contents);
      console.log(`Wrote ${step.path}`);
      return true;
    case 'remove':
      await rm(step.path, { force: true });
      console.log(`Removed ${step.path}`);
      return true;
    case 'link':
      await mkdir(dirname(step.path), { recursive: true });
      await rm(step.path, { force: true });
      await symlink(step.target, step.path);
      console.log(`Linked ${step.path} -> ${step.target}`);
      return true;
    case 'pack': {
      await mkdir(dirname(step.output), { recursive: true });
      await rm(step.output, { force: true });
      const zipped = spawnSync('zip', ['-r', '-X', '-q', step.output, '.', '-x', '*.DS_Store'], { cwd: step.pluginDir, stdio: ['ignore', 'inherit', 'inherit'] });
      // Only Claude desktop needs the zip, so a missing `zip` doesn't stop setup.
      console.log(zipped.status === 0 ? `Built ${step.output}` : `Couldn't build ${step.output} (is \`zip\` installed?); skipping.`);
      return true;
    }
    case 'devMarketplace': {
      // Rebuilt each run from the clone's plugin/, then reinstalled (planInstall).
      const manifest: unknown = JSON.parse(await readFile(join(step.pluginDir, '.claude-plugin', 'plugin.json'), 'utf8'));
      const files = devMarketplaceFiles(typeof manifest === 'object' && manifest !== null ? (manifest as Record<string, unknown>) : {});
      const plugin = join(step.dir, DEV_NAME);
      await rm(step.dir, { recursive: true, force: true });
      await mkdir(join(step.dir, '.claude-plugin'), { recursive: true });
      await mkdir(join(plugin, '.claude-plugin'), { recursive: true });
      await writeFile(join(step.dir, '.claude-plugin', 'marketplace.json'), files.marketplace);
      await writeFile(join(plugin, '.claude-plugin', 'plugin.json'), files.plugin);
      for (const entry of DEV_PLUGIN_ENTRIES) await cp(join(step.pluginDir, entry), join(plugin, entry), { recursive: true });
      console.log(`Wrote the ${DEV_NAME} marketplace in ${step.dir}`);
      return true;
    }
    case 'claude':
      console.log(`\n$ claude ${step.args.join(' ')}`);
      return spawnSync('claude', [...step.args], { stdio: ['ignore', 'inherit', 'inherit'] }).status === 0;
    case 'note':
      console.log(step.message);
      return true;
  }
};

const main = async (): Promise<number> => {
  const command = process.argv[2] ?? 'install';
  if (command !== 'install' && command !== 'uninstall') {
    console.error('Usage: bun run setup [uninstall]');
    return 1;
  }
  const state = await readState();
  const steps = command === 'install' ? planInstall(state) : planUninstall(state);
  if (steps.length === 0) console.log('Nothing to remove.');
  for (const step of steps) {
    if (!(await runStep(step))) {
      console.error('\nSetup stopped because that command failed.');
      return 1;
    }
  }
  if (command === 'install') {
    console.log(`\nRemry is set up for ${REPO}.`);
    console.log(`- Claude Code: start a new session to use ${DEV_NAME}, this clone's plugin.`);
    console.log(`- Claude desktop (Chat and Cowork): add ${repoPaths(REPO).pluginZip} as a plugin.`);
  }
  return 0;
};

process.exit(await main());
