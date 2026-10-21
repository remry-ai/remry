import { describe, it, expect } from 'vitest';
import { breakMarkdown, keepLineBreaks, unescapePageBreaks, type MdastNode } from '../line-breaks';

const text = (value: string): MdastNode => ({ type: 'text', value });
const br = (value = '<br>'): MdastNode => ({ type: 'html', value });

describe('keepLineBreaks', () => {
  it('turns a mid-line <br> into a hard break, in paragraphs and table cells', () => {
    const tree: MdastNode = {
      type: 'root',
      children: [
        { type: 'paragraph', children: [text('Line one'), br(), text('line two')] },
        { type: 'table', children: [{ type: 'tableRow', children: [{ type: 'tableCell', children: [text('x'), br('<br />'), text('y')] }] }] }
      ]
    };
    keepLineBreaks(tree);
    expect(tree.children?.[0]?.children?.map((n) => n.type)).toEqual(['text', 'break', 'text']);
    expect(tree.children?.[1]?.children?.[0]?.children?.[0]?.children?.map((n) => n.type)).toEqual(['text', 'break', 'text']);
  });

  it('drops a <br /> standing alone (an old empty-line marker), and leaves other html', () => {
    const tree: MdastNode = { type: 'root', children: [br('<br />'), { type: 'html', value: '<!-- pagebreak -->' }, br('<BR/>')] };
    keepLineBreaks(tree);
    expect(tree.children).toEqual([{ type: 'html', value: '<!-- pagebreak -->' }]);
  });
});

describe('breakMarkdown', () => {
  it('writes <br> in a table cell, a space in a heading, else a backslash break', () => {
    expect(breakMarkdown(['table', 'tableRow', 'tableCell', 'phrasing'])).toBe('<br>');
    expect(breakMarkdown(['headingAtx', 'heading', 'phrasing'])).toBe(' ');
    expect(breakMarkdown(['paragraph', 'phrasing'])).toBe('\\\n');
  });
});

describe('unescapePageBreaks', () => {
  it('restores a page break the editor escaped, on its own line only', () => {
    expect(unescapePageBreaks('Intro\n\n\\<!-- pagebreak -->\n\nNext')).toBe('Intro\n\n<!-- pagebreak -->\n\nNext');
    expect(unescapePageBreaks('\\<!-- page-break -->')).toBe('<!-- page-break -->');
    expect(unescapePageBreaks('Text \\<!-- pagebreak --> inline')).toBe('Text \\<!-- pagebreak --> inline');
  });
});
