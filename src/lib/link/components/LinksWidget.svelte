<script lang="ts">
  // Sidebar list of an entity's links, shown only when it has some. A link is
  // a source when Claude has synced the entity from it: its row shows when, in
  // the warning colour once that's more than a week ago. Links open in a new tab.
  import { invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import { submitOrThrow } from '$lib/ui/submit';
  import { timeAgo } from '$lib/home/utils';
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
    readonly readOnly?: boolean;
  }

  const { links, readOnly = false }: Props = $props();

  const rows = $derived(links.map((link) => {
    const source = linkSource(link.url);
    const label = linkLabel(link.title, link.url, source);
    const syncedDate = link.syncedAt ? new Date(link.syncedAt) : null;
    return {
      ...link,
      source,
      label,
      tooltip: source ? `${source.name}: ${link.url}` : link.url,
      synced: syncedDate
        ? {
            text: timeAgo(syncedDate),
            stale: isSyncStale(syncedDate),
            title: `Synced ${syncedDate.toLocaleString()}`
          }
        : null
    };
  }));

  const handleRemove = async (id: string) => {
    await submitOrThrow(() => trpc().link.remove.mutate({ id }));
    await invalidateAll();
  };
</script>

<div class="links-widget">
  <div class="section-header">
    <h4>Links <span class="count">{links.length}</span></h4>
  </div>
  <ul class="list">
    {#each rows as row (row.id)}
      <li class="list-row">
        <SourceIcon source={row.source} />
        <a class="grow truncate" href={row.url} target="_blank" rel="noopener noreferrer" title={row.tooltip}>{row.label}</a>
        {#if row.synced}
          <span class="meta synced" class:stale={row.synced.stale} title={row.synced.stale ? `${row.synced.title}. More than a week ago: ask Claude to re-sync it.` : row.synced.title}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-label="Synced">
              <path d="M13.5 6.5A5.5 5.5 0 0 0 3.3 4.4M2.5 9.5a5.5 5.5 0 0 0 10.2 2.1" />
              <path d="M3 1.8v2.8h2.8M13 14.2v-2.8h-2.8" />
            </svg>{row.synced.text}
          </span>
        {/if}
        {#if !readOnly}
          <span class="row-actions">
            <ConfirmButton label="Remove link {row.label}" variant="icon" onConfirm={() => handleRemove(row.id)} />
          </span>
        {/if}
      </li>
    {/each}
  </ul>
</div>

<style lang="scss">
  .synced { display: inline-flex; align-items: center; gap: var(--sp-1); white-space: nowrap; flex: none; }
  .stale { color: var(--warning); }
</style>
