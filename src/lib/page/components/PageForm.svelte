<script lang="ts">
  // Title, kind and the kind's properties. Content is edited on the page itself.
  // Kinds are the notebook's own (pageKind.list), passed in by the page's load.
  import { trpc } from '$shared/trpc/client';
  import Field from '$lib/ui/Field.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import { submit } from '$lib/ui/submit';
  import { GENERAL_KIND, type PageKindDefinition, type PageProperties, type PagePropertyValue } from '$shared/types/pages';
  import { optionLabel } from '$lib/page/utils';

  interface PageData {
    readonly id?: string;
    readonly title?: string;
    readonly kind?: string;
    readonly parentId?: string | null;
    readonly properties?: PageProperties;
  }

  interface Props {
    readonly initial?: PageData;
    readonly kinds: readonly PageKindDefinition[];
    readonly onSuccess: (result: { readonly id: string }) => void;
    readonly onCancel?: () => void;
    readonly onDelete?: () => Promise<void> | void;
  }

  const { initial = {}, kinds, onSuccess, onCancel, onDelete }: Props = $props();

  const isEdit = $derived(!!initial.id);

  // Text inputs hold strings; multiselects an array, checkboxes a boolean.
  type FormValue = string | boolean | readonly string[];
  const asValues = (properties: PageProperties | undefined): Record<string, FormValue> =>
    Object.fromEntries(Object.entries(properties ?? {}).map(([key, value]) => [key, typeof value === 'number' ? String(value) : value]));

  let title = $state(initial.title ?? '');
  let kind = $state(initial.kind ?? 'GENERAL');
  let values = $state<Record<string, FormValue>>(asValues(initial.properties));
  let submitting = $state(false);
  let error = $state('');

  // Re-sync when initial changes (e.g. navigating to a different page)
  $effect(() => {
    title = initial.title ?? '';
    kind = initial.kind ?? 'GENERAL';
    values = asValues(initial.properties);
  });

  // GENERAL first, then the notebook's kinds; a page whose kind is gone keeps it listed.
  const kindOptions = $derived.by(() => {
    const all = kinds.some((k) => k.key === GENERAL_KIND.key) ? kinds : [GENERAL_KIND, ...kinds];
    return all.some((k) => k.key === kind) ? all : [...all, { ...GENERAL_KIND, key: kind, name: kind }];
  });
  const fields = $derived(kindOptions.find((k) => k.key === kind)?.fields ?? []);

  const toggleOption = (key: string, option: string, on: boolean) => {
    const current = Array.isArray(values[key]) ? (values[key] as readonly string[]) : [];
    values[key] = on ? [...current, option] : current.filter((o) => o !== option);
  };

  // Every field of the kind: a value, or null to clear it.
  const propertyPatch = (): Record<string, PagePropertyValue | null> =>
    Object.fromEntries(fields.map((field): [string, PagePropertyValue | null] => {
      const value = values[field.key];
      if (field.input === 'checkbox') return [field.key, value === true ? true : null];
      if (field.input === 'multiselect') return [field.key, Array.isArray(value) && value.length > 0 ? value : null];
      const raw = typeof value === 'string' ? value.trim() : '';
      if (!raw) return [field.key, null];
      return [field.key, field.input === 'number' ? Number(raw) : raw];
    }));

  const handleSubmit = async () => {
    submitting = true;
    error = '';
    const properties = propertyPatch();
    const outcome = isEdit
      ? await submit(() => trpc().page.update.mutate({ id: initial.id!, title: title.trim(), kind, properties }))
      : await submit(() => trpc().page.create.mutate({
          title: title.trim(),
          kind,
          parentId: initial.parentId ?? undefined,
          properties,
        }));
    submitting = false;
    if (!outcome.ok) {
      error = outcome.error;
      return;
    }
    if (!isEdit) {
      title = '';
      values = {};
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
    <Field label="Kind">
      {#snippet children({ id })}
        <select {id} bind:value={kind}>
          {#each kindOptions as k (k.key)}
            <option value={k.key}>{k.name}</option>
          {/each}
        </select>
      {/snippet}
    </Field>
  </div>

  {#each fields as field (field.key)}
    <Field label={field.label}>
      {#snippet children({ id })}
        {#if field.input === 'checkbox'}
          <input {id} type="checkbox" checked={values[field.key] === true} onchange={(e) => { values[field.key] = e.currentTarget.checked; }} />
        {:else if field.input === 'multiselect'}
          {@const chosen = Array.isArray(values[field.key]) ? (values[field.key] as readonly string[]) : []}
          <select
            {id}
            multiple
            size={Math.min(6, field.options?.length ?? 1)}
            onchange={(e) => {
              const picked = new Set([...e.currentTarget.selectedOptions].map((o) => o.value));
              for (const option of field.options ?? []) toggleOption(field.key, option, picked.has(option));
            }}
          >
            {#each field.options ?? [] as option (option)}
              <option value={option} selected={chosen.includes(option)}>{optionLabel(option)}</option>
            {/each}
          </select>
        {:else if field.input === 'select'}
          <select {id} value={values[field.key] ?? ''} onchange={(e) => { values[field.key] = e.currentTarget.value; }}>
            <option value="">—</option>
            {#each field.options ?? [] as option (option)}
              <option value={option}>{optionLabel(option)}</option>
            {/each}
          </select>
        {:else}
          <input
            {id}
            type={field.input}
            step={field.input === 'number' ? 'any' : undefined}
            value={typeof values[field.key] === 'string' ? values[field.key] : ''}
            oninput={(e) => { values[field.key] = e.currentTarget.value; }}
          />
        {/if}
      {/snippet}
    </Field>
  {/each}

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
