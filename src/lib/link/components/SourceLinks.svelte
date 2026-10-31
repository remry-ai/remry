<script lang="ts">
  // A doc's sources on one wrapping line, under its title: each tool's mark, the
  // link, and a small "synced" time (in the warning colour after a week; "not
  // synced yet" for one added by hand, which Claude reads on its next refresh).
  // With onAdd, an "Add link" button at the end opens the add-link form (AddLinkForm), which
  // with onUploadFile also uploads a file as a link, shown in the line like the others.
  import { timeAgo } from '$lib/home/utils';
  import AddLinkForm from './AddLinkForm.svelte';
  import { isSyncStale, linkLabel, linkSource } from '../source';
  import { fileLinkKey, linkHref } from '$shared/utils/file-links';
  import SourceIcon from './SourceIcon.svelte';

  interface LinkItem {
    readonly id: string;
    readonly url: string;
    readonly title: string | null;
    readonly syncedAt: Date | string | null;
  }

  interface Props {
    readonly links: readonly LinkItem[];
    /** Adds a link; without it (and without onUploadFile) there's no Add link button. */
    readonly onAdd?: (link: { readonly url: string; readonly title?: string }) => Promise<unknown>;
    /** Uploads a source file from the add form ("or upload a file"); with no onAdd, the button reads "Add a file". */
    readonly onUploadFile?: (file: File) => Promise<unknown>;
    /** Offers to make the doc a sync doc (a link after Add link), with this label. */
    readonly onMakeSync?: () => void;
    readonly makeSyncLabel?: string;
  }

  const { links, onAdd, onUploadFile, onMakeSync, makeSyncLabel = 'Make sync doc' }: Props = $props();
  const canAdd = $derived(!!onAdd || !!onUploadFile);

  const items = $derived(links.map((link) => {
    // A file uploaded as a link points into the notebook (storage://…) and opens from the files route.
    const isFile = fileLinkKey(link.url) !== null;
    const source = isFile ? null : linkSource(link.url);
    const synced = link.syncedAt ? new Date(link.syncedAt) : null;
    return {
      id: link.id,
      url: linkHref(link.url),
      isFile,
      source,
      label: linkLabel(link.title, link.url, source),
      tooltip: isFile ? `File: ${link.title ?? ''}` : source ? `${source.name}: ${link.url}` : link.url,
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
</script>

<div class="sources">
  <ul class="source-links" aria-label="Sources">
    {#each items as item (item.id)}
      <li>
        <SourceIcon source={item.source} file={item.isFile} small />
        <a href={item.url} target="_blank" rel="noopener noreferrer" title={item.tooltip}>{item.label}</a>
        {#if item.isFile}
          <!-- An uploaded file is read as it is; there's nothing to sync. -->
        {:else if item.synced}
          <span class="synced" class:stale={item.synced.stale} title={item.synced.title}>{item.synced.text}</span>
        {:else}
          <span class="synced" title="Added by hand: Claude reads it on its next refresh">not synced yet</span>
        {/if}
      </li>
    {/each}
    {#if canAdd && !adding}
      <li><button type="button" class="btn link muted" onclick={() => { adding = true; }}>{onAdd ? '+ Add link' : '+ Add a file'}</button></li>
    {/if}
    {#if onMakeSync && !adding}
      <li><button type="button" class="btn link muted" onclick={onMakeSync} title="Claude keeps it in step with its sources, following a prompt you write">{makeSyncLabel}</button></li>
    {/if}
  </ul>

  {#if adding}<AddLinkForm {onAdd} {onUploadFile} onDone={() => { adding = false; }} />{/if}
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
</style>
