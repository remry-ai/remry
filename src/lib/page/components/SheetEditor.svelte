<script lang="ts">
  // A wiki page's spreadsheet body (bodyType 'sheet'), edited in place with
  // Jspreadsheet CE: typed cells, paste from Excel or Sheets, basic formulas
  // (=SUM(B2:B5)), resizable and renameable columns, right-click to add or
  // remove rows and columns. Every change saves itself after a short pause, as
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
          columnSorting: false
        }],
        // The library's "About" entry links to its website; Remry links nowhere.
        contextMenu: (_sheet, _x, _y, _e, items) => {
          const kept = items.filter((item) => item.title !== 'About');
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
      removeKeys = () => window.removeEventListener('keydown', onKey, true);
    })();

    return () => {
      destroyed = true;
      removeKeys?.();
      // Leaving the page with a save still waiting: send it now.
      if (timer !== undefined && worksheet) {
        clearTimeout(timer);
        void save();
      }
      if (host && (host as jspreadsheet.JspreadsheetInstanceElement).spreadsheet) {
        import('jspreadsheet-ce').then(({ default: lib }) => lib.destroy(host as jspreadsheet.JspreadsheetInstanceElement, true));
      }
      worksheet = null;
    };
  });
</script>

<div class="sheet-editor">
  <div class="sheet-grid" bind:this={host}></div>
  <p class="sheet-status text-xs muted" aria-live="polite">
    {#if status === 'saving'}Saving…{:else if status === 'saved'}Saved{:else if editable}Enter or double-click edits a cell; start it with = for a formula, like =SUM(B1:B5). Right-click to add or remove rows and columns; double-click a column header to rename it.{/if}
  </p>
  {#if error}<p class="form-error">{error}</p>{/if}
</div>

<style lang="scss">
  .sheet-editor { min-width: 0; }

  // The grid wears the app's tokens (jspreadsheet.themes.css reads these).
  .sheet-grid {
    max-width: 100%;
    font-size: var(--fs-sm);

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
