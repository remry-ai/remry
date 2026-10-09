#!/usr/bin/env bun
// Builds the standalone plugin: one `remry` binary (the CLI, MCP server, backups and
// UI, with Bun and the UI's static files built in) and the migrations, in a copy of
// plugin/. A machine that installs it needs no clone and no Bun. The static files are
// embedded rather than shipped as hundreds of minified files, so an organisation's
// plugin security scan has less to read on every update.
//   bun run release:build [--target darwin-arm64|darwin-x64|linux-x64|linux-arm64|windows-x64]
// Output: dist/plugin/, the built plugin with this target's binary in server/. CI builds
// each target on its own OS and scripts/release/package.ts merges them and zips them.

import { spawnSync } from 'node:child_process';
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { agreedVersion } from './versions';
import { libsqlNativePlugin } from './libsql';

const REPO = resolve(import.meta.dir, '..', '..');
const DIST = join(REPO, 'dist');
// Each target's libsql native package. Build a target on its own OS: `bun install`
// fetches only the host's native package, and the binary embeds it.
const TARGETS: ReadonlyMap<string, { readonly libsql: string; readonly exe: string }> = new Map([
  ['darwin-arm64', { libsql: 'darwin-arm64', exe: '' }],
  ['darwin-x64', { libsql: 'darwin-x64', exe: '' }],
  ['linux-x64', { libsql: 'linux-x64-gnu', exe: '' }],
  ['linux-arm64', { libsql: 'linux-arm64-gnu', exe: '' }],
  ['windows-x64', { libsql: 'win32-x64-msvc', exe: '.exe' }]
]);

/** The target this machine builds by default: Bun's names, with Windows as `windows`. */
const hostTarget = (): string => `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;

const run = (command: string, args: readonly string[]): void => {
  const r = spawnSync(command, [...args], { cwd: REPO, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`\`${command} ${args.join(' ')}\` failed`);
};

const option = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const main = async (): Promise<void> => {
  const target = option('target') ?? hostTarget();
  const spec = TARGETS.get(target);
  if (!spec) throw new Error(`Can't build for ${target}. Targets: ${[...TARGETS.keys()].join(', ')}`);

  const version = agreedVersion(
    await Bun.file(join(REPO, 'plugin/.claude-plugin/plugin.json')).text(),
    await Bun.file(join(REPO, '.claude-plugin/marketplace.json')).text()
  );
  if (!version.ok) throw version.error;
  console.log(`Building Remry ${version.value} for ${target}`);

  // The UI, as SvelteKit's adapter-node output in build/.
  run('bunx', ['svelte-kit', 'sync']);
  run('bunx', ['vite', 'build']);

  const plugin = join(DIST, 'plugin');
  const server = join(plugin, 'server');
  await rm(plugin, { recursive: true, force: true });
  await cp(join(REPO, 'plugin'), plugin, { recursive: true, filter: (src) => !src.endsWith('.DS_Store') });
  await mkdir(server, { recursive: true });

  // Every static file is imported `with { type: 'file' }`, which embeds it unchanged; the
  // map from request path to embedded path is what cli/app-server.ts serves.
  const clientDir = join(REPO, 'build', 'client');
  const clientFiles = (await readdir(clientDir, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile() && e.name !== '.DS_Store')
    .map((e) => join(e.parentPath, e.name))
    .sort();

  // The generated entry imports the built SvelteKit server, so it isn't type-checked source.
  const entry = join(DIST, '.build', 'remry.ts');
  await mkdir(join(DIST, '.build'), { recursive: true });
  await writeFile(entry, [
    `import { runStandalone } from ${JSON.stringify(join(REPO, 'cli/standalone.ts'))};`,
    ...clientFiles.map((file, i) => `import f${i} from ${JSON.stringify(file)} with { type: 'file' };`),
    'await runStandalone({',
    `  staticFiles: new Map([${clientFiles.map((file, i) => `[${JSON.stringify(`/${relative(clientDir, file).split(sep).join('/')}`)}, f${i}]`).join(', ')}]),`,
    '  loadServer: async () => {',
    `    const [{ Server }, { manifest }] = await Promise.all([import(${JSON.stringify(join(REPO, 'build/server/index.js'))}), import(${JSON.stringify(join(REPO, 'build/server/manifest.js'))})]);`,
    '    return new Server(manifest);',
    '  }',
    '});',
    ''
  ].join('\n'));

  const binary = join(server, `remry-${target}${spec.exe}`);
  const built = await Bun.build({
    entrypoints: [entry],
    compile: { target: `bun-${target}` as Bun.Build.CompileTarget, outfile: binary },
    plugins: [libsqlNativePlugin(spec.libsql)]
  });
  if (!built.success) throw new Error(`Compiling failed:\n${built.logs.map(String).join('\n')}`);

  await cp(join(REPO, 'prisma', 'migrations'), join(server, 'migrations'), { recursive: true });
  await writeFile(join(server, 'VERSION'), `${version.value}\n`);

  const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  console.log(`\nBuilt ${plugin}\n  binary ${mb((await stat(binary)).size)}, with ${clientFiles.length} static files\nZip it with \`bun run release:package\`.`);
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
