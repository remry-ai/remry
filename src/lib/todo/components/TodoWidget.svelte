<script lang="ts">
  import ChevronIcon from '$lib/ui/ChevronIcon.svelte';
  import { invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import StatusDot from './StatusDot.svelte';
  import PriorityBadge from './PriorityBadge.svelte';
  import { nextStatus, describeDueDate, formatDueDateFull, isClosedTodo, type TodoStatus } from '../utils';
  import { openPopup } from '$lib/ui/popup-url';
  import { submit } from '$lib/ui/submit';
  import EmptyState from '$lib/ui/EmptyState.svelte';

  interface Todo {
    readonly id: string;
    readonly title: string;
    readonly status: TodoStatus;
    readonly priority: number;
    readonly targetDate: Date | null;
    readonly completedAt: Date | null;
  }

  interface Props {
    readonly todos: readonly Todo[];
    readonly onCreate?: () => void;
    readonly onEditTodo?: (id: string) => void;
  }

  const { todos, onCreate, onEditTodo }: Props = $props();

  let expanded = $state(true);

  // Complete and cancelled ones are in the right panel's Done tab (DoneTodos).
  const activeTodos = $derived(todos.filter((t) => !isClosedTodo(t.status)));

  const openCreate = () => {
    if (onCreate) return onCreate();
    openPopup('todo');
  };

  const openEdit = (id: string) => {
    if (onEditTodo) return onEditTodo(id);
    openPopup('todo', { todo: id });
  };

  let statusError = $state('');

  const handleStatusChange = async (id: string, status: TodoStatus) => {
    const outcome = await submit(() => trpc().todo.update.mutate({ id, status }));
    statusError = outcome.ok ? '' : outcome.error;
    if (outcome.ok) await invalidateAll();
  };
</script>

<div class="todo-widget">
  <div class="section-header">
    <h4>Todos <span class="count">{activeTodos.length}</span></h4>
    <span class="header-actions">
      <button type="button" class="btn icon sm" onclick={openCreate} title="New todo" aria-label="New todo">+</button>
      <button type="button" class="btn icon sm chevron" class:open={expanded} onclick={() => (expanded = !expanded)} aria-label={expanded ? 'Collapse' : 'Expand'} aria-expanded={expanded}><ChevronIcon /></button>
    </span>
  </div>

  {#if statusError}<p class="form-error" role="alert">{statusError}</p>{/if}

  {#if expanded}
    {#if activeTodos.length > 0}
      <ul class="list">
        {#each activeTodos as todo (todo.id)}
          {@const due = describeDueDate(todo.targetDate)}
          <li class="list-row todo-row">
            <span class="first-line">
              <StatusDot status={todo.status} clickable onclick={() => handleStatusChange(todo.id, nextStatus(todo.status))} />
            </span>
            <div class="grow todo-main">
              <button type="button" class="wrap todo-title" onclick={() => openEdit(todo.id)}>{todo.title}</button>
              {#if due && todo.targetDate}
                <span class="due" class:overdue={due.overdue} title="Due {formatDueDateFull(todo.targetDate)}">{due.label}</span>
              {/if}
            </div>
            {#if todo.priority > 0}
              <span class="first-line"><PriorityBadge priority={todo.priority} /></span>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <EmptyState message="No active todos." small />
    {/if}

  {/if}
</div>

<style lang="scss">
  .header-actions { display: flex; align-items: center; }
  .chevron {
    transition: transform var(--ease);
    &.open { transform: rotate(90deg); }
  }
  .todo-row { padding-top: 3px; padding-bottom: 3px; }
  // Title on top, due date underneath: the sidebar is too narrow for both on one line.
  .todo-main { display: flex; flex-direction: column; }
  // The toggle and priority sit level with the title's first line, not the middle of the row.
  .todo-row { align-items: flex-start; }
  .first-line {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    height: calc(var(--fs-md) * 1.5);
  }
  .due {
    font-size: var(--fs-xs);
    color: var(--text-3);
    &.overdue { color: var(--danger); }
  }
  .todo-title {
    text-align: left;
    font-size: var(--fs-md);
    &:hover { color: var(--accent); }
  }
</style>
