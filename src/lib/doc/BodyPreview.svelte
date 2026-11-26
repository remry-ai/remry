<script lang="ts">
  // A doc's or wiki page's body, the same in every peek: a document as rendered markdown, a
  // spreadsheet as a table of the values its cells showed (bodyMarkdown), a drawing as its
  // picture. Read-only, except that with onSave a drawing's zoomed picture has the pencil
  // beside ×, which opens the full-screen editor (DrawingEditor, loaded only then).
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import MarkdownRenderer from '$lib/common/MarkdownRenderer.svelte';
  import DrawingImage from '$lib/drawing/DrawingImage.svelte';
  import { bodyMarkdown } from '$shared/utils/body';
  import { isEmptyDrawing, readDrawingContent } from '$shared/utils/drawing';
  import type { BodyType } from '$shared/types/body-types';

  interface Props {
    readonly bodyType: BodyType;
    readonly content: string;
    readonly title: string;
    /** Shown when there's nothing in it: "This page is empty." */
    readonly emptyMessage: string;
    /** Saves an edited drawing; without it (an archived page) the drawing doesn't edit. */
    readonly onSave?: (content: string) => Promise<void>;
    /** Uploads an encrypted copy to excalidraw.com and returns its link (drawing.shareLink). */
    readonly onShare?: () => Promise<string>;
    /** After the drawing editor closes: reload, so the picture shows what was drawn. */
    readonly onDrawingClosed?: () => void;
  }

  const { bodyType, content, title, emptyMessage, onSave, onShare, onDrawingClosed }: Props = $props();

  const markdown = $derived(bodyType === 'drawing' ? '' : bodyMarkdown(bodyType, content));
  const empty = $derived(bodyType === 'drawing' ? isEmptyDrawing(readDrawingContent(content)) : !markdown.trim());

  let drawingOpen = $state(false);
  const closeDrawing = () => {
    drawingOpen = false;
    onDrawingClosed?.();
  };
</script>

{#if empty}
  <div class="content"><EmptyState message={emptyMessage} /></div>
{:else}
  <div class="card compact content">
    {#if bodyType === 'drawing'}
      <DrawingImage {content} {title} onOpen={onSave ? () => { drawingOpen = true; } : undefined} />
    {:else}
      <MarkdownRenderer content={markdown} />
    {/if}
  </div>
{/if}
{#if drawingOpen && onSave}
  <!-- Loaded when opened, so a peek never loads the editor or its styles otherwise. -->
  {#await import('$lib/drawing/DrawingEditor.svelte') then { default: DrawingEditor }}
    <DrawingEditor {content} {onSave} {title} {onShare} onClose={closeDrawing} />
  {/await}
{/if}

<style lang="scss">
  .content { margin-top: var(--sp-3); }
</style>
