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
    /** An empty drawing can start from an excalidraw.com share link; throws the server's error. */
    readonly onImportLink?: (url: string) => Promise<void>;
  }

  const { content, title, onOpen, readOnly = false, onImportLink }: Props = $props();

  let importing = $state(false);
  let shareLink = $state('');
  let importBusy = $state(false);
  let importError = $state('');
  const handleImport = async () => {
    if (!onImportLink || !shareLink.trim()) return;
    importBusy = true;
    importError = '';
    try {
      await onImportLink(shareLink.trim());
      importing = false;
      shareLink = '';
    } catch (e: unknown) {
      importError = e instanceof Error ? e.message : String(e);
    } finally {
      importBusy = false;
    }
  };

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
    {#if onImportLink && !readOnly && !importing}<button type="button" class="btn ghost sm" onclick={() => { importing = true; }}>From an Excalidraw link</button>{/if}
  </EmptyState>
  {#if importing}
    <!-- Remry fetches it from excalidraw.com and decrypts it here (drawing.importLink). -->
    <form class="toolbar import-link" onsubmit={(e: SubmitEvent) => { e.preventDefault(); void handleImport(); }}>
      <input type="url" class="sm" bind:value={shareLink} placeholder="https://excalidraw.com/#json=…" aria-label="Excalidraw share link" />
      <button type="submit" class="btn sm" disabled={importBusy || !shareLink.trim()} aria-busy={importBusy}>{importBusy ? 'Importing…' : 'Import'}</button>
      <button type="button" class="btn ghost sm" onclick={() => { importing = false; importError = ''; }}>Cancel</button>
    </form>
    {#if importError}<p class="form-error" role="alert">{importError}</p>{/if}
  {/if}
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
  .import-link input { flex: 1; }
</style>
