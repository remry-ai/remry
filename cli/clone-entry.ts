#!/usr/bin/env bun
// What bin/remry does, for a clone on a machine that can't run that shell script
// (Windows, through plugin/scripts/remry.cmd):
//   bun cli/clone-entry.ts <procedure> [--key value] | mcp | backup [args] | app [restart]

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const repo = resolve(import.meta.dir, '..');

switch (process.argv[2]) {
  case 'mcp':
    await import('./mcp');
    break;
  case 'backup':
    // scripts/backup/main.ts reads its own arguments from argv[2], and runs from the repo.
    process.argv.splice(2, 1);
    process.chdir(repo);
    await import('../scripts/backup/main');
    break;
  case 'app':
    if (process.argv[3] === 'restart') await import('./app-restart');
    else process.exit(spawnSync(process.execPath, ['run', 'dev'], { cwd: repo, stdio: 'inherit' }).status ?? 1);
    break;
  default:
    await import('./main');
}
