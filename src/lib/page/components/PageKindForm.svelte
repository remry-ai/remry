<script lang="ts">
  // Create or edit a page kind: its name, key and fields. The server checks a
  // field change against the kind's pages and refuses one that would orphan values.
  import { trpc } from '$shared/trpc/client';
  import Field from '$lib/ui/Field.svelte';
  import { submit } from '$lib/ui/submit';
  import { PAGE_FIELD_INPUTS, PAGE_KIND_LIMITS, type PageFieldInput, type PageKindDefinition } from '$shared/types/pages';
  import { emptyRow, fieldKeyFromLabel, kindKeyFromName, toField, toRow, type FieldRow } from '$lib/page/kind-form';

  interface Props {
    readonly initial?: PageKindDefinition;
    readonly onSuccess: (result: { readonly key: string }) => void;
    readonly onCancel?: () => void;
  }

  const { initial, onSuccess, onCancel }: Props = $props();

  const isEdit = $derived(!!initial);

  const INPUT_LABELS: Readonly<Record<PageFieldInput, string>> = {
    text: 'Text', number: 'Number', date: 'Date', url: 'Link', select: 'One of a list', multiselect: 'Several of a list', checkbox: 'Yes / no'
  };

  let name = $state(initial?.name ?? '');
  let key = $state(initial?.key ?? '');
  let autoKey = $state(!initial);
  let description = $state(initial?.description ?? '');
  let rows = $state<FieldRow[]>(initial ? initial.fields.map(toRow) : [emptyRow()]);
  let submitting = $state(false);
  let error = $state('');

  $effect(() => {
    name = initial?.name ?? '';
    key = initial?.key ?? '';
    autoKey = !initial;
    description = initial?.description ?? '';
    rows = initial ? initial.fields.map(toRow) : [emptyRow()];
  });

  const setName = (value: string) => {
    name = value;
    if (autoKey) key = kindKeyFromName(value);
  };

  const setLabel = (row: FieldRow, value: string) => {
    row.label = value;
    if (row.autoKey) row.key = fieldKeyFromLabel(value);
  };

  const move = (index: number, by: number) => {
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(index + by, 0, row!);
    rows = next;
  };

  const handleSubmit = async () => {
    submitting = true;
    error = '';
    const fields = rows.filter((r) => r.label.trim()).map(toField);
    const outcome = isEdit
      ? await submit(() => trpc().pageKind.update.mutate({ key: initial!.key, name: name.trim(), description: description.trim() || null, fields }))
      : await submit(() => trpc().pageKind.create.mutate({ key, name: name.trim(), description: description.trim() || null, fields }));
    submitting = false;
    if (!outcome.ok) {
      error = outcome.error;
      return;
    }
    onSuccess({ key: outcome.value.key });
  };
</script>

<form class="form-grid" onsubmit={(e: SubmitEvent) => { e.preventDefault(); handleSubmit(); }}>
  <div class="form-row">
    <Field label="Name">
      {#snippet children({ id })}
        <input {id} type="text" value={name} oninput={(e) => setName(e.currentTarget.value)} required placeholder="e.g. Expense, Recipe, Place" />
      {/snippet}
    </Field>
    <Field label="Key" hint={isEdit ? "A kind's key can't change." : 'Used by Claude and the CLI.'}>
      {#snippet children({ id })}
        <input {id} type="text" class="mono" bind:value={key} oninput={() => { autoKey = false; }} disabled={isEdit} required pattern={'[A-Z][A-Z0-9_]*'} />
      {/snippet}
    </Field>
  </div>
  <Field label="Description">
    {#snippet children({ id })}
      <input {id} type="text" bind:value={description} placeholder="Shown at the top of its table" />
    {/snippet}
  </Field>

  <div class="section">
    <div class="section-header"><h4>Fields <span class="count">{rows.filter((r) => r.label.trim()).length}</span></h4></div>
    <ul class="list divided">
      {#each rows as row, i (i)}
        <li class="list-row field-row">
          <div class="form-row thirds grow">
            <Field label="Label">
              {#snippet children({ id })}
                <input {id} type="text" class="sm" value={row.label} oninput={(e) => setLabel(row, e.currentTarget.value)} placeholder="e.g. Amount" />
              {/snippet}
            </Field>
            <Field label="Type">
              {#snippet children({ id })}
                <select {id} class="sm" bind:value={row.input}>
                  {#each PAGE_FIELD_INPUTS as input (input)}<option value={input}>{INPUT_LABELS[input]}</option>{/each}
                </select>
              {/snippet}
            </Field>
            <Field label="Key">
              {#snippet children({ id })}
                <input {id} type="text" class="sm mono" bind:value={row.key} oninput={() => { row.autoKey = false; }} />
              {/snippet}
            </Field>
            {#if row.input === 'select' || row.input === 'multiselect'}
              <Field label="Options" hint="Separated by commas">
                {#snippet children({ id })}
                  <input {id} type="text" class="sm" bind:value={row.options} placeholder="Monthly, Yearly" />
                {/snippet}
              </Field>
            {:else if row.input === 'number'}
              <Field label="Shown as">
                {#snippet children({ id })}
                  <select {id} class="sm" bind:value={row.format}>
                    <option value="plain">A number</option>
                    <option value="money">Money</option>
                  </select>
                {/snippet}
              </Field>
              {#if row.format === 'money'}
                <Field label="Currency">
                  {#snippet children({ id })}
                    <input {id} type="text" class="sm mono" bind:value={row.currency} maxlength="3" placeholder="USD" />
                  {/snippet}
                </Field>
              {/if}
            {/if}
          </div>
          <span class="field-actions">
            <button type="button" class="btn icon sm" aria-label="Move {row.label || 'field'} up" disabled={i === 0} onclick={() => move(i, -1)}>↑</button>
            <button type="button" class="btn icon sm" aria-label="Move {row.label || 'field'} down" disabled={i === rows.length - 1} onclick={() => move(i, 1)}>↓</button>
            <button type="button" class="btn icon sm" aria-label="Remove {row.label || 'field'}" onclick={() => { rows = rows.filter((_, j) => j !== i); }}>×</button>
          </span>
        </li>
      {/each}
    </ul>
    <button type="button" class="btn sm" disabled={rows.length >= PAGE_KIND_LIMITS.fields} onclick={() => { rows = [...rows, emptyRow()]; }}>Add field</button>
    {#if isEdit}
      <p class="muted text-sm">Removing a field clears its values from this kind's pages when you save.</p>
    {/if}
  </div>

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

<style lang="scss">
  .field-row {
    align-items: flex-end;
  }
  .field-actions {
    display: flex;
    gap: var(--sp-1);
    flex-shrink: 0;
  }
</style>
