<script lang="ts">
  import type { PageData } from './$types';
  import Popup from '$lib/common/Popup.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ArchiveFilter from '$lib/ui/ArchiveFilter.svelte';
  import ProgressBar from '$lib/ui/ProgressBar.svelte';
  import GoalForm from '$lib/goal/components/GoalForm.svelte';
  import { openPopup, closePopup } from '$lib/ui/popup-url';
  import { GOAL_STATUSES, type GoalStatus, type OwnerType } from '$shared/types/enums';
  import { buildTree, flattenTree } from '$shared/utils/hierarchy';
  import { GOAL_STATUS_LABELS, GOAL_TIME_FLAGS, formatGoalValue, goalStatusBadgeClass, goalTimeFlag, progressTone } from '$lib/goal/utils';
  import { localDay, periodPhase, type PeriodPhase } from '$shared/utils/period';
  import type { GoalSummary } from '$shared/types/goals';

  const { data } = $props<{ data: PageData }>();
  const goals = $derived(data.goals as readonly GoalSummary[]);

  const today = localDay();

  // Period filter: a phase (current, past, upcoming), goals with no period, all,
  // or one period. It opens on the current periods when any goal has one.
  const PHASE_FILTERS: Readonly<Record<string, PeriodPhase>> = { CURRENT: 'current', PAST: 'past', UPCOMING: 'future' };
  let periodChoice = $state<string | null>(null);
  const hasCurrent = $derived(goals.some((g) => g.period && periodPhase(g.period, today) === 'current'));
  const periodFilter = $derived(periodChoice ?? (hasCurrent ? 'CURRENT' : 'ALL'));

  const matchesPeriod = (g: GoalSummary): boolean => {
    if (periodFilter === 'ALL') return true;
    if (periodFilter === 'NONE') return !g.period;
    const phase = PHASE_FILTERS[periodFilter];
    if (phase) return !!g.period && periodPhase(g.period, today) === phase;
    return g.period === periodFilter;
  };
  let statusFilter = $state<GoalStatus | 'ALL'>('ALL');
  let ownerTypeFilter = $state<OwnerType | 'ALL'>('ALL');
  let ownerFilter = $state('ALL');

  // Owners of the chosen type that have goals, so the list stays short.
  const owners = $derived(
    [...new Map(
      goals.flatMap((g) => (g.owner?.type === ownerTypeFilter ? [[g.owner.id, g.owner.label ?? '—'] as const] : [])),
    ).entries()].sort(([, a], [, b]) => a.localeCompare(b)),
  );

  const matchesOwner = (g: GoalSummary): boolean =>
    ownerTypeFilter === 'ALL'
    || (g.owner?.type === ownerTypeFilter && (ownerFilter === 'ALL' || g.owner.id === ownerFilter));

  const periods = $derived(
    [...new Set(goals.map((g) => g.period).filter((p): p is string => !!p))].sort().reverse(),
  );

  // Sub-goals whose parent is filtered out show at the top level.
  const rows = $derived(
    flattenTree(
      buildTree(
        goals.filter((g) =>
          matchesPeriod(g) && (statusFilter === 'ALL' || g.status === statusFilter) && matchesOwner(g),
        ),
        (g) => g.parentId,
      ),
    ),
  );

  const handleCreated = () => closePopup({ invalidate: true });
</script>

<svelte:head><title>Goals</title></svelte:head>

<div class="page">
  <PageHeader title="Goals" description="What each department, team and person is aiming for, and how it's going.">
    <button type="button" class="btn primary" onclick={() => openPopup('new-goal')}>Add goal</button>
  </PageHeader>

  <div class="toolbar filters">
    <ArchiveFilter />
    {#if data.goals.length > 0}
      <select class="sm" value={periodFilter} onchange={(e) => (periodChoice = e.currentTarget.value)} aria-label="Filter by period">
        <option value="CURRENT">Current periods</option>
        <option value="PAST">Past periods</option>
        <option value="UPCOMING">Upcoming periods</option>
        <option value="NONE">No period</option>
        <option value="ALL">All periods</option>
        {#if periods.length > 0}
          <optgroup label="Period">
            {#each periods as period (period)}
              <option value={period}>{period}</option>
            {/each}
          </optgroup>
        {/if}
      </select>
      <select class="sm" bind:value={statusFilter} aria-label="Filter by status">
        <option value="ALL">All statuses</option>
        {#each GOAL_STATUSES as status (status)}
          <option value={status}>{GOAL_STATUS_LABELS[status]}</option>
        {/each}
      </select>
      <select class="sm" bind:value={ownerTypeFilter} onchange={() => (ownerFilter = 'ALL')} aria-label="Filter by owner type">
        <option value="ALL">All owners</option>
        <option value="PERSON">Individuals</option>
        <option value="GROUP">Groups</option>
      </select>
      {#if ownerTypeFilter !== 'ALL'}
        <select class="sm" bind:value={ownerFilter} aria-label="Filter by owner">
          <option value="ALL">Any {ownerTypeFilter === 'PERSON' ? 'person' : ownerTypeFilter.toLowerCase()}</option>
          {#each owners as [id, label] (id)}
            <option value={id}>{label}</option>
          {/each}
        </select>
      {/if}
    {/if}
  </div>

  {#if data.goals.length > 0}
    {#if rows.length > 0}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Goal</th>
              <th>Owner</th>
              <th>Period</th>
              <th>Status</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as { item: goal, depth } (goal.id)}
              {@const timeFlag = goalTimeFlag(goal, today)}
              <tr>
                <td>
                  <span class="goal-name" style="--depth: {depth}">
                    {#if depth > 0}<span class="tree-indent">└</span>{/if}
                    <a href={goal.path}>{goal.title}</a>{#if goal.archivedAt} <span class="badge muted">Archived</span>{/if}
                  </span>
                </td>
                <td class="text-2">
                  {#if goal.owner}<a href={goal.owner.path}>{goal.owner.label ?? '—'}</a>{:else}Organisation{/if}
                </td>
                <td class="text-2">{goal.period ?? ''}</td>
                <td>
                  <span class="status-cell">
                    <span class={goalStatusBadgeClass(goal.status)}>{GOAL_STATUS_LABELS[goal.status]}</span>
                    {#if timeFlag}<span class={GOAL_TIME_FLAGS[timeFlag].badge}>{GOAL_TIME_FLAGS[timeFlag].label}</span>{/if}
                  </span>
                </td>
                <td class="progress-cell">
                  {#if goal.target !== null}
                    <ProgressBar
                      value={goal.progress}
                      tone={progressTone(goal.status)}
                      label="{formatGoalValue(goal.current, goal.unit)} / {formatGoalValue(goal.target, goal.unit)}"
                    />
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <EmptyState message="No goals match these filters." />
    {/if}
  {:else}
    <EmptyState message="No goals yet." boxed>
      <button type="button" class="btn sm" onclick={() => openPopup('new-goal')}>Add goal</button>
    </EmptyState>
  {/if}
</div>

<Popup id="new-goal" title="Add goal">
  <GoalForm ownerOptions={data.ownerOptions} onSuccess={handleCreated} onCancel={() => closePopup()} />
</Popup>

<style lang="scss">
  .goal-name {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    padding-left: calc(var(--depth) * var(--sp-5));
  }
  .tree-indent {
    color: var(--border-strong);
    font-size: var(--fs-sm);
  }
  .status-cell {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--sp-1);
  }
  .progress-cell { min-width: 180px; }
</style>
