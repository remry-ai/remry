<script lang="ts">
  // A spreadsheet's or drawing's body, the same on a wiki page and in a doc: the grid, saving
  // itself (SheetEditor), or the drawing's picture (DrawingImage), which opens the full-screen
  // editor (DrawingEditor, loaded only then). An empty drawing can also start from an
  // excalidraw.com share link. The holder's header opens the editor through `drawingOpen`.
  import SheetEditor from '$lib/page/components/SheetEditor.svelte';
  import DrawingImage from '$lib/drawing/DrawingImage.svelte';
  import type { GridOrDrawing } from '$shared/types/body-types';

  interface Props {
    readonly bodyType: GridOrDrawing;
    readonly content: string;
    readonly title: string;
    /** False when archived: it shows but doesn't edit. */
    readonly editable: boolean;
    readonly onSave: (content: string) => Promise<void>;
    /** Uploads an encrypted copy to excalidraw.com and returns its link (drawing.shareLink). */
    readonly onShare?: () => Promise<string>;
    /** Fills an empty drawing from an excalidraw.com share link (drawing.importLink). */
    readonly onImportLink?: (url: string) => Promise<void>;
    /** After the drawing editor closes: reload, so the picture shows what was drawn. */
    readonly onDrawingClosed?: () => Promise<void>;
    /** Whether the drawing editor is open; the holder's pencil sets it. */
    drawingOpen?: boolean;
  }

  // eslint-disable-next-line prefer-const -- drawingOpen is $bindable, so it must be let
  let { bodyType, content, title, editable, onSave, onShare, onImportLink, onDrawingClosed, drawingOpen = $bindable(false) }: Props = $props();

  const closeDrawing = async () => {
    drawingOpen = false;
    await onDrawingClosed?.();
  };
</script>

{#if bodyType === 'sheet'}
  <SheetEditor {content} {editable} {onSave} {title} />
{:else}
  <DrawingImage {content} {title} readOnly={!editable} onOpen={() => { drawingOpen = true; }} onImportLink={editable ? onImportLink : undefined} />
  {#if drawingOpen}
    <!-- Loaded when opened, so other pages never load the editor or its styles. -->
    {#await import('$lib/drawing/DrawingEditor.svelte') then { default: DrawingEditor }}
      <DrawingEditor {content} {editable} {onSave} {title} {onShare} onClose={closeDrawing} />
    {/await}
  {/if}
{/if}
