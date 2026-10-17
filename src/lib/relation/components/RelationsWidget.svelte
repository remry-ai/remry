<script lang="ts">
  // Sidebar list of everything linked to an entity, grouped by how the link
  // reads from this side. "+" in the header opens AddRelation (not while
  // read-only). MENTIONS come from links in content, and goal–project links from the
  // goal's Projects section, so neither can be removed or edited here. Under a link's name sits
  // its note (cut to two lines), or the other entity's type when its group mixes types, or, on
  // hover, "Add note". That text and the pencil edit the link in a popup, or in place when the
  // widget is already inside one (`inPopup`, the todo popup).
  import EntityRow from '$lib/ui/EntityRow.svelte';
  import { invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import type { RelationGroup, RelationItem } from '$shared/types/relations';
  import { entityTypeLabel } from '$shared/utils/entity';
  import { model } from '$lib/stores/notebook-model';
  import { mixesTypes, relationEnd } from '$shared/utils/relations';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { submitOrThrow } from '$lib/ui/submit';
  import Popup from '$lib/common/Popup.svelte';
  import { page } from '$app/stores';
  import { openPopup, closePopup } from '$lib/ui/popup-url';
  import AddRelation from './AddRelation.svelte';
  import RelationEditForm from './RelationEditForm.svelte';

  interface Props {
    readonly entityType: string;
    readonly entityId: string;
    readonly groups: readonly RelationGroup[];
    readonly readOnly?: boolean;
    /** Runs after a link is added or removed, for a caller that loads `groups` itself (the todo popup). */
    readonly onChange?: () => Promise<void> | void;
    /** Inside a popup already: edit a link in place, since popups don't stack. */
    readonly inPopup?: boolean;
    /** This entity's name, for the edit form's sentence ("Jim is partner of Marie"). */
    readonly selfLabel?: string;
  }

  const { entityType, entityId, groups: allGroups, readOnly = false, onChange, inPopup = false, selfLabel }: Props = $props();
  const selfName = $derived.by(() => {
    const end = relationEnd(entityType, entityId);
    return selfLabel ?? (end ? `This ${entityTypeLabel(end.entityType).toLowerCase()}` : 'This');
  });

  const EDIT_POPUP = 'relation';
  const EDIT_PARAM = 'relation';

  // A home notebook leaves out links to goals and departments.
  const groups = $derived(
    allGroups
      .map((group) => ({ ...group, items: group.items.filter((item) => $model.shows(item.other.entityType)) }))
      .filter((group) => group.items.length > 0)
  );

  const self = $derived(readOnly ? null : relationEnd(entityType, entityId));
  const count = $derived(groups.reduce((n, group) => n + group.items.length, 0));

  let adding = $state(false);
  let editingInPlace = $state<string | null>(null);

  const editable = (item: RelationItem): boolean => !readOnly && item.kind !== 'MENTIONS' && !item.goalProject;
  const items = $derived(groups.flatMap((group) => group.items));
  const editingId = $derived(inPopup ? editingInPlace : $page.url.searchParams.get(EDIT_PARAM));
  const editing = $derived(items.find((item) => item.id === editingId) ?? null);

  const startEdit = (item: RelationItem) => {
    if (inPopup) editingInPlace = item.id;
    else void openPopup(EDIT_POPUP, { [EDIT_PARAM]: item.id });
  };

  const finishEdit = async (saved: boolean) => {
    if (inPopup) {
      editingInPlace = null;
      if (saved) {
        await onChange?.();
        await invalidateAll();
      }
    } else {
      await closePopup({ invalidate: saved, clear: [EDIT_PARAM] });
    }
  };

  const handleRemove = async (item: RelationItem) => {
    await submitOrThrow(() => item.personRelation
      ? trpc().personRelation.remove.mutate({ id: item.id })
      : trpc().relation.remove.mutate({ id: item.id }));
    await onChange?.();
    await invalidateAll();
  };

  const removeEditing = async (item: RelationItem) => {
    await handleRemove(item);
    await finishEdit(false);
  };
</script>

<div class="relations-widget">
  <div class="section-header">
    <h4>Related <span class="count">{count}</span></h4>
    {#if self}
      <button
        type="button"
        class="btn icon sm"
        onclick={() => (adding = !adding)}
        title="Add link"
        aria-label="Add link"
        aria-expanded={adding}
      >+</button>
    {/if}
  </div>
  {#if self && adding}
    <AddRelation {self} {onChange} onDone={() => (adding = false)} />
  {/if}
  {#if count === 0}
    {#if !adding}<EmptyState message="Nothing linked yet." small />{/if}
  {:else}
    {#each groups as group (group.label)}
      {@const showType = mixesTypes(group.items)}
      <p class="eyebrow">{group.label}</p>
      <ul class="list">
        {#each group.items as item (item.id)}
          {@const name = item.other.label ?? entityTypeLabel(item.other.entityType)}
          {@const subText = item.note ?? (showType ? entityTypeLabel(item.other.entityType) : null)}
          <EntityRow href={item.other.path} label={name} wrap>
            {#snippet detail()}
              {#if editable(item)}
                <button type="button" class="btn link muted" class:add-note={!subText} title={item.note ?? 'Edit link'} onclick={() => startEdit(item)}>
                  <span class="detail">{subText ?? 'Add note'}</span>
                </button>
              {:else if subText}
                <span class="detail muted" title={item.note ?? undefined}>{subText}</span>
              {/if}
            {/snippet}
            {#snippet actions()}
              {#if editable(item)}
                <button type="button" class="btn icon sm" aria-label="Edit link to {name}" title="Edit link" onclick={() => startEdit(item)}><PencilIcon /></button>
                <ConfirmButton label="Remove link to {name}" variant="icon" onConfirm={() => handleRemove(item)} />
              {/if}
            {/snippet}
          </EntityRow>
          {#if inPopup && editing?.id === item.id}
            <li class="edit-in-place">
              <RelationEditForm item={editing} selfLabel={selfName} onSaved={() => finishEdit(true)} onRemove={() => removeEditing(editing)} onCancel={() => finishEdit(false)} />
            </li>
          {/if}
        {/each}
      </ul>
    {/each}
  {/if}
</div>

{#if !inPopup}
  <Popup id={EDIT_POPUP} title="Edit link" size="sm" clearParams={[EDIT_PARAM]}>
    {#if editing}
      {#key editing.id}
        <RelationEditForm item={editing} selfLabel={selfName} onSaved={() => finishEdit(true)} onRemove={() => removeEditing(editing)} onCancel={() => finishEdit(false)} />
      {/key}
    {/if}
  </Popup>
{/if}

<style lang="scss">
  .eyebrow { margin: var(--sp-2) 0 var(--sp-1); }
  .detail {
    font-size: var(--fs-sm);
    font-weight: 400;
    text-align: left;
    white-space: normal;
    overflow-wrap: anywhere;
    // A long note takes two lines at most; its title has it whole.
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
  // "Add note" shows only while the row is hovered or focused.
  .add-note { opacity: 0; transition: opacity var(--ease); }
  :global(.list-row:hover) .add-note,
  :global(.list-row:focus-within) .add-note { opacity: 1; }
  .edit-in-place { padding: var(--sp-2) 0; }
</style>
