<script lang="ts">
  import { trpc } from '$shared/trpc/client';
  import Field from '$lib/ui/Field.svelte';
  import MarkdownEditor from '$lib/common/MarkdownEditor.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import GroupedOptions from '$lib/ui/GroupedOptions.svelte';
  import { submit } from '$lib/ui/submit';
  import type { EntityOwner } from '$shared/types/owner';
  import { ownerOptionValue, parseOwnerOptionValue, type OwnerOption } from '$shared/trpc/load-owner-options';
  import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from '$shared/utils/project-status';

  interface ProjectData {
    readonly id?: string;
    readonly name?: string;
    readonly description?: string | null;
    readonly status?: string | null;
    readonly startDate?: Date | string | null;
    readonly endDate?: Date | string | null;
    readonly daysOptimistic?: number | null;
    readonly daysLikely?: number | null;
    readonly daysPessimistic?: number | null;
    readonly parentId?: string;
    readonly owner?: EntityOwner | null;
  }

  interface Props {
    readonly initial?: ProjectData;
    /** When given, the form shows an owner field. */
    readonly ownerOptions?: readonly OwnerOption[];
    readonly onSuccess: (result: { readonly id: string }) => void;
    readonly onCancel?: () => void;
    readonly onDelete?: () => Promise<void> | void;
  }

  const { initial = {}, ownerOptions, onSuccess, onCancel, onDelete }: Props = $props();

  const isEdit = $derived(!!initial.id);

  const toDateStr = (d: Date | string | null | undefined): string => {
    if (!d) return '';
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toISOString().slice(0, 10);
  };

  const ownerValue = (owner: EntityOwner | null | undefined): string =>
    owner ? ownerOptionValue(owner.type, owner.id) : '';

  let name = $state(initial.name ?? '');
  let description = $state(initial.description ?? '');
  let owner = $state(ownerValue(initial.owner));
  // A new project starts committed; "No status" is only for one that has none.
  let status = $state(initial.id ? (initial.status ?? '') : 'committed');
  let startDate = $state(toDateStr(initial.startDate));
  let endDate = $state(toDateStr(initial.endDate));
  let daysOptimistic = $state<number | undefined>(initial.daysOptimistic ?? undefined);
  let daysLikely = $state<number | undefined>(initial.daysLikely ?? undefined);
  let daysPessimistic = $state<number | undefined>(initial.daysPessimistic ?? undefined);
  let submitting = $state(false);
  let error = $state('');

  // Re-sync when initial changes (e.g. navigating to a different entity)
  $effect(() => {
    name = initial.name ?? '';
    description = initial.description ?? '';
    owner = ownerValue(initial.owner);
    status = initial.id ? (initial.status ?? '') : 'committed';
    startDate = toDateStr(initial.startDate);
    endDate = toDateStr(initial.endDate);
    daysOptimistic = initial.daysOptimistic ?? undefined;
    daysLikely = initial.daysLikely ?? undefined;
    daysPessimistic = initial.daysPessimistic ?? undefined;
  });

  const handleSubmit = async () => {
    submitting = true;
    error = '';
    const picked = parseOwnerOptionValue(owner);
    const outcome = isEdit
      ? await submit(() => trpc().project.update.mutate({
          id: initial.id!,
          name: name.trim(),
          description: description.trim() || null,
          status: status || null,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          daysOptimistic: daysOptimistic ?? null,
          daysLikely: daysLikely ?? null,
          daysPessimistic: daysPessimistic ?? null,
          ...(ownerOptions && { ownerType: picked?.ownerType ?? null, ownerId: picked?.ownerId ?? null }),
        }))
      : await submit(() => trpc().project.create.mutate({
          name: name.trim(),
          description: description.trim() || undefined,
          status: status || undefined,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          daysOptimistic,
          daysLikely,
          daysPessimistic,
          parentId: initial.parentId,
          ...(picked ?? {}),
        }));
    submitting = false;
    if (!outcome.ok) {
      error = outcome.error;
      return;
    }
    if (!isEdit) {
      name = '';
      description = '';
      owner = '';
      status = 'committed';
      startDate = '';
      endDate = '';
      daysOptimistic = undefined;
      daysLikely = undefined;
      daysPessimistic = undefined;
    }
    onSuccess(outcome.value);
  };
</script>

<form class="form-grid" onsubmit={(e: SubmitEvent) => { e.preventDefault(); handleSubmit(); }}>
  <Field label="Name">
    {#snippet children({ id })}
      <input {id} type="text" bind:value={name} required placeholder="Project name" />
    {/snippet}
  </Field>
  <Field label="Description">
    {#snippet children({ id })}
      <MarkdownEditor value={description} onChange={(md: string) => { description = md; }} />
    {/snippet}
  </Field>
  <Field label="Status">
    {#snippet children({ id })}
      <select {id} bind:value={status}>
        {#if isEdit}<option value="">No status</option>{/if}
        {#each PROJECT_STATUSES as option (option)}
          <option value={option}>{PROJECT_STATUS_LABELS[option]}</option>
        {/each}
      </select>
    {/snippet}
  </Field>
  {#if ownerOptions}
    <Field label="Owner">
      {#snippet children({ id })}
        <select {id} bind:value={owner}>
          <option value="">No owner</option>
          <GroupedOptions options={ownerOptions} />
        </select>
      {/snippet}
    </Field>
  {/if}
  <div class="form-row">
    <Field label="Start date">
      {#snippet children({ id })}
        <input {id} type="date" bind:value={startDate} />
      {/snippet}
    </Field>
    <Field label="Target date">
      {#snippet children({ id })}
        <input {id} type="date" bind:value={endDate} />
      {/snippet}
    </Field>
  </div>
  <div class="form-row thirds">
    <Field label="Optimistic" hint="days">
      {#snippet children({ id })}
        <input {id} type="number" min="0" bind:value={daysOptimistic} placeholder="–" />
      {/snippet}
    </Field>
    <Field label="Likely" hint="days">
      {#snippet children({ id })}
        <input {id} type="number" min="0" bind:value={daysLikely} placeholder="–" />
      {/snippet}
    </Field>
    <Field label="Pessimistic" hint="days">
      {#snippet children({ id })}
        <input {id} type="number" min="0" bind:value={daysPessimistic} placeholder="–" />
      {/snippet}
    </Field>
  </div>

  {#if error}<p class="form-error">{error}</p>{/if}

  <div class="form-actions">
    <button type="submit" class="btn primary" disabled={submitting || !name.trim()} aria-busy={submitting}>
      {isEdit ? 'Save' : 'Add project'}
    </button>
    {#if onCancel}
      <button type="button" class="btn ghost" onclick={onCancel}>Cancel</button>
    {/if}
    {#if isEdit && onDelete}
      <span class="ml-auto"><ConfirmButton label="Delete" confirmLabel="Delete project" variant="button" onConfirm={onDelete} /></span>
    {/if}
  </div>
</form>
