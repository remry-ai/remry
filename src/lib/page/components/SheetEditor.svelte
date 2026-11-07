<script lang="ts">
  // A wiki page's spreadsheet body (bodyType 'sheet'), edited in place with
  // Jspreadsheet CE: typed cells, paste from Excel or Sheets, formulas
  // (=SUM(B2:B5)), resizable columns, renamed in a box of our own (below),
  // right-click to add or remove rows and columns. Every change saves itself after a short pause, as
  // the sheet's JSON (see $shared/utils/sheet).
  //
  // Formulas are worked out by $shared/utils/sheet-formula, not the library: its engine runs
  // eval, which the app's Content Security Policy refuses, so every formula showed #ERROR.
  // parseFormulas is off, cells keep what was typed, and after each change the formula cells
  // show their results (an error's reason in its tooltip). The line under the grid explains
  // the selected cell's formula, or how to write one, and names the formulas that fail.
  import { onMount } from 'svelte';
  import 'jsuites/dist/jsuites.css';
  import 'jspreadsheet-ce/dist/jspreadsheet.css';
  import 'jspreadsheet-ce/dist/jspreadsheet.themes.css';
  import type jspreadsheet from 'jspreadsheet-ce';
  import { columnLetter, normaliseFormula, readSheetContent, type SheetContent } from '$shared/utils/sheet';
  import { cellName, evaluateSheet, FORMULA_FUNCTIONS, parseCellNumber, type FormulaProblem } from '$shared/utils/sheet-formula';
  import { formatExample, MAX_DECIMALS, type SheetFormat } from '$shared/utils/sheet-format';
  import HelpPopover from '$lib/ui/HelpPopover.svelte';
  import ExpandIcon from '$lib/ui/ExpandIcon.svelte';

  interface Props {
    readonly content: string;
    /** False for an archived page: the grid shows but doesn't edit. */
    readonly editable?: boolean;
    readonly onSave: (content: string) => Promise<void>;
    /** Names the sheet in its full-screen bar. */
    readonly title?: string;
  }

  const { content, editable = true, onSave, title = 'Spreadsheet' }: Props = $props();

  const SAVE_DELAY_MS = 600;

  let host: HTMLDivElement;
  let worksheet: jspreadsheet.WorksheetInstance | null = null;
  let status = $state<'idle' | 'saving' | 'saved'>('idle');
  let error = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> = Promise.resolve();

  const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

  // Each column's number format lives on the library's own column options, which it moves,
  // inserts and deletes along with the column, so a format stays with its column. Not as
  // `format`: the library reads that one itself, as a mask, and fails on ours.
  type FormattedColumn = { remryFormat?: SheetFormat };
  const columnFormats = (sheet: jspreadsheet.WorksheetInstance): (SheetFormat | undefined)[] =>
    sheet.headers.map((_, i) => (sheet.options.columns?.[i] as FormattedColumn | undefined)?.remryFormat);

  // What the grid holds now: raw cells (formulas included) and what each cell shows.
  const snapshot = (sheet: jspreadsheet.WorksheetInstance): SheetContent => {
    const data = sheet.getData(false, false).map((row) => row.map(text));
    // The server works the values out again on save; these are the same results.
    const formats = columnFormats(sheet);
    const shown = evaluateSheet(data, formats).values;
    const headers = sheet.getHeaders(true) as string[];
    const widths = sheet.getWidth() as (number | string)[];
    const columns = headers.map((title, i) => {
      const width = Math.round(Number(widths[i]));
      return { title: title === columnLetter(i) ? '' : text(title), ...(width >= 20 && width <= 2000 && { width }), ...(formats[i] && { format: formats[i] }) };
    });
    return { version: 1, columns, data, values: shown };
  };

  const save = async () => {
    if (!worksheet) return;
    const json = JSON.stringify(snapshot(worksheet));
    status = 'saving';
    error = '';
    try {
      await onSave(json);
      status = 'saved';
    } catch (e) {
      status = 'idle';
      error = e instanceof Error ? e.message : String(e);
    }
  };

  /**
   * Enter on a selected cell opens its editor, keeping its value, as F2 does
   * (Jspreadsheet would move down instead). Enter while editing still saves
   * and moves down, and Shift+Enter moves up. It listens on window in the
   * capture phase to run before the library's own document listener.
   */
  const enterToEdit = (lib: typeof jspreadsheet, event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    // Enter in a field or on a button elsewhere on the page (the sub-page form) is that control's.
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;
    const sheet = worksheet;
    if (!sheet || !editable || lib.current !== sheet || sheet.edition) return;
    const selected = sheet.selectedCell?.map(Number);
    if (!selected || selected[0] !== selected[2] || selected[1] !== selected[3]) return;
    const cell = sheet.records[selected[1]!]?.[selected[0]!]?.element;
    if (!cell) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sheet.openEditor(cell, false, event);
  };

  // Renaming a column. The library's own rename asks with prompt(), which the desktop app's
  // window can't show (it has no handler for browser dialogs), and then resets the title to
  // its letter; a slow second click on a header did the same. So it's off
  // (allowRenameColumn: false), and a box of ours opens over the header instead: from the
  // right-click menu's "Rename column", or a double-click on the header.
  interface Renaming {
    readonly x: number;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  }
  let renaming = $state<Renaming | null>(null);
  const saveLabel = $derived(error ? `Not saved: ${error}` : status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Changes save themselves');
  let renameDraft = $state('');

  const startRename = (x: number) => {
    const header = worksheet?.headers[x];
    if (!worksheet || !editable || !header) return;
    const box = header.getBoundingClientRect();
    const origin = host.getBoundingClientRect();
    renameDraft = header.textContent ?? '';
    renaming = { x, left: box.left - origin.left, top: box.top - origin.top, width: box.width, height: box.height };
  };

  const commitRename = () => {
    const current = renaming;
    renaming = null;
    const name = renameDraft.trim();
    const header = current ? worksheet?.headers[current.x] : undefined;
    // setHeader fires onchangeheader, which saves.
    if (current && worksheet && name && name !== header?.textContent) worksheet.setHeader(current.x, name);
  };

  // Keys typed in the box are its own: the grid's listeners on the document never see them.
  const handleRenameKeydown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
    else if (e.key === 'Escape') { e.preventDefault(); renaming = null; }
  };

  const focusOnMount = (node: HTMLInputElement) => { node.focus(); node.select(); };

  // ----- Full screen -----
  // The same grid, moved onto <body> over the whole window (no stacking context on the page
  // can draw over it, as with the drawing editor), and back again: nothing is remounted, so
  // the selection, an edit and the save state carry on. The moved part is the editor's inner
  // box, never its outer element, which Svelte adds and removes where it was.
  let fullScreen = $state(false);
  let expandButton = $state<HTMLButtonElement | null>(null);

  const liftWhen = (node: HTMLElement, on: boolean) => {
    const home = document.createComment('sheet');
    const apply = (lifted: boolean) => {
      if (lifted && node.parentNode !== document.body) {
        node.replaceWith(home);
        document.body.append(node);
      } else if (!lifted && home.parentNode) {
        home.replaceWith(node);
      }
    };
    apply(on);
    return {
      update: apply,
      destroy: () => {
        if (node.parentNode === document.body) node.remove();
        home.remove();
      }
    };
  };

  const closeFullScreen = () => {
    fullScreen = false;
    queueMicrotask(() => expandButton?.focus());
  };

  // Esc leaves full screen, unless it's ending a cell's edit, the rename box or something open. In the capture
  // phase, so it sees the edit before the library's own listener ends it.
  const fullScreenKeys = (event: KeyboardEvent) => {
    if (!fullScreen || event.key !== 'Escape' || renaming || worksheet?.edition) return;
    // The formula help, a field, or the grid's open right-click menu closes first.
    if ((event.target as HTMLElement | null)?.closest('input, textarea, .help-popover') || document.querySelector('.jcontextmenu-focus')) return;
    event.preventDefault();
    event.stopPropagation();
    closeFullScreen();
  };

  // ----- Number formats -----
  // The header's menu sets a column's format ("Format column"): what its numbers show as.
  const FORMAT_CHOICES: readonly { readonly name: string; readonly format: SheetFormat | undefined }[] = [
    { name: 'As typed', format: undefined },
    { name: 'Number', format: { type: 'number', decimals: 2 } },
    { name: 'Whole number', format: { type: 'number', decimals: 0 } },
    { name: 'Dollars', format: { type: 'currency', decimals: 2, symbol: '$' } },
    { name: 'Euros', format: { type: 'currency', decimals: 2, symbol: '€' } },
    { name: 'Pounds', format: { type: 'currency', decimals: 2, symbol: '£' } },
    { name: 'Yen', format: { type: 'currency', decimals: 0, symbol: '¥' } },
    { name: 'Percent', format: { type: 'percent', decimals: 0 } }
  ];

  const sameKind = (a: SheetFormat | undefined, b: SheetFormat | undefined): boolean =>
    a === b || (!!a && !!b && a.type === b.type && a.symbol === b.symbol && (a.type !== 'number' || (a.decimals === 0) === (b.decimals === 0)));

  const setFormat = (x: number, format: SheetFormat | undefined) => {
    const column = worksheet?.options.columns?.[x] as FormattedColumn | undefined;
    if (!column) return;
    if (format) column.remryFormat = format;
    else delete column.remryFormat;
    schedule();
  };

  const formatMenu = (x: number): jspreadsheet.ContextMenuItem[] => {
    const current = (worksheet?.options.columns?.[x] as FormattedColumn | undefined)?.remryFormat;
    const step = (by: number) => {
      if (!current) return;
      const decimals = Math.min(MAX_DECIMALS, Math.max(0, current.decimals + by));
      if (decimals !== current.decimals) setFormat(x, { ...current, decimals });
    };
    return [
      ...FORMAT_CHOICES.map((choice) => ({
        title: `${sameKind(choice.format, current) ? '✓ ' : ''}${choice.name}${choice.format ? ` (${formatExample(choice.format)})` : ''}`,
        onclick: () => setFormat(x, choice.format)
      })),
      { type: 'line', title: '' },
      { title: 'More decimals', disabled: !current || current.decimals >= MAX_DECIMALS, onclick: () => step(1) },
      { title: 'Fewer decimals', disabled: !current || current.decimals <= 0, onclick: () => step(-1) }
    ];
  };

  // ----- Formulas -----
  let problems = $state<readonly FormulaProblem[]>([]);
  let selected = $state<{ readonly x: number; readonly y: number } | null>(null);
  let selectedFormula = $state<{ readonly cell: string; readonly formula: string; readonly result: string; readonly problem: FormulaProblem | null } | null>(null);

  // Shows each formula's result in its cell (the cell keeps the formula, for editing).
  const showResults = () => {
    const sheet = worksheet;
    if (!sheet) return;
    const data = sheet.getData(false, false).map((row) => row.map(text));
    const formats = columnFormats(sheet);
    const evaluated = evaluateSheet(data, formats);
    const failed = new Map(evaluated.problems.map((p) => [p.cell, p]));
    data.forEach((row, y) => row.forEach((raw, x) => {
      const element = sheet.records[y]?.[x]?.element;
      if (!element) return;
      const shown = evaluated.values[y]![x]!;
      // A number in a formatted column, typed or worked out, lines up on the right.
      element.classList.toggle('formatted-cell', !!formats[x] && parseCellNumber(shown) !== null);
      if (!raw.startsWith('=')) {
        if (element.classList.contains('formula-cell')) {
          element.classList.remove('formula-cell', 'formula-error');
          element.removeAttribute('title');
        }
        // A typed number in its column's format ($1,200.00); the cell keeps what was typed.
        if (element.textContent !== shown) element.textContent = shown;
        return;
      }
      const problem = failed.get(cellName(x, y));
      element.textContent = evaluated.values[y]![x]!;
      element.classList.add('formula-cell');
      element.classList.toggle('formula-error', !!problem);
      element.title = problem ? `${raw}: ${problem.message}` : raw;
    }));
    problems = evaluated.problems;
    describeSelected(data, evaluated.values, failed);
    markColumnLetters(sheet);
  };

  // A renamed column still goes by its letter in formulas: the header shows it, small, after
  // the title (data-letter, drawn by CSS, so the title the library keeps is untouched).
  const markColumnLetters = (sheet: jspreadsheet.WorksheetInstance) => {
    sheet.headers.forEach((header, x) => {
      const letter = columnLetter(x);
      if ((header.textContent ?? '').trim() !== letter) {
        header.dataset.letter = letter;
        header.title = `Column ${letter} in formulas: ${letter}1, ${letter}2… or ${letter}1:${letter}9`;
      } else if (header.dataset.letter) {
        delete header.dataset.letter;
        header.removeAttribute('title');
      }
    });
  };

  const describeSelected = (data?: string[][], values?: string[][], failed?: Map<string, FormulaProblem>) => {
    const sheet = worksheet;
    const at = selected;
    if (!sheet || !at) { selectedFormula = null; return; }
    const rows = data ?? sheet.getData(false, false).map((row) => row.map(text));
    const raw = rows[at.y]?.[at.x] ?? '';
    if (!raw.startsWith('=')) { selectedFormula = null; return; }
    const evaluated = values && failed ? { values, failed } : (() => { const e = evaluateSheet(rows, columnFormats(sheet)); return { values: e.values, failed: new Map(e.problems.map((p) => [p.cell, p])) }; })();
    const cell = cellName(at.x, at.y);
    selectedFormula = { cell, formula: raw, result: evaluated.values[at.y]?.[at.x] ?? '', problem: evaluated.failed.get(cell) ?? null };
  };

  const handleSelection = (x1: number, y1: number, x2: number, y2: number) => {
    selected = x1 === x2 && y1 === y2 ? { x: x1, y: y1 } : null;
    describeSelected();
  };

  // Saves run one after another, so an older snapshot never lands after a newer one.
  const schedule = () => {
    showResults();
    if (!editable) return;
    clearTimeout(timer);
    timer = setTimeout(() => { pending = pending.then(save); }, SAVE_DELAY_MS);
  };

  onMount(() => {
    let destroyed = false;
    let removeKeys: (() => void) | undefined;
    const sheet = readSheetContent(content);
    (async () => {
      const lib = (await import('jspreadsheet-ce')).default;
      if (destroyed) return;
      const [instance] = lib(host, {
        tabs: false,
        toolbar: false,
        // Worked out by sheet-formula (showResults): the library's engine needs eval.
        parseFormulas: false,
        onselection: (_sheet, x1, y1, x2, y2) => handleSelection(x1, y1, x2, y2),
        worksheets: [{
          data: sheet.data.map((row) => [...row]),
          columns: sheet.columns.map((c, i) => ({ title: c.title || columnLetter(i), width: c.width ?? 120, type: 'text' as const, ...(c.format && { remryFormat: c.format }) })),
          minDimensions: [sheet.columns.length, Math.max(sheet.data.length, 1)],
          editable,
          allowComments: false,
          tableOverflow: true,
          tableHeight: '520px',
          columnSorting: false,
          // Renamed in a box of ours (startRename), never through prompt().
          allowRenameColumn: false
        }],
        // The library's "About" entry links to its website; Remry links nowhere. A header's
        // menu gets "Rename column" and "Format column" after its column items.
        contextMenu: (_sheet, x, _y, _e, items, role) => {
          const kept = items.filter((item) => item.title !== 'About');
          const column = x === null || x === undefined ? NaN : Number(x);
          if (role === 'header' && editable && Number.isInteger(column)) {
            const after = kept.findIndex((item) => item.title === 'Delete selected columns');
            kept.splice(after >= 0 ? after + 1 : 0, 0, { title: 'Rename column', onclick: () => startRename(column) }, { title: 'Format column', submenu: formatMenu(column) });
          }
          while (kept.length > 0 && kept[kept.length - 1]!.type === 'line') kept.pop();
          return kept;
        },
        // Typed or pasted =sum(b2:c2) is stored and evaluated as =SUM(B2:C2).
        onbeforechange: (_sheet, _cell, _x, _y, value) => (typeof value === 'string' ? normaliseFormula(value) : value),
        onafterchanges: schedule,
        oninsertrow: schedule,
        ondeleterow: schedule,
        oninsertcolumn: schedule,
        ondeletecolumn: schedule,
        onmoverow: schedule,
        onmovecolumn: schedule,
        onresizecolumn: schedule,
        onchangeheader: schedule,
        onundo: schedule,
        onredo: schedule
      });
      worksheet = instance ?? null;
      showResults();
      const onKey = (event: KeyboardEvent) => enterToEdit(lib, event);
      window.addEventListener('keydown', onKey, true);
      // A double-click on a column header renames it.
      const onDoubleClick = (event: MouseEvent) => {
        const header = (event.target as HTMLElement | null)?.closest<HTMLElement>('thead td[data-x]');
        if (!header || !host.contains(header)) return;
        event.preventDefault();
        startRename(Number(header.dataset.x));
      };
      host.addEventListener('dblclick', onDoubleClick);
      removeKeys = () => {
        window.removeEventListener('keydown', onKey, true);
        host.removeEventListener('dblclick', onDoubleClick);
      };
    })();

    return () => {
      destroyed = true;
      removeKeys?.();
      // Leaving the page with a save still waiting: send it now.
      if (timer !== undefined && worksheet) {
        clearTimeout(timer);
        void save();
      }
      // Kept here: Svelte clears `host` once the component is gone, before the import resolves.
      const el = host as jspreadsheet.JspreadsheetInstanceElement | null;
      if (el?.spreadsheet) {
        import('jspreadsheet-ce').then(({ default: lib }) => lib.destroy(el, true));
      }
      worksheet = null;
    };
  });
</script>

<svelte:window onkeydowncapture={fullScreenKeys} />

<div class="sheet-editor">
<div class="sheet-body" class:full-screen={fullScreen} use:liftWhen={fullScreen} role={fullScreen ? 'dialog' : undefined} aria-modal={fullScreen ? 'true' : undefined} aria-label={fullScreen ? title : undefined}>
  {#if fullScreen}
    <div class="full-screen-bar">
      <span class="full-screen-title truncate">{title}</span>
      <button type="button" class="btn icon sm" onclick={closeFullScreen} aria-label="Close full screen" title="Close full screen">&times;</button>
    </div>
  {/if}
  <div class="sheet-frame">
    <div class="sheet-grid" bind:this={host}></div>
    {#if renaming}
      <input
        class="sm rename-column"
        style="--left: {renaming.left}px; --top: {renaming.top}px; --width: {renaming.width}px; --height: {renaming.height}px"
        bind:value={renameDraft}
        onkeydown={handleRenameKeydown}
        onblur={commitRename}
        use:focusOnMount
        aria-label="Column name"
      />
    {/if}
  </div>
  <!-- The save state first, then formula help on a click, then the selected formula or the ones that fail. -->
  <div class="sheet-status text-xs">
    {#if editable}
      <!-- The save state as a dot: grey with nothing to save yet, amber while saving, green once saved, red when a save failed. The words are its tooltip and for screen readers. -->
      <span class="save-dot {error ? 'failed' : status}" title={saveLabel} role="status"><span class="sr-only">{saveLabel}</span></span>
    {/if}
    <HelpPopover label="Formulas" placement="above">
      <p>Start a cell with <code>=</code> for a formula: <code>=SUM(B1:B5)</code>, <code>=B2*C2</code>, <code>=IF(B2&gt;100,"high","low")</code>, <code>="Total: "&amp;B6</code>.</p>
      <p>Columns go by their letter (A, B, C…) and rows by their number, so <code>B2</code> is column B, row 2, and <code>B2:B9</code> a range. A renamed column shows its letter in the header's top-left corner.</p>
      <p>Use <code>+ - * / ^</code>, <code>%</code>, <code>&amp;</code> to join text, and <code>= &lt;&gt; &lt; &gt; &lt;= &gt;=</code> to compare. Functions: {FORMULA_FUNCTIONS.join(', ')}.</p>
      <p>A formula that fails shows its error in red: <code>#NAME?</code> (no such function), <code>#DIV/0!</code>, <code>#VALUE!</code> (text where a number goes), <code>#CYCLE!</code> (a cell that refers back to itself), <code>#ERROR!</code> (one that can't be read). Select it to see why.</p>
      <p><code>TEXT(B2,"$#,##0.00")</code> writes a number as text in a format code: <code>0</code> a digit, <code>#</code> one only when needed, <code>,</code> thousands, <code>.</code> decimals, <code>%</code> a percent; other symbols and <code>"quoted words"</code> show as written.</p>
      <p>To show a whole column as money or a percent, right-click its header and choose Format column. It changes only how numbers look: formulas still use what was typed, and <code>$1,200</code>, <code>1200</code> and <code>12%</code> all read as numbers.</p>
      <p>Right-click a row or column to add or remove one; double-click a header to rename it.</p>
      <p>More in <a href="https://bossanova.uk/jspreadsheet/docs/formulas" target="_blank" rel="noreferrer">Jspreadsheet's formula docs ↗</a>; only the functions above work here.</p>
    </HelpPopover>
    {#if selectedFormula}
      <span class="formula-line"><strong>{selectedFormula.cell}</strong> <code>{selectedFormula.formula}</code>
        {#if selectedFormula.problem}<span class="formula-problem">{selectedFormula.problem.code} {selectedFormula.problem.message}</span>{:else}= <strong>{selectedFormula.result}</strong>{/if}
      </span>
    {/if}
    {#if problems.length > 0}
      <span class="formula-problem">{problems.length === 1 ? '1 formula fails' : `${problems.length} formulas fail`}: {problems.slice(0, 5).map((p) => p.cell).join(', ')}{problems.length > 5 ? '…' : ''}. Select one to see why.</span>
    {/if}
    {#if !fullScreen}
      <button bind:this={expandButton} type="button" class="btn icon sm expand" onclick={() => { fullScreen = true; }} aria-label="Full screen" title="Full screen"><ExpandIcon /></button>
    {/if}
  </div>
  {#if error}<p class="form-error">{error}</p>{/if}
</div>
</div>

<style lang="scss">
  .sheet-editor { min-width: 0; }

  // Full screen: the window's height for the grid, with a bar naming the sheet above it.
  .sheet-body.full-screen {
    position: fixed;
    inset: 0;
    z-index: var(--z-viewer);
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3) var(--sp-3);
    background: var(--bg);

    .sheet-frame {
      flex: 1;
      min-height: 0;
    }
    // Over the library's inline max-height (tableHeight), hence !important.
    :global(.jss_content) { max-height: 100% !important; }
    .sheet-grid,
    .sheet-grid :global(.jtabs-content),
    :global(.jss_container) { height: 100%; }
  }
  .full-screen-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
  }
  .full-screen-title {
    font-weight: 600;
    min-width: 0;
  }
  .expand { margin-left: auto; }

  // The rename box sits over the header it renames (its offset within the frame).
  .sheet-frame { position: relative; }
  .rename-column {
    position: absolute;
    left: var(--left);
    top: var(--top);
    width: max(var(--width), 8em);
    height: var(--height);
    z-index: var(--z-sticky);
  }

  // The grid wears the app's tokens (jspreadsheet.themes.css reads these).
  .sheet-grid {
    max-width: 100%;
    // Cells are written content: its font and size (--font-text, --fs-text).
    font-family: var(--font-text);
    font-size: var(--fs-text);

    :global(.jss_container) {
      --border_color: var(--border);
      --border_color_highlighted: var(--accent);
      --header_background: var(--surface-2);
      --header_color: var(--text-2);
      --header_background_highlighted: var(--accent-soft);
      // A selected row's or column's header keeps dark text on its soft highlight.
      --header_color_highlighted: var(--text);
      --content_background: var(--surface);
      --content_color: var(--text);
      --content_selected: var(--accent-soft);
      --selection: var(--accent-soft);
      --active_color: var(--surface);
      --cursor: var(--accent-soft);
      --menu_background: var(--surface);
      --menu_color: var(--text);
      --menu_shadow: var(--shadow-2);
      max-width: 100%;
    }
    // As wide as the columns, up to the page; wider sheets scroll.
    :global(.jss_content) {
      max-width: 100%;
      box-shadow: none;
      border: 1px solid var(--border);
      border-radius: var(--r-md);
    }
  }

  // One wrapping row from the left: the save state, Formulas help, the selected formula.
  .sheet-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-3);
    margin-top: var(--sp-1);
    min-height: 1.4em;
    p { margin: 0; }
  }
  .save-dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: var(--r-full);
    background: var(--text-3);
    opacity: 0.5;
    transition: background-color var(--ease), opacity var(--ease);
    &.saving { background: var(--warning); opacity: 1; }
    &.saved { background: var(--success); opacity: 1; }
    &.failed { background: var(--danger); opacity: 1; }
  }
  .formula-problem { color: var(--danger); }
  // Numbers in a formatted column line up on the right, in even-width figures (over the
  // library's inline text-align, hence !important).
  .sheet-grid :global(tbody td.formatted-cell) {
    text-align: right !important;
    font-variant-numeric: tabular-nums;
  }
  // Column headers in bold; a renamed one shows its formula letter in its top-left corner
  // (the header cell is sticky, so it already positions the letter).
  .sheet-grid :global(thead td) { font-weight: 600; }
  .sheet-grid :global(thead td[data-letter])::after {
    content: attr(data-letter);
    position: absolute;
    top: 1px;
    left: var(--sp-1);
    font-weight: 400;
    font-size: var(--fs-xs);
    line-height: 1;
    color: var(--text-3);
    pointer-events: none;
  }
  // A formula cell's result, and one that fails, told apart in the grid.
  .sheet-grid :global(td.formula-error) { color: var(--danger); }
</style>
