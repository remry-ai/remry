// Every field reads in the one text font and size (--font-text at --fs-text, styles/_tokens.scss),
// like labels, docs, notes and editors, so changing those two tokens changes all of it. A
// component that set a field's own font or size, or made one monospace, would quietly opt out.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..', '..');

const svelteFiles = (dir: string): readonly string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.svelte'))
    .map((file) => join(dir, file));

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** A field tag with `mono` among its classes. */
const MONO_FIELD = /<(input|textarea|select)\b[^>]*\bclass="[^"]*\bmono\b[^"]*"/g;

/** A style rule for a field element that sets its own font or size. */
const FIELD_FONT_RULE = /(?:^|[\s,(>])(?:input|textarea|select)\b[^{};]*\{[^{}]*\bfont(?:-size|-family)?\s*:/gm;

const offenders = (pattern: RegExp, part: (text: string) => string): readonly string[] =>
  svelteFiles(SRC).flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    const scope = part(text);
    const offset = text.indexOf(scope);
    return [...scope.matchAll(pattern)].map((m) => `${relative(SRC, file)}:${lineOf(text, offset + (m.index ?? 0))}`);
  });

const styleBlock = (text: string): string => /<style[^>]*>([\s\S]*?)<\/style>/.exec(text)?.[1] ?? '';

describe('text font', () => {
  it('no field is monospace', () => {
    expect(offenders(MONO_FIELD, (text) => text), 'Fields use --font-text; take `mono` off').toEqual([]);
  });

  it('no component sets a field’s own font or size', () => {
    expect(offenders(FIELD_FONT_RULE, styleBlock), 'Fields take --font-text at --fs-text from styles/_base.scss; drop the font rule').toEqual([]);
  });
});
