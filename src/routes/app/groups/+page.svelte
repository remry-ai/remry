<script lang="ts">
  // Every group, of every kind (Team, Department, Family…); ?kind= shows one.
  import type { PageData } from './$types';
  import Popup from '$lib/common/Popup.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ArchiveFilter from '$lib/ui/ArchiveFilter.svelte';
  import ParamSelect from '$lib/ui/ParamSelect.svelte';
  import GroupForm from '$lib/group/components/GroupForm.svelte';
  import { openPopup, closePopup } from '$lib/ui/popup-url';
  import type { GroupKindSummary, GroupSummary } from '$shared/types/groups';

  const { data } = $props<{ data: PageData }>();
  const groups = $derived(data.groups as readonly GroupSummary[]);
  const kinds = $derived(data.kinds as readonly GroupKindSummary[]);
  const current = $derived(kinds.find((k) => k.key === data.kind) ?? null);
  const kindOptions = $derived([
    { id: '', name: 'All kinds' },
    ...kinds.map((k) => ({ id: k.key, name: `${k.plural} (${k.groupCount})` }))
  ]);

  const handleCreated = () => closePopup({ invalidate: true });
</script>

<svelte:head><title>{current?.plural ?? 'Groups'}</title></svelte:head>

<div class="page">
  <PageHeader title={current?.plural ?? 'Groups'} description="Teams, departments, families, friends: any set of people, of a kind this notebook defines.">
    <a class="btn" href="/app/groups/kinds">Group kinds</a>
    <button type="button" class="btn primary" onclick={() => openPopup('new-group')} disabled={kinds.length === 0}>Add {current?.name.toLowerCase() ?? 'group'}</button>
  </PageHeader>

  <div class="toolbar filters">
    <ArchiveFilter />
    {#if kinds.length > 1}<ParamSelect param="kind" options={kindOptions} defaultValue="" ariaLabel="Show one kind" />{/if}
  </div>

  {#if groups.length > 0}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Kind</th>
            <th class="num">Members</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {#each groups as item (item.id)}
            <tr>
              <td><a href={item.path}>{item.name}</a>{#if item.archivedAt} <span class="badge muted">Archived</span>{/if}</td>
              <td><a class="badge" href="/app/groups?kind={item.kind}">{item.kindName}</a></td>
              <td class="num text-2">{item.memberCount}</td>
              <td class="text-2 pre-line">{item.description ?? ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if kinds.length === 0}
    <EmptyState message="No group kinds yet. Add one (Team, Family, Book club), then its groups." boxed>
      <a class="btn sm" href="/app/groups/kinds">Group kinds</a>
    </EmptyState>
  {:else}
    <EmptyState message="No {current?.plural.toLowerCase() ?? 'groups'} yet." boxed>
      <button type="button" class="btn sm" onclick={() => openPopup('new-group')}>Add {current?.name.toLowerCase() ?? 'group'}</button>
    </EmptyState>
  {/if}
</div>

<Popup id="new-group" title="Add {current?.name.toLowerCase() ?? 'group'}">
  <GroupForm initial={{ kind: current?.key }} {kinds} onSuccess={handleCreated} onCancel={() => closePopup()} />
</Popup>
