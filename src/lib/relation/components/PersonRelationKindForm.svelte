<script lang="ts">
  // Create or edit a person relation kind. Its labels change freely; its direction
  // and whether it's one each are set when it's created.
  import { trpc } from '$shared/trpc/client';
  import Field from '$lib/ui/Field.svelte';
  import { submit } from '$lib/ui/submit';
  import { kindKeyFromName } from '$lib/page/kind-form';
  import type { PersonRelationKindDefinition } from '$shared/types/person-relations';

  interface Props {
    readonly initial?: PersonRelationKindDefinition;
    readonly onSuccess: () => void;
    readonly onCancel?: () => void;
  }

  const { initial, onSuccess, onCancel }: Props = $props();

  const isEdit = $derived(!!initial);

  let label = $state(initial?.label ?? '');
  let inverseLabel = $state(initial && !initial.symmetric ? initial.inverseLabel : '');
  let key = $state(initial?.key ?? '');
  let autoKey = $state(!initial);
  let exclusive = $state(initial?.exclusive ?? false);
  let submitting = $state(false);
  let error = $state('');

  $effect(() => {
    label = initial?.label ?? '';
    inverseLabel = initial && !initial.symmetric ? initial.inverseLabel : '';
    key = initial?.key ?? '';
    autoKey = !initial;
    exclusive = initial?.exclusive ?? false;
  });

  const setLabel = (value: string) => {
    label = value;
    if (autoKey) key = kindKeyFromName(value);
  };

  const handleSubmit = async () => {
    submitting = true;
    error = '';
    const inverse = inverseLabel.trim() || undefined;
    const outcome = isEdit
      ? await submit(() => trpc().personRelationKind.update.mutate({ key: initial!.key, label: label.trim(), inverseLabel: inverse }))
      : await submit(() => trpc().personRelationKind.create.mutate({ key, label: label.trim(), inverseLabel: inverse, exclusive: !!inverse && exclusive }));
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
    <Field label="Label" hint="Read from the first person: Alice is “Mentor of” Bo.">
      {#snippet children({ id })}
        <input {id} type="text" value={label} oninput={(e) => setLabel(e.currentTarget.value)} required placeholder="e.g. Mentor of, Neighbour of" />
      {/snippet}
    </Field>
    <Field label="From the other end" hint={isEdit && initial?.symmetric ? 'This kind reads the same both ways.' : 'Leave empty if it reads the same both ways.'}>
      {#snippet children({ id })}
        <input {id} type="text" bind:value={inverseLabel} disabled={isEdit && initial?.symmetric} placeholder="e.g. Mentee of" />
      {/snippet}
    </Field>
  </div>
  <Field label="Key" hint={isEdit ? "A kind's key can't change." : 'Used by Claude and the CLI.'}>
    {#snippet children({ id })}
      <input {id} type="text" class="mono" bind:value={key} oninput={() => { autoKey = false; }} disabled={isEdit} required pattern={'[A-Z][A-Z0-9_]*'} />
    {/snippet}
  </Field>
  {#if !isEdit}
    <Field label="One each" hint="Like a lead: someone has one, and adding another replaces it.">
        {#snippet children({ id })}
          <input {id} type="checkbox" bind:checked={exclusive} disabled={!inverseLabel.trim()} />
        {/snippet}
    </Field>
  {/if}

  {#if error}<p class="form-error">{error}</p>{/if}

  <div class="form-actions">
    <button type="submit" class="btn primary" disabled={submitting || !label.trim() || !key.trim()} aria-busy={submitting}>
      {isEdit ? 'Save' : 'Add kind'}
    </button>
    {#if onCancel}
      <button type="button" class="btn ghost" onclick={onCancel}>Cancel</button>
    {/if}
  </div>
</form>
