// The plugin's `remry` shim: runs a clone, or installs and runs a release's standalone
// binary, or explains how to set up.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readlinkSync, statSync, writeFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SHIM = resolve('plugin/scripts/remry');
const TARGET = `${process.platform}-${process.arch === 'arm64' ? 'arm64' : 'x64'}`;

const fakeApp = (withDeps = true): string => {
  const app = mkdtempSync(join(tmpdir(), 'remry-app-'));
  mkdirSync(join(app, 'bin'));
  writeFileSync(join(app, 'bin', 'remry'), '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\n');
  chmodSync(join(app, 'bin', 'remry'), 0o755);
  if (withDeps) mkdirSync(join(app, 'node_modules'));
  return app;
};

/** A built plugin: the shim plus server/ with a binary for this computer. The binary has no execute bit, like one from a zip. */
const fakeRelease = (version: string): string => {
  const plugin = mkdtempSync(join(tmpdir(), 'remry-plugin-'));
  mkdirSync(join(plugin, 'scripts'));
  copyFileSync(SHIM, join(plugin, 'scripts', 'remry'));
  const server = join(plugin, 'server');
  mkdirSync(join(server, 'migrations'), { recursive: true });
  writeFileSync(join(server, `remry-${TARGET}`), '#!/bin/sh\necho "release $0"\nfor a in "$@"; do printf "%s\\n" "$a"; done\n');
  writeFileSync(join(server, 'VERSION'), `${version}\n`);
  return plugin;
};

const dataDirFor = (home: string): string =>
  platform() === 'darwin' ? join(home, 'Library', 'Application Support', 'Remry') : join(home, '.local', 'share', 'remry');

const newHome = (): string => mkdtempSync(join(tmpdir(), 'remry-home-'));

const run = (env: Record<string, string>, ...args: string[]) => runShim(SHIM, env, ...args);

const runShim = (shim: string, env: Record<string, string>, ...args: string[]) => {
  const home = env['HOME'] ?? newHome();
  return spawnSync('sh', [shim, ...args], { env: { PATH: process.env.PATH ?? '', HOME: home, ...env }, encoding: 'utf8' });
};

const recordClone = (home: string, app: string): void => {
  mkdirSync(dataDirFor(home), { recursive: true });
  writeFileSync(join(dataDirFor(home), 'app-path'), app);
};

describe('plugin remry shim', () => {
  it('explains how to set up when no clone is configured', () => {
    const r = run({}, 'help');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Remry isn't set up on this computer");
    expect(r.stderr).toContain('bun run setup');
  });

  it('passes arguments through unchanged to REMRY_HOME', () => {
    const r = run({ REMRY_HOME: fakeApp() }, 'note.add', '--content', 'two words', '--title', "it's");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("note.add\n--content\ntwo words\n--title\nit's\n");
  });

  it('reads the clone from the app-path file that setup writes', () => {
    const home = newHome();
    recordClone(home, fakeApp());
    const r = run({ HOME: home }, 'person.list');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('person.list\n');
  });

  it('says so when the clone is gone or has no dependencies', () => {
    const gone = run({ REMRY_HOME: '/nonexistent/remry' });
    expect(gone.status).toBe(1);
    expect(gone.stderr).toContain("isn't at /nonexistent/remry");

    const app = fakeApp(false);
    const noDeps = run({ REMRY_HOME: app });
    expect(noDeps.status).toBe(1);
    expect(noDeps.stderr).toContain(`Run \`bun install\` in ${app}`);
  });

  it('installs a release binary into the data directory and runs it, when there is no clone', () => {
    const home = newHome();
    const plugin = fakeRelease('9.9.9');
    const r = runShim(join(plugin, 'scripts', 'remry'), { HOME: home }, 'person.list', '--name', 'two words');
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);

    const installed = join(dataDirFor(home), 'App', '9.9.9');
    expect(r.stdout).toBe(`release ${join(installed, 'remry')}\nperson.list\n--name\ntwo words\n`);
    expect(statSync(join(installed, 'remry')).mode & 0o111).not.toBe(0);
    expect(existsSync(join(installed, 'migrations'))).toBe(true);
    expect(readlinkSync(join(dataDirFor(home), 'App', 'current'))).toBe('9.9.9');

    // An update installs alongside and repoints App/current.
    const next = runShim(join(fakeRelease('9.9.10'), 'scripts', 'remry'), { HOME: home }, 'help');
    expect(next.status).toBe(0);
    expect(readlinkSync(join(dataDirFor(home), 'App', 'current'))).toBe('9.9.10');
  });

  it('prefers a clone set up on this computer over the release binary, unless the clone is gone', () => {
    const home = newHome();
    const plugin = fakeRelease('9.9.9');
    recordClone(home, fakeApp());
    expect(runShim(join(plugin, 'scripts', 'remry'), { HOME: home }, 'person.list').stdout).toBe('person.list\n');

    recordClone(home, '/nonexistent/remry');
    expect(runShim(join(plugin, 'scripts', 'remry'), { HOME: home }, 'person.list').stdout).toContain('release ');
  });

  it('keeps the plugin free of a top-level bin/, which claude.ai-hosted plugins reject', () => {
    expect(existsSync(resolve('plugin/bin'))).toBe(false);
  });
});
