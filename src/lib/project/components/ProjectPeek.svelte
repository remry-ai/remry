<script lang="ts">
  // A project's summary in a side peek: its metadata, description, goals,
  // sub-projects, open todos and docs. Read-only; Open goes to the full page.
  import { page } from '$app/state';
  import { trpc } from '$shared/trpc/client';
  import { errorMessage } from '$lib/ui/submit';
  import { openPopup } from '$lib/ui/popup-url';
  import SidePeek from '$lib/ui/SidePeek.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import MarkdownRenderer from '$lib/common/MarkdownRenderer.svelte';
  import GoalRows from '$lib/goal/components/GoalRows.svelte';
  import StatusDot from '$lib/todo/components/StatusDot.svelte';
  import PriorityBadge from '$lib/todo/components/PriorityBadge.svelte';
  import type { TodoStatus } from '$lib/todo/utils';
  import StatusBadge from '$lib/project/components/StatusBadge.svelte';
  import { docPath } from '$shared/utils/entity';
  import type { GoalSummary } from '$shared/types/goals';
  import { model } from '$lib/stores/notebook-model';

  interface Props {
    readonly id: string;
  }

  const { id }: Props = $props();

  type Client = ReturnType<typeof trpc>;
  type Project = Extract<Awaited<ReturnType<Client['project']['get']['query']>>, { ok: true }>['value'];
  type Doc = Extract<Awaited<ReturnType<Client['doc']['list']['query']>>, { ok: true }>['value'][number];

  interface Todo {
    readonly id: string;
    readonly title: string;
    readonly status: TodoStatus;
    readonly priority: number;
  }

  interface Peeked {
    readonly project: Project;
    readonly goals: readonly GoalSummary[];
    readonly todos: readonly Todo[];
    readonly docs: readonly Doc[];
  }

  let loaded = $state.raw<{ readonly id: string; readonly value: Peeked } | null>(null);
  let failed = $state.raw<{ readonly id: string; readonly message: string } | null>(null);

  const load = async (projectId: string, withGoals: boolean): Promise<Peeked | string> => {
    const client = trpc();
    const input = { entityType: 'PROJECT' as const, entityId: projectId };
    const [project, goals, todos, docs] = await Promise.all([
      client.project.get.query({ id: projectId }),
      withGoals ? client.goal.list.query({ projectId }) : null,
      client.todo.forEntity.query(input),
      client.doc.list.query(input)
    ]);
    if (!project.ok) return project.error.message;
    return {
      project: project.value,
      // Dates arrive as strings over the wire; GoalRows reads none of them.
      goals: goals?.ok ? (goals.value as unknown as readonly GoalSummary[]) : [],
      todos: (todos as readonly Todo[]).filter((t) => t.status !== 'COMPLETE' && t.status !== 'CANCELLED'),
      docs: docs.ok ? docs.value : []
    };
  };

  // Reload when the peeked project changes, and when a popup closes (a todo edited from here).
  const popupOpen = $derived(page.url.searchParams.has('popup'));
  $effect(() => {
    const projectId = id;
    if (popupOpen) return;
    const withGoals = $model.has('goals');
    let stale = false;
    load(projectId, withGoals).then(
      (result) => {
        if (stale) return;
        if (typeof result === 'string') failed = { id: projectId, message: result };
        else { loaded = { id: projectId, value: result }; failed = null; }
      },
      (e: unknown) => { if (!stale) failed = { id: projectId, message: errorMessage(e) }; }
    );
    return () => { stale = true; };
  });

  const peeked = $derived(loaded?.id === id ? loaded.value : null);
  const error = $derived(failed?.id === id ? failed.message : null);
  const project = $derived(peeked?.project ?? null);

  const formatDate = (d: Date | string) => (typeof d === 'string' ? new Date(d) : d).toLocaleDateString('en-CA');
</script>

<SidePeek title={project?.name ?? (error ? 'Project' : 'Loading…')} href="/app/projects/{id}">
  {#if error}
    <EmptyState message={error} />
  {:else if peeked && project}
    <dl class="meta-list">
      {#if project.status}
        <div><dt>Status</dt><dd><StatusBadge status={project.status} /></dd></div>
      {/if}
      {#if project.archivedAt}
        <div><dt>Archived</dt><dd>{formatDate(project.archivedAt)}</dd></div>
      {/if}
      <div>
        <dt>Owner</dt>
        <dd>{#if project.owner}<a href={project.owner.path}>{project.owner.label ?? 'Missing owner'}</a>{:else}<span class="muted">None</span>{/if}</dd>
      </div>
      {#if project.parentId}
        <div><dt>Parent</dt><dd><a href="/app/projects/{project.parentId}">{project.parentName}</a></dd></div>
      {/if}
      {#if project.startDate || project.endDate}
        <div>
          <dt>Dates</dt>
          <dd>{project.startDate ? formatDate(project.startDate) : '?'} → {project.endDate ? formatDate(project.endDate) : 'ongoing'}</dd>
        </div>
      {/if}
    </dl>

    {#if project.description?.trim()}
      {#key project.id}
        <div class="card compact description"><MarkdownRenderer content={project.description} /></div>
      {/key}
    {/if}

    {#if $model.has('goals')}
      <section class="section">
        <div class="section-header"><h4>Goals <span class="count">{peeked.goals.length}</span></h4></div>
        {#if peeked.goals.length > 0}
          <GoalRows goals={peeked.goals} showOwner />
        {:else}
          <EmptyState message="Not linked to any goal." />
        {/if}
      </section>
    {/if}

    <section class="section">
      <div class="section-header"><h4>Sub-projects <span class="count">{project.children.length}</span></h4></div>
      {#if project.children.length > 0}
        <ul class="list">
          {#each project.children as child (child.id)}
            <li class="list-row"><a class="grow truncate" href="/app/projects/{child.id}">{child.name}</a></li>
          {/each}
        </ul>
      {:else}
        <EmptyState message="No sub-projects." />
      {/if}
    </section>

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
            <li class="list-row"><a class="grow truncate" href={docPath('PROJECT', project.id, doc.id)}>{doc.title}</a></li>
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
  .description { margin-top: var(--sp-3); color: var(--text-2); }
  .todo-title { justify-content: flex-start; text-align: left; }
</style>
