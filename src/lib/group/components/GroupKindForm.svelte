<script lang="ts">
  // Create or edit a group kind: its key, name, plural, and whether a person can
  // be in only one group of it (like a department).
  import { trpc } from '$shared/trpc/client';
  import Field from '$lib/ui/Field.svelte';
  import { submit } from '$lib/ui/submit';
  import { kindKeyFromName } from '$lib/page/kind-form';
  import type { GroupKindDefinition } from '$shared/types/groups';

  interface Props {
    readonly initial?: GroupKindDefinition;
    readonly onSuccess: () => void;
    readonly onCancel?: () => void;
  }

  const { initial, onSuccess, onCancel }: Props = $props();

  const isEdit = $derived(!!initial);

  let name = $state(initial?.name ?? '');
  let plural = $state(initial?.plural ?? '');
  let key = $state(initial?.key ?? '');
  let autoKey = $state(!initial);
  let exclusive = $state(initial?.exclusive ?? false);
  let submitting = $state(false);
  let error = $state('');

  $effect(() => {
    name = initial?.name ?? '';
    plural = initial?.plural ?? '';
    key = initial?.key ?? '';
    autoKey = !initial;
    exclusive = initial?.exclusive ?? false;
  });

  const setName = (value: string) => {
    name = value;
    if (autoKey) key = kindKeyFromName(value);
  };

  const handleSubmit = async () => {
    submitting = true;
    error = '';
    const outcome = isEdit
      ? await submit(() => trpc().groupKind.update.mutate({ key: initial!.key, name: name.trim(), plural: plural.trim() || undefined, exclusive }))
      : await submit(() => trpc().groupKind.create.mutate({ key, name: name.trim(), plural: plural.trim() || undefined, exclusive }));
    submitting = false;
    if (!outcome.ok) {
      error = outcome.error;
      return;
    }
    onSuccess();
  };
</script>

<form class="form-grid" onsubmit={(e: SubmitEvent) => { e.preventDefault(); handleSubmit(); }}>
  <div class="form-row">
    <Field label="Name">
      {#snippet children({ id })}
        <input {id} type="text" value={name} oninput={(e) => setName(e.currentTarget.value)} required placeholder="e.g. Team, Family, Book club" />
      {/snippet}
    </Field>
    <Field label="Plural">
      {#snippet children({ id })}
        <input {id} type="text" bind:value={plural} placeholder={name ? `${name}s` : 'e.g. Teams'} />
      {/snippet}
    </Field>
  </div>
  <Field label="Key" hint={isEdit ? "A kind's key can't change." : 'Used by Claude and the CLI.'}>
    {#snippet children({ id })}
      <input {id} type="text" class="mono" bind:value={key} oninput={() => { autoKey = false; }} disabled={isEdit} required pattern={'[A-Z][A-Z0-9_]*'} />
    {/snippet}
  </Field>
  <Field label="One per person" hint="Like a department: joining one leaves the other.">
    {#snippet children({ id })}
      <input {id} type="checkbox" bind:checked={exclusive} />
    {/snippet}
  </Field>

  {#if error}<p class="form-error">{error}</p>{/if}

  <div class="form-actions">
    <button type="submit" class="btn primary" disabled={submitting || !name.trim() || !key.trim()} aria-busy={submitting}>
      {isEdit ? 'Save' : 'Add kind'}
    </button>
    {#if onCancel}
      <button type="button" class="btn ghost" onclick={onCancel}>Cancel</button>
    {/if}
  </div>
</form>
