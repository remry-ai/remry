<script lang="ts">
  // An open doc's edit popup, like an entity's: its title, Save and Cancel, and Delete. Its
  // content is edited in the doc itself.
  import Field from '$lib/ui/Field.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import { errorMessage } from '$lib/ui/submit';
  import { BODY_LABELS, type BodyType } from '$shared/types/body-types';

  interface Props {
    readonly title: string;
    readonly bodyType: BodyType;
    /** Throws to show its message. */
    readonly onSave: (title: string) => Promise<void>;
    readonly onCancel: () => void;
    /** Throws to show its message (ConfirmButton). */
    readonly onDelete?: () => Promise<void>;
  }

  const { title: initialTitle, bodyType, onSave, onCancel, onDelete }: Props = $props();

  // Follows the doc (another opened), and the input writes to it.
  let title = $derived(initialTitle);
  let submitting = $state(false);
  let error = $state('');

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    if (trimmed === initialTitle) { onCancel(); return; }
    submitting = true;
    error = '';
    try {
      await onSave(trimmed);
    } catch (e: unknown) {
      error = errorMessage(e);
    } finally {
      submitting = false;
    }
  };
</script>

<form class="form-grid" onsubmit={(e: SubmitEvent) => { e.preventDefault(); void handleSubmit(); }}>
  <Field label="Title">
    {#snippet children({ id })}
      <input {id} type="text" bind:value={title} required placeholder="{BODY_LABELS[bodyType]} title" />
    {/snippet}
  </Field>

  {#if error}<p class="form-error">{error}</p>{/if}

  <div class="form-actions">
    <button type="submit" class="btn primary" disabled={submitting || !title.trim()} aria-busy={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
    <button type="button" class="btn ghost" onclick={onCancel}>Cancel</button>
    {#if onDelete}
      <span class="ml-auto"><ConfirmButton label="Delete" confirmLabel="Delete {BODY_LABELS[bodyType].toLowerCase()}" variant="button" onConfirm={onDelete} /></span>
    {/if}
  </div>
</form>
