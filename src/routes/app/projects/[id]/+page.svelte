<script lang="ts">
  import type { PageData } from './$types';
  import { goto, invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import EntityDetailPage from '$lib/common/EntityDetailPage.svelte';
  import ProjectForm from '$lib/project/components/ProjectForm.svelte';
  import GoalRows from '$lib/goal/components/GoalRows.svelte';
  import InlinePicker from '$lib/ui/InlinePicker.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { submit, submitOrThrow } from '$lib/ui/submit';
  import StatusBadge from '$lib/project/components/StatusBadge.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from '$shared/utils/project-status';
  import { parseOwnerOptionValue } from '$shared/trpc/load-owner-options';
  import { ancestorsOf, wouldCreateCycle } from '$shared/utils/hierarchy';
  import type { GoalSummary } from '$shared/types/goals';
  import { model } from '$lib/stores/notebook-model';

  interface ProjectOption {
    readonly id: string;
    readonly name: string;
    readonly parentId: string | null;
    readonly archivedAt: Date | null;
  }

  const { data } = $props<{ data: PageData }>();
  const project = $derived(data.project);
  const docs = $derived(data.docs);
  const notes = $derived(data.notes);
  const todos = $derived(data.todos);
  const reports = $derived(data.reports);
  const relations = $derived(data.relations);
  const linkedGoals = $derived(data.linkedGoals as readonly GoalSummary[]);

  // Any project except this one and its sub-projects can be its parent.
  const allProjects = $derived(data.allProjects as readonly ProjectOption[]);
  const parentOptions = $derived.by(() => {
    const parents = new Map(allProjects.map((p): [string, string | null] => [p.id, p.parentId]));
    return allProjects.filter((p) => !p.archivedAt && !wouldCreateCycle((id) => parents.get(id), project.id, p.id));
  });

  // Every parent up to the top-level project, for the breadcrumb.
  const breadcrumbTrail = $derived(
    ancestorsOf(allProjects, project.id, (p) => p.parentId).map((p) => ({ label: p.name, href: `/app/projects/${p.id}` })),
  );

  const goalOptions = $derived(
    (data.allGoals as readonly GoalSummary[])
      .filter((g) => !linkedGoals.some((linked) => linked.id === g.id))
      .map((g) => ({ id: g.id, name: g.title })),
  );

  let newChildName = $state('');
  let creatingChild = $state(false);
  let childError = $state('');

  // ----- Status: a menu of the six -----
  const statusItems = $derived(
    PROJECT_STATUSES.map((status) => ({
      label: PROJECT_STATUS_LABELS[status],
      current: project.status === status,
      onSelect: () => handleStatusChange(status)
    }))
  );

  let statusError = $state('');

  const handleStatusChange = async (newStatus: string) => {
    const outcome = await submit(() => trpc().project.update.mutate({ id: project.id, status: newStatus }));
    statusError = outcome.ok ? '' : outcome.error;
    if (outcome.ok) await invalidateAll();
  };

  const handleSetParent = async (parentId: string | null) => {
    await submitOrThrow(() => trpc().project.update.mutate({ id: project.id, parentId }));
    await invalidateAll();
  };

  const handleSetOwner = async (value: string | null) => {
    const picked = value ? parseOwnerOptionValue(value) : null;
    await submitOrThrow(() => trpc().project.update.mutate({
      id: project.id,
      ownerType: picked?.ownerType ?? null,
      ownerId: picked?.ownerId ?? null,
    }));
    await invalidateAll();
  };

  const handleUnlinkChild = async (childId: string) => {
    await submitOrThrow(() => trpc().project.update.mutate({ id: childId, parentId: null }));
    await invalidateAll();
  };

  const handleLinkGoal = async (goalId: string) => {
    await submitOrThrow(() => trpc().goal.addProject.mutate({ goalId, projectId: project.id }));
    await invalidateAll();
  };

  const handleUnlinkGoal = async (goalId: string) => {
    await submitOrThrow(() => trpc().goal.removeProject.mutate({ goalId, projectId: project.id }));
    await invalidateAll();
  };

  const handleCreateChild = async () => {
    if (!newChildName.trim()) return;
    creatingChild = true;
    childError = '';
    const outcome = await submit(() => trpc().project.create.mutate({
      name: newChildName.trim(),
      status: 'committed',
      parentId: project.id,
    }));
    creatingChild = false;
    if (!outcome.ok) {
      childError = outcome.error;
      return;
    }
    newChildName = '';
    await goto(`/app/projects/${outcome.value.id}`);
  };

  const formatDate = (d: Date | string) => {
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleDateString('en-CA');
  };
</script>

<EntityDetailPage
  entityType="PROJECT"
  entityId={project.id}
  archivedAt={project.archivedAt}
  entityName={project.name}
  description={project.description}
  breadcrumbLabel="Projects"
  breadcrumbHref="/app/projects"
  {breadcrumbTrail}
  editPopupTitle="Edit project"
  {docs}
  {notes}
  {todos}
  {reports}
  {relations}
  links={data.links}
>
  {#snippet renderMeta()}
    <dl class="meta-list">
      <div>
        <dt>Status</dt>
        <dd>
          <Menu label="Change status" items={statusItems}>
            {#snippet trigger()}
              {#if project.status}<StatusBadge status={project.status} />{:else}<span class="muted">Set status</span>{/if}
            {/snippet}
          </Menu>
          {#if statusError}<span class="inline-error" role="alert">{statusError}</span>{/if}
        </dd>
      </div>
      <div>
        <dt>Owner</dt>
        <dd>
          {#if project.owner}
            <a href={project.owner.path}>{project.owner.label ?? 'Missing owner'}</a>
            <ConfirmButton label="Unassign" confirmLabel="Unassign owner" onConfirm={() => handleSetOwner(null)} />
          {:else}
            <InlinePicker label="Assign owner" options={data.ownerOptions} placeholder="Select an owner…" onPick={handleSetOwner} />
          {/if}
        </dd>
      </div>
      <div>
        <dt>Parent</dt>
        <dd>
          {#if project.parentName}
            <a href="/app/projects/{project.parentId}">{project.parentName}</a>
            <ConfirmButton label="Unlink" confirmLabel="Unlink parent" onConfirm={() => handleSetParent(null)} />
          {:else}
            <InlinePicker label="Assign parent" options={parentOptions} placeholder="Select a parent…" onPick={handleSetParent} />
          {/if}
        </dd>
      </div>
      {#if project.startDate || project.endDate}
        <div>
          <dt>Dates</dt>
          <dd>{project.startDate ? formatDate(project.startDate) : '?'} → {project.endDate ? formatDate(project.endDate) : 'ongoing'}</dd>
        </div>
      {/if}
    </dl>
  {/snippet}

  {#snippet renderOverview()}

    <!-- A home notebook has no goals. -->
    {#if $model.has('goals')}
    <section class="section">
      <div class="section-header">
        <h4>Goals <span class="count">{data.linkedGoals.length}</span></h4>
      </div>
      {#if data.linkedGoals.length > 0}
        <GoalRows goals={data.linkedGoals} showOwner removeLabel="Unlink goal" onRemove={handleUnlinkGoal} />
      {:else}
        <EmptyState message="Not linked to any goal." />
      {/if}
      <div class="section-footer">
        <InlinePicker label="Link goal" options={goalOptions} placeholder="Select a goal…" onPick={handleLinkGoal} />
      </div>
    </section>
    {/if}

    <section class="section">
      <div class="section-header">
        <h4>Sub-projects <span class="count">{project.children.length}</span></h4>
      </div>
      {#if project.children.length > 0}
        <ul class="list">
          {#each project.children as child (child.id)}
            <li class="list-row">
              <a class="grow truncate" href="/app/projects/{child.id}">{child.name}</a>
              <StatusBadge status={child.status} />
              <span class="row-actions">
                <ConfirmButton label="Unlink sub-project" variant="icon" onConfirm={() => handleUnlinkChild(child.id)} />
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState message="No sub-projects." />
      {/if}

      <form class="toolbar child-form" onsubmit={(e: SubmitEvent) => { e.preventDefault(); handleCreateChild(); }}>
        <input type="text" class="sm" bind:value={newChildName} placeholder="New sub-project name" aria-label="New sub-project name" />
        <button type="submit" class="btn sm" disabled={creatingChild || !newChildName.trim()} aria-busy={creatingChild}>Add</button>
      </form>
      {#if childError}<p class="form-error">{childError}</p>{/if}
    </section>
  {/snippet}

  {#snippet renderAssetHeader()}
    <span class="asset-h-name">{project.name}</span>
    <StatusBadge status={project.status} />
  {/snippet}

  {#snippet renderEditForm({ onSuccess, onCancel })}
    <ProjectForm initial={project} ownerOptions={data.ownerOptions} {onSuccess} {onCancel} />
  {/snippet}
</EntityDetailPage>

<style lang="scss">
  .child-form {
    margin-top: var(--sp-2);
    max-width: 360px;
    input { flex: 1; }
  }
  .section-footer { margin-top: var(--sp-2); }
</style>
