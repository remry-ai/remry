<script lang="ts">
  // A person's summary in a side peek: the fields the notebook's modules add
  // (title and lead, or birthday and how you know them), how they relate to you,
  // their groups and reports, what they own, open todos and docs. Read-only;
  // Open goes to the full page.
  import EntityRow from '$lib/ui/EntityRow.svelte';
  import { page } from '$app/state';
  import { trpc } from '$shared/trpc/client';
  import { errorMessage } from '$lib/ui/submit';
  import { openPopup } from '$lib/ui/popup-url';
  import SidePeek from '$lib/ui/SidePeek.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import OwnedWork from '$lib/goal/components/OwnedWork.svelte';
  import StatusDot from '$lib/todo/components/StatusDot.svelte';
  import PriorityBadge from '$lib/todo/components/PriorityBadge.svelte';
  import type { TodoStatus } from '$lib/todo/utils';
  import { fieldText } from '$lib/person/fields';
  import { model } from '$lib/stores/notebook-model';
  import { docPath } from '$shared/utils/entity';
  import type { GoalSummary } from '$shared/types/goals';

  interface Props {
    readonly id: string;
    /** How the person relates to you ("Lead of"), from the list's row; the person's own record doesn't carry it. */
    readonly toMe?: readonly string[];
  }

  const { id, toMe = [] }: Props = $props();

  type Client = ReturnType<typeof trpc>;
  type Person = Extract<Awaited<ReturnType<Client['person']['get']['query']>>, { ok: true }>['value'];
  type Project = Extract<Awaited<ReturnType<Client['project']['list']['query']>>, { ok: true }>['value'][number];
  type Doc = Extract<Awaited<ReturnType<Client['doc']['list']['query']>>, { ok: true }>['value'][number];

  interface Todo {
    readonly id: string;
    readonly title: string;
    readonly status: TodoStatus;
    readonly priority: number;
  }

  interface Peeked {
    readonly person: Person;
    readonly goals: readonly GoalSummary[];
    readonly projects: readonly Project[];
    readonly todos: readonly Todo[];
    readonly docs: readonly Doc[];
  }

  let loaded = $state.raw<{ readonly id: string; readonly value: Peeked } | null>(null);
  let failed = $state.raw<{ readonly id: string; readonly message: string } | null>(null);

  const load = async (personId: string, withGoals: boolean): Promise<Peeked | string> => {
    const client = trpc();
    const input = { entityType: 'PERSON' as const, entityId: personId };
    const owner = { ownerType: 'PERSON' as const, ownerId: personId };
    const [person, goals, projects, todos, docs] = await Promise.all([
      client.person.get.query({ id: personId }),
      withGoals ? client.goal.list.query(owner) : null,
      client.project.list.query(owner),
      client.todo.forEntity.query(input),
      client.doc.list.query(input)
    ]);
    if (!person.ok) return person.error.message;
    return {
      person: person.value,
      // Dates arrive as strings over the wire; GoalRows reads none of them.
      goals: goals?.ok ? (goals.value as unknown as readonly GoalSummary[]) : [],
      projects: projects.ok ? projects.value : [],
      todos: (todos as readonly Todo[]).filter((t) => t.status !== 'COMPLETE' && t.status !== 'CANCELLED'),
      docs: docs.ok ? docs.value : []
    };
  };

  // Reload when the peeked person changes, and when a popup closes (a todo edited from here).
  const popupOpen = $derived(page.url.searchParams.has('popup'));
  $effect(() => {
    const personId = id;
    if (popupOpen) return;
    const withGoals = $model.has('goals');
    let stale = false;
    load(personId, withGoals).then(
      (result) => {
        if (stale) return;
        if (typeof result === 'string') failed = { id: personId, message: result };
        else { loaded = { id: personId, value: result }; failed = null; }
      },
      (e: unknown) => { if (!stale) failed = { id: personId, message: errorMessage(e) }; }
    );
    return () => { stale = true; };
  });

  const peeked = $derived(loaded?.id === id ? loaded.value : null);
  const error = $derived(failed?.id === id ? failed.message : null);
  const person = $derived(peeked?.person ?? null);
  const reports = $derived(person?.extensions.org?.reports ?? []);

  const formatDate = (d: Date | string) => (typeof d === 'string' ? new Date(d) : d).toLocaleDateString('en-CA');
</script>

<SidePeek title={person?.name ?? (error ? 'Person' : 'Loading…')} href="/app/people/{id}">
  {#if error}
    <EmptyState message={error} />
  {:else if peeked && person}
    <dl class="meta-list">
      {#if person.isMe}
        <div><dt>You</dt><dd><span class="badge accent">You</span></dd></div>
      {:else if toMe.length > 0}
        <div><dt>To you</dt><dd>{toMe.join(', ')}</dd></div>
      {/if}
      {#each $model.personFields as f (`${f.module}.${f.key}`)}
        {@const text = fieldText(person.extensions, f)}
        {#if text}
          <div>
            <dt>{f.label}</dt>
            <dd>
              {#if f.input === 'person' && person.extensions.org?.leadId}
                <a href="/app/people/{person.extensions.org.leadId}">{text}</a>
              {:else}
                {text}
              {/if}
            </dd>
          </div>
        {/if}
      {/each}
      {#if person.email}
        <div><dt>Email</dt><dd><a href="mailto:{person.email}">{person.email}</a></dd></div>
      {/if}
      {#if person.archivedAt}
        <div><dt>Archived</dt><dd>{formatDate(person.archivedAt)}</dd></div>
      {/if}
    </dl>

    <section class="section">
      <div class="section-header"><h4>Groups <span class="count">{person.groups.length}</span></h4></div>
      {#if person.groups.length > 0}
        <ul class="list">
          {#each person.groups as group (group.id)}
            <EntityRow href={group.path} label={group.name}>
              <span class="meta">{group.kindName}</span>
            </EntityRow>
          {/each}
        </ul>
      {:else}
        <EmptyState message="Not in any group." />
      {/if}
    </section>

    {#if reports.length > 0}
      <section class="section">
        <div class="section-header"><h4>Reports <span class="count">{reports.length}</span></h4></div>
        <ul class="list">
          {#each reports as report (report.id)}
            <EntityRow href="/app/people/{report.id}" label={report.name}>
              {#if report.title}<span class="meta">{report.title}</span>{/if}
            </EntityRow>
          {/each}
        </ul>
      </section>
    {/if}

    <OwnedWork goals={peeked.goals} projects={peeked.projects} />

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
            <EntityRow href={docPath('PERSON', person.id, doc.id)} label={doc.title} />
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
  .todo-title { justify-content: flex-start; text-align: left; }
</style>
