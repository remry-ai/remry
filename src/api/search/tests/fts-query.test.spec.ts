import { describe, it, expect } from 'vitest';
import { buildFtsQuery, phraseQuery } from '../fts-query';

const q = (input: string): string | null => {
  const result = buildFtsQuery(input);
  return result.ok ? result.value : null;
};

describe('buildFtsQuery', () => {
  it('ANDs words, each as a prefix', () => {
    expect(q('budget review')).toBe('"budget"* AND "review"*');
  });

  it('keeps a quoted phrase exact', () => {
    expect(q('"budget review" vendor')).toBe('"budget review" AND "vendor"*');
  });

  it('closes an unterminated quote', () => {
    expect(q('"budget review')).toBe('"budget review"');
  });

  it('joins the terms either side of OR', () => {
    expect(q('renewal vendor OR supplier')).toBe('"renewal"* AND ("vendor"* OR "supplier"*)');
    expect(q('a | b')).toBe('("a"* OR "b"*)');
  });

  it('ignores a leading or trailing OR', () => {
    expect(q('OR vendor OR')).toBe('"vendor"*');
  });

  it('excludes negated words and phrases', () => {
    expect(q('budget -draft -"old plan"')).toBe('("budget"*) NOT ("draft"* OR "old plan")');
  });

  it('turns punctuated words into phrases', () => {
    expect(q('ENG-123')).toBe('"ENG 123"*');
    expect(q("o'brien")).toBe('"o brien"*');
  });

  it('keeps non-ASCII letters', () => {
    expect(q('café naïve 東京')).toBe('"café"* AND "naïve"* AND "東京"*');
  });

  it('neutralises FTS5 syntax', () => {
    expect(q('title:x NEAR(a b) AND *')).toBe('"title x"* AND "NEAR a"* AND "b"* AND "AND"*');
    expect(q('a"b')).toBe('"a b"*');
  });

  it('refuses input with nothing to search for', () => {
    expect(buildFtsQuery('  ').ok).toBe(false);
    expect(buildFtsQuery('!!! ---').ok).toBe(false);
    const onlyNegated = buildFtsQuery('-draft');
    expect(onlyNegated.ok).toBe(false);
    if (!onlyNegated.ok) expect(onlyNegated.error.message).toContain('at least one word to include');
  });
});

describe('phraseQuery', () => {
  it('quotes a name as one phrase', () => {
    expect(phraseQuery('Dana O\'Neil')).toBe('"Dana O Neil"');
  });
  it('is null without letters or digits', () => {
    expect(phraseQuery('—')).toBeNull();
  });
});
