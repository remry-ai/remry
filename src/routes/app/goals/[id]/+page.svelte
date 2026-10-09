<script lang="ts">
  import type { PageData } from './$types';
  import { goto, invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import EntityDetailPage from '$lib/common/EntityDetailPage.svelte';
  import GoalForm from '$lib/goal/components/GoalForm.svelte';
  import GoalRows from '$lib/goal/components/GoalRows.svelte';
  import ProgressLineChart from '$lib/goal/components/ProgressLineChart.svelte';
  import InlinePicker from '$lib/ui/InlinePicker.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ProgressBar from '$lib/ui/ProgressBar.svelte';
  import { submit, submitOrThrow } from '$lib/ui/submit';
  import { GOAL_STATUSES, type GoalStatus } from '$shared/types/enums';
  import { parseOwnerOptionValue } from '$shared/trpc/load-owner-options';
  import { ancestorsOf, wouldCreateCycle } from '$shared/utils/hierarchy';
  import StatusBadge from '$lib/project/components/StatusBadge.svelte';
  import { GOAL_STATUS_LABELS, GOAL_TIME_FLAGS, formatGoalValue, goalStatusBadgeClass, goalTimeFlag, progressTone } from '$lib/goal/utils';
  import { localDay, periodElapsed, periodPhase, periodSpan } from '$shared/utils/period';
  import type { GoalDetail, GoalSummary } from '$shared/types/goals';

  interface ProjectOption {
    readonly id: string;
    readonly name: string;
  }

  const { data } = $props<{ data: PageData }>();
  const goal = $derived(data.goal as GoalDetail);
  const docs = $derived(data.docs);
  const notes = $derived(data.notes);
  const todos = $derived(data.todos);
  const reports = $derived(data.reports);
  const relations = $derived(data.relations);
  const allGoals = $derived(data.allGoals as readonly GoalSummary[]);

  // Any goal except this one and its sub-goals can be its parent.
  const parentOptions = $derived.by(() => {
    const parents = new Map(allGoals.map((g): [string, string | null] => [g.id, g.parentId]));
    return allGoals
      .filter((g) => !g.archivedAt)
      .filter((g) => !wouldCreateCycle((id) => parents.get(id), goal.id, g.id))
      .map((g) => ({ id: g.id, name: g.title }));
  });

  // Every parent up to the top-level goal, for the breadcrumb.
  const breadcrumbTrail = $derived(
    ancestorsOf(allGoals, goal.id, (g) => g.parentId).map((g) => ({ label: g.title, href: g.path })),
  );

  const projectOptions = $derived(
    (data.allProjects as readonly ProjectOption[])
      .filter((p) => !goal.projects.some((linked) => linked.id === p.id))
      .map((p) => ({ id: p.id, name: p.name })),
  );

  const statusOptions = $derived(
    GOAL_STATUSES.filter((s) => s !== goal.status).map((s) => ({ id: s, name: GOAL_STATUS_LABELS[s] })),
  );

  const day = (d: Date | string): string => new Date(d).toISOString().slice(0, 10);

  // ----- Period -----
  const today = localDay();
  const span = $derived(goal.period ? periodSpan(goal.period) : null);
  const elapsed = $derived(goal.period ? periodElapsed(goal.period, today) : null);
  const timeFlag = $derived(goalTimeFlag(goal, today));
  const timeLabel = $derived.by(() => {
    if (!goal.period || elapsed === null) return '';
    const phase = periodPhase(goal.period, today);
    if (phase === 'future') return `${span} hasn't started`;
    if (phase === 'past') return `${span} is over`;
    return `${Math.round(elapsed * 100)}% of ${span} gone`;
  });

  const update = async (changes: Record<string, unknown>) => {
    await submitOrThrow(() => trpc().goal.update.mutate({ id: goal.id, ...changes }));
    await invalidateAll();
  };

  const handleSetStatus = (status: string) => update({ status: status as GoalStatus });
  const handleSetParent = (parentId: string | null) => update({ parentId });
  const handleSetOwner = (value: string | null) => {
    const picked = value ? parseOwnerOptionValue(value) : null;
    return update({ ownerType: picked?.ownerType ?? null, ownerId: picked?.ownerId ?? null });
  };

  const handleUnlinkChild = async (childId: string) => {
    await submitOrThrow(() => trpc().goal.update.mutate({ id: childId, parentId: null }));
    await invalidateAll();
  };

  const handleLinkProject = async (projectId: string) => {
    await submitOrThrow(() => trpc().goal.addProject.mutate({ goalId: goal.id, projectId }));
    await invalidateAll();
  };

  const handleUnlinkProject = async (projectId: string) => {
    await submitOrThrow(() => trpc().goal.removeProject.mutate({ goalId: goal.id, projectId }));
    await invalidateAll();
  };

  const handleRemoveCheckIn = async (id: string) => {
    await submitOrThrow(() => trpc().goal.removeCheckIn.mutate({ id }));
    await invalidateAll();
  };

  const handleDelete = async () => {
    await submitOrThrow(() => trpc().goal.delete.mutate({ id: goal.id }));
    await goto('/app/goals');
  };

  // ----- Check-in -----
  let checkInDate = $state(new Date().toLocaleDateString('en-CA'));
  let checkInValue = $state<number | undefined>(undefined);
  let checkInStatus = $state<GoalStatus | ''>('');
  let checkInComment = $state('');
  let checkingIn = $state(false);
  let checkInError = $state('');

  const canCheckIn = $derived(checkInValue != null || checkInStatus !== '' || checkInComment.trim() !== '');

  const handleCheckIn = async () => {
    checkingIn = true;
    checkInError = '';
    const outcome = await submit(() => trpc().goal.checkIn.mutate({
      goalId: goal.id,
      date: new Date(checkInDate),
      value: checkInValue ?? undefined,
      status: checkInStatus || undefined,
      comment: checkInComment.trim() || undefined,
    }));
    checkingIn = false;
    if (!outcome.ok) {
      checkInError = outcome.error;
      return;
    }
    checkInValue = undefined;
    checkInStatus = '';
    checkInComment = '';
    await invalidateAll();
  };

  // ----- Sub-goal -----
  let newChildTitle = $state('');
  let creatingChild = $state(false);
  let childError = $state('');

  const handleCreateChild = async () => {
    if (!newChildTitle.trim()) return;
    creatingChild = true;
    childError = '';
    const outcome = await submit(() => trpc().goal.create.mutate({
      title: newChildTitle.trim(),
      parentId: goal.id,
      period: goal.period ?? undefined,
    }));
    creatingChild = false;
    if (!outcome.ok) {
      childError = outcome.error;
      return;
    }
    newChildTitle = '';
    await goto(outcome.value.path);
  };
</script>

<EntityDetailPage
  entityType="GOAL"
  entityId={goal.id}
  archivedAt={goal.archivedAt}
  entityName={goal.title}
  description={goal.description}
  breadcrumbLabel="Goals"
  breadcrumbHref="/app/goals"
  {breadcrumbTrail}
  editPopupTitle="Edit goal"
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
        <dt>Owner</dt>
        <dd>
          {#if goal.owner}
            <a href={goal.owner.path}>{goal.owner.label ?? 'Missing owner'}</a>
            <ConfirmButton label="Unassign" confirmLabel="Unassign owner" onConfirm={() => handleSetOwner(null)} />
          {:else}
            <span class="muted">Whole organisation</span>
            <InlinePicker label="Assign owner" options={data.ownerOptions} placeholder="Select an owner…" onPick={handleSetOwner} />
          {/if}
        </dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>
          <span class={goalStatusBadgeClass(goal.status)}>{GOAL_STATUS_LABELS[goal.status]}</span>
          <InlinePicker label="Change" options={statusOptions} placeholder="Select a status…" onPick={handleSetStatus} />
        </dd>
      </div>
      {#if goal.period}
        <div>
          <dt>Period</dt>
          <dd>
            {goal.period}{#if span}<span class="muted">{span}</span>{/if}
            {#if timeFlag}<span class={GOAL_TIME_FLAGS[timeFlag].badge}>{GOAL_TIME_FLAGS[timeFlag].label}</span>{/if}
          </dd>
        </div>
      {/if}
      <div>
        <dt>Parent</dt>
        <dd>
          {#if goal.parent}
            <a href="/app/goals/{goal.parent.id}">{goal.parent.title}</a>
            <ConfirmButton label="Unlink" confirmLabel="Unlink parent" onConfirm={() => handleSetParent(null)} />
          {:else}
            <InlinePicker label="Assign parent" options={parentOptions} placeholder="Select a parent goal…" onPick={handleSetParent} />
          {/if}
        </dd>
      </div>
    </dl>
  {/snippet}

  {#snippet renderOverview({ openEdit })}

    <section class="section">
      <div class="section-header">
        <h4>Progress</h4>
      </div>
      {#if goal.target !== null}
        <ProgressBar
          value={goal.progress}
          tone={progressTone(goal.status)}
          label="{formatGoalValue(goal.current, goal.unit)} of {formatGoalValue(goal.target, goal.unit)}, from {formatGoalValue(goal.baseline ?? 0, goal.unit)}"
        />
        {#if elapsed !== null}<ProgressBar value={elapsed} tone="muted" label={timeLabel} />{/if}
        <ProgressLineChart checkIns={goal.checkIns} baseline={goal.baseline} target={goal.target} unit={goal.unit} period={goal.period} />
      {:else}
        {#if elapsed !== null}<ProgressBar value={elapsed} tone="muted" label={timeLabel} />{/if}
        <EmptyState message="Not measured yet. Give the goal a target to track progress.">
          <button type="button" class="btn sm" onclick={openEdit}>Set a target</button>
        </EmptyState>
      {/if}
    </section>

    <section class="section">
      <div class="section-header">
        <h4>Check-ins <span class="count">{goal.checkIns.length}</span></h4>
      </div>
      {#if goal.checkIns.length > 0}
        <ul class="list">
          {#each goal.checkIns as checkIn (checkIn.id)}
            <li class="list-row">
              <span class="meta mono">{day(checkIn.date)}</span>
              {#if checkIn.value !== null}<strong>{formatGoalValue(checkIn.value, goal.unit)}</strong>{/if}
              {#if checkIn.status}<span class={goalStatusBadgeClass(checkIn.status)}>{GOAL_STATUS_LABELS[checkIn.status]}</span>{/if}
              <span class="grow truncate text-2">{checkIn.comment ?? ''}</span>
              <span class="row-actions">
                <ConfirmButton label="Remove check-in" variant="icon" onConfirm={() => handleRemoveCheckIn(checkIn.id)} />
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState message="No check-ins yet." />
      {/if}

      <form class="toolbar check-in-form" onsubmit={(e: SubmitEvent) => { e.preventDefault(); handleCheckIn(); }}>
        <input type="date" class="sm" bind:value={checkInDate} aria-label="Check-in date" />
        <input type="number" step="any" class="sm value" bind:value={checkInValue} placeholder={goal.unit ?? 'Value'} aria-label="Value" />
        <select class="sm" bind:value={checkInStatus} aria-label="Status">
          <option value="">Status unchanged</option>
          {#each GOAL_STATUSES as status (status)}
            <option value={status}>{GOAL_STATUS_LABELS[status]}</option>
          {/each}
        </select>
        <input type="text" class="sm comment" bind:value={checkInComment} placeholder="Comment" aria-label="Comment" />
        <button type="submit" class="btn sm" disabled={checkingIn || !canCheckIn} aria-busy={checkingIn}>Check in</button>
      </form>
      {#if checkInError}<p class="form-error">{checkInError}</p>{/if}
    </section>

    <section class="section">
      <div class="section-header">
        <h4>Sub-goals <span class="count">{goal.children.length}</span></h4>
      </div>
      {#if goal.children.length > 0}
        <GoalRows goals={goal.children} showOwner removeLabel="Unlink sub-goal" onRemove={handleUnlinkChild} />
      {:else}
        <EmptyState message="No sub-goals." />
      {/if}

      <form class="toolbar child-form" onsubmit={(e: SubmitEvent) => { e.preventDefault(); handleCreateChild(); }}>
        <input type="text" class="sm" bind:value={newChildTitle} placeholder="New sub-goal title" aria-label="New sub-goal title" />
        <button type="submit" class="btn sm" disabled={creatingChild || !newChildTitle.trim()} aria-busy={creatingChild}>Add</button>
      </form>
      {#if childError}<p class="form-error">{childError}</p>{/if}
    </section>

    <section class="section">
      <div class="section-header">
        <h4>Projects <span class="count">{goal.projects.length}</span></h4>
      </div>
      {#if goal.projects.length > 0}
        <ul class="list">
          {#each goal.projects as project (project.id)}
            <li class="list-row">
              <a class="grow truncate" href={project.path}>{project.name}</a>
              <StatusBadge status={project.status} />
              <span class="row-actions">
                <ConfirmButton label="Unlink project" variant="icon" onConfirm={() => handleUnlinkProject(project.id)} />
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState message="No projects linked." />
      {/if}
      <div class="section-footer">
        <InlinePicker label="Link project" options={projectOptions} placeholder="Select a project…" onPick={handleLinkProject} />
      </div>
    </section>
  {/snippet}

  {#snippet renderAssetHeader()}
    <span class="asset-h-name">{goal.title}</span>
    <span class={goalStatusBadgeClass(goal.status)}>{GOAL_STATUS_LABELS[goal.status]}</span>
    {#if goal.period}<span class="asset-h-meta">{goal.period}</span>{/if}
  {/snippet}

  {#snippet renderEditForm({ onSuccess, onCancel })}
    <GoalForm initial={goal} ownerOptions={data.ownerOptions} {onSuccess} {onCancel} onDelete={handleDelete} />
  {/snippet}
</EntityDetailPage>

<style lang="scss">
  .check-in-form {
    margin-top: var(--sp-2);
    input, select { width: auto; }
    .value { width: 100px; }
    .comment { flex: 1; min-width: 160px; }
  }
  .child-form {
    margin-top: var(--sp-2);
    max-width: 360px;
    input { flex: 1; }
  }
  .section-footer { margin-top: var(--sp-2); }
</style>
