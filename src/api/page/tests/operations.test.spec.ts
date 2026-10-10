import { describe, it, expect } from 'vitest';
import { isEmptyBody, mergePageProperties, prepareContent } from '../operations';
import { emptySheet } from '$shared/utils/sheet';
import type { PageKindField } from '$shared/types/pages';

const SOFTWARE: readonly PageKindField[] = [
  { key: 'vendor', label: 'Vendor', input: 'text' },
  { key: 'seats', label: 'Seats', input: 'number' }
];
const PRODUCT: readonly PageKindField[] = [{ key: 'url', label: 'URL', input: 'url' }];

describe('mergePageProperties', () => {
  it('replaces patched values and removes keys set to null', () => {
    expect(mergePageProperties(SOFTWARE, { vendor: 'Acme', seats: 10 }, { seats: 12, vendor: null })).toEqual({ seats: 12 });
  });

  it('drops current values the kind does not have after a kind change', () => {
    expect(mergePageProperties(PRODUCT, { vendor: 'Acme', url: 'https://acme.test' }, undefined)).toEqual({ url: 'https://acme.test' });
  });

  it('keeps unknown keys from the patch so validation can name them', () => {
    expect(mergePageProperties(PRODUCT, {}, { vendor: 'Acme' })).toEqual({ vendor: 'Acme' });
  });
});

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
