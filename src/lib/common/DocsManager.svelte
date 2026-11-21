<script lang="ts">
  import EntityRow from '$lib/ui/EntityRow.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import DisclosureButton from '$lib/ui/DisclosureButton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import { errorMessage } from '$lib/ui/submit';
  import { BODY_LABELS, BODY_TYPES, type BodyType } from '$shared/types/body-types';
  import { page } from '$app/state';
  import { drawingMenuMarks, type DrawingAllowanceView } from '$lib/license/drawings';
  import SyncStatus from '$lib/link/components/SyncStatus.svelte';
  import { syncStatus, syncNeedTone, type LastSyncView } from '$lib/link/last-sync';
  import type { SyncNeed } from '$shared/types/sync-now';
  import { hasPro } from '$lib/license/pro';

  interface Doc {
    readonly id: string;
    readonly title: string;
    /** A spreadsheet or drawing doc gets a badge saying so. */
    readonly bodyType?: BodyType;
    /** Set on a sync doc, which gets a badge. */
    readonly prompt?: string | null;
    /** The entity's sync doc: pinned first, and not moved or deleted here (clearing its prompt makes it an ordinary doc). */
    readonly isSync?: boolean;
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
    /** Adds an empty doc of that type and opens it; without it (archived), no "+". */
    readonly onAdd?: (bodyType: BodyType) => Promise<void>;
    readonly onRemove: (id: string) => Promise<void>;
    readonly onReorder: (docIds: readonly string[]) => Promise<void>;
    /** Offers "Sync doc…" in the "+" menu, for an entity that can be synced and isn't yet. */
    readonly onAddSync?: () => void;
  }

  const {
    docs,
    activeDocId,
    onSelect,
    onAdd,
    onRemove,
    onReorder,
    onAddSync,
  }: Props = $props();

  // Open on arrival, so the page shows what it holds, unless the URL already
  // has a doc open. It closes itself when a doc takes the centre pane, and
  // reopens on a click.
  // Read once: where it starts.
  // svelte-ignore state_referenced_locally
  let expanded = $state(activeDocId === null);

  const toggle = () => { expanded = !expanded; };

  // A sync doc's dot takes its colour from why it wants syncing; the date and details from its last sync.
  const statusOf = (doc: Doc) => ({ ...syncStatus(doc.lastSync ?? null), tone: syncNeedTone(doc.syncNeed) });

  // The header shows the sync doc's dot alone, whenever there is one, so a folded list still says
  // how its last sync went: blue when current, amber when it wants syncing, red when it failed.
  const syncDoc = $derived(docs.find((d) => d.prompt) ?? null);
  const headerStatus = $derived(syncDoc ? { ...statusOf(syncDoc), text: '' } : null);

  // A plain click opens the doc in place; a modified click (new tab) is left to the browser.
  const select = (e: MouseEvent, id: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    expanded = false;
    onSelect(id);
  };

  let addError = $state('');
  const add = async (bodyType: BodyType) => {
    addError = '';
    expanded = false;
    try {
      await onAdd?.(bodyType);
    } catch (e: unknown) {
      addError = errorMessage(e);
    }
  };

  // Drawings are free up to a number per notebook; the item says how many are used, and wears
  // the Pro icon once they're gone (the server then refuses another, saying why).
  const allowance = $derived(page.data?.drawingAllowance as DrawingAllowanceView | undefined);
  // A sync doc isn't written by hand: "Sync doc…" asks for the prompt, and saving it makes the doc.
  const addItems = $derived([
    ...BODY_TYPES.map((type) => ({
      label: BODY_LABELS[type],
      onSelect: () => { void add(type); },
      ...(type === 'drawing' && allowance ? drawingMenuMarks(allowance) : {})
    })),
    ...(onAddSync ? [{ label: 'Sync doc…', divided: true, pro: !hasPro(page.data ?? {}), onSelect: () => { expanded = false; onAddSync(); } }] : [])
  ]);

  // The sync doc stays first; the others reorder among themselves.
  const ordinary = $derived(docs.filter((d) => !d.isSync));

  const moveUp = async (index: number) => {
    if (index <= 0) return;
    const ids = ordinary.map((d) => d.id);
    [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!];
    await onReorder(ids);
  };

  const moveDown = async (index: number) => {
    if (index >= ordinary.length - 1) return;
    const ids = ordinary.map((d) => d.id);
    [ids[index], ids[index + 1]] = [ids[index + 1]!, ids[index]!];
    await onReorder(ids);
  };

  const orderOf = (id: string): number => ordinary.findIndex((d) => d.id === id);
</script>

<div class="docs-manager">
  <div class="section-header">
    <h4>
      <DisclosureButton {expanded} label="Docs" onToggle={toggle}>
        Docs <span class="count">{docs.length}</span>
      </DisclosureButton>
    </h4>
    {#if headerStatus}<span class="to-sync"><SyncStatus {...headerStatus} /></span>{/if}
    {#if onAdd}
      <Menu label="Add doc" items={addItems} align="end">
        {#snippet trigger()}<span aria-hidden="true">+</span><span class="sr-only">Add doc</span>{/snippet}
      </Menu>
    {/if}
  </div>
  {#if addError}<p class="form-error" role="alert">{addError}</p>{/if}
  {#if expanded}
    {#if docs.length > 0}
      <ul class="list doc-list">
        {#each docs as doc (doc.id)}
          <EntityRow href="?doc={encodeURIComponent(doc.id)}" label={doc.title} linkClass="doc-title" active={activeDocId === doc.id} onclick={(e) => select(e, doc.id)}>
            {#if doc.prompt}<SyncStatus {...statusOf(doc)} />{/if}
            {#snippet actions()}
              {#if !doc.isSync}
                {@const i = orderOf(doc.id)}
                <button type="button" class="btn icon sm" onclick={() => moveUp(i)} disabled={i === 0} title="Move up" aria-label="Move up">↑</button>
                <button type="button" class="btn icon sm" onclick={() => moveDown(i)} disabled={i === ordinary.length - 1} title="Move down" aria-label="Move down">↓</button>
                <ConfirmButton label="Delete doc" variant="delete" onConfirm={() => onRemove(doc.id)} />
              {/if}
            {/snippet}
            <!-- Its type, last, so the types line up down the list: a sync doc's is "Sync". -->
            {#snippet trailing()}
              {#if doc.prompt}
                <span class="badge muted" title="Sync doc: written only from this page's sources, following its prompt. {doc.prompt}">Sync</span>
              {:else}
                <span class="badge muted">{BODY_LABELS[doc.bodyType ?? 'doc']}</span>
              {/if}
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
