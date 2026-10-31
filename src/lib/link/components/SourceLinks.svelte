<script lang="ts">
  // A doc's sources on one wrapping line, under its title: each tool's mark, the
  // link, and a small "synced" time (in the warning colour after a week; "not
  // synced yet" for one added by hand, which Claude reads on its next refresh).
  // With onAdd, an "Add link" button at the end opens a small inline form; with onUploadFile,
  // that form also takes a file Claude can read (a doc's source: a PDF, an image or a text
  // file), shown first in the line once attached.
  import { timeAgo } from '$lib/home/utils';
  import { submit } from '$lib/ui/submit';
  import { isSyncStale, linkLabel, linkSource } from '../source';
  import { fileLinkKey, linkHref } from '$shared/utils/file-links';
  import SourceIcon from './SourceIcon.svelte';

  interface LinkItem {
    readonly id: string;
    readonly url: string;
    readonly title: string | null;
    readonly syncedAt: Date | string | null;
  }

  /** A file the entity holds as a source (a doc's PDF, image or text file), at `href` (the files route). */
  interface SourceFile {
    readonly label: string;
    readonly href: string;
  }

  interface Props {
    readonly links: readonly LinkItem[];
    /** Adds a link; without it (and without onUploadFile) there's no Add link button. */
    readonly onAdd?: (link: { readonly url: string; readonly title?: string }) => Promise<unknown>;
    /** Uploads a source file from the add form ("or upload a file"); with no onAdd, the button reads "Add a file". */
    readonly onUploadFile?: (file: File) => Promise<unknown>;
    /** The source file already attached, first in the line. */
    readonly file?: SourceFile | null;
    /** Offers to make the doc a sync doc (a link after Add link), with this label. */
    readonly onMakeSync?: () => void;
    readonly makeSyncLabel?: string;
  }

  const { links, onAdd, onUploadFile, file = null, onMakeSync, makeSyncLabel = 'Make sync doc' }: Props = $props();
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
  let url = $state('');
  let title = $state('');
  let saving = $state(false);
  let error = $state('');

  const open = () => { url = ''; title = ''; error = ''; adding = true; };

  let uploading = $state(false);
  const upload = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const chosen = input.files?.[0];
    if (!chosen || !onUploadFile) return;
    uploading = true;
    error = '';
    const outcome = await submit(() => onUploadFile(chosen));
    uploading = false;
    input.value = '';
    if (!outcome.ok) { error = outcome.error; return; }
    adding = false;
  };

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
    {#if file}
      <li>
        <SourceIcon source={null} file small />
        <a href={file.href} target="_blank" rel="noopener noreferrer" title="Open the file">{file.label}</a>
      </li>
    {/if}
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
      <li><button type="button" class="btn link muted" onclick={open}>{onAdd ? '+ Add link' : '+ Add a file'}</button></li>
    {/if}
    {#if onMakeSync && !adding}
      <li><button type="button" class="btn link muted" onclick={onMakeSync} title="Claude keeps it in step with its sources, following a prompt you write">{makeSyncLabel}</button></li>
    {/if}
  </ul>

  {#if adding}
    <form class="toolbar add-form" onsubmit={(e: SubmitEvent) => { e.preventDefault(); void add(); }}>
      {#if onAdd}
        <!-- svelte-ignore a11y_autofocus -->
        <input type="url" class="sm url" bind:value={url} placeholder="https://…" aria-label="Link address" required autofocus />
        <input type="text" class="sm" bind:value={title} placeholder="Title (optional)" aria-label="Link title" maxlength="200" />
        <button type="submit" class="btn sm" disabled={saving || uploading || !url.trim()} aria-busy={saving}>{saving ? 'Adding…' : 'Add'}</button>
      {/if}
      {#if onUploadFile}
        <label class="btn ghost sm" aria-busy={uploading}>
          {uploading ? 'Uploading…' : onAdd ? 'or upload a file' : 'Choose a file'}
          <!-- Any file: the server takes a PDF, an image or any text, and says what to do with anything else. -->
          <input type="file" onchange={upload} disabled={uploading} hidden />
        </label>
      {/if}
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
