<script lang="ts">
  // A page's title, and on create whether its body is a document, a spreadsheet or a drawing.
  // Content is edited on the page itself; a new drawing can start from an excalidraw.com
  // share link, which the server fetches and decrypts (drawing.importLink).
  import { trpc } from '$shared/trpc/client';
  import Field from '$lib/ui/Field.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import { submit } from '$lib/ui/submit';
  import { BODY_LABELS, BODY_TYPES, type BodyType } from '$shared/types/body-types';
  import { page } from '$app/state';
  import ProIcon from '$lib/ui/ProIcon.svelte';
  import { drawingAllowanceNote, type DrawingAllowanceView } from '$lib/license/drawings';

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
  let bodyType = $state<BodyType>('doc');
  let shareLink = $state('');
  let submitting = $state(false);
  let error = $state('');

  // Drawings are free up to a number per notebook: the form says how many are used, and once
  // they're gone it says so with the Pro icon and doesn't offer to add one.
  const allowance = $derived(page.data?.drawingAllowance as DrawingAllowanceView | undefined);
  const drawingNote = $derived(allowance ? drawingAllowanceNote(allowance) : null);
  const drawingLocked = $derived(!isEdit && bodyType === 'drawing' && allowance !== undefined && !allowance.canAdd);

  const handleSubmit = async () => {
    submitting = true;
    error = '';
    const fromLink = !isEdit && bodyType === 'drawing' && shareLink.trim() !== '';
    const outcome = isEdit
      ? await submit(() => trpc().page.update.mutate({ id: initial.id!, title: title.trim() }))
      : fromLink
        ? await submit(() => trpc().drawing.importLink.mutate({ url: shareLink.trim(), title: title.trim(), parentId: initial.parentId ?? undefined }))
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
      shareLink = '';
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
            {#each BODY_TYPES as type (type)}<option value={type}>{BODY_LABELS[type]}</option>{/each}
          </select>
        {/snippet}
      </Field>
    {/if}
  </div>

  {#if !isEdit && bodyType === 'drawing' && drawingNote}
    <p class="text-sm" class:text-2={!drawingLocked}>{drawingNote}{#if drawingLocked}<ProIcon show label="Remry Pro" /> <a href="/app/license">License</a>{/if}</p>
  {/if}

  {#if !isEdit && bodyType === 'drawing' && !drawingLocked}
    <Field label="From an Excalidraw link" hint="Optional. Paste a share link (excalidraw.com/#json=…) to start from that drawing; Remry fetches it from excalidraw.com and decrypts it here.">
      {#snippet children({ id })}
        <input {id} type="url" bind:value={shareLink} placeholder="https://excalidraw.com/#json=…" />
      {/snippet}
    </Field>
  {/if}

  {#if error}<p class="form-error">{error}</p>{/if}

  <div class="form-actions">
    <button type="submit" class="btn primary" disabled={submitting || !title.trim() || drawingLocked} aria-busy={submitting}>
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
