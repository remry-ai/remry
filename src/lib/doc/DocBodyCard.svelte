<script lang="ts">
  // An open doc that's a spreadsheet or a drawing, in the centre pane where DocEditor shows a
  // document: its title (double-click to rename), Export PDF and Close, its links, then the
  // body exactly as a wiki page shows it (BodyView).
  import type { Snippet } from 'svelte';
  import ProBadge from '$lib/ui/ProBadge.svelte';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';
  import BodyView from './BodyView.svelte';
  import { errorMessage } from '$lib/ui/submit';
  import { BODY_LABELS, type GridOrDrawing } from '$shared/types/body-types';

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

  const kind = $derived(BODY_LABELS[bodyType]);

  // Read once: a new doc starts with its title in the box.
  // svelte-ignore state_referenced_locally
  let editingTitle = $state(autoEditTitle);
  // svelte-ignore state_referenced_locally
  let titleDraft = $state(autoEditTitle ? title : '');
  let error = $state('');

  const startEditingTitle = () => {
    if (!onSaveTitle || !editable) return;
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
      error = errorMessage(e);
    }
  };

  const handleTitleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void commitTitle(); }
    else if (e.key === 'Escape') { e.preventDefault(); editingTitle = false; }
  };

  const focusOnMount = (node: HTMLInputElement) => { node.focus(); node.select(); };

  let drawingOpen = $state(false);
</script>

<section class="card doc-card">
  <div class="doc-header">
    <span class="badge selected">{kind}</span>
    {#if editingTitle}
      <input class="title-input" bind:value={titleDraft} onblur={commitTitle} onkeydown={handleTitleKeydown} use:focusOnMount aria-label="{kind} title" />
    {:else}
      <h2 class:editable={!!onSaveTitle && editable} ondblclick={startEditingTitle} title={onSaveTitle && editable ? 'Double-click to rename' : undefined}>{title}</h2>
    {/if}
    <span class="doc-actions">
      {#if exportHref}<a class="btn ghost sm" href={exportHref}>Export PDF <ProBadge /></a>{/if}
      {#if bodyType === 'drawing'}
        <button type="button" class="btn icon sm" aria-label="{editable ? 'Edit' : 'Open'} the drawing {title}" title={editable ? 'Edit drawing' : 'Open full screen'} onclick={() => { drawingOpen = true; }}><PencilIcon /></button>
      {/if}
      <button type="button" class="btn icon sm" onclick={onClose} aria-label="Close" title="Close">&times;</button>
    </span>
  </div>
  {#if sources}<div class="doc-sources">{@render sources()}</div>{/if}
  {#if error}<p class="form-error" role="alert">{error}</p>{/if}
  <BodyView {bodyType} {content} {title} {editable} {onSave} {onShare} {onImportLink} {onDrawingClosed} bind:drawingOpen />
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
  .title-input { flex: 1; }
  .doc-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }
</style>
