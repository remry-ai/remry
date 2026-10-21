// Pure helpers for the markdown editor (Milkdown) so a round trip through it keeps line
// breaks and page breaks:
// - `keepLineBreaks` runs on the parsed tree (mdast) before the editor sees it. Milkdown's own
//   "preserve empty line" plugin deleted every `<br>`, mid-line ones included ("Line one<br>line
//   two" came back as "Line oneline two"), and wrote each empty paragraph back as a `<br />`
//   line. A `<br>` inside a paragraph, heading or table cell becomes a hard break; one standing
//   alone (an old empty-line marker) is dropped.
// - `breakMarkdown` is how a hard break is written back: a `<br>` in a table cell (a newline
//   would end the row), a space in a heading, otherwise a backslash line break.
// - `unescapePageBreaks` restores a `<!-- pagebreak -->` typed into the editor, which saves it
//   as text (`\<!-- pagebreak -->`), so it prints as a page break.

export interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
}

const BR = /^<br\s*\/?\s*>$/i;

/** Nodes whose children are inline: a `<br>` among them is a line break. */
const INLINE_PARENTS: ReadonlySet<string> = new Set([
  'paragraph', 'heading', 'tableCell', 'emphasis', 'strong', 'delete', 'link', 'linkReference'
]);

const isBr = (node: MdastNode): boolean => node.type === 'html' && BR.test((node.value ?? '').trim());

/** Turns `<br>` html nodes into hard breaks inside inline content, and drops standalone ones. Mutates `tree`. */
export const keepLineBreaks = (tree: MdastNode): void => {
  const walk = (node: MdastNode): void => {
    if (!node.children) return;
    const inline = INLINE_PARENTS.has(node.type);
    node.children = node.children.flatMap((child) => {
      if (!isBr(child)) return [child];
      return inline ? [{ type: 'break' }] : [];
    });
    for (const child of node.children) walk(child);
  };
  walk(tree);
};

/** The markdown for a hard break, given the stack of constructs it sits in (mdast-util-to-markdown's `state.stack`). */
export const breakMarkdown = (stack: readonly string[]): string => {
  if (stack.includes('tableCell')) return '<br>';
  if (stack.includes('heading')) return ' ';
  return '\\\n';
};

const ESCAPED_PAGE_BREAK = /^([ \t]*)\\(<!--\s*page-?break\s*-->)[ \t]*$/gim;

/** `\<!-- pagebreak -->` lines (a page break typed into the editor) back to the comment. */
export const unescapePageBreaks = (markdown: string): string => markdown.replace(ESCAPED_PAGE_BREAK, '$1$2');
