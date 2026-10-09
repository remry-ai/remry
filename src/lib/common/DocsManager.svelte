<script lang="ts">
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import DisclosureButton from '$lib/ui/DisclosureButton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';

  interface Doc {
    readonly id: string;
    readonly title: string;
    readonly sortOrder: number;
  }

  interface Props {
    readonly docs: readonly Doc[];
    readonly activeDocId: string | null;
    readonly onSelect: (id: string) => void;
    readonly onStartAdd: () => void;
    readonly onRemove: (id: string) => Promise<void>;
    readonly onReorder: (docIds: readonly string[]) => Promise<void>;
  }

  const {
    docs,
    activeDocId,
    onSelect,
    onStartAdd,
    onRemove,
    onReorder,
  }: Props = $props();

  // Open on arrival, so the page shows what it holds, unless the URL already
  // has a doc open. It closes itself when a doc takes the centre pane, and
  // reopens on a click.
  let expanded = $state(activeDocId === null);

  const toggle = () => { expanded = !expanded; };

  // A plain click opens the doc in place; a modified click (new tab) is left to the browser.
  const select = (e: MouseEvent, id: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    expanded = false;
    onSelect(id);
  };

  const startAdd = () => {
    expanded = false;
    onStartAdd();
  };

  const moveUp = async (index: number) => {
    if (index <= 0) return;
    const ids = docs.map((d) => d.id);
    [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!];
    await onReorder(ids);
  };

  const moveDown = async (index: number) => {
    if (index >= docs.length - 1) return;
    const ids = docs.map((d) => d.id);
    [ids[index], ids[index + 1]] = [ids[index + 1]!, ids[index]!];
    await onReorder(ids);
  };
</script>

<div class="docs-manager">
  <div class="section-header">
    <h4>
      <DisclosureButton {expanded} label="Docs" onToggle={toggle}>
        Docs <span class="count">{docs.length}</span>
      </DisclosureButton>
    </h4>
    <button type="button" class="btn icon sm" onclick={startAdd} title="Add doc" aria-label="Add doc">+</button>
  </div>
  {#if expanded}
    {#if docs.length > 0}
      <ul class="list">
        {#each docs as doc, i (doc.id)}
          <li class="list-row" class:active={activeDocId === doc.id}>
            <a href="?doc={encodeURIComponent(doc.id)}" class="grow truncate doc-title" onclick={(e) => select(e, doc.id)}>
              {doc.title}
            </a>
            <span class="row-actions">
              <button type="button" class="btn icon sm" onclick={() => moveUp(i)} disabled={i === 0} title="Move up" aria-label="Move up">↑</button>
              <button type="button" class="btn icon sm" onclick={() => moveDown(i)} disabled={i === docs.length - 1} title="Move down" aria-label="Move down">↓</button>
              <ConfirmButton label="Delete doc" variant="icon" onConfirm={() => onRemove(doc.id)} />
            </span>
          </li>
        {/each}
      </ul>
    {:else}
      <EmptyState message="No docs yet." small />
    {/if}
  {/if}
</div>

<style lang="scss">
  .doc-title {
    text-align: left;
    padding: 4px 0;
    color: inherit;
    text-decoration: none;
    &:hover { color: var(--accent); }
  }
  .list-row.active .doc-title { color: var(--accent); font-weight: 500; }
  .row-actions :global(.btn.icon.sm) { font-size: var(--fs-sm); }
</style>
