<script lang="ts">
  // Create or edit a group: its kind (Team, Family…), name and description.
  import { trpc } from '$shared/trpc/client';
  import Field from '$lib/ui/Field.svelte';
  import MarkdownEditor from '$lib/common/MarkdownEditor.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import { submit } from '$lib/ui/submit';
  import type { GroupKindDefinition } from '$shared/types/groups';

  interface GroupData {
    readonly id?: string;
    readonly kind?: string;
    readonly name?: string;
    readonly description?: string | null;
  }

  interface Props {
    readonly initial?: GroupData;
    /** The notebook's group kinds (groupKind.list). */
    readonly kinds: readonly GroupKindDefinition[];
    readonly onSuccess: (result: { readonly id: string }) => void;
    readonly onCancel?: () => void;
    readonly onDelete?: () => Promise<void> | void;
  }

  const { initial = {}, kinds, onSuccess, onCancel, onDelete }: Props = $props();

  const isEdit = $derived(!!initial.id);

  let kind = $state(initial.kind ?? '');
  let name = $state(initial.name ?? '');
  let description = $state(initial.description ?? '');
  let submitting = $state(false);
  let error = $state('');

  $effect(() => {
    kind = initial.kind ?? kinds[0]?.key ?? '';
    name = initial.name ?? '';
    description = initial.description ?? '';
  });

  const kindName = $derived(kinds.find((k) => k.key === kind)?.name.toLowerCase() ?? 'group');

  const handleSubmit = async () => {
    submitting = true;
    error = '';
    const outcome = isEdit
      ? await submit(() => trpc().group.update.mutate({
          id: initial.id!,
          kind,
          name: name.trim(),
          description: description.trim() || null,
        }))
      : await submit(() => trpc().group.create.mutate({
          kind,
          name: name.trim(),
          description: description.trim() || undefined,
        }));
    submitting = false;
    if (!outcome.ok) {
      error = outcome.error;
      return;
    }
    if (!isEdit) {
      name = '';
      description = '';
    }
    onSuccess(outcome.value);
  };
</script>

<form class="form-grid" onsubmit={(e: SubmitEvent) => { e.preventDefault(); handleSubmit(); }}>
  <div class="form-row">
    <Field label="Name">
      {#snippet children({ id })}
        <input {id} type="text" bind:value={name} required placeholder="e.g. Platform, Sinclairs" />
      {/snippet}
    </Field>
    <Field label="Kind" hint={kinds.length === 0 ? 'Add a group kind first.' : undefined}>
      {#snippet children({ id })}
        <select {id} bind:value={kind} required>
          {#each kinds as k (k.key)}
            <option value={k.key}>{k.name}{k.exclusive ? ' (one per person)' : ''}</option>
          {/each}
        </select>
      {/snippet}
    </Field>
  </div>
  <Field label="Description">
    {#snippet children({ id })}
      <MarkdownEditor value={description} onChange={(md: string) => { description = md; }} />
    {/snippet}
  </Field>

  {#if error}<p class="form-error">{error}</p>{/if}

  <div class="form-actions">
    <button type="submit" class="btn primary" disabled={submitting || !name.trim() || !kind} aria-busy={submitting}>
      {isEdit ? 'Save' : `Add ${kindName}`}
    </button>
    {#if onCancel}
      <button type="button" class="btn ghost" onclick={onCancel}>Cancel</button>
    {/if}
    {#if isEdit && onDelete}
      <span class="ml-auto"><ConfirmButton label="Delete" confirmLabel="Delete {kindName}" variant="button" onConfirm={onDelete} /></span>
    {/if}
  </div>
</form>
