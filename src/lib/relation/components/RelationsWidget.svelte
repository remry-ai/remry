<script lang="ts">
  // Sidebar list of everything linked to an entity, grouped by how the link
  // reads from this side. "+" in the header opens AddRelation (not while
  // read-only). MENTIONS come from links in content, and goal–project links from the
  // goal's Projects section, so neither can be removed here.
  import { invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import type { RelationGroup, RelationItem } from '$shared/types/relations';
  import { entityTypeLabel } from '$shared/utils/entity';
  import { model } from '$lib/stores/notebook-model';
  import { relationEnd } from '$shared/utils/relations';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { submitOrThrow } from '$lib/ui/submit';
  import AddRelation from './AddRelation.svelte';

  interface Props {
    readonly entityType: string;
    readonly entityId: string;
    readonly groups: readonly RelationGroup[];
    readonly readOnly?: boolean;
    /** Runs after a link is added or removed, for a caller that loads `groups` itself (the todo popup). */
    readonly onChange?: () => Promise<void> | void;
  }

  const { entityType, entityId, groups: allGroups, readOnly = false, onChange }: Props = $props();

  // A home notebook leaves out links to goals and departments.
  const groups = $derived(
    allGroups
      .map((group) => ({ ...group, items: group.items.filter((item) => $model.shows(item.other.entityType)) }))
      .filter((group) => group.items.length > 0)
  );

  const self = $derived(readOnly ? null : relationEnd(entityType, entityId));
  const count = $derived(groups.reduce((n, group) => n + group.items.length, 0));

  let adding = $state(false);

  const handleRemove = async (item: RelationItem) => {
    await submitOrThrow(() => item.personRelation
      ? trpc().personRelation.remove.mutate({ id: item.id })
      : trpc().relation.remove.mutate({ id: item.id }));
    await onChange?.();
    await invalidateAll();
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
      <p class="eyebrow">{group.label}</p>
      <ul class="list">
        {#each group.items as item (item.id)}
          <li class="list-row">
            <a class="grow truncate" href={item.other.path}>{item.other.label}</a>
            <span class="meta truncate" title={item.note ?? undefined}>{item.note ?? entityTypeLabel(item.other.entityType)}</span>
            {#if item.kind !== 'MENTIONS' && !item.goalProject}
              <span class="row-actions">
                <ConfirmButton label="Remove link to {item.other.label}" variant="icon" onConfirm={() => handleRemove(item)} />
              </span>
            {/if}
          </li>
        {/each}
      </ul>
    {/each}
  {/if}
</div>

<style lang="scss">
  .eyebrow { margin: var(--sp-2) 0 var(--sp-1); }
  .meta { max-width: 45%; }
</style>
