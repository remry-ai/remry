<script lang="ts">
  import MarkdownEditor from '$lib/common/MarkdownEditor.svelte';

  interface Props {
    readonly noteId: string;
    readonly content: string;
    readonly onSave: (content: string) => Promise<void>;
    readonly onClose?: () => void;
  }

  const { noteId, content, onSave, onClose }: Props = $props();

  let draft = $state(content);
  let saving = $state(false);
  let error = $state('');
  let lastSavedId = $state(noteId);

  $effect(() => {
    if (noteId !== lastSavedId) {
      draft = content;
      lastSavedId = noteId;
    }
  });

  const handleSave = async () => {
    if (!draft.trim() || draft === content) return;
    saving = true;
    error = '';
    try {
      await onSave(draft);
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'Could not save.';
    } finally {
      saving = false;
    }
  };
</script>

<section class="card note-editor">
  <div class="note-header">
    <h2>{noteId === '__new__' ? 'New note' : 'Note'}</h2>
    {#if onClose}
      <button type="button" class="btn icon" onclick={onClose} aria-label="Close">&times;</button>
    {/if}
  </div>
  <MarkdownEditor value={draft} onChange={(md) => draft = md} />
  {#if error}<p class="form-error" role="alert">{error}</p>{/if}
  <div class="form-actions">
    <button
      type="button"
      class="btn primary"
      onclick={handleSave}
      disabled={saving || !draft.trim() || draft === content}
      aria-busy={saving}
    >Save</button>
    {#if onClose}
      <button type="button" class="btn ghost" onclick={onClose}>Cancel</button>
    {/if}
  </div>
</section>

<style lang="scss">
  .note-editor {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  .note-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    h2 { margin: 0; font-size: var(--fs-base); }
  }
</style>
