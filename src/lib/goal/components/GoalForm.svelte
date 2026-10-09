<script lang="ts">
  import { trpc } from '$shared/trpc/client';
  import Field from '$lib/ui/Field.svelte';
  import MarkdownEditor from '$lib/common/MarkdownEditor.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import GroupedOptions from '$lib/ui/GroupedOptions.svelte';
  import { submit } from '$lib/ui/submit';
  import { GOAL_STATUSES, type GoalStatus } from '$shared/types/enums';
  import type { EntityOwner } from '$shared/types/owner';
  import { ownerOptionValue, parseOwnerOptionValue, type OwnerOption } from '$shared/trpc/load-owner-options';
  import { GOAL_STATUS_LABELS } from '$lib/goal/utils';
  import { localDay, periodOptions } from '$shared/utils/period';

  interface GoalData {
    readonly id?: string;
    readonly title?: string;
    readonly description?: string | null;
    readonly owner?: EntityOwner | null;
    readonly parentId?: string | null;
    readonly period?: string | null;
    readonly status?: GoalStatus;
    readonly unit?: string | null;
    readonly baseline?: number | null;
    readonly target?: number | null;
  }

  interface Props {
    readonly initial?: GoalData;
    readonly ownerOptions: readonly OwnerOption[];
    readonly onSuccess: (result: { readonly id: string }) => void;
    readonly onCancel?: () => void;
    readonly onDelete?: () => Promise<void> | void;
  }

  const { initial = {}, ownerOptions, onSuccess, onCancel, onDelete }: Props = $props();

  const isEdit = $derived(!!initial.id);
  const periods = $derived(periodOptions(localDay(), initial.period ?? null));

  const ownerValue = (owner: EntityOwner | null | undefined): string =>
    owner ? ownerOptionValue(owner.type, owner.id) : '';

  let title = $state(initial.title ?? '');
  let description = $state(initial.description ?? '');
  let owner = $state(ownerValue(initial.owner));
  let period = $state(initial.period ?? '');
  let status = $state<GoalStatus>(initial.status ?? 'NOT_STARTED');
  let unit = $state(initial.unit ?? '');
  let baseline = $state<number | undefined>(initial.baseline ?? undefined);
  let target = $state<number | undefined>(initial.target ?? undefined);
  let submitting = $state(false);
  let error = $state('');

  // Re-sync when initial changes (e.g. navigating to a different goal)
  $effect(() => {
    title = initial.title ?? '';
    description = initial.description ?? '';
    owner = ownerValue(initial.owner);
    period = initial.period ?? '';
    status = initial.status ?? 'NOT_STARTED';
    unit = initial.unit ?? '';
    baseline = initial.baseline ?? undefined;
    target = initial.target ?? undefined;
  });

  const handleSubmit = async () => {
    submitting = true;
    error = '';
    const picked = parseOwnerOptionValue(owner);
    const outcome = isEdit
      ? await submit(() => trpc().goal.update.mutate({
          id: initial.id!,
          title: title.trim(),
          description: description.trim() || null,
          ownerType: picked?.ownerType ?? null,
          ownerId: picked?.ownerId ?? null,
          period: period || null,
          status,
          unit: unit.trim() || null,
          baseline: baseline ?? null,
          target: target ?? null,
        }))
      : await submit(() => trpc().goal.create.mutate({
          title: title.trim(),
          description: description.trim() || undefined,
          ...(picked ?? {}),
          parentId: initial.parentId ?? undefined,
          period: period || undefined,
          status,
          unit: unit.trim() || undefined,
          baseline: baseline ?? undefined,
          target: target ?? undefined,
        }));
    submitting = false;
    if (!outcome.ok) {
      error = outcome.error;
      return;
    }
    if (!isEdit) {
      title = '';
      description = '';
      period = '';
      unit = '';
      baseline = undefined;
      target = undefined;
    }
    onSuccess(outcome.value);
  };
</script>

<form class="form-grid" onsubmit={(e: SubmitEvent) => { e.preventDefault(); handleSubmit(); }}>
  <Field label="Title">
    {#snippet children({ id })}
      <input {id} type="text" bind:value={title} required placeholder="What does success look like?" />
    {/snippet}
  </Field>
  <Field label="Description">
    {#snippet children({ id })}
      <MarkdownEditor value={description} onChange={(md: string) => { description = md; }} />
    {/snippet}
  </Field>
  <div class="form-row">
    <Field label="Owner">
      {#snippet children({ id })}
        <select {id} bind:value={owner}>
          <option value="">Whole organisation</option>
          <GroupedOptions options={ownerOptions} />
        </select>
      {/snippet}
    </Field>
    <Field label="Period">
      {#snippet children({ id })}
        <select {id} bind:value={period}>
          <option value="">No period</option>
          <GroupedOptions options={periods} />
        </select>
      {/snippet}
    </Field>
  </div>
  <Field label="Status">
    {#snippet children({ id })}
      <select {id} bind:value={status}>
        {#each GOAL_STATUSES as s (s)}
          <option value={s}>{GOAL_STATUS_LABELS[s]}</option>
        {/each}
      </select>
    {/snippet}
  </Field>
  <div class="form-row thirds">
    <Field label="Unit" hint="%, deals, ms…">
      {#snippet children({ id })}
        <input {id} type="text" bind:value={unit} placeholder="–" />
      {/snippet}
    </Field>
    <Field label="Baseline">
      {#snippet children({ id })}
        <input {id} type="number" step="any" bind:value={baseline} placeholder="0" />
      {/snippet}
    </Field>
    <Field label="Target">
      {#snippet children({ id })}
        <input {id} type="number" step="any" bind:value={target} placeholder="–" />
      {/snippet}
    </Field>
  </div>

  {#if error}<p class="form-error">{error}</p>{/if}

  <div class="form-actions">
    <button type="submit" class="btn primary" disabled={submitting || !title.trim()} aria-busy={submitting}>
      {isEdit ? 'Save' : 'Add goal'}
    </button>
    {#if onCancel}
      <button type="button" class="btn ghost" onclick={onCancel}>Cancel</button>
    {/if}
    {#if isEdit && onDelete}
      <span class="ml-auto"><ConfirmButton label="Delete" confirmLabel="Delete goal" variant="button" onConfirm={onDelete} /></span>
    {/if}
  </div>
</form>
