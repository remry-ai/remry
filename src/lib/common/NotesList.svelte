<script lang="ts">
  import { marked } from 'marked';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';

  interface Note {
    readonly id: string;
    readonly content: string;
    readonly createdAt: Date | string;
  }

  interface Props {
    readonly notes: readonly Note[];
    readonly maxHeight?: number;
    readonly onEdit?: (note: Note) => void;
    readonly onRemove?: (id: string) => void;
  }

  const { notes, maxHeight = 250, onEdit, onRemove }: Props = $props();

  const sortedNotes = $derived([...notes].sort((a, b) => {
    const da = typeof a.createdAt === 'string' ? new Date(a.createdAt) : a.createdAt;
    const db = typeof b.createdAt === 'string' ? new Date(b.createdAt) : b.createdAt;
    return db.getTime() - da.getTime();
  }));

  let expandedNotes = $state(new Set<string>());
  let overflowingNotes = $state(new Set<string>());
  let listEl = $state<HTMLDivElement | null>(null);

  const expandNote = (id: string) => {
    expandedNotes = new Set(expandedNotes).add(id);
  };

  const collapseNote = (id: string) => {
    const next = new Set(expandedNotes);
    next.delete(id);
    expandedNotes = next;
  };

  const recheckOverflows = () => {
    if (!listEl) return;
    const next = new Set<string>();
    for (const el of listEl.querySelectorAll<HTMLDivElement>('[data-note-body]')) {
      const id = el.dataset.noteBody!;
      if (el.scrollHeight > el.clientHeight) next.add(id);
    }
    overflowingNotes = next;
  };

  $effect(() => {
    notes;
    requestAnimationFrame(() => requestAnimationFrame(recheckOverflows));
  });

  const formatDate = (d: Date | string) => {
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleDateString('en-CA');
  };
</script>

{#if notes.length > 0}
  <div class="notes-list" bind:this={listEl}>
    {#each sortedNotes as note (note.id)}
      <article class="note">
        <header class="note-header">
          {#if onEdit}
            <button type="button" class="btn link muted text-xs" onclick={() => onEdit(note)} title="Edit note">{formatDate(note.createdAt)}</button>
          {:else}
            <span class="text-xs muted">{formatDate(note.createdAt)}</span>
          {/if}
          {#if onEdit || onRemove}
            <span class="note-actions">
              {#if onEdit}
                <button type="button" class="btn icon sm" aria-label="Edit note" title="Edit" onclick={() => onEdit(note)}><PencilIcon /></button>
              {/if}
              {#if onRemove}
                <ConfirmButton label="Delete note" variant="icon" onConfirm={() => onRemove(note.id)} />
              {/if}
            </span>
          {/if}
        </header>
        <div
          class="note-body"
          class:clamped={!expandedNotes.has(note.id)}
          data-note-body={note.id}
          style="--max-height: {maxHeight}px"
        >
          {@html marked.parse(note.content)}
        </div>
        {#if !expandedNotes.has(note.id) && overflowingNotes.has(note.id)}
          <button type="button" class="btn link text-xs" onclick={() => expandNote(note.id)}>See more</button>
        {:else if expandedNotes.has(note.id)}
          <button type="button" class="btn link text-xs" onclick={() => collapseNote(note.id)}>Show less</button>
        {/if}
      </article>
    {/each}
  </div>
{:else}
  <EmptyState message="No notes yet." small />
{/if}

<style lang="scss">
  .notes-list {
    display: flex;
    flex-direction: column;
  }
  .note {
    padding: var(--sp-3) 0;
    border-bottom: 1px solid var(--border);
    &:last-child { border-bottom: 0; }
    &:hover .note-actions { opacity: 1; }
  }
  .note-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 20px;
    margin-bottom: var(--sp-1);
  }
  .note-actions {
    display: inline-flex;
    align-items: center;
    opacity: 0;
    transition: opacity var(--ease);
    &:has(:global(.inline-error)) { opacity: 1; }
    // Touch screens have no hover, so the actions stay visible.
    @media (hover: none) { opacity: 1; }
  }
  .note-body {
    font-size: var(--fs-md);
    line-height: 1.5;
    color: var(--text);
    :global(p) { margin: 0 0 var(--sp-2); }
    :global(p:last-child) { margin-bottom: 0; }
    :global(ul), :global(ol) { padding-left: var(--sp-4); margin: 0 0 var(--sp-2); }
    :global(h1), :global(h2), :global(h3) { font-size: var(--fs-base); margin: var(--sp-2) 0 var(--sp-1); }
    &.clamped {
      max-height: var(--max-height, 250px);
      overflow: hidden;
    }
  }
</style>
