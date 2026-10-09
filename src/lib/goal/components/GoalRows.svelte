<script lang="ts">
  // Goals as list rows: title, period, status and progress, with an optional
  // per-row remove action.
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import ProgressBar from '$lib/ui/ProgressBar.svelte';
  import type { GoalSummary } from '$shared/types/goals';
  import { GOAL_STATUS_LABELS, GOAL_TIME_FLAGS, goalStatusBadgeClass, goalTimeFlag, progressTone } from '$lib/goal/utils';
  import { localDay } from '$shared/utils/period';

  interface Props {
    readonly goals: readonly GoalSummary[];
    readonly showOwner?: boolean;
    readonly removeLabel?: string;
    readonly onRemove?: (id: string) => Promise<void>;
  }

  const { goals, showOwner = false, removeLabel = 'Remove', onRemove }: Props = $props();
  const today = localDay();
</script>

<ul class="list">
  {#each goals as goal (goal.id)}
    {@const flag = goalTimeFlag(goal, today)}
    <li class="list-row">
      <a class="grow truncate" href={goal.path}>{goal.title}</a>
      {#if showOwner && goal.owner?.label}<span class="meta">{goal.owner.label}</span>{/if}
      {#if goal.period}<span class="meta">{goal.period}</span>{/if}
      <span class={goalStatusBadgeClass(goal.status)}>{GOAL_STATUS_LABELS[goal.status]}</span>
      {#if flag}<span class={GOAL_TIME_FLAGS[flag].badge}>{GOAL_TIME_FLAGS[flag].label}</span>{/if}
      {#if goal.target !== null}
        <span class="progress">
          <ProgressBar value={goal.progress} tone={progressTone(goal.status)} label="{Math.round((goal.progress ?? 0) * 100)}%" />
        </span>
      {/if}
      {#if onRemove}
        <span class="row-actions">
          <ConfirmButton label={removeLabel} variant="icon" onConfirm={() => onRemove(goal.id)} />
        </span>
      {/if}
    </li>
  {/each}
</ul>

<style lang="scss">
  .progress {
    flex-shrink: 0;
    width: 120px;
  }
</style>
