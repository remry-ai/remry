<script lang="ts">
  // A doc's sources on one wrapping line, under its title: each tool's mark, the
  // link, and a small "synced" time (in the warning colour after a week; "not
  // synced yet" for one added by hand, which Claude reads on its next refresh).
  // With onAdd, an "Add link" button at the end opens a small inline form.
  import { timeAgo } from '$lib/home/utils';
  import { submit } from '$lib/ui/submit';
  import { isSyncStale, linkLabel, linkSource } from '../source';
  import SourceIcon from './SourceIcon.svelte';

  interface LinkItem {
    readonly id: string;
    readonly url: string;
    readonly title: string | null;
    readonly syncedAt: Date | string | null;
  }

  interface Props {
    readonly links: readonly LinkItem[];
    /** Adds a link; without it there's no Add link button. */
    readonly onAdd?: (link: { readonly url: string; readonly title?: string }) => Promise<unknown>;
    /** Offers to make the doc a sync doc (a link after Add link), with this label. */
    readonly onMakeSync?: () => void;
    readonly makeSyncLabel?: string;
  }

  const { links, onAdd, onMakeSync, makeSyncLabel = 'Make sync doc' }: Props = $props();

  const items = $derived(links.map((link) => {
    const source = linkSource(link.url);
    const synced = link.syncedAt ? new Date(link.syncedAt) : null;
    return {
      id: link.id,
      url: link.url,
      source,
      label: linkLabel(link.title, link.url, source),
      tooltip: source ? `${source.name}: ${link.url}` : link.url,
      synced: synced
        ? {
            text: timeAgo(synced),
            stale: isSyncStale(synced),
            title: `Synced ${synced.toLocaleString()}${isSyncStale(synced) ? '. More than a week ago: ask Claude to re-sync it.' : ''}`
          }
        : null
    };
  }));

  let adding = $state(false);
  let url = $state('');
  let title = $state('');
  let saving = $state(false);
  let error = $state('');

  const open = () => { url = ''; title = ''; error = ''; adding = true; };

  const add = async () => {
    if (!onAdd || !url.trim()) return;
    saving = true;
    const outcome = await submit(() => onAdd({ url: url.trim(), ...(title.trim() && { title: title.trim() }) }));
    saving = false;
    if (!outcome.ok) { error = outcome.error; return; }
    adding = false;
  };
</script>

<div class="sources">
  <ul class="source-links" aria-label="Sources">
    {#each items as item (item.id)}
      <li>
        <SourceIcon source={item.source} small />
        <a href={item.url} target="_blank" rel="noopener noreferrer" title={item.tooltip}>{item.label}</a>
        {#if item.synced}
          <span class="synced" class:stale={item.synced.stale} title={item.synced.title}>{item.synced.text}</span>
        {:else}
          <span class="synced" title="Added by hand: Claude reads it on its next refresh">not synced yet</span>
        {/if}
      </li>
    {/each}
    {#if onAdd && !adding}
      <li><button type="button" class="btn link muted" onclick={open}>+ Add link</button></li>
    {/if}
    {#if onMakeSync && !adding}
      <li><button type="button" class="btn link muted" onclick={onMakeSync} title="Claude keeps it in step with its sources, following a prompt you write">{makeSyncLabel}</button></li>
    {/if}
  </ul>

  {#if adding}
    <form class="toolbar add-form" onsubmit={(e: SubmitEvent) => { e.preventDefault(); void add(); }}>
      <!-- svelte-ignore a11y_autofocus -->
      <input type="url" class="sm url" bind:value={url} placeholder="https://…" aria-label="Link address" required autofocus />
      <input type="text" class="sm" bind:value={title} placeholder="Title (optional)" aria-label="Link title" maxlength="200" />
      <button type="submit" class="btn sm" disabled={saving || !url.trim()} aria-busy={saving}>{saving ? 'Adding…' : 'Add'}</button>
      <button type="button" class="btn ghost sm" onclick={() => { adding = false; }}>Cancel</button>
    </form>
    {#if error}<p class="form-error">{error}</p>{/if}
  {/if}
</div>

<style lang="scss">
  .sources {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }
  .source-links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--fs-xs);
    color: var(--text-2);
  }
  li {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-width: 0;
  }
  a {
    color: inherit;
    overflow-wrap: anywhere;
    &:hover { color: var(--accent); }
  }
  .synced { color: var(--text-3); white-space: nowrap; }
  .stale { color: var(--warning); }
  // One row: the address takes the room, the title less; they wrap on a narrow pane.
  .add-form {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    input { width: auto; min-width: 0; flex: 1 1 10rem; }
    .url { flex: 3 1 16rem; }
  }
</style>
