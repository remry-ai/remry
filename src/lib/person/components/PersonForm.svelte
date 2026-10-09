<script lang="ts">
  // Create or edit a person: name and email, then each field the notebook's
  // modules add (org: title, lead; personal: how we know them, birthday).
  import { trpc } from '$shared/trpc/client';
  import Field from '$lib/ui/Field.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import { submit } from '$lib/ui/submit';
  import { model } from '$lib/stores/notebook-model';
  import { fieldRaw } from '$lib/person/fields';
  import type { PersonExtensions, PersonExtensionsPatch } from '$shared/types/person';

  interface PersonData {
    readonly id?: string;
    readonly name?: string;
    readonly email?: string | null;
    readonly extensions?: PersonExtensions;
  }

  interface PersonOption {
    readonly id: string;
    readonly name: string;
  }

  interface Props {
    readonly initial?: PersonData;
    /** Choices for person fields (a lead); leave out to skip them. */
    readonly personOptions?: readonly PersonOption[];
    readonly onSuccess: (result: { readonly id: string }) => void;
    readonly onCancel?: () => void;
    readonly onDelete?: () => Promise<void> | void;
  }

  const { initial = {}, personOptions, onSuccess, onCancel, onDelete }: Props = $props();

  const isEdit = $derived(!!initial.id);
  const fields = $derived($model.personFields.filter((f) => f.input !== 'person' || personOptions));

  const startValues = (): Record<string, string> =>
    Object.fromEntries($model.personFields.map((f) => [`${f.module}.${f.key}`, fieldRaw(initial.extensions ?? {}, f) ?? '']));

  let name = $state(initial.name ?? '');
  let email = $state(initial.email ?? '');
  let values = $state<Record<string, string>>(startValues());
  let submitting = $state(false);
  let error = $state('');

  $effect(() => {
    name = initial.name ?? '';
    email = initial.email ?? '';
    values = startValues();
  });

  // Each module's fields under its id; empty clears a field on edit and is left out on create.
  const extensionsPatch = (): PersonExtensionsPatch => {
    const patch: Record<string, Record<string, string | null>> = {};
    for (const f of fields) {
      const value = values[`${f.module}.${f.key}`]?.trim() ?? '';
      if (!value && !isEdit) continue;
      patch[f.module] = { ...patch[f.module], [f.key]: value || null };
    }
    return patch as PersonExtensionsPatch;
  };

  const handleSubmit = async () => {
    submitting = true;
    error = '';
    const extensions = extensionsPatch();
    const outcome = isEdit
      ? await submit(() => trpc().person.update.mutate({ id: initial.id!, name: name.trim(), email: email.trim() || null, extensions }))
      : await submit(() => trpc().person.create.mutate({ name: name.trim(), email: email.trim() || undefined, extensions }));
    submitting = false;
    if (!outcome.ok) {
      error = outcome.error;
      return;
    }
    if (!isEdit) {
      name = '';
      email = '';
      values = startValues();
    }
    onSuccess(outcome.value);
  };
</script>

<form class="form-grid" onsubmit={(e: SubmitEvent) => { e.preventDefault(); handleSubmit(); }}>
  <div class="form-row">
    <Field label="Name">
      {#snippet children({ id })}
        <input {id} type="text" bind:value={name} required placeholder="Full name" />
      {/snippet}
    </Field>
    <Field label="Email">
      {#snippet children({ id })}
        <input {id} type="email" bind:value={email} placeholder="name@example.com" />
      {/snippet}
    </Field>
  </div>
  {#each fields as field (`${field.module}.${field.key}`)}
    {@const key = `${field.module}.${field.key}`}
    <Field label={field.label}>
      {#snippet children({ id })}
        {#if field.input === 'person'}
          <select {id} bind:value={values[key]}>
            <option value="">None</option>
            {#each (personOptions ?? []).filter((p) => p.id !== initial.id) as p (p.id)}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        {:else if field.input === 'birthday'}
          <input {id} type="text" bind:value={values[key]} pattern={'(\\d{4}-|--)\\d{2}-\\d{2}'} placeholder={field.placeholder} />
        {:else}
          <input {id} type="text" bind:value={values[key]} placeholder={field.placeholder} />
        {/if}
      {/snippet}
    </Field>
  {/each}

  {#if error}<p class="form-error">{error}</p>{/if}

  <div class="form-actions">
    <button type="submit" class="btn primary" disabled={submitting || !name.trim()} aria-busy={submitting}>
      {isEdit ? 'Save' : 'Add person'}
    </button>
    {#if onCancel}
      <button type="button" class="btn ghost" onclick={onCancel}>Cancel</button>
    {/if}
    {#if isEdit && onDelete}
      <span class="ml-auto"><ConfirmButton label="Delete" confirmLabel="Delete person" variant="button" onConfirm={onDelete} /></span>
    {/if}
  </div>
</form>
