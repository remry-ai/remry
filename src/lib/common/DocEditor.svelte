<script lang="ts">
  import { assistantName } from '$lib/stores/assistant';
  import { untrack, type Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import MarkdownEditor from '$lib/common/MarkdownEditor.svelte';
  import ProBadge from '$lib/ui/ProBadge.svelte';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';
  import MarkdownRenderer from '$lib/common/MarkdownRenderer.svelte';
  import type { ChartBranding } from '$shared/types/branding';
  import { blobUrlsIn, replaceLostImages } from '$lib/doc/lost-images';
  import { imageFilesIn, insertImages } from '$lib/doc/pasted-images';

  interface ConvertNotice {
    readonly tone: 'warning' | 'error';
    readonly message: string;
  }

  interface Props {
    readonly title: string;
    readonly content: string;
    /** A file uploaded as a link that "Convert with Claude" can write the doc from. */
    readonly hasSourceFile?: boolean;
    /** The doc is being written from that file with Claude. */
    readonly converting?: boolean;
    readonly convertNotice?: ConvertNotice | null;
    readonly onSave: (content: string) => Promise<void>;
    readonly onSaveTitle?: (title: string) => Promise<void>;
    readonly onConvert?: () => Promise<void>;
    readonly onUploadImage?: (file: File) => Promise<string>;
    readonly onResolveImages?: (keys: string[]) => Promise<Record<string, string>>;
    readonly onClose?: () => void;
    /** Under the title: the doc's tracked sources, when it has any. */
    readonly sources?: Snippet;
    /**
     * False drops the title row, for an editor under a heading that already names it (a wiki
     * page's). "Convert with Claude" is in that row, so a caller hiding it passes none.
     */
    readonly showTitle?: boolean;
    /** Link to the doc's print page (Export PDF). */
    readonly exportHref?: string;
    /** Colours charts in the preview like the exported PDF (the default branding). */
    readonly chartBranding?: ChartBranding | null;
    readonly autoEditTitle?: boolean;
    /** The tab it opens on: Preview, unless the doc is empty (nothing to preview) or the caller asked to edit. */
    readonly startIn?: 'editor' | 'preview';
  }

  const { title, content, hasSourceFile, converting = false, convertNotice = null, onSave, onSaveTitle, onConvert, onUploadImage, onResolveImages, onClose, sources, exportHref, chartBranding = null, autoEditTitle = false, startIn, showTitle = true }: Props = $props();

  let editingTitle = $state(autoEditTitle);
  let titleDraft = $state(title);

  const startEditingTitle = () => {
    if (!onSaveTitle) return;
    titleDraft = title;
    editingTitle = true;
  };

  const commitTitle = async () => {
    editingTitle = false;
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === title || !onSaveTitle) return;
    error = '';
    try {
      await onSaveTitle(trimmed);
    } catch (e: unknown) {
      error = messageOf(e);
    }
  };

  const cancelTitle = () => {
    editingTitle = false;
    titleDraft = title;
  };

  const handleTitleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelTitle(); }
  };

  const focusOnMount = (node: HTMLInputElement) => { node.focus(); node.select(); };

  const pendingImages = new Map<string, File>();
  // blob: addresses already in the content as loaded: saved by an earlier tab, so their
  // images are gone (`lib/doc/lost-images.ts`).
  let lostImages: ReadonlySet<string> = new Set();

  const STORAGE_RE = /storage:\/\/[^\s)]+/g;
  const hasStorageUrls = (md: string): boolean => /storage:\/\//.test(md);

  const resolveStorageUrls = async (md: string): Promise<string> => {
    if (!onResolveImages) return md;
    const keys = [...md.matchAll(STORAGE_RE)].map(m => m[0].replace('storage://', ''));
    if (!keys.length) return md;
    const urls = await onResolveImages(keys);
    return md.replace(STORAGE_RE, (match) => {
      const key = match.replace('storage://', '');
      return urls[key] ?? match;
    });
  };

  let draft = $state(content);
  let resolvedContent = $state(content);
  // The text last loaded or saved: the editor is dirty while the draft differs from it.
  let saved = $state(content);
  let resolving = $state(hasStorageUrls(content));
  // Read once: the tab it opens on.
  let mode = $state<'write' | 'editor' | 'preview'>(untrack(() => startIn ?? (content.trim() ? 'preview' : 'editor')));
  let saving = $state(false);
  let error = $state('');

  const messageOf = (e: unknown): string => (e instanceof Error ? e.message : 'Could not save.');

  $effect(() => {
    const md = content;
    lostImages = new Set(blobUrlsIn(md));
    if (hasStorageUrls(md)) {
      resolving = true;
      resolveStorageUrls(md).then((resolved) => {
        resolvedContent = resolved;
        draft = resolved;
        saved = resolved;
        resolving = false;
      });
    } else {
      resolvedContent = md;
      draft = md;
      saved = md;
      resolving = false;
    }
  });

  // Against what was last saved, not the `content` prop: a wiki page saves without reloading, so its prop never changes.
  const isDirty = $derived(draft !== saved);

  // A pasted or dropped image shows from a blob: address, which lasts only as long as
  // this tab. Each is uploaded on save and replaced by its storage key; one that can't
  // be (no uploader, or a blob from another tab) stops the save rather than being lost.
  // One that was in the content when it loaded is already gone, and becomes a note.
  const uploadPendingImages = async (md: string): Promise<string> => {
    let result = replaceLostImages(md, lostImages);
    for (const blobUrl of blobUrlsIn(result)) {
      const file = pendingImages.get(blobUrl);
      if (!file || !onUploadImage) {
        throw new Error(onUploadImage
          ? "An image here can't be uploaded (it came from another tab). Remove it, paste or drop it again, then save."
          : "Images can't be added here. Remove the image, then save.");
      }
      const storageKey = await onUploadImage(file);
      result = result.replaceAll(blobUrl, `storage://${storageKey}`);
      pendingImages.delete(blobUrl);
      URL.revokeObjectURL(blobUrl);
    }
    return result;
  };

  // The title box and the Markdown textarea would drop a pasted image without a word (a new
  // doc opens with the title focused), so it goes into the body, uploaded on save like any other.
  let editorKey = $state(0);
  const pasteImagesIntoBody = (e: ClipboardEvent, at?: number): boolean => {
    const files = imageFilesIn(e.clipboardData);
    if (files.length === 0 || !onUploadImage) return false;
    e.preventDefault();
    const images = files.map((file) => {
      const url = URL.createObjectURL(file);
      pendingImages.set(url, file);
      return { url, name: file.name || 'image' };
    });
    draft = insertImages(draft, images, at);
    // The editor reads its content when it mounts.
    editorKey += 1;
    return true;
  };

  const handleTitlePaste = (e: ClipboardEvent) => {
    if (!pasteImagesIntoBody(e)) return;
    void commitTitle();
    if (mode === 'preview') mode = 'editor';
  };

  const handleTextareaPaste = (e: ClipboardEvent) => {
    const textarea = e.currentTarget as HTMLTextAreaElement;
    pasteImagesIntoBody(e, textarea.selectionStart);
  };

  const handleSave = async () => {
    if (!isDirty) return;
    saving = true;
    error = '';
    // What the editor held when Save was pressed: typing during the save leaves it dirty.
    const snapshot = draft;
    try {
      const toSave = await uploadPendingImages(snapshot);
      await onSave(toSave);
      // Unless a reload during the save already reset the draft and what's saved (docs reload, wiki pages don't).
      if (draft === snapshot) saved = snapshot;
    } catch (e: unknown) {
      error = messageOf(e);
    } finally {
      saving = false;
    }
  };

  // Export PDF opens the print page in this window (the desktop app's window drops a new-window
  // link), so unsaved changes are saved first. A modified click still opens a browser tab.
  const handleExport = async (e: MouseEvent) => {
    if (!exportHref || !isDirty || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    await handleSave();
    if (!error) await goto(exportHref);
  };

  // The bar shows the title on a row above the tabs once it sticks, so a long doc scrolled
  // down still says which one it is. The row is pulled up over what's above the bar (hidden,
  // so nothing jumps when it shows); the bar is stuck once it has moved down from there.
  let sentinelEl = $state<HTMLDivElement>();
  let stickyEl = $state<HTMLDivElement>();
  let titleRowEl = $state<HTMLDivElement>();
  let stuck = $state(false);
  $effect(() => {
    if (!showTitle || !sentinelEl || !stickyEl || !titleRowEl) return;
    const sentinel = sentinelEl, sticky = stickyEl, row = titleRowEl;
    let frame = 0;
    const measure = () => {
      frame = 0;
      stuck = sticky.getBoundingClientRect().top > sentinel.getBoundingClientRect().top - row.offsetHeight + 1;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    // Capture: the page scrolls in the window or in a layout column, depending on its width.
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  });

  const setMode = async (next: typeof mode) => {
    const leaving = mode === 'write' || mode === 'editor';
    const entering = next === 'preview';
    if (leaving && entering && isDirty) await handleSave();
    mode = next;
  };
</script>


<section class="card doc-card">
  {#if showTitle}
  <div class="doc-header">
    <span class="badge selected">Doc</span>
    {#if editingTitle}
      <input
        class="title-input"
        bind:value={titleDraft}
        onblur={commitTitle}
        onkeydown={handleTitleKeydown}
        onpaste={handleTitlePaste}
        use:focusOnMount
        aria-label="Document title"
      />
    {:else}
      <h2 class:editable={!!onSaveTitle} ondblclick={startEditingTitle} title={onSaveTitle ? 'Double-click to rename' : undefined}>{title}</h2>
    {/if}
    {#if hasSourceFile && onConvert && !converting && !content.trim()}
      <button type="button" class="btn ghost sm" onclick={onConvert}>Convert with {$assistantName}</button>
    {/if}
  </div>
  {/if}
  {#if sources}<div class="doc-sources">{@render sources()}</div>{/if}
  {#if error}<p class="form-error" role="alert">{error}</p>{/if}
  {#if convertNotice}<p class={convertNotice.tone === 'error' ? 'form-error' : 'form-warning'} role="alert">{convertNotice.message}</p>{/if}
  {#if converting}
    <div class="status" aria-busy="true">Converting the file with {$assistantName}… This can take a minute or two.</div>
  {:else if resolving}
    <div class="status" aria-busy="true">Loading…</div>
  {:else}
    <div class="doc-editor" class:with-title={showTitle}>
      <div class="doc-sentinel" bind:this={sentinelEl}></div>
      <!-- Stays in view above the editor's own toolbar: the title once scrolled past it, then the view tabs with the doc's actions at the right end. -->
      <div class="doc-sticky" class:stuck bind:this={stickyEl}>
      {#if showTitle}
        <div class="doc-sticky-title" bind:this={titleRowEl} aria-hidden={!stuck}><span class="badge selected">Doc</span><span class="truncate">{title}</span></div>
      {/if}
      <div class="doc-bar">
        <div class="tabs scroll">
          <button type="button" class="tab" class:active={mode === 'write'} onclick={() => setMode('write')}>Markdown</button>
          <button type="button" class="tab" class:active={mode === 'editor'} onclick={() => setMode('editor')}>Editor</button>
          <button type="button" class="tab" class:active={mode === 'preview'} onclick={() => setMode('preview')}>Preview</button>
          {#if exportHref && content.trim()}
            <a class="tab divided" href={exportHref} onclick={handleExport}>Export PDF <ProBadge /></a>
          {/if}
        </div>
        <div class="doc-actions">
          {#if mode === 'preview'}
            <!-- As beside a wiki page's Content heading: the pencil opens the editor. -->
            <button type="button" class="btn icon sm" aria-label="Edit {title}" title="Edit" onclick={() => setMode('editor')}><PencilIcon /></button>
          {/if}
          {#if mode !== 'preview'}
            {#if isDirty}<span class="unsaved text-xs">● Unsaved</span>{/if}
            <button type="button" class="btn primary sm" onclick={handleSave} disabled={saving || !isDirty} aria-busy={saving}>{saving ? 'Saving…' : 'Save'}</button>
          {/if}
          {#if onClose}
            <button type="button" class="btn icon sm" onclick={onClose} aria-label="Close" title="Close">&times;</button>
          {/if}
        </div>
      </div>
      </div>
      {#if mode === 'write'}
        <textarea class="doc-textarea mono" bind:value={draft} onpaste={handleTextareaPaste} rows={20} placeholder="Write in markdown..."></textarea>
      {:else if mode === 'editor'}
        {#key `${resolvedContent}|${editorKey}`}
          <MarkdownEditor value={draft} onChange={(md) => (draft = md)} {pendingImages} />
        {/key}
      {:else}
        <div class="doc-preview">
          <MarkdownRenderer content={draft} branding={chartBranding} />
        </div>
      {/if}
    </div>
  {/if}
</section>

<style lang="scss">
  .doc-card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  .doc-header {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    h2 {
      flex: 1;
      min-width: 0;
      margin: 0;
      font-size: var(--fs-base);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      &.editable { cursor: text; }
    }
  }
  // A field like any other (--font-form); only its width is its own.
  .title-input { flex: 1; }
  // Tucked under the title: the card's gap is too loose for a line that belongs to it.
  .doc-sources { margin-top: calc(-1 * var(--sp-1)); }
  .doc-editor {
    display: flex;
    flex-direction: column;
    min-height: 0;
    // The page's sticky offset, captured here so the editor's toolbar can stick just below the bar.
    --doc-sticky: var(--sticky-top, 0px);
    --doc-bar-h: calc(var(--control-h) + var(--sp-2));
    --doc-title-h: 0px;
    &.with-title { --doc-title-h: var(--control-h); }
    :global(.md-editor-container) { --sticky-top: calc(var(--doc-sticky) + var(--doc-title-h) + var(--doc-bar-h)); }
  }
  .doc-sentinel { height: 0; }
  // Stays in view while a long doc scrolls, above the editor's sticky toolbar. The title row
  // overlaps what's above it until the bar sticks, so it lets clicks through while hidden.
  .doc-sticky {
    position: sticky;
    top: var(--doc-sticky);
    z-index: calc(var(--z-sticky) + 1);
    margin-top: calc(-1 * var(--doc-title-h));
    margin-bottom: var(--sp-2);
    pointer-events: none;
    > * { pointer-events: auto; }
  }
  .doc-sticky-title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    height: var(--doc-title-h);
    min-width: 0;
    font-weight: 600;
    background: var(--surface);
    visibility: hidden;
    pointer-events: none;
  }
  .stuck .doc-sticky-title {
    visibility: visible;
    pointer-events: auto;
  }
  .doc-bar {
    display: flex;
    align-items: flex-end;
    height: var(--doc-bar-h);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    .tabs { flex: 1; align-self: stretch; align-items: flex-end; border-bottom: none; }
  }
  // Spaced off the tabs, which scroll under it on a phone, so the buttons aren't crowded.
  .doc-actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding-left: var(--sp-3);
    padding-bottom: var(--sp-1);
  }
  // Markdown source: monospace, at the form size.
  .doc-textarea {
    width: 100%;
    font-size: var(--fs-form);
    min-height: 300px;
  }
  .unsaved { color: var(--text-3); white-space: nowrap; }
  .status {
    padding: var(--sp-8);
    text-align: center;
    color: var(--text-3);
    font-size: var(--fs-md);
  }
  .doc-preview {
    padding: var(--sp-3) 0;
    min-height: 200px;
  }
</style>
