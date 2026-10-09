<script lang="ts">
  import ChevronIcon from '$lib/ui/ChevronIcon.svelte';
  import { untrack } from 'svelte';
  import Self from './OrgLevel.svelte';
  import { countDescendants, type OrgTreeNode } from '$lib/org/org-tree';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';

  interface Props {
    // One row of peers: the roots, or the reports of the lead opened in the row above.
    readonly nodes: readonly OrgTreeNode[];
    readonly groupsByPerson: ReadonlyMap<string, readonly string[]>;
    readonly onEdit: (id: string) => void;
    readonly parentGroups?: readonly string[];
    readonly isRoot?: boolean;
    /** Ids from a root down to a person to open the chart to and highlight (the last id). */
    readonly focusPath?: readonly string[];
  }

  const { nodes, groupsByPerson, onEdit, parentGroups = [], isRoot = false, focusPath = [] }: Props = $props();
  const focusedId = $derived(focusPath.at(-1) ?? null);

  // Big teams wrap into a boxed grid so the chart doesn't grow endlessly sideways.
  // The grid is as wide as the team allows, up to MAX_COLS across.
  const WRAP_AFTER = 4;
  const MAX_COLS = 7;
  const wrap = $derived(nodes.length > WRAP_AFTER);
  const cols = $derived(Math.min(MAX_COLS, Math.ceil(nodes.length / Math.ceil(nodes.length / MAX_COLS))));

  // At most one peer is open per row; its reports render as the next row, below all peers.
  // A jump opens the lead on `focusPath`; otherwise the top row starts with its first lead open.
  let openId = $state<string | null>(
    untrack(() => {
      const onPath = nodes.find((n) => focusPath.includes(n.person.id) && n.children.length > 0);
      if (onPath) return onPath.person.id;
      if (focusPath.length > 0) return null;
      return isRoot ? (nodes.find((n) => n.children.length > 0)?.person.id ?? null) : null;
    })
  );
  const openNode = $derived(nodes.find((n) => n.person.id === openId && n.children.length > 0) ?? null);

  const toggle = (id: string): void => {
    openId = openId === id ? null : id;
  };

  // Only show tags the lead doesn't already show.
  const visibleGroups = (id: string): readonly string[] =>
    (groupsByPerson.get(id) ?? []).filter((g) => !parentGroups.includes(g));
</script>

<div class="level" class:root={isRoot}>
  <ul class:wrap style:--cols={cols}>
    {#each nodes as node (node.person.id)}
      {@const open = openNode?.person.id === node.person.id}
      <li>
        <div class="node" class:open class:focused={node.person.id === focusedId} data-person-id={node.person.id}>
          <a class="name" href="/app/people/{node.person.id}">{node.person.name}</a>
          {#if node.person.title}<span class="title">{node.person.title}</span>{/if}
          {#if visibleGroups(node.person.id).length > 0}
            <span class="chips">
              {#each visibleGroups(node.person.id) as g}<span class="chip">{g}</span>{/each}
            </span>
          {/if}
          <button type="button" class="edit" aria-label="Edit {node.person.name}" title="Edit" onclick={() => onEdit(node.person.id)}><PencilIcon /></button>
        </div>
        {#if node.children.length > 0}
          <button type="button" class="count" class:open aria-expanded={open} onclick={() => toggle(node.person.id)}>
            {node.children.length}{countDescendants(node) > node.children.length ? ` · ${countDescendants(node)}` : ''}
            <span class="count-chevron" aria-hidden="true"><ChevronIcon size={12} /></span>
          </button>
        {/if}
      </li>
    {/each}
  </ul>

  {#if openNode}
    <div class="next">
      <span class="next-label">{openNode.person.name}'s reports</span>
      {#key openNode.person.id}
        <Self nodes={openNode.children} {groupsByPerson} {onEdit} {focusPath} parentGroups={groupsByPerson.get(openNode.person.id) ?? []} />
      {/key}
    </div>
  {/if}
</div>

<style lang="scss">
  $gap: 20px;
  $line: 1px solid var(--border-strong);

  .level {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    padding-top: $gap;

    // Line down into this row from the row above.
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      height: $gap;
      border-left: $line;
    }

    &.root {
      padding-top: 0;
      &::before { display: none; }
    }
  }

  ul {
    display: flex;
    justify-content: center;
    margin: 0;
    padding: 0;
  }

  li {
    list-style: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    padding: $gap 5px 0;

    // Bar across the row plus a drop into each card.
    &::before,
    &::after {
      content: '';
      position: absolute;
      top: 0;
      width: 50%;
      height: $gap;
      border-top: $line;
    }
    &::before { right: 50%; }
    &::after { left: 50%; border-left: $line; }
    &:first-child::before,
    &:last-child::after,
    &:only-child::after { border-top: none; }
    &:last-child::before { border-right: $line; }
    &:last-child:not(:only-child)::after { border-left: none; }
  }

  .root > ul > li {
    padding-top: 0;
    &::before,
    &::after { display: none; }
  }

  // Wrapped team: a light box, cards in even rows, no per-card connectors.
  ul.wrap {
    display: grid;
    grid-template-columns: repeat(var(--cols), 148px);
    align-items: stretch;
    gap: var(--sp-2);
    padding: var(--sp-3);
    border: 1px dashed var(--border-strong);
    border-radius: var(--r-lg);

    > li {
      padding: 0;
      align-items: stretch;
      &::before,
      &::after { display: none; }
    }

    .node {
      min-width: 0;
      max-width: none;
      height: 100%;
    }
  }

  .node {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 128px;
    max-width: 172px;
    padding: var(--sp-2) 26px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
    text-align: center;
    transition: border-color var(--ease), box-shadow var(--ease);

    &:hover { border-color: var(--border-strong); }
    &.open { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
    // The person a jump landed on.
    &.focused { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 2px var(--accent); }

    &:hover .edit,
    &:focus-within .edit { opacity: 1; }
  }

  .name {
    font-weight: 600;
    font-size: var(--fs-md);
    color: var(--text);
    &:hover { color: var(--accent); text-decoration: none; }
  }

  .title {
    color: var(--text-3);
    font-size: var(--fs-xs);
    line-height: 1.3;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 2px;
    margin-top: 2px;
  }

  .chip {
    font-size: 10px;
    line-height: 14px;
    padding: 0 5px;
    border-radius: var(--r-full);
    background: var(--surface-2);
    color: var(--text-2);
  }

  // Edit stays off the card face until hover or keyboard focus.
  .edit {
    position: absolute;
    top: 3px;
    right: 3px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--r-sm);
    opacity: 0;
    color: var(--text-3);
    transition: opacity var(--ease), color var(--ease), background var(--ease);
    &:hover { color: var(--accent); background: var(--accent-soft); }
  }

  // Reports badge: direct reports · everyone below, when different.
  .count {
    position: relative;
    z-index: 1;
    align-self: center;
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    margin: -10px 0 0;
    padding: 0 var(--sp-1) 0 var(--sp-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--r-full);
    background: var(--surface);
    color: var(--text-2);
    font-size: var(--fs-xs);
    line-height: 20px;
    font-weight: 500;
    transition: color var(--ease), border-color var(--ease);
    &:hover,
    &.open { color: var(--accent); border-color: var(--accent); }
  }
  // Points down while closed, up while open.
  .count-chevron {
    display: inline-flex;
    transform: rotate(90deg);
    transition: transform var(--ease);
  }
  .count.open .count-chevron { transform: rotate(-90deg); }

  .next {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: $gap;
    padding-top: 0;
  }

  .next-label {
    color: var(--text-3);
    font-size: var(--fs-xs);
  }
</style>
