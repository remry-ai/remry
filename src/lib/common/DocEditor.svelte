<script lang="ts">
  import MarkdownEditor from '$lib/common/MarkdownEditor.svelte';
  import ProBadge from '$lib/ui/ProBadge.svelte';
  import MarkdownRenderer from '$lib/common/MarkdownRenderer.svelte';
  import type { ChartBranding } from '$shared/types/branding';

  interface PdfNotice {
    readonly tone: 'warning' | 'error';
    readonly message: string;
  }

  interface Props {
    readonly title: string;
    readonly content: string;
    readonly hasSourcePdf?: boolean;
    /** The attached PDF is being converted with Claude. */
    readonly converting?: boolean;
    readonly pdfNotice?: PdfNotice | null;
    readonly onSave: (content: string) => Promise<void>;
    readonly onSaveTitle?: (title: string) => Promise<void>;
    readonly onUploadPdf?: (file: File) => Promise<void>;
    readonly onOpenSourcePdf?: () => Promise<void>;
    readonly onConvertPdf?: () => Promise<void>;
    readonly onUploadImage?: (file: File) => Promise<string>;
    readonly onResolveImages?: (keys: string[]) => Promise<Record<string, string>>;
    readonly onClose?: () => void;
    /** Link to the doc's print page (Export PDF). */
    readonly exportHref?: string;
    /** Colours charts in the preview like the exported PDF (the default branding). */
    readonly chartBranding?: ChartBranding | null;
    readonly autoEditTitle?: boolean;
  }

  const { title, content, hasSourcePdf, converting = false, pdfNotice = null, onSave, onSaveTitle, onUploadPdf, onOpenSourcePdf, onConvertPdf, onUploadImage, onResolveImages, onClose, exportHref, chartBranding = null, autoEditTitle = false }: Props = $props();

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
  let mode = $state<'write' | 'editor' | 'preview'>('editor');
  let saving = $state(false);
  let uploading = $state(false);
  let error = $state('');

  const messageOf = (e: unknown): string => (e instanceof Error ? e.message : 'Could not save.');

  $effect(() => {
    const md = content;
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

  const handlePdfUpload = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !onUploadPdf) return;
    uploading = true;
    error = '';
    try {
      await onUploadPdf(file);
    } catch (e: unknown) {
      error = messageOf(e);
    } finally {
      uploading = false;
      input.value = '';
    }
  };

  // Against what was last saved, not the `content` prop: a wiki page saves without reloading, so its prop never changes.
  const isDirty = $derived(draft !== saved);

  const uploadPendingImages = async (md: string): Promise<string> => {
    if (!onUploadImage) return md;
    const blobRe = /blob:[^\s)]+/g;
    const blobUrls = [...new Set([...md.matchAll(blobRe)].map(m => m[0]))];
    if (!blobUrls.length) return md;

    let result = md;
    for (const blobUrl of blobUrls) {
      const file = pendingImages.get(blobUrl);
      if (!file) continue;
      const storageKey = await onUploadImage(file);
      result = result.replaceAll(blobUrl, `storage://${storageKey}`);
      pendingImages.delete(blobUrl);
      URL.revokeObjectURL(blobUrl);
    }
    return result;
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

  const setMode = async (next: typeof mode) => {
    const leaving = mode === 'write' || mode === 'editor';
    const entering = next === 'preview';
    if (leaving && entering && isDirty) await handleSave();
    mode = next;
  };
</script>


<section class="card doc-card">
  <div class="doc-header">
    {#if editingTitle}
      <input
        class="title-input"
        bind:value={titleDraft}
        onblur={commitTitle}
        onkeydown={handleTitleKeydown}
        use:focusOnMount
        aria-label="Document title"
      />
    {:else}
      <h2 class:editable={!!onSaveTitle} ondblclick={startEditingTitle} title={onSaveTitle ? 'Double-click to rename' : undefined}>{title}</h2>
    {/if}
    {#if hasSourcePdf && onOpenSourcePdf}
      <button type="button" class="badge source-badge" onclick={onOpenSourcePdf}>PDF source</button>
    {/if}
    {#if hasSourcePdf && onConvertPdf && !converting && !content.trim()}
      <button type="button" class="btn ghost sm" onclick={onConvertPdf}>Convert with Claude</button>
    {/if}
    {#if onUploadPdf && !hasSourcePdf}
      <label class="btn ghost sm">
        Attach PDF
        <input type="file" accept=".pdf,application/pdf" onchange={handlePdfUpload} hidden />
      </label>
    {/if}
    {#if onClose}
      <button type="button" class="btn icon" onclick={onClose} aria-label="Close">&times;</button>
    {/if}
  </div>
  {#if error}<p class="form-error" role="alert">{error}</p>{/if}
  {#if pdfNotice}<p class={pdfNotice.tone === 'error' ? 'form-error' : 'form-warning'} role="alert">{pdfNotice.message}</p>{/if}
  {#if uploading}
    <div class="status" aria-busy="true">Attaching PDF…</div>
  {:else if converting}
    <div class="status" aria-busy="true">Converting PDF with Claude… This can take a minute or two.</div>
  {:else if resolving}
    <div class="status" aria-busy="true">Loading…</div>
  {:else}
    <div class="doc-editor">
      <!-- The view tabs, with the doc's actions at the right end; stays in view above the editor's own toolbar. -->
      <div class="doc-bar">
        <div class="tabs">
          <button type="button" class="tab" class:active={mode === 'editor'} onclick={() => setMode('editor')}>Editor</button>
          <button type="button" class="tab" class:active={mode === 'write'} onclick={() => setMode('write')}>Markdown</button>
          <button type="button" class="tab" class:active={mode === 'preview'} onclick={() => setMode('preview')}>Preview</button>
        </div>
        <div class="doc-actions">
          {#if exportHref && content.trim()}
            <a class="btn ghost sm" href={exportHref} target="_blank" rel="noopener">Export PDF <ProBadge /></a>
          {/if}
          {#if mode !== 'preview'}
            {#if isDirty}<span class="unsaved text-xs">● Unsaved</span>{/if}
            <button type="button" class="btn primary sm" onclick={handleSave} disabled={saving || !isDirty} aria-busy={saving}>{saving ? 'Saving…' : 'Save'}</button>
          {/if}
        </div>
      </div>
      {#if mode === 'write'}
        <textarea class="doc-textarea mono" bind:value={draft} rows={20} placeholder="Write in markdown..."></textarea>
      {:else if mode === 'editor'}
        {#key resolvedContent}
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
  .title-input {
    flex: 1;
    height: var(--control-h);
    font-size: var(--fs-base);
    font-weight: 600;
  }
  .source-badge { cursor: pointer; &:hover { color: var(--accent); } }
  .doc-editor {
    display: flex;
    flex-direction: column;
    min-height: 0;
    // The page's sticky offset, captured here so the editor's toolbar can stick just below the bar.
    --doc-sticky: var(--sticky-top, 0px);
    --doc-bar-h: calc(var(--control-h) + var(--sp-2));
    :global(.md-editor-container) { --sticky-top: calc(var(--doc-sticky) + var(--doc-bar-h)); }
  }
  // Stays in view while a long doc scrolls, above the editor's sticky toolbar.
  .doc-bar {
    position: sticky;
    top: var(--doc-sticky);
    z-index: calc(var(--z-sticky) + 1);
    display: flex;
    align-items: flex-end;
    height: var(--doc-bar-h);
    margin-bottom: var(--sp-2);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    .tabs { flex: 1; align-self: stretch; align-items: flex-end; border-bottom: none; }
  }
  .doc-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding-bottom: var(--sp-1);
  }
  .doc-textarea {
    width: 100%;
    font-size: var(--fs-sm);
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
