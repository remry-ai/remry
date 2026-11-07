<script lang="ts">
  // A wiki page's spreadsheet body (bodyType 'sheet'), edited in place with
  // Jspreadsheet CE: typed cells, paste from Excel or Sheets, basic formulas
  // (=SUM(B2:B5)), resizable columns, renamed in a box of our own (below),
  // right-click to add or remove rows and columns. Every change saves itself after a short pause, as
  // the sheet's JSON with the values the grid showed (see $shared/utils/sheet).
  import { onMount } from 'svelte';
  import 'jsuites/dist/jsuites.css';
  import 'jspreadsheet-ce/dist/jspreadsheet.css';
  import 'jspreadsheet-ce/dist/jspreadsheet.themes.css';
  import type jspreadsheet from 'jspreadsheet-ce';
  import { columnLetter, normaliseFormula, readSheetContent, type SheetContent } from '$shared/utils/sheet';

  interface Props {
    readonly content: string;
    /** False for an archived page: the grid shows but doesn't edit. */
    readonly editable?: boolean;
    readonly onSave: (content: string) => Promise<void>;
  }

  const { content, editable = true, onSave }: Props = $props();

  const SAVE_DELAY_MS = 600;

  let host: HTMLDivElement;
  let worksheet: jspreadsheet.WorksheetInstance | null = null;
  let status = $state<'idle' | 'saving' | 'saved'>('idle');
  let error = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> = Promise.resolve();

  const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

  // What the grid holds now: raw cells (formulas included) and what each cell shows.
  const snapshot = (sheet: jspreadsheet.WorksheetInstance): SheetContent => {
    const data = sheet.getData(false, false).map((row) => row.map(text));
    const shown = data.map((row, y) => row.map((_, x) => sheet.records[y]?.[x]?.element?.textContent ?? ''));
    const headers = sheet.getHeaders(true) as string[];
    const widths = sheet.getWidth() as (number | string)[];
    const columns = headers.map((title, i) => {
      const width = Math.round(Number(widths[i]));
      return { title: title === columnLetter(i) ? '' : text(title), ...(width >= 20 && width <= 2000 && { width }) };
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

  // Saves run one after another, so an older snapshot never lands after a newer one.
  const schedule = () => {
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
        worksheets: [{
          data: sheet.data.map((row) => [...row]),
          columns: sheet.columns.map((c, i) => ({ title: c.title || columnLetter(i), width: c.width ?? 120, type: 'text' as const })),
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
        // menu gets "Rename column" after its column items.
        contextMenu: (_sheet, x, _y, _e, items, role) => {
          const kept = items.filter((item) => item.title !== 'About');
          const column = x === null || x === undefined ? NaN : Number(x);
          if (role === 'header' && editable && Number.isInteger(column)) {
            const after = kept.findIndex((item) => item.title === 'Delete selected columns');
            kept.splice(after >= 0 ? after + 1 : 0, 0, { title: 'Rename column', onclick: () => startRename(column) });
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

<div class="sheet-editor">
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
  <p class="sheet-status text-xs muted" aria-live="polite">
    {#if status === 'saving'}Saving…{:else if status === 'saved'}Saved{:else if editable}Enter or double-click edits a cell; start it with = for a formula, like =SUM(B1:B5). Right-click to add or remove rows and columns; double-click a column header to rename it.{/if}
  </p>
  {#if error}<p class="form-error">{error}</p>{/if}
</div>

<style lang="scss">
  .sheet-editor { min-width: 0; }

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
      --header_color_highlighted: var(--accent-text);
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

  .sheet-status {
    margin-top: var(--sp-1);
    min-height: 1.4em;
  }
</style>
