<script lang="ts">
  // The notebook's group kinds: Team, Department, Family, Friends, or your own.
  import type { PageData } from './$types';
  import Popup from '$lib/common/Popup.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';
  import GroupKindForm from '$lib/group/components/GroupKindForm.svelte';
  import { openPopup, closePopup } from '$lib/ui/popup-url';
  import { submitOrThrow } from '$lib/ui/submit';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { trpc } from '$shared/trpc/client';
  import type { GroupKindSummary } from '$shared/types/groups';

  const { data } = $props<{ data: PageData }>();
  const kinds = $derived(data.kinds as readonly GroupKindSummary[]);
  const editing = $derived(kinds.find((k) => k.key === page.url.searchParams.get('kind')) ?? null);

  const handleDelete = async (kind: GroupKindSummary) => {
    await submitOrThrow(() => trpc().groupKind.delete.mutate({ key: kind.key }));
    await invalidateAll();
  };
</script>

<svelte:head><title>Group kinds</title></svelte:head>

<div class="page">
  <PageHeader title="Group kinds" description="What kinds of groups this notebook has. A kind can be one per person, like a department.">
    <a class="btn" href="/app/groups">Back to groups</a>
    <button type="button" class="btn primary" onclick={() => openPopup('new-group-kind')}>Add kind</button>
  </PageHeader>

  {#if kinds.length > 0}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Kind</th>
            <th>One per person</th>
            <th class="num">Groups</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each kinds as kind (kind.key)}
            <tr>
              <td>
                <a href="/app/groups?kind={kind.key}">{kind.plural}</a>
                <span class="muted mono text-xs">{kind.key}</span>
              </td>
              <td class="text-2">{kind.exclusive ? 'Yes' : 'No'}</td>
              <td class="num text-2">{kind.groupCount}</td>
              <td class="num">
                <button type="button" class="btn icon sm" aria-label="Edit {kind.name}" title="Edit" onclick={() => openPopup('edit-group-kind', { kind: kind.key })}><PencilIcon /></button>
                {#if kind.groupCount === 0}
                  <ConfirmButton label="Delete {kind.name}" confirmLabel="Delete kind" variant="icon" onConfirm={() => handleDelete(kind)} />
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <EmptyState message="No group kinds yet." boxed>
      <button type="button" class="btn sm" onclick={() => openPopup('new-group-kind')}>Add kind</button>
    </EmptyState>
  {/if}
</div>

<Popup id="new-group-kind" title="Add group kind">
  <GroupKindForm onSuccess={() => closePopup({ invalidate: true })} onCancel={() => closePopup()} />
</Popup>

<Popup id="edit-group-kind" title={editing ? `Edit ${editing.name}` : 'Edit group kind'} clearParams={['kind']}>
  {#if editing}
    <GroupKindForm initial={editing} onSuccess={() => closePopup({ invalidate: true, clear: ['kind'] })} onCancel={() => closePopup({ clear: ['kind'] })} />
  {/if}
</Popup>
