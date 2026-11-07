import { describe, it, expect } from 'vitest';
import { isEmptyBody, linkedText, planBodyUpdate, prepareContent, requireDocument } from '../_body';
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

describe('planBodyUpdate', () => {
  const sheet = JSON.stringify({ columns: [{ title: 'A' }], data: [['1']] });

  it('gives pages and docs the same rules, in the same words', () => {
    for (const holder of ['page', 'doc'] as const) {
      const full = planBodyUpdate(holder, { bodyType: 'sheet', content: sheet, prompt: null }, { bodyType: 'drawing' });
      expect(!full.ok && full.error.message).toBe(`This ${holder} already has content as a spreadsheet, so it can't become a drawing. Clear its content first, or make a new ${holder} (${holder === 'doc' ? 'doc.add' : 'page.create'} --bodyType drawing).`);
      const sync = planBodyUpdate(holder, { bodyType: 'sheet', content: sheet, prompt: null }, { prompt: 'Pull costs' });
      expect(!sync.ok && sync.error.message).toBe(`A spreadsheet ${holder} can't be a sync ${holder}: only a document's text is rewritten from its sources.`);
      const toSync = planBodyUpdate(holder, { bodyType: 'doc', content: '', prompt: 'Pull costs' }, { bodyType: 'drawing' });
      expect(toSync.ok).toBe(false);
    }
  });

  it('stores the empty body of a new type, and leaves content alone when it is not changing', () => {
    const changed = planBodyUpdate('doc', { bodyType: 'doc', content: '', prompt: null }, { bodyType: 'drawing' });
    expect(changed.ok && changed.value).toEqual({ bodyType: 'drawing', typeChanged: true, content: JSON.stringify({ version: 1, elements: [] }) });
    const title = planBodyUpdate('page', { bodyType: 'sheet', content: sheet, prompt: null }, {});
    expect(title.ok && title.value).toEqual({ bodyType: 'sheet', typeChanged: false });
  });
});

describe('linkedText and requireDocument', () => {
  it('treat only a document as text with links, and refuse the rest in one form', () => {
    expect(linkedText('doc', '[x](/app/wiki/1)')).toBe('[x](/app/wiki/1)');
    expect(linkedText('sheet', '{}')).toBe('');
    expect(requireDocument('doc', 'doc', 'synced').ok).toBe(true);
    const refused = requireDocument('doc', 'drawing', 'written from a file');
    expect(!refused.ok && refused.error.message).toBe("A drawing doc can't be written from a file.");
  });
});
