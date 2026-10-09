<script lang="ts">
  import type { PageData } from './$types';
  import { goto, invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import EntityDetailPage from '$lib/common/EntityDetailPage.svelte';
  import GroupForm from '$lib/group/components/GroupForm.svelte';
  import InlinePicker from '$lib/ui/InlinePicker.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { submitOrThrow } from '$lib/ui/submit';
  import OwnedWork from '$lib/goal/components/OwnedWork.svelte';
  import type { GroupDetail } from '$shared/types/groups';

  const { data } = $props<{ data: PageData }>();
  const group = $derived(data.group as GroupDetail);
  const docs = $derived(data.docs);
  const notes = $derived(data.notes);
  const todos = $derived(data.todos);
  const reports = $derived(data.reports);
  const relations = $derived(data.relations);

  const availablePersons = $derived(
    data.allPersons.filter((p: { id: string }) => !group.members.some((m) => m.personId === p.id)),
  );

  const handleAddMember = async (personId: string) => {
    await submitOrThrow(() => trpc().group.addMember.mutate({ groupId: group.id, personId }));
    await invalidateAll();
  };

  const handleRemoveMember = async (personId: string) => {
    await submitOrThrow(() => trpc().group.removeMember.mutate({ groupId: group.id, personId }));
    await invalidateAll();
  };

  const handleDelete = async () => {
    await submitOrThrow(() => trpc().group.delete.mutate({ id: group.id }));
    await goto('/app/groups');
  };
</script>

<EntityDetailPage
  entityType="GROUP"
  entityId={group.id}
  archivedAt={group.archivedAt}
  entityName={group.name}
  description={group.description}
  breadcrumbLabel="Groups"
  breadcrumbHref="/app/groups"
  breadcrumbTrail={[{ label: group.kindName, href: `/app/groups?kind=${group.kind}` }]}
  editPopupTitle="Edit {group.kindName.toLowerCase()}"
  {docs}
  {notes}
  {todos}
  {reports}
  {relations}
  links={data.links}
>
  {#snippet renderOverview()}
    <OwnedWork goals={data.ownedGoals} projects={data.ownedProjects} />

    <section class="section">
      <div class="section-header">
        <h4>Members <span class="count">{group.members.length}</span></h4>
      </div>
      {#if group.members.length > 0}
        <ul class="list">
          {#each group.members as m (m.personId)}
            <li class="list-row">
              <a class="grow truncate" href="/app/people/{m.personId}">{m.personName}</a>
              <span class="row-actions">
                <ConfirmButton label="Remove member" variant="icon" onConfirm={() => handleRemoveMember(m.personId)} />
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState message="No members yet." />
      {/if}
      <div class="section-footer">
        <InlinePicker label="Add member" options={availablePersons} placeholder="Select a person…" onPick={handleAddMember} />
        {#if group.exclusive}<p class="muted text-sm">A person is in one {group.kindName.toLowerCase()} at most; adding them here moves them.</p>{/if}
      </div>
    </section>
  {/snippet}

  {#snippet renderAssetHeader()}
    <span class="asset-h-name">{group.name}</span>
    <span class="asset-h-meta">{group.kindName} · {group.members.length} member{group.members.length === 1 ? '' : 's'}</span>
  {/snippet}

  {#snippet renderEditForm({ onSuccess, onCancel })}
    <GroupForm initial={group} kinds={data.kinds} {onSuccess} {onCancel} onDelete={handleDelete} />
  {/snippet}
</EntityDetailPage>

<style lang="scss">
  .section-footer { margin-top: var(--sp-2); }
</style>
