// Turns what someone typed into a safe FTS5 MATCH expression. Raw input never
// reaches MATCH: every term is rebuilt from its letters and digits and quoted,
// so FTS5 syntax (column filters, NEAR, stray quotes) can't cause an error.
//
//   budget review     both words, each also as a prefix ("budget"* AND "review"*)
//   "budget review"   the exact phrase
//   vendor OR supplier  either word
//   budget -draft     budget, but not draft

import { ok, err, type Result } from '$shared/utils';

interface Term {
  readonly words: readonly string[];
  readonly phrase: boolean;
  readonly negated: boolean;
}

const WORD = /[\p{L}\p{N}\p{M}]+/gu;

const wordsOf = (text: string): readonly string[] => text.match(WORD) ?? [];

const quote = (words: readonly string[]): string => `"${words.join(' ')}"`;

/** An FTS5 phrase for exact text, such as an entity's name. Null when it has no letters or digits. */
export const phraseQuery = (text: string): string | null => {
  const words = wordsOf(text);
  return words.length > 0 ? quote(words) : null;
};

/** Splits input into phrases, words and OR markers. Exported for tests. */
export const tokenize = (input: string): readonly (Term | 'OR')[] => {
  const tokens: (Term | 'OR')[] = [];
  const re = /(-?)"([^"]*)"?|(\S+)/g;
  for (const match of input.matchAll(re)) {
    const [, minus, phrase, bare] = match;
    if (phrase !== undefined) {
      const words = wordsOf(phrase);
      if (words.length > 0) tokens.push({ words, phrase: true, negated: minus === '-' });
      continue;
    }
    const raw = bare ?? '';
    if (raw === 'OR' || raw === '|') {
      tokens.push('OR');
      continue;
    }
    const negated = raw.startsWith('-') && raw.length > 1;
    const words = wordsOf(negated ? raw.slice(1) : raw);
    if (words.length > 0) tokens.push({ words, phrase: false, negated });
  }
  return tokens;
};

// A bare word also matches as a prefix ("migr" finds "migration"); a word like
// "ENG-123" is several tokens to FTS5, so it becomes the phrase "ENG 123"*.
const render = (term: Term): string => (term.phrase ? quote(term.words) : `${quote(term.words)}*`);

/**
 * Builds the MATCH expression. Terms are ANDed; OR joins the terms either side
 * of it; negated terms are excluded from the whole result.
 */
export const buildFtsQuery = (input: string): Result<string> => {
  const tokens = tokenize(input);
  const groups: string[][] = [];
  const excluded: string[] = [];
  let joinNext = false;
  for (const token of tokens) {
    if (token === 'OR') {
      joinNext = groups.length > 0;
      continue;
    }
    if (token.negated) {
      excluded.push(render(token));
      continue;
    }
    const last = groups[groups.length - 1];
    if (joinNext && last) last.push(render(token));
    else groups.push([render(token)]);
    joinNext = false;
  }
  if (groups.length === 0) {
    return err(new Error(excluded.length > 0
      ? 'Search for at least one word to include: a query of only -excluded words matches nothing'
      : 'Search for at least one word or number'));
  }
  const positive = groups.map((g) => (g.length > 1 ? `(${g.join(' OR ')})` : g[0])).join(' AND ');
  return ok(excluded.length > 0 ? `(${positive}) NOT (${excluded.join(' OR ')})` : positive);
};
