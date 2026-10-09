<script lang="ts">
  // Global todo popup, opened with `?popup=todo` (create) or `?popup=todo&todo=<id>` (edit).
  import { page } from '$app/stores';
  import Popup from '$lib/common/Popup.svelte';
  import TodoForm from './TodoForm.svelte';
  import { closePopup } from '$lib/ui/popup-url';
  import { parseEntityPath } from '$shared/utils/entity';
  import type { EntityType } from '../utils';

  // Detail pages whose entity a new todo belongs to.
  const TODO_OWNERS: ReadonlySet<EntityType> = new Set(['PROJECT', 'PERSON', 'GROUP', 'GOAL', 'PAGE']);

  const entityContext = $derived.by((): { entityType: EntityType; entityId: string } | null => {
    const ref = parseEntityPath($page.url.pathname);
    return ref && TODO_OWNERS.has(ref.entityType) ? { entityType: ref.entityType, entityId: ref.entityId } : null;
  });

  const isOpen = $derived($page.url.searchParams.get('popup') === 'todo');
  const editId = $derived($page.url.searchParams.get('todo'));

  const close = () => closePopup({ clear: ['todo'] });
  const done = () => closePopup({ invalidate: true, clear: ['todo'] });
</script>

<Popup id="todo" title={editId ? 'Edit todo' : 'New todo'} clearParams={['todo']}>
  {#if isOpen}
    {#key editId}
      <TodoForm
        entityType={entityContext?.entityType}
        entityId={entityContext?.entityId}
        {editId}
        onSuccess={done}
        onCancel={close}
      />
    {/key}
  {/if}
</Popup>
