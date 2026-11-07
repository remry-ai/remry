<script lang="ts">
  // An open doc that's a spreadsheet or a drawing, built like a document's DocEditor from the
  // same parts: DocTitle (tag, title, rename), its links, DocBar (Export PDF, its actions, ×),
  // then the body exactly as a wiki page shows it (BodyView). A spreadsheet's bar has Full screen
  // and Save (SheetActions) before the ×, where a document has its Save.
  import type { Snippet } from 'svelte';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';
  import BodyView from './BodyView.svelte';
  import DocTitle from './DocTitle.svelte';
  import DocBar from './DocBar.svelte';
  import SheetActions from './SheetActions.svelte';
  import { SheetControl } from './sheet-control.svelte';
  import { goto } from '$app/navigation';
  import { isEmptyBody } from '$shared/utils/body';
  import type { GridOrDrawing } from '$shared/types/body-types';

  interface Props {
    readonly title: string;
    readonly bodyType: GridOrDrawing;
    readonly content: string;
    /** False when what it's on is archived: it shows but doesn't edit. */
    readonly editable: boolean;
    readonly onSave: (content: string) => Promise<void>;
    readonly onSaveTitle?: (title: string) => Promise<void>;
    readonly onClose: () => void;
    /** After the full-screen drawing editor closes: reload, so the picture shows what was drawn. */
    readonly onDrawingClosed?: () => Promise<void>;
    readonly onShare?: () => Promise<string>;
    readonly onImportLink?: (url: string) => Promise<void>;
    readonly exportHref?: string;
    readonly sources?: Snippet;
    /** A doc just made: it opens with its title selected, ready to type over. */
    readonly autoEditTitle?: boolean;
  }

  const { title, bodyType, content, editable, onSave, onSaveTitle, onClose, onDrawingClosed, onShare, onImportLink, exportHref, sources, autoEditTitle = false }: Props = $props();

  let drawingOpen = $state(false);

  // A spreadsheet saves as a document does: Save in the bar, and its changes are saved before
  // it closes or exports, so neither loses them.
  const sheet = new SheetControl();
  const handleClose = async () => {
    if (await sheet.save()) onClose();
  };
  const handleExport = async (e: MouseEvent) => {
    if (!exportHref || !sheet.dirty || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    if (await sheet.save()) await goto(exportHref);
  };
</script>

<section class="card doc-card">
  <DocTitle {title} {bodyType} onSaveTitle={editable ? onSaveTitle : undefined} autoEdit={autoEditTitle} />
  {#if sources}<div class="doc-sources">{@render sources()}</div>{/if}
  <div>
    <DocBar {title} {bodyType} exportHref={isEmptyBody(bodyType, content) ? undefined : exportHref} onExport={handleExport} onClose={handleClose}>
      {#snippet actions()}
        {#if bodyType === 'sheet'}
          <SheetActions control={sheet} {editable} />
        {:else}
          <button type="button" class="btn icon sm" aria-label="{editable ? 'Edit' : 'Open'} the drawing {title}" title={editable ? 'Edit drawing' : 'Open full screen'} onclick={() => { drawingOpen = true; }}><PencilIcon /></button>
        {/if}
      {/snippet}
    </DocBar>
    <BodyView {bodyType} {content} {title} {editable} {onSave} {onShare} {onImportLink} {onDrawingClosed} bind:drawingOpen sheetControl={sheet} />
  </div>
</section>

<style lang="scss">
  // As DocEditor's card: the title, its links tucked under it, then the bar and the body.
  .doc-card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  .doc-sources { margin-top: calc(-1 * var(--sp-1)); }
</style>
