// The app has one font, --font-text (styles/_tokens.scss), for everything: interface, fields,
// docs, notes, code, charts and diagrams. Fields also share one size, --fs-text. So changing
// those tokens changes all of it, and nothing may quietly opt out with a font of its own.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..', '..');

const filesEnding = (dir: string, ...endings: readonly string[]): readonly string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => endings.some((end) => file.endsWith(end)))
    .map((file) => join(dir, file));
const svelteFiles = (dir: string): readonly string[] => filesEnding(dir, '.svelte');

/** A font-family that isn't the one font. */
const OTHER_FONT_FAMILY = /font-family\s*:(?!\s*var\(--font-text\)\s*[;}\n])[^;}\n]+/g;
/** The font shorthand, which could name another family (only `font: inherit` is allowed). */
const FONT_SHORTHAND = /(?<![-\w])font\s*:(?!\s*inherit\s*[;}\n])[^;}\n]+/g;
/** The old second and third fonts, and the class that used one. */
const OTHER_FONT_TOKEN = /--font-(?:sans|mono)\b|class="[^"]*\bmono\b/g;

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

  it('every style uses the one font', () => {
    const styles = filesEnding(SRC, '.svelte', '.scss').flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      const scope = file.endsWith('.scss') ? text : styleBlock(text);
      const offset = text.indexOf(scope);
      return [...scope.matchAll(OTHER_FONT_FAMILY), ...scope.matchAll(FONT_SHORTHAND)].map(
        (m) => `${relative(SRC, file)}:${lineOf(text, offset + (m.index ?? 0))} ${m[0].trim()}`
      );
    });
    expect(styles, 'Use font-family: var(--font-text), the app\'s one font').toEqual([]);
  });

  it('nothing brings back a second font', () => {
    const uses = filesEnding(SRC, '.svelte', '.scss').flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return [...text.matchAll(OTHER_FONT_TOKEN)].map((m) => `${relative(SRC, file)}:${lineOf(text, m.index ?? 0)} ${m[0]}`);
    });
    expect(uses, 'There is one font, --font-text').toEqual([]);
  });

  it('no component sets a field’s own font or size', () => {
    expect(offenders(FIELD_FONT_RULE, styleBlock), 'Fields take --font-text at --fs-text from styles/_base.scss; drop the font rule').toEqual([]);
  });
});
