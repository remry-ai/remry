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

/** Marks the cells of each table's short columns with `.nowrap` (styled in `_base.scss`). */
export const fitTableColumns = (container: HTMLElement): void => {
  for (const table of container.querySelectorAll('table')) {
    const rows = [...table.rows].map((row) => [...row.cells]);
    const keep = nowrapColumns(rows.map((cells) => cells.map((cell) => cell.textContent ?? '')));
    for (const cells of rows) cells.forEach((cell, col) => cell.classList.toggle('nowrap', keep[col] ?? false));
  }
};
