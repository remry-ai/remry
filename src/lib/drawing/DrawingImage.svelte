<script lang="ts">
  // A drawing page's drawing as a picture (a PNG from Excalidraw's canvas
  // export, render-drawing.ts). With onOpen it's a button that opens the
  // full-screen editor; without it (a peek) it's only the picture.
  import { untrack } from 'svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { isEmptyDrawing, isSkeleton, readDrawingContent } from '$shared/utils/drawing';
  import { renderDrawing } from './render-drawing';

  interface Props {
    readonly content: string;
    readonly title: string;
    /** Opens the editor; the empty state offers it too. */
    readonly onOpen?: () => void;
    /** Says "Open drawing" rather than "Edit drawing" (an archived page). */
    readonly readOnly?: boolean;
  }

  const { content, title, onOpen, readOnly = false }: Props = $props();

  const empty = $derived(isEmptyDrawing(readDrawingContent(content)));
  let image = $state<{ readonly url: string; readonly width: number } | null>(null);
  let error = $state('');

  // After an edit the old picture stays until the new one is drawn, so nothing flickers.
  const show = (next: { readonly url: string; readonly width: number } | null) => {
    untrack(() => { if (image) URL.revokeObjectURL(image.url); });
    image = next;
  };

  $effect(() => {
    if (empty) {
      show(null);
      return;
    }
    const drawing = readDrawingContent(content);
    let cancelled = false;
    error = '';
    renderDrawing(drawing, { scale: 2, background: !isSkeleton(drawing) && drawing.appState?.viewBackgroundColor !== undefined }).then(
      (rendered) => {
        if (cancelled || !rendered) return;
        show({ url: URL.createObjectURL(rendered.blob), width: Math.round(rendered.width) });
      },
      (e: unknown) => {
        if (!cancelled) error = `The drawing couldn't be shown: ${e instanceof Error ? e.message : String(e)}`;
      }
    );
    return () => { cancelled = true; };
  });

  $effect(() => () => { if (image) URL.revokeObjectURL(image.url); });

  const label = $derived(readOnly ? `Open ${title}` : `Edit ${title}`);
</script>

{#if empty}
  <EmptyState message="Nothing drawn yet.">
    {#if onOpen && !readOnly}<button type="button" class="btn sm" onclick={onOpen}>Start drawing</button>{/if}
  </EmptyState>
{:else if error}
  <p class="form-error" role="alert">{error}</p>
{:else if !image}
  <p class="text-sm muted drawing-loading" aria-busy="true">Drawing…</p>
{:else if onOpen}
  <button type="button" class="drawing-image openable" aria-label={label} title={readOnly ? 'Open full screen' : 'Click to edit'} onclick={onOpen}>
    <img src={image.url} alt={title} width={image.width} />
  </button>
{:else}
  <div class="drawing-image"><img src={image.url} alt={title} width={image.width} /></div>
{/if}

<style lang="scss">
  .drawing-image {
    display: block;
    max-width: 100%;
    margin: 0 auto;
    text-align: center;

    img {
      max-width: 100%;
      height: auto;
      border-radius: var(--r-sm);
    }
  }

  .openable {
    cursor: zoom-in;

    img {
      outline: 1px solid transparent;
      outline-offset: 2px;
      transition: outline-color var(--ease);
    }
    &:hover img,
    &:focus-visible img { outline-color: var(--border-strong); }
  }

  .drawing-loading { min-height: 4em; }
</style>
