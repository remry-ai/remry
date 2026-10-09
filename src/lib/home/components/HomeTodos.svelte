<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import type { TodoSummary } from '$api/attached/todo/operations';
  import StatusDot from '$lib/todo/components/StatusDot.svelte';
  import PriorityBadge from '$lib/todo/components/PriorityBadge.svelte';
  import { nextStatus, formatTodoDate, type TodoStatus } from '$lib/todo/utils';
  import { openPopup } from '$lib/ui/popup-url';
  import { submit } from '$lib/ui/submit';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ParamToggle from '$lib/ui/ParamToggle.svelte';
  import Pager from '$lib/ui/Pager.svelte';

  const SORT_OPTIONS = [
    { id: 'priority', name: 'Priority' },
    { id: 'status', name: 'Status' }
  ];

  interface Props {
    /** The page shown. */
    readonly todos: readonly TodoSummary[];
    /** Open todos on every page. */
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
  }

  const { todos, total, page, pageSize }: Props = $props();

  let statusError = $state('');

  const openEdit = (id: string) => openPopup('todo', { todo: id });

  const advance = async (id: string, status: TodoStatus) => {
    const outcome = await submit(() => trpc().todo.update.mutate({ id, status: nextStatus(status) }));
    statusError = outcome.ok ? '' : outcome.error;
    if (outcome.ok) await invalidateAll();
  };
</script>

<section class="card panel">
  <header class="section-header">
    <h2>Todos <span class="count">{total}</span></h2>
    <div class="header-actions">
      <ParamToggle param="todoSort" options={SORT_OPTIONS} defaultValue="priority" ariaLabel="Sort todos" />
      <a href="/app/todos" class="text-sm">All todos →</a>
    </div>
  </header>

  {#if statusError}<p class="form-error" role="alert">{statusError}</p>{/if}

  {#if todos.length === 0}
    <EmptyState message="Nothing open. Nice." />
  {:else}
    <ul class="list divided">
      {#each todos as todo (todo.id)}
        <li class="list-row todo-row">
          <StatusDot status={todo.status} clickable onclick={() => advance(todo.id, todo.status)} />
          <div class="body">
            <button type="button" class="title truncate" onclick={() => openEdit(todo.id)}>
              {todo.title} <PriorityBadge priority={todo.priority} />
            </button>
            <div class="meta">
              {#if todo.entityLabel}<a href={todo.entityPath}>{todo.entityLabel}</a>{/if}
              {#if todo.targetDate}<span>due {formatTodoDate(todo.targetDate)}</span>{/if}
            </div>
          </div>
        </li>
      {/each}
    </ul>
    <Pager param="todoPage" current={page} {total} {pageSize} ariaLabel="Todo pages" />
  {/if}
</section>

<style lang="scss">
  h2 { font-size: var(--fs-base); }
  .header-actions { display: flex; align-items: center; gap: var(--sp-3); }
  .todo-row {
    align-items: flex-start;
    padding: var(--sp-2) 0;
    :global(.status-toggle) { margin-top: 1px; }
  }
  .body { min-width: 0; flex: 1; }
  .title {
    display: block;
    width: 100%;
    text-align: left;
    font-size: var(--fs-md);
    &:hover { color: var(--accent); }
  }
  .meta {
    display: flex;
    gap: var(--sp-2);
    font-size: var(--fs-sm);
    color: var(--text-3);
    a { color: inherit; }
    a:hover { color: var(--text); }
  }
</style>
