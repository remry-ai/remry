// The plugin's `remry` shim: runs a clone or the desktop app's installed binary, or explains how to set up.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SHIM = resolve('plugin/scripts/remry');

const fakeApp = (withDeps = true): string => {
  const app = mkdtempSync(join(tmpdir(), 'remry-app-'));
  mkdirSync(join(app, 'bin'));
  writeFileSync(join(app, 'bin', 'remry'), '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\n');
  chmodSync(join(app, 'bin', 'remry'), 0o755);
  if (withDeps) mkdirSync(join(app, 'node_modules'));
  return app;
};

const dataDirFor = (home: string): string =>
  platform() === 'darwin' ? join(home, 'Library', 'Application Support', 'Remry') : join(home, '.local', 'share', 'remry');

const newHome = (): string => mkdtempSync(join(tmpdir(), 'remry-home-'));

const run = (env: Record<string, string>, ...args: string[]) => {
  const home = env['HOME'] ?? newHome();
  return spawnSync('sh', [SHIM, ...args], { env: { PATH: process.env.PATH ?? '', HOME: home, ...env }, encoding: 'utf8' });
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

  it("runs the desktop app's installed binary before a recorded clone, but after REMRY_HOME", () => {
    const home = newHome();
    recordClone(home, fakeApp());
    const current = join(dataDirFor(home), 'App', 'current');
    mkdirSync(current, { recursive: true });
    writeFileSync(join(current, 'remry'), '#!/bin/sh\necho "app $1"\n');
    chmodSync(join(current, 'remry'), 0o755);

    expect(run({ HOME: home }, 'person.list').stdout).toBe('app person.list\n');
    // remry-dev sets REMRY_HOME, so a development machine keeps running its clone.
    expect(run({ HOME: home, REMRY_HOME: fakeApp() }, 'person.list').stdout).toBe('person.list\n');
  });

  it('keeps the plugin free of a top-level bin/, which claude.ai-hosted plugins reject', () => {
    expect(existsSync(resolve('plugin/bin'))).toBe(false);
  });
});
