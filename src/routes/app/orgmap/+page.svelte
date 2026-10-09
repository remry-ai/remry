<script lang="ts">
  import Popup from '$lib/common/Popup.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import InlinePicker from '$lib/ui/InlinePicker.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import PersonForm from '$lib/person/components/PersonForm.svelte';
  import GroupForm from '$lib/group/components/GroupForm.svelte';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';
  import { openPopup, closePopup } from '$lib/ui/popup-url';
  import { invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import { submitOrThrow } from '$lib/ui/submit';
  import OrgTree from '$lib/org/components/OrgTree.svelte';
  import { buildOrgTree } from '$lib/org/org-tree';
  import ParamToggle from '$lib/ui/ParamToggle.svelte';
  import WorkMap from '$lib/org/components/WorkMap.svelte';
  import { page } from '$app/state';
  import type { PageData } from './$types';

  const { data } = $props<{ data: PageData }>();
  const departments = $derived(data.departments);
  const teams = $derived(data.teams);
  const persons = $derived(data.persons);

  const orgRoots = $derived(buildOrgTree(persons));

  const VIEW_OPTIONS = [
    { id: 'people', name: 'Org chart' },
    { id: 'work', name: 'Owned work' }
  ];
  const isWork = $derived(page.url.searchParams.get('view') === 'work');

  // Department and team names per person, shown as chips on tree rows.
  const groupsByPerson = $derived.by(() => {
    const map = new Map<string, string[]>();
    for (const group of [...departments, ...teams]) {
      for (const m of group.members) {
        const list = map.get(m.personId) ?? [];
        list.push(group.name);
        map.set(m.personId, list);
      }
    }
    return map;
  });

  // ----- Edit targets (derived objects re-read from data after invalidate) -----

  let editDeptId = $state<string | null>(null);
  let editTeamId = $state<string | null>(null);
  let editPersonId = $state<string | null>(null);

  const editDept = $derived(editDeptId ? departments.find((d: any) => d.id === editDeptId) ?? null : null);
  const editTeam = $derived(editTeamId ? teams.find((t: any) => t.id === editTeamId) ?? null : null);
  const editPerson = $derived(editPersonId ? persons.find((p: any) => p.id === editPersonId) ?? null : null);

  const startEditDept = (id: string | null) => { editDeptId = id; openPopup('edit-department'); };
  const startEditTeam = (id: string | null) => { editTeamId = id; openPopup('edit-team'); };
  const startEditPerson = (id: string | null) => { editPersonId = id; openPopup('edit-person'); };

  const finish = async () => {
    editDeptId = null;
    editTeamId = null;
    editPersonId = null;
    await closePopup({ invalidate: true });
  };
  const cancel = () => { closePopup(); };

  // Passed to each form's delete ConfirmButton, which shows a thrown error.
  const deleteDept = async () => {
    if (!editDept) return;
    const id = editDept.id;
    await submitOrThrow(() => trpc().group.delete.mutate({ id }));
    await finish();
  };
  const deleteTeam = async () => {
    if (!editTeam) return;
    const id = editTeam.id;
    await submitOrThrow(() => trpc().group.delete.mutate({ id }));
    await finish();
  };
  const deletePerson = async () => {
    if (!editPerson) return;
    const id = editPerson.id;
    await submitOrThrow(() => trpc().person.delete.mutate({ id }));
    await finish();
  };

  // ----- Memberships (derived from loaded org data so add/remove refreshes automatically) -----

  const personDeptMemberships = $derived(
    editPersonId
      ? departments
          .filter((d: any) => d.members.some((m: any) => m.personId === editPersonId))
          .map((d: any) => ({ id: d.id, name: d.name }))
      : []
  );

  const personTeamMemberships = $derived(
    editPersonId
      ? teams
          .filter((t: any) => t.members.some((m: any) => m.personId === editPersonId))
          .map((t: any) => ({ id: t.id, name: t.name }))
      : []
  );

  const availablePersonsForDept = $derived(
    editDept ? persons.filter((p: any) => !editDept.members.some((m: any) => m.personId === p.id)) : []
  );
  const availablePersonsForTeam = $derived(
    editTeam ? persons.filter((p: any) => !editTeam.members.some((m: any) => m.personId === p.id)) : []
  );
  const availableDeptsForPerson = $derived(
    editPersonId ? departments.filter((d: any) => !d.members.some((m: any) => m.personId === editPersonId)) : []
  );
  const availableTeamsForPerson = $derived(
    editPersonId ? teams.filter((t: any) => !t.members.some((m: any) => m.personId === editPersonId)) : []
  );
  // Departments are an exclusive group kind, so adding a person to one moves them.
  const addMember = async (groupId: string, personId: string) => {
    await submitOrThrow(() => trpc().group.addMember.mutate({ groupId, personId }));
    await invalidateAll();
  };
  const removeMember = async (groupId: string, personId: string) => {
    await submitOrThrow(() => trpc().group.removeMember.mutate({ groupId, personId }));
    await invalidateAll();
  };
  const addDeptMember = addMember;
  const removeDeptMember = removeMember;
  const addTeamMember = addMember;
  const removeTeamMember = removeMember;
</script>

<svelte:head><title>Org Map</title></svelte:head>

<div class="page wide">
  <PageHeader title="Org Map" description="Reporting lines, departments and teams, and the work each one owns.">
    <button type="button" class="btn sm" onclick={() => startEditDept(null)}>Add department</button>
    <button type="button" class="btn sm" onclick={() => startEditTeam(null)}>Add team</button>
    <button type="button" class="btn primary sm" onclick={() => startEditPerson(null)}>Add person</button>
  </PageHeader>

  {#snippet viewToggle()}
    <ParamToggle param="view" options={VIEW_OPTIONS} defaultValue="people" ariaLabel="View" />
  {/snippet}

  {#if isWork}
    <section class="section">
      <div class="section-header"><h2>Owned work</h2></div>
      <div class="view-tools">{@render viewToggle()}</div>
      {#if data.work}
        <WorkMap input={data.work} />
      {:else}
        <EmptyState boxed message="The work map couldn't be loaded. Reload the page to try again." />
      {/if}
    </section>
  {:else}
    <section class="section">
      <div class="section-header"><h2>Reporting lines</h2></div>
      {#if persons.length === 0}
        <div class="view-tools">{@render viewToggle()}</div>
        <EmptyState message="No people yet." />
      {:else}
        <OrgTree roots={orgRoots} {groupsByPerson} onEdit={startEditPerson} tools={viewToggle} />
      {/if}
    </section>

    <section class="section">
      <div class="section-header"><h2>Departments <span class="count">{departments.length}</span></h2></div>
      {#if departments.length === 0}
        <EmptyState message="No departments yet." />
      {:else}
        <ul class="group-list">
          {#each departments as dept (dept.id)}
            <li class="card compact hover group-card">
              <a class="group-title truncate" href="/app/groups/{dept.id}">{dept.name}</a>
              <button type="button" class="btn icon sm edit" onclick={() => startEditDept(dept.id)} aria-label="Edit {dept.name}" title="Edit"><PencilIcon /></button>
              <span class="badge muted">{dept.members.length}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="section">
      <div class="section-header"><h2>Teams <span class="count">{teams.length}</span></h2></div>
      {#if teams.length === 0}
        <EmptyState message="No teams yet." />
      {:else}
        <ul class="group-list">
          {#each teams as team (team.id)}
            <li class="card compact hover group-card">
              <a class="group-title truncate" href="/app/groups/{team.id}">{team.name}</a>
              <button type="button" class="btn icon sm edit" onclick={() => startEditTeam(team.id)} aria-label="Edit {team.name}" title="Edit"><PencilIcon /></button>
              <span class="badge muted">{team.members.length}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<Popup id="edit-department" title={editDept ? 'Edit department' : 'Add department'}>
  <GroupForm initial={editDept ?? { kind: 'DEPARTMENT' }} kinds={data.kinds} onSuccess={finish} onCancel={cancel} onDelete={editDept ? deleteDept : undefined} />
  {#if editDept}
    <div class="members">
      <div class="section-header"><h4>Members <span class="count">{editDept.members.length}</span></h4></div>
      {#if editDept.members.length === 0}
        <EmptyState message="No members yet." />
      {:else}
        <ul class="list">
          {#each editDept.members as m (m.personId)}
            <li class="list-row">
              <span class="grow truncate">{m.personName}</span>
              <span class="row-actions"><ConfirmButton label="Remove member" variant="icon" onConfirm={() => removeDeptMember(editDept.id, m.personId)} /></span>
            </li>
          {/each}
        </ul>
      {/if}
      <InlinePicker label="Add member" options={availablePersonsForDept} placeholder="Select a person…" onPick={(id) => addDeptMember(editDept.id, id)} />
    </div>
  {/if}
</Popup>

<Popup id="edit-team" title={editTeam ? 'Edit team' : 'Add team'}>
  <GroupForm initial={editTeam ?? { kind: 'TEAM' }} kinds={data.kinds} onSuccess={finish} onCancel={cancel} onDelete={editTeam ? deleteTeam : undefined} />
  {#if editTeam}
    <div class="members">
      <div class="section-header"><h4>Members <span class="count">{editTeam.members.length}</span></h4></div>
      {#if editTeam.members.length === 0}
        <EmptyState message="No members yet." />
      {:else}
        <ul class="list">
          {#each editTeam.members as m (m.personId)}
            <li class="list-row">
              <span class="grow truncate">{m.personName}</span>
              <span class="row-actions"><ConfirmButton label="Remove member" variant="icon" onConfirm={() => removeTeamMember(editTeam.id, m.personId)} /></span>
            </li>
          {/each}
        </ul>
      {/if}
      <InlinePicker label="Add member" options={availablePersonsForTeam} placeholder="Select a person…" onPick={(id) => addTeamMember(editTeam.id, id)} />
    </div>
  {/if}
</Popup>

<Popup id="edit-person" title={editPerson ? 'Edit person' : 'Add person'}>
  {#key editPersonId}
    <PersonForm initial={editPerson ?? {}} personOptions={persons} onSuccess={finish} onCancel={cancel} onDelete={editPerson ? deletePerson : undefined} />
  {/key}
  {#if editPerson}
    <div class="members">
      <div class="section-header"><h4>Departments</h4></div>
      {#if personDeptMemberships.length === 0}
        <EmptyState message="Not in any department." />
      {:else}
        <ul class="list">
          {#each personDeptMemberships as d (d.id)}
            <li class="list-row">
              <span class="grow truncate">{d.name}</span>
              <span class="row-actions"><ConfirmButton label="Remove from department" variant="icon" onConfirm={() => removeDeptMember(d.id, editPerson.id)} /></span>
            </li>
          {/each}
        </ul>
      {/if}
      <InlinePicker label="Add to department" options={availableDeptsForPerson} placeholder="Select a department…" onPick={(id) => addDeptMember(id, editPerson.id)} />
    </div>
    <div class="members">
      <div class="section-header"><h4>Teams</h4></div>
      {#if personTeamMemberships.length === 0}
        <EmptyState message="Not on any team." />
      {:else}
        <ul class="list">
          {#each personTeamMemberships as t (t.id)}
            <li class="list-row">
              <span class="grow truncate">{t.name}</span>
              <span class="row-actions"><ConfirmButton label="Remove from team" variant="icon" onConfirm={() => removeTeamMember(t.id, editPerson.id)} /></span>
            </li>
          {/each}
        </ul>
      {/if}
      <InlinePicker label="Add to team" options={availableTeamsForPerson} placeholder="Select a team…" onPick={(id) => addTeamMember(id, editPerson.id)} />
    </div>
  {/if}
</Popup>

<style lang="scss">
  // Where the view toggle sits when there's no org chart tools row to hold it.
  .view-tools {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--sp-2);
  }
  .group-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--sp-2);
  }
  .group-card {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    .edit { opacity: 0; margin-left: auto; }
    &:hover .edit, &:focus-within .edit { opacity: 1; }
    .badge { flex-shrink: 0; }
  }
  .group-title { flex: 1; min-width: 0; font-weight: 500; color: var(--text); }
  .members {
    margin-top: var(--sp-5);
    padding-top: var(--sp-4);
    border-top: 1px solid var(--border);
    .list { margin-bottom: var(--sp-2); }
  }
</style>
