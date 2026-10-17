<script lang="ts">
  // A goal's summary in a side peek: status, owner, period, progress, the latest
  // check-ins, linked projects, sub-goals, open todos and docs. Read-only; Open
  // goes to the full page.
  import EntityRow from '$lib/ui/EntityRow.svelte';
  import { page } from '$app/state';
  import { trpc } from '$shared/trpc/client';
  import { errorMessage } from '$lib/ui/submit';
  import { openPopup } from '$lib/ui/popup-url';
  import SidePeek from '$lib/ui/SidePeek.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ProgressBar from '$lib/ui/ProgressBar.svelte';
  import MarkdownRenderer from '$lib/common/MarkdownRenderer.svelte';
  import GoalRows from '$lib/goal/components/GoalRows.svelte';
  import StatusBadge from '$lib/project/components/StatusBadge.svelte';
  import StatusDot from '$lib/todo/components/StatusDot.svelte';
  import PriorityBadge from '$lib/todo/components/PriorityBadge.svelte';
  import type { TodoStatus } from '$lib/todo/utils';
  import { GOAL_STATUS_LABELS, GOAL_TIME_FLAGS, formatGoalValue, goalStatusBadgeClass, goalTimeFlag, progressTone } from '$lib/goal/utils';
  import { localDay, periodSpan } from '$shared/utils/period';
  import { docPath } from '$shared/utils/entity';
  import type { GoalSummary } from '$shared/types/goals';

  interface Props {
    readonly id: string;
  }

  const { id }: Props = $props();

  /** Check-ins shown; the goal's page has them all. */
  const CHECK_INS = 3;

  type Client = ReturnType<typeof trpc>;
  type Goal = Extract<Awaited<ReturnType<Client['goal']['get']['query']>>, { ok: true }>['value'];
  type Doc = Extract<Awaited<ReturnType<Client['doc']['list']['query']>>, { ok: true }>['value'][number];

  interface Todo {
    readonly id: string;
    readonly title: string;
    readonly status: TodoStatus;
    readonly priority: number;
  }

  interface Peeked {
    readonly goal: Goal;
    readonly todos: readonly Todo[];
    readonly docs: readonly Doc[];
  }

  let loaded = $state.raw<{ readonly id: string; readonly value: Peeked } | null>(null);
  let failed = $state.raw<{ readonly id: string; readonly message: string } | null>(null);

  const load = async (goalId: string): Promise<Peeked | string> => {
    const client = trpc();
    const input = { entityType: 'GOAL' as const, entityId: goalId };
    const [goal, todos, docs] = await Promise.all([
      client.goal.get.query({ id: goalId }),
      client.todo.forEntity.query(input),
      client.doc.list.query(input)
    ]);
    if (!goal.ok) return goal.error.message;
    return {
      goal: goal.value,
      todos: (todos as readonly Todo[]).filter((t) => t.status !== 'COMPLETE' && t.status !== 'CANCELLED'),
      docs: docs.ok ? docs.value : []
    };
  };

  // Reload when the peeked goal changes, and when a popup closes (a todo edited from here).
  const popupOpen = $derived(page.url.searchParams.has('popup'));
  $effect(() => {
    const goalId = id;
    if (popupOpen) return;
    let stale = false;
    load(goalId).then(
      (result) => {
        if (stale) return;
        if (typeof result === 'string') failed = { id: goalId, message: result };
        else { loaded = { id: goalId, value: result }; failed = null; }
      },
      (e: unknown) => { if (!stale) failed = { id: goalId, message: errorMessage(e) }; }
    );
    return () => { stale = true; };
  });

  const peeked = $derived(loaded?.id === id ? loaded.value : null);
  const error = $derived(failed?.id === id ? failed.message : null);
  const goal = $derived(peeked?.goal ?? null);
  const timeFlag = $derived(goal ? goalTimeFlag(goal, localDay()) : null);

  const formatDate = (d: Date | string) => (typeof d === 'string' ? new Date(d) : d).toLocaleDateString('en-CA');
</script>

<SidePeek title={goal?.title ?? (error ? 'Goal' : 'Loading…')} href="/app/goals/{id}">
  {#if error}
    <EmptyState message={error} />
  {:else if peeked && goal}
    <dl class="meta-list">
      <div>
        <dt>Status</dt>
        <dd class="badges">
          <span class={goalStatusBadgeClass(goal.status)}>{GOAL_STATUS_LABELS[goal.status]}</span>
          {#if timeFlag}<span class={GOAL_TIME_FLAGS[timeFlag].badge}>{GOAL_TIME_FLAGS[timeFlag].label}</span>{/if}
        </dd>
      </div>
      {#if goal.archivedAt}
        <div><dt>Archived</dt><dd>{formatDate(goal.archivedAt)}</dd></div>
      {/if}
      <div>
        <dt>Owner</dt>
        <dd>{#if goal.owner}<a href={goal.owner.path}>{goal.owner.label ?? 'Missing owner'}</a>{:else}<span class="muted">Organisation</span>{/if}</dd>
      </div>
      {#if goal.period}
        <div><dt>Period</dt><dd>{periodSpan(goal.period) ?? goal.period}</dd></div>
      {/if}
      {#if goal.parent}
        <div><dt>Parent</dt><dd><a href="/app/goals/{goal.parent.id}">{goal.parent.title}</a></dd></div>
      {/if}
    </dl>

    {#if goal.target !== null}
      <div class="progress">
        <ProgressBar
          value={goal.progress}
          tone={progressTone(goal.status)}
          label="{formatGoalValue(goal.current, goal.unit)} / {formatGoalValue(goal.target, goal.unit)}"
        />
      </div>
    {/if}

    {#if goal.description?.trim()}
      {#key goal.id}
        <div class="card compact description"><MarkdownRenderer content={goal.description} /></div>
      {/key}
    {/if}

    <section class="section">
      <div class="section-header"><h4>Latest check-ins <span class="count">{goal.checkIns.length}</span></h4></div>
      {#if goal.checkIns.length > 0}
        <ul class="list">
          {#each goal.checkIns.slice(0, CHECK_INS) as checkIn (checkIn.id)}
            <li class="list-row check-in">
              <span class="check-in-line">
                <span class="text-2">{formatDate(checkIn.date)}</span>
                {#if checkIn.value !== null}<span>{formatGoalValue(checkIn.value, goal.unit)}</span>{/if}
                {#if checkIn.status}<span class={goalStatusBadgeClass(checkIn.status)}>{GOAL_STATUS_LABELS[checkIn.status]}</span>{/if}
              </span>
              {#if checkIn.comment}<span class="text-sm text-2 pre-line">{checkIn.comment}</span>{/if}
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState message="No check-ins yet." />
      {/if}
    </section>

    <section class="section">
      <div class="section-header"><h4>Projects <span class="count">{goal.projects.length}</span></h4></div>
      {#if goal.projects.length > 0}
        <ul class="list">
          {#each goal.projects as project (project.id)}
            <EntityRow href={project.path} label={project.name}>
              <StatusBadge status={project.status} />
            </EntityRow>
          {/each}
        </ul>
      {:else}
        <EmptyState message="No projects deliver this goal." />
      {/if}
    </section>

    {#if goal.children.length > 0}
      <section class="section">
        <div class="section-header"><h4>Sub-goals <span class="count">{goal.children.length}</span></h4></div>
        <!-- Dates arrive as strings over the wire; GoalRows reads none of them. -->
        <GoalRows goals={goal.children as unknown as readonly GoalSummary[]} />
      </section>
    {/if}

    <section class="section">
      <div class="section-header"><h4>Open todos <span class="count">{peeked.todos.length}</span></h4></div>
      {#if peeked.todos.length > 0}
        <ul class="list">
          {#each peeked.todos as todo (todo.id)}
            <li class="list-row">
              <StatusDot status={todo.status} />
              <button type="button" class="btn link grow truncate todo-title" onclick={() => openPopup('todo', { todo: todo.id })}>{todo.title}</button>
              <PriorityBadge priority={todo.priority} />
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState message="No open todos." />
      {/if}
    </section>

    <section class="section">
      <div class="section-header"><h4>Docs <span class="count">{peeked.docs.length}</span></h4></div>
      {#if peeked.docs.length > 0}
        <ul class="list">
          {#each peeked.docs as doc (doc.id)}
            <EntityRow href={docPath('GOAL', goal.id, doc.id)} label={doc.title} />
          {/each}
        </ul>
      {:else}
        <EmptyState message="No docs." />
      {/if}
    </section>
  {:else}
    <EmptyState message="Loading…" />
  {/if}
</SidePeek>

<style lang="scss">
  .badges { display: inline-flex; flex-wrap: wrap; gap: var(--sp-1); }
  .progress { margin-top: var(--sp-3); }
  .description { margin-top: var(--sp-3); color: var(--text-2); }
  .check-in { flex-direction: column; align-items: stretch; gap: var(--sp-1); height: auto; padding-block: var(--sp-2); }
  .check-in-line { display: flex; align-items: center; gap: var(--sp-2); }
  .todo-title { justify-content: flex-start; text-align: left; }
</style>
