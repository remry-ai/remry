// Milkdown plugin: exit code blocks with Enter (empty last line) or Mod-Enter.
// Use in any Milkdown editor: `.use(exitCodeBlockPlugin)`

import { $prose } from '@milkdown/utils';
import { keymap } from '@milkdown/prose/keymap';
import { Selection } from '@milkdown/prose/state';

export const exitCodeBlockPlugin = $prose(() => {
  return keymap({
    'Mod-Enter': (state, dispatch) => {
      const head = state.selection.$head;
      if (head.parent.type.name !== 'code_block') return false;
      if (!dispatch) return true;
      const after = head.after();
      const paragraph = state.schema.nodes['paragraph']!.create();
      const tr = state.tr.insert(after, paragraph);
      tr.setSelection(Selection.near(tr.doc.resolve(after + 1)));
      dispatch(tr);
      return true;
    },
    // 'Enter': (state, dispatch) => {
    //   const head = state.selection.$head;
    //   const parent = head.parent;
    //   if (parent.type.name !== 'code_block') return false;
    //   const text = parent.textContent;
    //   const atEnd = head.parentOffset === text.length;
    //   if (!atEnd || !text.endsWith('\n')) return false;
    //   if (!dispatch) return true;
    //   const from = head.pos - 1;
    //   const to = head.pos;
    //   const after = head.after();
    //   const paragraph = state.schema.nodes['paragraph']!.create();
    //   const tr = state.tr.delete(from, to).insert(after - 1, paragraph);
    //   tr.setSelection(Selection.near(tr.doc.resolve(after)));
    //   dispatch(tr);
    //   return true;
    // }
  });
});
