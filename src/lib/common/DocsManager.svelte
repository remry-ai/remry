<script lang="ts">
  import EntityRow from '$lib/ui/EntityRow.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import DisclosureButton from '$lib/ui/DisclosureButton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import SyncStatus from '$lib/link/components/SyncStatus.svelte';
  import { syncStatus, syncNeedTone, type LastSyncView } from '$lib/link/last-sync';
  import type { SyncNeed } from '$shared/types/sync-now';

  interface Doc {
    readonly id: string;
    readonly title: string;
    /** Set on a sync doc, which gets a badge. */
    readonly prompt?: string | null;
    /** Why a sync doc wants syncing (never synced, failed, over a week old); its badge says so. */
    readonly syncNeed?: SyncNeed | null;
    /** A sync doc's last sync, for its date. */
    readonly lastSync?: LastSyncView | null;
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
  // Read once: where it starts.
  // svelte-ignore state_referenced_locally
  let expanded = $state(activeDocId === null);

  const toggle = () => { expanded = !expanded; };

  // Shown in the header too, so a folded list still says some sync docs want syncing.
  const needingSync = $derived(docs.filter((d) => d.prompt && d.syncNeed).length);

  // A sync doc's dot takes its colour from why it wants syncing; the date and details from its last sync.
  const statusOf = (doc: Doc) => ({ ...syncStatus(doc.lastSync ?? null), tone: syncNeedTone(doc.syncNeed) });

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
    {#if needingSync > 0}<span class="to-sync"><SyncStatus tone="warning" text={String(needingSync)} title="{needingSync} sync doc{needingSync === 1 ? '' : 's'} failed, never synced, or last synced over a week ago" /></span>{/if}
    <button type="button" class="btn icon sm" onclick={startAdd} title="Add doc" aria-label="Add doc">+</button>
  </div>
  {#if expanded}
    {#if docs.length > 0}
      <ul class="list doc-list">
        {#each docs as doc, i (doc.id)}
          <EntityRow href="?doc={encodeURIComponent(doc.id)}" label={doc.title} linkClass="doc-title" active={activeDocId === doc.id} onclick={(e) => select(e, doc.id)}>
            {#if doc.prompt}
              <SyncStatus {...statusOf(doc)} />
              <span class="badge accent" title="Sync doc: Claude keeps it in step with its sources. {doc.prompt}">Sync</span>
            {/if}
            {#snippet actions()}
              <button type="button" class="btn icon sm" onclick={() => moveUp(i)} disabled={i === 0} title="Move up" aria-label="Move up">↑</button>
              <button type="button" class="btn icon sm" onclick={() => moveDown(i)} disabled={i === docs.length - 1} title="Move down" aria-label="Move down">↓</button>
              <ConfirmButton label="Delete doc" variant="icon" onConfirm={() => onRemove(doc.id)} />
            {/snippet}
          </EntityRow>
        {/each}
      </ul>
    {:else}
      <EmptyState message="No docs yet." small />
    {/if}
  {/if}
</div>

<style lang="scss">
  // Beside the heading, with the add button kept at the far end.
  .to-sync { margin-right: auto; }
  // The rows are EntityRows, so their parts are reached through the list.
  .doc-list {
    :global(.doc-title) {
      text-align: left;
      padding: 4px 0;
      color: inherit;
      text-decoration: none;
      &:hover { color: var(--accent); }
    }
    :global(.list-row.active .doc-title) { color: var(--accent); font-weight: 500; }
    :global(.row-actions .btn.icon.sm) { font-size: var(--fs-sm); }
  }
</style>
