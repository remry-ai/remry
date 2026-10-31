<script lang="ts">
  // Sidebar list of an entity's links. A link is a source when Claude has synced
  // the entity from it: its row shows when, in the warning colour once that's more
  // than a week ago. Links open in a new tab. The header's "+" opens the add-link form
  // (AddLinkForm, the same one a doc's or page's line uses): an address, or a file uploaded as a
  // link (storage://…, a file icon, opening from the files route; removing it deletes the file).
  // After an upload the local Claude saves a PDF's or image's text on the link, so Claude reads that
  // instead of the file; a file's "Re-read" button writes it again.
  import { invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import { ENTITY_TYPES, type EntityType } from '$shared/types/enums';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { errorMessage, submitOrThrow } from '$lib/ui/submit';
  import { transcribeFileLinkAndWait, transcribeInBackground, uploadFileLink } from '$lib/link/file-links';
  import AddLinkForm from './AddLinkForm.svelte';
  import { timeAgo } from '$lib/home/utils';
  import { isSyncStale, linkLabel, linkSource } from '../source';
  import { FILE_LINK_HOLDERS, fileLinkKey, linkHref, type FileLinkHolder } from '$shared/utils/file-links';
  import SourceIcon from './SourceIcon.svelte';
  import { onMount } from 'svelte';
  import DisclosureButton from '$lib/ui/DisclosureButton.svelte';
  import { SECTION_OPEN_BY_DEFAULT, storedSectionOpen, storeSectionOpen } from '$lib/stores/sidebar-sections';

  interface LinkItem {
    readonly id: string;
    readonly url: string;
    readonly title: string | null;
    readonly syncedAt: Date | string | null;
    readonly sourceEditedAt?: Date | string | null;
    readonly hasText?: boolean;
  }

  interface Props {
    readonly entityType: string;
    readonly entityId: string;
    readonly links: readonly LinkItem[];
    readonly readOnly?: boolean;
    /** After a file is uploaded here, with its link's id: true when it writes its page from it (an empty wiki page), which saves the file's text too. */
    readonly onFileUploaded?: (linkId: string) => boolean;
  }

  const { entityType, entityId, links, readOnly = false, onFileUploaded }: Props = $props();

  // EntityDetailPage passes its type as a string; anything else can't take a link.
  const linkType = $derived((ENTITY_TYPES as readonly string[]).includes(entityType) ? (entityType as EntityType) : null);

  // Files can be uploaded as links on every entity whose page shows links.
  const fileHolder = $derived((FILE_LINK_HOLDERS as readonly string[]).includes(entityType) ? (entityType as FileLinkHolder) : null);

  let adding = $state(false);

  // Folds from its heading; remembered per browser (sidebar-sections.ts). Adding opens it.
  let expanded = $state(SECTION_OPEN_BY_DEFAULT.links);
  onMount(() => { expanded = storedSectionOpen('links'); });
  const setExpanded = (open: boolean) => { expanded = open; storeSectionOpen('links', open); };

  const handleAdd = async (link: { readonly url: string; readonly title?: string }): Promise<void> => {
    if (!linkType) return;
    await submitOrThrow(() => trpc().link.add.mutate({ entityType: linkType, entityId, ...link }));
    await invalidateAll();
  };

  const handleUpload = async (file: File): Promise<void> => {
    if (!fileHolder) return;
    const linkId = await uploadFileLink(fileHolder, entityId, file);
    await invalidateAll();
    if (!onFileUploaded?.(linkId)) transcribeInBackground(linkId);
  };

  // "Re-read": the local Claude writes the file's text again (a PDF or an image; a text file is its own text).
  let rereading = $state<string | null>(null);
  let rereadNotice = $state<string | null>(null);
  const handleReread = async (id: string) => {
    rereading = id;
    rereadNotice = null;
    try {
      rereadNotice = await transcribeFileLinkAndWait(id);
    } catch (e: unknown) {
      rereadNotice = errorMessage(e);
    } finally {
      rereading = null;
      await invalidateAll();
    }
  };

  const rows = $derived(links.map((link) => {
    // A file uploaded as a link (storage://…) opens from the files route, and removing it deletes the file.
    const isFile = fileLinkKey(link.url) !== null;
    const readable = isFile && /\.(pdf|png|jpe?g|gif|webp)$/i.test(link.url);
    const source = isFile ? null : linkSource(link.url);
    const label = linkLabel(link.title, link.url, source);
    const syncedDate = link.syncedAt ? new Date(link.syncedAt) : null;
    return {
      ...link,
      href: linkHref(link.url),
      isFile,
      readable,
      source,
      label,
      tooltip: isFile
        ? `File: ${link.title ?? ''}${readable ? (link.hasText ? '. Claude has its text' : '. Its text isn\'t saved yet') : ''}`
        : source ? `${source.name}: ${link.url}` : link.url,
      synced: syncedDate
        ? {
            text: timeAgo(syncedDate),
            stale: isSyncStale(syncedDate),
            title: `Synced ${syncedDate.toLocaleString()}${link.sourceEditedAt ? `, from a version edited ${new Date(link.sourceEditedAt).toLocaleString()}` : ''}`
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
    <h4>
      <DisclosureButton {expanded} label="Links" onToggle={() => setExpanded(!expanded)}>
        Links <span class="count">{links.length}</span>
      </DisclosureButton>
    </h4>
    {#if !readOnly && linkType}
      <button type="button" class="btn icon sm" onclick={() => { adding = !adding; if (adding) setExpanded(true); }} title="Add link" aria-label="Add link" aria-expanded={adding}>+</button>
    {/if}
  </div>
  {#if expanded}
  {#if adding}
    <div class="add-link">
      <AddLinkForm onAdd={handleAdd} onUploadFile={fileHolder ? handleUpload : undefined} onDone={() => { adding = false; }} stacked />
    </div>
  {/if}
  {#if links.length === 0}
    {#if !adding}<EmptyState message="No links yet." small />{/if}
  {:else}
  <ul class="list">
    {#each rows as row (row.id)}
      <li class="list-row">
        <SourceIcon source={row.source} file={row.isFile} />
        <a class="grow wrap" href={row.href} target="_blank" rel="noopener noreferrer" title={row.tooltip}>{row.label}</a>
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
            {#if row.readable}
              <button type="button" class="btn icon sm" onclick={() => handleReread(row.id)} disabled={rereading !== null} title={rereading === row.id ? 'Reading…' : 'Re-read with Claude: write its text again'} aria-label="Re-read {row.label}">{rereading === row.id ? '…' : '↻'}</button>
            {/if}
            <ConfirmButton label="Remove link {row.label}" variant="icon" onConfirm={() => handleRemove(row.id)} />
          </span>
        {/if}
      </li>
    {/each}
  </ul>
  {/if}
  {#if rereadNotice}<p class="meta notice" role="status">{rereadNotice}</p>{/if}
  {/if}
</div>

<style lang="scss">
  .add-link { margin-bottom: var(--sp-2); }
  .synced { display: inline-flex; align-items: center; gap: var(--sp-1); white-space: nowrap; flex: none; }
  .stale { color: var(--warning); }
  .notice { margin-top: var(--sp-2); }
</style>
