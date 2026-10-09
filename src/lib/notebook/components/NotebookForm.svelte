<script lang="ts">
  // Create a notebook (name, optional id), or rename one. Ids can't change, so editing shows only the name.
  import { trpc } from '$shared/trpc/client';
  import { NOTEBOOK_ID_RULE, notebookIdFromName } from '$shared/notebooks/id';
  import type { NotebookInfo } from '$shared/types/notebook';
  import Field from '$lib/ui/Field.svelte';
  import { submit } from '$lib/ui/submit';

  interface Props {
    /** The notebook to rename. Without it, the form creates one. */
    readonly initial?: Pick<NotebookInfo, 'id' | 'name'>;
    readonly onSuccess: (notebook: NotebookInfo) => void;
    readonly onCancel?: () => void;
  }

  const { initial, onSuccess, onCancel }: Props = $props();

  let name = $state(initial?.name ?? '');
  let id = $state('');
  let submitting = $state(false);
  let error = $state('');

  const suggestedId = $derived(notebookIdFromName(name));

  $effect(() => {
    name = initial?.name ?? '';
  });

  const handleSubmit = async () => {
    submitting = true;
    error = '';
    const outcome = initial
      ? await submit(() => trpc().notebook.rename.mutate({ id: initial.id, name: name.trim() }))
      : await submit(() => trpc().notebook.create.mutate({ name: name.trim(), id: id.trim() || undefined }));
    submitting = false;
    if (!outcome.ok) {
      error = outcome.error;
      return;
    }
    onSuccess(outcome.value);
  };
</script>

<form class="form-grid" onsubmit={(e: SubmitEvent) => { e.preventDefault(); handleSubmit(); }}>
  <Field label="Name">
    {#snippet children({ id: fieldId })}
      <input id={fieldId} type="text" bind:value={name} required maxlength="100" placeholder="Work, or a side project" />
    {/snippet}
  </Field>
  {#if !initial}
    <Field label="Id" hint="Used in links and by Claude (--notebook), and can't be changed. {NOTEBOOK_ID_RULE}.">
      {#snippet children({ id: fieldId })}
        <input id={fieldId} type="text" class="mono" bind:value={id} maxlength="40" placeholder={suggestedId || 'side-project'} autocomplete="off" spellcheck="false" />
      {/snippet}
    </Field>
  {/if}

  {#if error}<p class="form-error">{error}</p>{/if}

  <div class="form-actions">
    <button type="submit" class="btn primary" disabled={submitting || !name.trim()} aria-busy={submitting}>
      {initial ? 'Save' : 'Create notebook'}
    </button>
    {#if onCancel}
      <button type="button" class="btn ghost" onclick={onCancel}>Cancel</button>
    {/if}
  </div>
</form>
