import { afterAll, describe, it, expect } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLlm } from '../claude-process.server';

// A stand-in for `copilot` that records its arguments, then prints the prompt file it was pointed at.
const dir = mkdtempSync(join(tmpdir(), 'wn-run-llm-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const fakeCopilot = join(dir, 'copilot');
writeFileSync(
  fakeCopilot,
  `#!/bin/sh\nprintf '%s\\n' "$@" > '${join(dir, 'args')}'\nwhile [ "$1" != "--add-dir" ]; do shift; done\ncat "$2/prompt.md"\n`
);
chmodSync(fakeCopilot, 0o755);

describe('runLlm', () => {
  it('writes a Copilot prompt to a private file, points the arguments at it, and removes it after', async () => {
    const run = await runLlm({ provider: 'copilot', path: fakeCopilot }, { kind: 'chat', prompt: 'The whole page\nand "quotes"' }, { cwd: null, timeoutMs: 10_000 });
    expect(run.code).toBe(0);
    expect(run.stdout).toBe('The whole page\nand "quotes"');
    const args = readFileSync(join(dir, 'args'), 'utf8').split('\n');
    const promptDir = args[args.indexOf('--add-dir') + 1]!;
    expect(promptDir).toContain('remry-prompt-');
    expect(args[1]).toContain(`${promptDir}/prompt.md`);
    expect(existsSync(promptDir)).toBe(false);
  });
});
