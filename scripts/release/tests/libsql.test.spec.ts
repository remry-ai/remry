import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rewriteLibsqlLoader } from '../libsql';

describe('rewriteLibsqlLoader', () => {
  it('turns the runtime require into a static one for the build target', () => {
    const result = rewriteLibsqlLoader('function load() {\n  return require(`@libsql/${target}`);\n}', 'darwin-arm64');
    expect(result).toEqual({ ok: true, value: 'function load() {\n  return require("@libsql/darwin-arm64");\n}' });
  });

  it('fails loudly if libsql changes how it loads', () => {
    const result = rewriteLibsqlLoader('module.exports = require("./native")', 'darwin-arm64');
    expect(!result.ok && result.error.message).toContain('update scripts/release/libsql.ts');
  });

  it('matches the installed libsql', () => {
    const installed = readFileSync(resolve('node_modules/libsql/index.js'), 'utf8');
    expect(rewriteLibsqlLoader(installed, 'darwin-arm64').ok).toBe(true);
  });
});
