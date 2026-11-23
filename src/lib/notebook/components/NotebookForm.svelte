<script lang="ts">
  // Create a notebook (name and profile; the server makes its id from the name), or rename one, which
  // shows only the name: the id never changes, and a profile changes with notebook.setProfile.
  import { trpc } from '$shared/trpc/client';
  import type { NotebookInfo, NotebookProfile } from '$shared/types/notebook';
  import { PROFILE_OPTIONS, profileHint } from '../profiles';
  import Field from '$lib/ui/Field.svelte';
  import { submit } from '$lib/ui/submit';

  interface Props {
    /** The notebook to rename. Without it, the form creates one. */
    readonly initial?: Pick<NotebookInfo, 'id' | 'name'>;
    readonly onSuccess: (notebook: NotebookInfo) => void;
    readonly onCancel?: () => void;
  }

  const { initial, onSuccess, onCancel }: Props = $props();

  // Follows `initial` (another notebook to rename) until the user types.
  let name = $derived(initial?.name ?? '');
  let profile = $state<NotebookProfile>('work');
  let submitting = $state(false);
  let error = $state('');

  const handleSubmit = async () => {
    submitting = true;
    error = '';
    const outcome = initial
      ? await submit(() => trpc().notebook.rename.mutate({ id: initial.id, name: name.trim() }))
      : await submit(() => trpc().notebook.create.mutate({ name: name.trim(), profile }));
    submitting = false;
    if (!outcome.ok) {
      error = outcome.error;
      return;
    }
    onSuccess(outcome.value);
  };
</script>

<form class="form-grid" onsubmit={(e: SubmitEvent) => { e.preventDefault(); handleSubmit(); }}>
  <Field label="Name">
    {#snippet children({ id: fieldId })}
      <input id={fieldId} type="text" bind:value={name} required maxlength="100" placeholder="Work, or a side project" />
    {/snippet}
  </Field>
  {#if !initial}
    <Field label="Profile" hint={profileHint(profile)}>
      {#snippet children({ id: fieldId })}
        <select id={fieldId} bind:value={profile}>
          {#each PROFILE_OPTIONS as option (option.id)}
            <option value={option.id}>{option.name}</option>
          {/each}
        </select>
      {/snippet}
    </Field>
  {/if}

  {#if error}<p class="form-error">{error}</p>{/if}

  <div class="form-actions">
    <button type="submit" class="btn primary" disabled={submitting || !name.trim()} aria-busy={submitting}>
      {initial ? 'Save' : 'Create notebook'}
    </button>
    {#if onCancel}
      <button type="button" class="btn ghost" onclick={onCancel}>Cancel</button>
    {/if}
  </div>
</form>
