// Keeps a table's short columns on one line. A browser shares a table's width between its
// columns by their content, so one long-text column (notes, a description) squeezes the
// others until dates, names and amounts wrap a word or a hyphen at a time ("2027-03-" / "01").
// When a table has such a long column, its short columns don't wrap and the long one takes
// what's left. `nowrapColumns` is the pure rule; `fitTableColumns` applies it to rendered tables.

/** A column is short when no cell in it is longer than this many characters. */
export const SHORT_COLUMN_CHARS = 24;

/** Which columns to keep on one line, given each row's cell texts (the header row included). */
export const nowrapColumns = (rows: readonly (readonly string[])[]): readonly boolean[] => {
  const width = Math.max(0, ...rows.map((row) => row.length));
  const longest = Array.from({ length: width }, (_, col) =>
    Math.max(0, ...rows.map((row) => (row[col] ?? '').trim().length))
  );
  // Without a long column the browser fits the columns on its own, wrapping only when it must.
  if (!longest.some((chars) => chars > SHORT_COLUMN_CHARS)) return longest.map(() => false);
  return longest.map((chars) => chars <= SHORT_COLUMN_CHARS);
};

/**
 * For a page that can't scroll (the PDF): a table whose kept-whole columns make it wider than
 * its box wraps them again, since a cut-off right side is worse than a wrapped date.
 */
export const wrapOverflowingTables = (container: ParentNode): void => {
  for (const table of container.querySelectorAll('table')) {
    const box = table.parentElement;
    if (!box || box.clientWidth === 0 || table.scrollWidth <= box.clientWidth) continue;
    for (const cell of table.querySelectorAll('.nowrap')) cell.classList.remove('nowrap');
  }
};

/** Marks the cells of each table's short columns with `.nowrap` (styled in `_base.scss`). */
export const fitTableColumns = (container: HTMLElement): void => {
  for (const table of container.querySelectorAll('table')) {
    const rows = [...table.rows].map((row) => [...row.cells]);
    const keep = nowrapColumns(rows.map((cells) => cells.map((cell) => cell.textContent ?? '')));
    for (const cells of rows) cells.forEach((cell, col) => cell.classList.toggle('nowrap', keep[col] ?? false));
  }
};
