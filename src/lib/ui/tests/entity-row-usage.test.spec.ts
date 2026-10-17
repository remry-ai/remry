// Every list row that opens with a link to an entity is an EntityRow, so each one gets the
// peek button (and whatever rows gain next) without anyone remembering to add it. A row that
// opens with something else (the Links widget's source icon, a status dot) isn't an entity
// row and is left alone.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..', '..');
const HAND_WRITTEN_ENTITY_ROW = /<li class="list-row"[^>]*>\s*<a\s/g;

const svelteFiles = (dir: string): readonly string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.svelte'))
    .map((file) => join(dir, file));

describe('entity rows', () => {
  it('are EntityRows, not hand-written .list-rows', () => {
    const offenders = svelteFiles(SRC)
      .filter((file) => !file.endsWith(join('ui', 'EntityRow.svelte')))
      .flatMap((file) => {
        const text = readFileSync(file, 'utf8');
        return [...text.matchAll(HAND_WRITTEN_ENTITY_ROW)].map((m) => `${relative(SRC, file)}:${text.slice(0, m.index).split('\n').length}`);
      });
    expect(offenders, 'Use <EntityRow href label> (src/lib/ui/EntityRow.svelte) for a row that links to an entity').toEqual([]);
  });
});
