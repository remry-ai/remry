import { describe, it, expect } from 'vitest';
import { isEmptyBody, prepareContent } from '../operations';
import { emptySheet } from '$shared/utils/sheet';

describe('prepareContent', () => {
  it('keeps markdown as given', () => {
    const prepared = prepareContent('doc', '# Hello');
    expect(prepared.ok && prepared.value).toBe('# Hello');
  });

  it('stores a sheet normalised, with values', () => {
    const prepared = prepareContent('sheet', '{"columns":[{"title":"A"},{"title":"B"}],"data":[["x"]]}');
    expect(prepared.ok && JSON.parse(prepared.value)).toEqual({ version: 1, columns: [{ title: 'A' }, { title: 'B' }], data: [['x', '']], values: [['x', '']] });
  });

  it('refuses a sheet that is not one', () => {
    const prepared = prepareContent('sheet', '# Hello');
    expect(!prepared.ok && prepared.error.message).toMatch(/sheet content: invalid JSON/);
  });
});

describe('isEmptyBody', () => {
  it('treats blank text and a sheet with no filled cells as empty', () => {
    expect(isEmptyBody('doc', '  \n')).toBe(true);
    expect(isEmptyBody('doc', 'x')).toBe(false);
    expect(isEmptyBody('sheet', JSON.stringify(emptySheet()))).toBe(true);
    expect(isEmptyBody('sheet', '{"columns":[{"title":"A"}],"data":[[""],["1"]]}')).toBe(false);
  });
});
