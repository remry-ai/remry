import { describe, it, expect } from 'vitest';
import { Schema } from '@milkdown/prose/model';
import { EditorState, TextSelection } from '@milkdown/prose/state';
import { applyLink, findLinkRange } from '../milkdown-link';

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*' },
    text: {},
  },
  marks: { link: { attrs: { href: {} } } },
});
const link = schema.marks['link']!;

// "Go to Datadog now", with "Datadog" linked (positions 7–14).
const doc = schema.node('doc', null, [
  schema.node('paragraph', null, [
    schema.text('Go to '),
    schema.text('Datadog', [link.create({ href: 'https://datadog.com' })]),
    schema.text(' now'),
  ]),
]);

const stateAt = (from: number, to = from): EditorState =>
  EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });

const linksIn = (state: EditorState): { text: string; href: unknown }[] => {
  const out: { text: string; href: unknown }[] = [];
  state.doc.descendants((node) => {
    const mark = link.isInSet(node.marks);
    if (node.isText && mark) out.push({ text: node.text ?? '', href: mark.attrs['href'] });
  });
  return out;
};

describe('findLinkRange', () => {
  it('finds the whole link around the cursor', () => {
    expect(findLinkRange(stateAt(10), link)).toEqual({ from: 7, to: 14, href: 'https://datadog.com' });
  });

  it('is null outside a link', () => {
    expect(findLinkRange(stateAt(3), link)).toBeNull();
  });
});

describe('applyLink', () => {
  it('links the selected text', () => {
    const tr = applyLink(stateAt(1, 3), link, ' https://go.dev ')!;
    expect(linksIn(stateAt(1).apply(tr))).toContainEqual({ text: 'Go', href: 'https://go.dev' });
  });

  it('changes the link the cursor is in', () => {
    const tr = applyLink(stateAt(10), link, 'https://example.com')!;
    expect(linksIn(stateAt(1).apply(tr))).toEqual([{ text: 'Datadog', href: 'https://example.com' }]);
  });

  it('removes the link when the URL is blank', () => {
    const tr = applyLink(stateAt(10), link, '')!;
    expect(linksIn(stateAt(1).apply(tr))).toEqual([]);
  });

  it('inserts the URL as linked text at a bare cursor', () => {
    const tr = applyLink(stateAt(1), link, '/app/wiki/abc')!;
    const next = stateAt(1).apply(tr);
    expect(next.doc.textContent.startsWith('/app/wiki/abcGo to')).toBe(true);
    expect(linksIn(next)).toContainEqual({ text: '/app/wiki/abc', href: '/app/wiki/abc' });
  });

  it('does nothing when removing where there is no link', () => {
    expect(applyLink(stateAt(3), link, '')).toBeNull();
  });
});
