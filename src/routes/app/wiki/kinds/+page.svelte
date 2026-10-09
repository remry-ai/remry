<script lang="ts">
  // The notebook's page kinds: each is a name and typed fields, and its pages
  // open as a table at /app/wiki?kind=<key>.
  import type { PageData } from './$types';
  import Popup from '$lib/common/Popup.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';
  import PageKindForm from '$lib/page/components/PageKindForm.svelte';
  import { openPopup, closePopup } from '$lib/ui/popup-url';
  import { submitOrThrow } from '$lib/ui/submit';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { trpc } from '$shared/trpc/client';
  import type { PageKindSummary } from '$shared/types/pages';

  const { data } = $props<{ data: PageData }>();
  const kinds = $derived((data.kinds as readonly PageKindSummary[]).filter((k) => k.key !== 'GENERAL'));
  const editing = $derived(kinds.find((k) => k.key === page.url.searchParams.get('kind')) ?? null);

  const fieldSummary = (kind: PageKindSummary): string =>
    kind.fields.length === 0 ? 'No fields' : kind.fields.map((f) => f.label).join(', ');

  // A kind's pages become plain pages (their values are dropped) when it goes.
  const handleDelete = async (kind: PageKindSummary) => {
    await submitOrThrow(() => trpc().pageKind.delete.mutate({ key: kind.key, ...(kind.pageCount > 0 ? { moveTo: 'GENERAL' } : {}) }));
    await invalidateAll();
  };
</script>

<svelte:head><title>Page kinds · Wiki</title></svelte:head>

<div class="page">
  <PageHeader title="Page kinds" description="Each kind of page has its own fields, and its pages open as a table you can filter, group and total.">
    <a class="btn" href="/app/wiki">Back to wiki</a>
    <button type="button" class="btn primary" onclick={() => openPopup('new-kind')}>Add kind</button>
  </PageHeader>

  {#if kinds.length > 0}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Kind</th>
            <th>Fields</th>
            <th class="num">Pages</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each kinds as kind (kind.key)}
            <tr>
              <td>
                <a href="/app/wiki?kind={kind.key}">{kind.name}</a>
                <span class="muted mono text-xs">{kind.key}</span>
              </td>
              <td class="text-2">{fieldSummary(kind)}</td>
              <td class="num text-2">{kind.pageCount}</td>
              <td class="num">
                <button type="button" class="btn icon sm" aria-label="Edit {kind.name}" title="Edit" onclick={() => openPopup('edit-kind', { kind: kind.key })}><PencilIcon /></button>
                <ConfirmButton
                  label="Delete {kind.name}"
                  confirmLabel={kind.pageCount > 0 ? `Delete; its ${kind.pageCount} page(s) become plain pages` : 'Delete kind'}
                  variant="icon"
                  onConfirm={() => handleDelete(kind)}
                />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <EmptyState message="No page kinds yet. Add one for anything you keep a list of: expenses, recipes, places to go." boxed>
      <button type="button" class="btn sm" onclick={() => openPopup('new-kind')}>Add kind</button>
    </EmptyState>
  {/if}
</div>

<Popup id="new-kind" title="Add page kind" size="lg">
  <PageKindForm onSuccess={() => closePopup({ invalidate: true })} onCancel={() => closePopup()} />
</Popup>

<Popup id="edit-kind" title={editing ? `Edit ${editing.name}` : 'Edit page kind'} size="lg" clearParams={['kind']}>
  {#if editing}
    <PageKindForm initial={editing} onSuccess={() => closePopup({ invalidate: true, clear: ['kind'] })} onCancel={() => closePopup({ clear: ['kind'] })} />
  {/if}
</Popup>
