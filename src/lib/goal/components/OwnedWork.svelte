<script lang="ts">
  // "Goals" and "Projects owned" sections for a person, team or department overview.
  import EntityRow from '$lib/ui/EntityRow.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import GoalRows from './GoalRows.svelte';
  import type { GoalSummary } from '$shared/types/goals';
  import StatusBadge from '$lib/project/components/StatusBadge.svelte';
  import { model } from '$lib/stores/notebook-model';
  import { isGoalDone } from '$lib/goal/utils';
  import { isProjectDone } from '$shared/utils/project-status';

  interface OwnedProject {
    readonly id: string;
    readonly name: string;
    readonly status: string | null;
    readonly path: string;
  }

  interface Props {
    readonly goals: readonly GoalSummary[];
    readonly projects: readonly OwnedProject[];
  }

  const { goals, projects }: Props = $props();

  // Done work stays out of the counts and lists, under a closed "Done" line.
  const activeGoals = $derived(goals.filter((g) => !isGoalDone(g.status)));
  const doneGoals = $derived(goals.filter((g) => isGoalDone(g.status)));
  const activeProjects = $derived(projects.filter((p) => !isProjectDone(p.status)));
  const doneProjects = $derived(projects.filter((p) => isProjectDone(p.status)));
</script>

{#snippet projectRows(rows: readonly OwnedProject[])}
  <ul class="list">
    {#each rows as project (project.id)}
      <EntityRow href={project.path} label={project.name}>
        <StatusBadge status={project.status} />
      </EntityRow>
    {/each}
  </ul>
{/snippet}

<!-- A home notebook has no goals. -->
{#if $model.has('goals')}
<section class="section">
  <div class="section-header">
    <h4>Goals <span class="count">{activeGoals.length}</span></h4>
  </div>
  {#if activeGoals.length > 0}
    <GoalRows goals={activeGoals} />
  {:else}
    <EmptyState message={doneGoals.length > 0 ? 'No active goals.' : 'No goals owned.'} />
  {/if}
  {#if doneGoals.length > 0}
    <details class="done">
      <summary>Done ({doneGoals.length})</summary>
      <GoalRows goals={doneGoals} />
    </details>
  {/if}
</section>
{/if}

<section class="section">
  <div class="section-header">
    <h4>Projects owned <span class="count">{activeProjects.length}</span></h4>
  </div>
  {#if activeProjects.length > 0}
    {@render projectRows(activeProjects)}
  {:else}
    <EmptyState message={doneProjects.length > 0 ? 'No active projects.' : 'No projects owned.'} />
  {/if}
  {#if doneProjects.length > 0}
    <details class="done">
      <summary>Done ({doneProjects.length})</summary>
      {@render projectRows(doneProjects)}
    </details>
  {/if}
</section>

<style lang="scss">
  .done { margin-top: var(--sp-2); }
</style>
