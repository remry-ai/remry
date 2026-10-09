<script lang="ts">
  // The notebook's person relation kinds: how two people relate, read one way
  // from each end ("Parent of" / "Child of").
  import type { PageData } from './$types';
  import Popup from '$lib/common/Popup.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';
  import PersonRelationKindForm from '$lib/relation/components/PersonRelationKindForm.svelte';
  import { openPopup, closePopup } from '$lib/ui/popup-url';
  import { submitOrThrow } from '$lib/ui/submit';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { trpc } from '$shared/trpc/client';
  import type { PersonRelationKindSummary } from '$shared/types/person-relations';

  const { data } = $props<{ data: PageData }>();
  const kinds = $derived(data.kinds as readonly PersonRelationKindSummary[]);
  const editing = $derived(kinds.find((k) => k.key === page.url.searchParams.get('kind')) ?? null);

  const handleDelete = async (kind: PersonRelationKindSummary) => {
    await submitOrThrow(() => trpc().personRelationKind.delete.mutate({ key: kind.key }));
    await invalidateAll();
  };
</script>

<svelte:head><title>Relation kinds</title></svelte:head>

<div class="page">
  <PageHeader title="Relation kinds" description="How people in this notebook relate. Each kind reads one way from each end.">
    <a class="btn" href="/app/people">Back to people</a>
    <button type="button" class="btn primary" onclick={() => openPopup('new-relation-kind')}>Add kind</button>
  </PageHeader>

  {#if kinds.length > 0}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>From one end</th>
            <th>From the other</th>
            <th>One each</th>
            <th class="num">Relationships</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each kinds as kind (kind.key)}
            <tr>
              <td>{kind.label} <span class="muted mono text-xs">{kind.key}</span></td>
              <td class="text-2">{kind.symmetric ? '—' : kind.inverseLabel}</td>
              <td class="text-2">{kind.exclusive ? 'Yes' : 'No'}</td>
              <td class="num text-2">{kind.relationCount}</td>
              <td class="num">
                <button type="button" class="btn icon sm" aria-label="Edit {kind.label}" title="Edit" onclick={() => openPopup('edit-relation-kind', { kind: kind.key })}><PencilIcon /></button>
                {#if kind.relationCount === 0}
                  <ConfirmButton label="Delete {kind.label}" confirmLabel="Delete kind" variant="icon" onConfirm={() => handleDelete(kind)} />
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <EmptyState message="No relation kinds yet." boxed>
      <button type="button" class="btn sm" onclick={() => openPopup('new-relation-kind')}>Add kind</button>
    </EmptyState>
  {/if}
</div>

<Popup id="new-relation-kind" title="Add relation kind">
  <PersonRelationKindForm onSuccess={() => closePopup({ invalidate: true })} onCancel={() => closePopup()} />
</Popup>

<Popup id="edit-relation-kind" title={editing ? `Edit ${editing.label}` : 'Edit relation kind'} clearParams={['kind']}>
  {#if editing}
    <PersonRelationKindForm initial={editing} onSuccess={() => closePopup({ invalidate: true, clear: ['kind'] })} onCancel={() => closePopup({ clear: ['kind'] })} />
  {/if}
</Popup>
