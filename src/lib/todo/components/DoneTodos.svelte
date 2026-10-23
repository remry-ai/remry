<script lang="ts">
  import StatusDot from './StatusDot.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { formatTodoDate, isClosedTodo, type TodoStatus } from '../utils';

  interface Todo {
    readonly id: string;
    readonly title: string;
    readonly status: TodoStatus;
    readonly completedAt: Date | null;
  }

  interface Props {
    readonly todos: readonly Todo[];
    readonly onEditTodo: (id: string) => void;
  }

  const { todos, onEditTodo }: Props = $props();

  // Most recently closed first; cancelled ones have no date and go last.
  const closedTodos = $derived(
    todos
      .filter((t) => isClosedTodo(t.status))
      .toSorted((a, b) => (b.completedAt ? new Date(b.completedAt).getTime() : 0) - (a.completedAt ? new Date(a.completedAt).getTime() : 0)),
  );
</script>

{#if closedTodos.length > 0}
  <ul class="list">
    {#each closedTodos as todo (todo.id)}
      <li class="list-row todo-row">
        <StatusDot status={todo.status} />
        <button type="button" class="grow wrap todo-title" onclick={() => onEditTodo(todo.id)}>{todo.title}</button>
        {#if todo.status === 'CANCELLED'}
          <span class="meta">Cancelled</span>
        {:else if todo.completedAt}
          <span class="meta">{formatTodoDate(todo.completedAt)}</span>
        {/if}
      </li>
    {/each}
  </ul>
{:else}
  <EmptyState message="No completed or cancelled todos." small />
{/if}

<style lang="scss">
  .todo-row { padding-top: 3px; padding-bottom: 3px; }
  .todo-title {
    text-align: left;
    font-size: var(--fs-md);
    color: var(--text-3);
    text-decoration: line-through;
    &:hover { color: var(--accent); }
  }
</style>
