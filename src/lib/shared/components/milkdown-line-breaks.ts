// Milkdown: keep `<br>` line breaks and page breaks through an edit (pure parts and the why in
// line-breaks.ts). Use `commonmarkKeepingBreaks` in place of `commonmark`, add
// `.use(lineBreaksPlugin)`, call `configureLineBreaks(ctx)` in `.config`, and pass the editor's
// markdown through `unescapePageBreaks` before saving it.

import { remarkStringifyOptionsCtx } from '@milkdown/core';
import type { Ctx, MilkdownPlugin } from '@milkdown/ctx';
import { commonmark, remarkPreserveEmptyLinePlugin } from '@milkdown/preset-commonmark';
import { $remark } from '@milkdown/utils';
import { breakMarkdown, keepLineBreaks, type MdastNode } from './line-breaks';

/** The commonmark preset without its empty-line plugin, which dropped every `<br>` and wrote empty paragraphs as `<br />`. */
export const commonmarkKeepingBreaks: MilkdownPlugin[] = commonmark.filter(
  (plugin) => plugin !== remarkPreserveEmptyLinePlugin.plugin && plugin !== remarkPreserveEmptyLinePlugin.options
);

export const lineBreaksPlugin = $remark('remry-keep-line-breaks', () => () => (tree: unknown) => {
  keepLineBreaks(tree as MdastNode);
});

/** Writes a hard break as `<br>` in a table cell, where a backslash line break would end the row. */
export const configureLineBreaks = (ctx: Ctx): void => {
  ctx.update(remarkStringifyOptionsCtx, (options) => ({
    ...options,
    handlers: {
      ...options.handlers,
      break: (_node: unknown, _parent: unknown, state: { readonly stack: readonly string[] }) => breakMarkdown(state.stack)
    }
  }));
};
