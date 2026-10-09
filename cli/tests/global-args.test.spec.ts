import { describe, it, expect } from 'vitest';
import { splitGlobalArgs } from '../args';

describe('splitGlobalArgs', () => {
  it('takes --notebook out, wherever it appears', () => {
    expect(splitGlobalArgs(['person.list', '--notebook', 'work'])).toEqual({ ok: true, value: { notebook: 'work', rest: ['person.list'] } });
    expect(splitGlobalArgs(['--notebook=side-project', 'person.create', '--name', 'Dana'])).toEqual({
      ok: true,
      value: { notebook: 'side-project', rest: ['person.create', '--name', 'Dana'] }
    });
  });

  it('leaves argv alone without --notebook', () => {
    expect(splitGlobalArgs(['person.create', '--name', 'Dana'])).toEqual({ ok: true, value: { rest: ['person.create', '--name', 'Dana'] } });
  });

  it('needs a value', () => {
    for (const argv of [['person.list', '--notebook'], ['--notebook', '--name', 'Dana'], ['--notebook=']]) {
      const result = splitGlobalArgs(argv);
      expect(!result.ok && result.error.message).toBe('--notebook needs a notebook id or name');
    }
  });
});
