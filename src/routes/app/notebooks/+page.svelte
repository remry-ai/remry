<script lang="ts">
  import { page } from '$app/stores';
  import { invalidateAll } from '$app/navigation';
  import type { PageData } from './$types';
  import Popup from '$lib/common/Popup.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';
  import NotebookForm from '$lib/notebook/components/NotebookForm.svelte';
  import { switchNotebook } from '$lib/notebook/switch';
  import { openPopup, closePopup } from '$lib/ui/popup-url';
  import { submit } from '$lib/ui/submit';
  import { trpc } from '$shared/trpc/client';
  import type { NotebookSummary } from '$shared/types/notebook';

  // The /app layout already loads the notebooks for the switcher.
  const { data } = $props<{ data: PageData }>();
  const notebooks: readonly NotebookSummary[] = $derived(data.notebooks);
  const renaming = $derived(notebooks.find((n) => n.id === $page.url.searchParams.get('rename')));

  let savingId = $state('');
  let error = $state('');

  const makeDefault = async (id: string) => {
    savingId = id;
    error = '';
    const outcome = await submit(() => trpc().notebook.setDefault.mutate({ id }));
    savingId = '';
    if (!outcome.ok) {
      error = outcome.error;
      return;
    }
    await invalidateAll();
  };
</script>

<svelte:head><title>Notebooks</title></svelte:head>

<div class="page">
  <PageHeader title="Notebooks" description="Each notebook keeps its own people, projects, notes and files. Claude uses its default notebook unless you name another.">
    <button type="button" class="btn primary" onclick={() => openPopup('new-notebook')}>New notebook</button>
  </PageHeader>

  {#if error}<p class="form-error">{error}</p>{/if}

  {#if notebooks.length > 0}
    <div class="list divided">
      {#each notebooks as notebook (notebook.id)}
        <div class="list-row">
          <span class="grow notebook-title">
            <span class="truncate">{notebook.name}</span>
            <span class="meta mono">{notebook.id}</span>
            {#if notebook.isCurrent}<span class="badge accent">Open</span>{/if}
            {#if notebook.isDefault}<span class="badge muted">Claude's default</span>{/if}
          </span>
          <span class="row-actions">
            {#if !notebook.isCurrent}
              <button type="button" class="btn sm" onclick={() => switchNotebook(notebook.id)}>Open</button>
            {/if}
            {#if !notebook.isDefault}
              <button
                type="button"
                class="btn ghost sm"
                disabled={savingId === notebook.id}
                aria-busy={savingId === notebook.id}
                onclick={() => makeDefault(notebook.id)}
              >{savingId === notebook.id ? 'Saving…' : "Make Claude's default"}</button>
            {/if}
            <button type="button" class="btn icon sm" aria-label="Rename {notebook.name}" onclick={() => openPopup('rename-notebook', { rename: notebook.id })}>
              <PencilIcon />
            </button>
          </span>
        </div>
      {/each}
    </div>
  {:else}
    <EmptyState message="No notebooks yet." boxed>
      <button type="button" class="btn sm" onclick={() => openPopup('new-notebook')}>New notebook</button>
    </EmptyState>
  {/if}
</div>

<Popup id="rename-notebook" title="Rename notebook" size="sm" clearParams={['rename']}>
  {#if renaming}
    <NotebookForm
      initial={renaming}
      onSuccess={() => closePopup({ invalidate: true, clear: ['rename'] })}
      onCancel={() => closePopup({ clear: ['rename'] })}
    />
  {/if}
</Popup>

<style lang="scss">
  .notebook-title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-width: 0;
  }
</style>
