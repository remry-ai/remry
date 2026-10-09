<script lang="ts">
  import type { PageData } from './$types';
  import { invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import StatusDot from '$lib/todo/components/StatusDot.svelte';
  import PriorityBadge from '$lib/todo/components/PriorityBadge.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { openPopup } from '$lib/ui/popup-url';
  import { submit } from '$lib/ui/submit';
  import { nextStatus, formatTodoDate, type TodoStatus, type EntityType } from '$lib/todo/utils';
  import { entityPath, entityTypeLabel } from '$shared/utils/entity';
  import { model } from '$lib/stores/notebook-model';

  const { data } = $props<{ data: PageData }>();
  const todos = $derived(data.todos);

  let statusFilter = $state<TodoStatus | 'ALL'>('ALL');
  let entityFilter = $state<EntityType | 'ALL'>('ALL');

  interface TodoItem {
    readonly id: string;
    readonly title: string;
    readonly status: TodoStatus;
    readonly priority: number;
    readonly entityType: EntityType;
    readonly entityId: string;
    readonly entityLabel: string | null;
    readonly targetDate: Date | null;
    readonly completedAt: Date | null;
    readonly createdAt: Date;
  }

  const filtered = $derived(
    (todos as readonly TodoItem[]).filter((t: TodoItem) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (entityFilter !== 'ALL' && t.entityType !== entityFilter) return false;
      return true;
    })
  );

  interface EntityGroup {
    readonly entityType: EntityType;
    readonly entityId: string;
    readonly entityLabel: string;
    readonly todos: readonly TodoItem[];
  }

  const groupByEntity = (items: readonly TodoItem[]): readonly EntityGroup[] => {
    const map = new Map<string, { entityType: EntityType; entityId: string; entityLabel: string; todos: TodoItem[] }>();
    for (const t of items) {
      const key = `${t.entityType}:${t.entityId}`;
      if (!map.has(key)) {
        map.set(key, { entityType: t.entityType, entityId: t.entityId, entityLabel: t.entityLabel ?? t.entityId, todos: [] });
      }
      map.get(key)!.todos.push(t);
    }
    return [...map.values()];
  };

  const activeGroups = $derived(groupByEntity(filtered.filter((t: TodoItem) => t.status !== 'COMPLETE' && t.status !== 'CANCELLED')));
  const completedTodos = $derived(filtered.filter((t: TodoItem) => t.status === 'COMPLETE' || t.status === 'CANCELLED'));

  const openEdit = (id: string) => openPopup('todo', { todo: id });

  let statusError = $state('');

  const handleStatusChange = async (id: string, status: TodoStatus) => {
    const outcome = await submit(() => trpc().todo.update.mutate({ id, status }));
    statusError = outcome.ok ? '' : outcome.error;
    if (outcome.ok) await invalidateAll();
  };

</script>

<svelte:head><title>Todos</title></svelte:head>

<div class="page">
  <PageHeader title="Todos" description="Everything open, grouped by what it belongs to.">
    <button type="button" class="btn primary" onclick={() => openPopup('todo')}>New todo</button>
  </PageHeader>

  <div class="toolbar filters">
    <select class="sm" bind:value={statusFilter} aria-label="Status filter">
      <option value="ALL">All statuses</option>
      <option value="PENDING">Pending</option>
      <option value="ACTIVE">Active</option>
      <option value="COMPLETE">Complete</option>
      <option value="CANCELLED">Cancelled</option>
    </select>
    <select class="sm" bind:value={entityFilter} aria-label="Type filter">
      <option value="ALL">All types</option>
      <option value="PROJECT">Projects</option>
      <option value="PERSON">People</option>
      <option value="GROUP">Groups</option>
    </select>
  </div>

  {#if statusError}<p class="form-error" role="alert">{statusError}</p>{/if}

  {#if activeGroups.length > 0}
    {#each activeGroups as group (`${group.entityType}:${group.entityId}`)}
      <section class="section group">
        <div class="section-header">
          <h3>
            <span class="eyebrow">{entityTypeLabel(group.entityType)}</span>
            <a href={entityPath(group.entityType, group.entityId)}>{group.entityLabel}</a>
          </h3>
        </div>
        <ul class="list">
          {#each group.todos as todo (todo.id)}
            <li class="list-row">
              <StatusDot status={todo.status} clickable onclick={() => handleStatusChange(todo.id, nextStatus(todo.status))} />
              <button type="button" class="grow truncate todo-title" onclick={() => openEdit(todo.id)}>{todo.title}</button>
              <PriorityBadge priority={todo.priority} />
              {#if todo.targetDate}<span class="meta">{formatTodoDate(todo.targetDate)}</span>{/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {:else}
    <EmptyState message="No active todos." boxed />
  {/if}

  {#if completedTodos.length > 0}
    <details class="section completed">
      <summary>Completed ({completedTodos.length})</summary>
      <ul class="list">
        {#each completedTodos as todo (todo.id)}
          <li class="list-row done">
            <StatusDot status={todo.status} />
            <button type="button" class="grow truncate todo-title" onclick={() => openEdit(todo.id)}>{todo.title}</button>
            <a href={entityPath(todo.entityType, todo.entityId)} class="meta entity-link">{todo.entityLabel ?? todo.entityId}</a>
            <span class="meta">{formatTodoDate(todo.completedAt)}</span>
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</div>

<style lang="scss">
  .filters {
    margin-bottom: var(--sp-5);
    select { width: auto; min-width: 140px; }
  }
  .group { margin-top: var(--sp-5); }
  .group h3 {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    font-size: var(--fs-base);
  }
  .todo-title {
    text-align: left;
    &:hover { color: var(--accent); }
  }
  .done .todo-title { color: var(--text-3); text-decoration: line-through; }
  .entity-link:hover { color: var(--text); text-decoration: none; }
  .completed { margin-top: var(--sp-6); }
  .completed .list { margin-top: var(--sp-2); }
</style>
