<script lang="ts">
  // A doc's sources on one wrapping line, under its title: each tool's mark, the
  // link, and a small "synced" time (in the warning colour after a week). Claude
  // adds and removes them; this only shows them.
  import { timeAgo } from '$lib/home/utils';
  import { isSyncStale, linkLabel, linkSource } from '../source';
  import SourceIcon from './SourceIcon.svelte';

  interface LinkItem {
    readonly id: string;
    readonly url: string;
    readonly title: string | null;
    readonly syncedAt: Date | string | null;
  }

  const { links }: { readonly links: readonly LinkItem[] } = $props();

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
</script>

<ul class="source-links" aria-label="Sources">
  {#each items as item (item.id)}
    <li>
      <SourceIcon source={item.source} small />
      <a href={item.url} target="_blank" rel="noopener noreferrer" title={item.tooltip}>{item.label}</a>
      {#if item.synced}
        <span class="synced" class:stale={item.synced.stale} title={item.synced.title}>{item.synced.text}</span>
      {/if}
    </li>
  {/each}
</ul>

<style lang="scss">
  .source-links {
    display: flex;
    flex-wrap: wrap;
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
</style>
