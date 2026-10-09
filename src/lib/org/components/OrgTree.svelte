<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import OrgLevel from './OrgLevel.svelte';
  import SearchPicker from '$lib/ui/SearchPicker.svelte';
  import { pathToPerson, type OrgTreeNode } from '$lib/org/org-tree';

  interface Props {
    readonly roots: readonly OrgTreeNode[];
    readonly groupsByPerson: ReadonlyMap<string, readonly string[]>;
    readonly onEdit: (id: string) => void;
    /** Extra controls at the far right, after "Jump to person" (the Org Map's view toggle). */
    readonly tools?: Snippet;
  }

  const { roots, groupsByPerson, onEdit, tools }: Props = $props();

  // Bumping this remounts the chart: back to its default (top lead open), or opened along `focusPath`.
  let resetVersion = $state(0);
  let focusPath = $state<readonly string[]>([]);
  let chartEl = $state<HTMLDivElement | null>(null);

  const people = $derived.by(() => {
    const all: { id: string; name: string }[] = [];
    const walk = (nodes: readonly OrgTreeNode[]) => {
      for (const n of nodes) {
        all.push({ id: n.person.id, name: n.person.name });
        walk(n.children);
      }
    };
    walk(roots);
    return all.sort((a, b) => a.name.localeCompare(b.name));
  });

  const collapseAll = () => {
    focusPath = [];
    resetVersion++;
  };

  const jumpTo = async (id: string) => {
    focusPath = pathToPerson(roots, id);
    resetVersion++;
    await tick();
    chartEl
      ?.querySelector(`[data-person-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  };
</script>

<div class="tools">
  <button type="button" class="btn link text-sm" onclick={collapseAll}>Collapse all</button>
  <div class="end">
    <div class="jump">
      <SearchPicker label="Jump to person" placeholder="Jump to person…" options={people} onPick={jumpTo} persistent />
    </div>
    {#if tools}{@render tools()}{/if}
  </div>
</div>
<div class="scroller">
  <div class="org-chart" bind:this={chartEl}>
    {#key resetVersion}
      <OrgLevel nodes={roots} {groupsByPerson} {onEdit} {focusPath} isRoot />
    {/key}
  </div>
</div>

<style lang="scss">
  .tools {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-bottom: var(--sp-2);
    justify-content: space-between;
  }
  .end {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-3);
    flex: 1;
    min-width: 0;
  }
  .jump {
    width: 100%;
    max-width: 200px;
  }

  .scroller {
    max-width: 100%;
    min-width: 0;
    overflow-x: auto;
    padding: var(--sp-2) 0 var(--sp-4);
  }

  // Auto margins centre a narrow chart without clipping a wide one on the left.
  .org-chart {
    width: max-content;
    margin: 0 auto;
  }
</style>
