<script lang="ts">
  // A page's title, and on create whether its body is a document or a spreadsheet.
  // Content is edited on the page itself.
  import { trpc } from '$shared/trpc/client';
  import Field from '$lib/ui/Field.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import { submit } from '$lib/ui/submit';
  import type { PageBodyType } from '$shared/types/pages';

  interface PageData {
    readonly id?: string;
    readonly title?: string;
    readonly parentId?: string | null;
  }

  interface Props {
    readonly initial?: PageData;
    readonly onSuccess: (result: { readonly id: string }) => void;
    readonly onCancel?: () => void;
    readonly onDelete?: () => Promise<void> | void;
  }

  const { initial = {}, onSuccess, onCancel, onDelete }: Props = $props();

  const isEdit = $derived(!!initial.id);

  // Follows `initial` (another page opened), and the input writes to it.
  let title = $derived(initial.title ?? '');
  let bodyType = $state<PageBodyType>('doc');
  let submitting = $state(false);
  let error = $state('');

  const handleSubmit = async () => {
    submitting = true;
    error = '';
    const outcome = isEdit
      ? await submit(() => trpc().page.update.mutate({ id: initial.id!, title: title.trim() }))
      : await submit(() => trpc().page.create.mutate({
          title: title.trim(),
          bodyType,
          parentId: initial.parentId ?? undefined,
        }));
    submitting = false;
    if (!outcome.ok) {
      error = outcome.error;
      return;
    }
    if (!isEdit) {
      title = '';
      bodyType = 'doc';
    }
    onSuccess(outcome.value);
  };
</script>

<form class="form-grid" onsubmit={(e: SubmitEvent) => { e.preventDefault(); handleSubmit(); }}>
  <div class="form-row">
    <Field label="Title">
      {#snippet children({ id })}
        <input {id} type="text" bind:value={title} required placeholder="Page title" />
      {/snippet}
    </Field>
    {#if !isEdit}
      <Field label="Body">
        {#snippet children({ id })}
          <select {id} bind:value={bodyType}>
            <option value="doc">Document</option>
            <option value="sheet">Spreadsheet</option>
          </select>
        {/snippet}
      </Field>
    {/if}
  </div>

  {#if error}<p class="form-error">{error}</p>{/if}

  <div class="form-actions">
    <button type="submit" class="btn primary" disabled={submitting || !title.trim()} aria-busy={submitting}>
      {isEdit ? 'Save' : 'Add page'}
    </button>
    {#if onCancel}
      <button type="button" class="btn ghost" onclick={onCancel}>Cancel</button>
    {/if}
    {#if isEdit && onDelete}
      <span class="ml-auto"><ConfirmButton label="Delete" confirmLabel="Delete page" variant="button" onConfirm={onDelete} /></span>
    {/if}
  </div>
</form>
