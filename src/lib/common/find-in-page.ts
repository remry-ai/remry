// Find on page for the desktop app's window, which has no find bar of its own (WebKit's
// view shows none, so ⌘F did nothing). The pure parts, and the walk that turns a query
// into ranges over the text the page shows.

/** Where `query` starts in `text`, ignoring case; overlapping matches aren't counted twice. */
export const matchOffsets = (text: string, query: string): readonly number[] => {
  const needle = query.toLowerCase();
  const haystack = text.toLowerCase();
  // Lower-casing changed a length (rare: 'İ'), so offsets wouldn't line up with the text.
  if (!needle || haystack.length !== text.length) return [];
  const found: number[] = [];
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) found.push(at);
  return found;
};

/** The next (1) or previous (-1) match, wrapping round; -1 when there are none. */
export const stepIndex = (current: number, total: number, direction: 1 | -1): number => {
  if (total === 0) return -1;
  if (current < 0) return direction === 1 ? 0 : total - 1;
  return (current + direction + total) % total;
};

/** "3 of 12", or "No matches" once something is typed. */
export const matchLabel = (index: number, total: number, query: string): string => {
  if (!query) return '';
  return total === 0 ? 'No matches' : `${index + 1} of ${total}`;
};

interface FindKey {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/** ⌘F (Ctrl+F): open the find bar. */
export const isFindShortcut = (e: FindKey): boolean =>
  (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f';

/** ⌘G (Ctrl+G) for the next match, ⇧⌘G for the previous; null for any other key. */
export const findAgainDirection = (e: FindKey): 1 | -1 | null =>
  (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'g' ? (e.shiftKey ? -1 : 1) : null;

// Text the reader can't see as page text: code that runs, styles, and form fields (whose
// text isn't in text nodes anyway).
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'TEMPLATE']);

/** Marks an element whose text find leaves out: the find bar itself. */
export const FIND_SKIP_ATTR = 'data-find-skip';

const isShown = (el: Element): boolean => el.getClientRects().length > 0;

/** Every match of `query` in the text shown under `root`, in page order. A match within one text node only. */
export const findRanges = (root: Node, query: string): Range[] => {
  if (!query) return [];
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest(`[${FIND_SKIP_ATTR}]`)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const ranges: Range[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? '';
    const offsets = matchOffsets(text, query);
    if (offsets.length === 0 || !isShown(node.parentElement!)) continue;
    for (const at of offsets) {
      const range = doc.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + query.length);
      ranges.push(range);
    }
  }
  return ranges;
};
