<script lang="ts">
  // Sidebar list of an entity's links. A link is a source when Claude has synced
  // the entity from it: its row shows when, in the warning colour once that's more
  // than a week ago. Links open in a new tab. The header's "+" adds one by hand
  // (unsynced: Claude reads it on its next refresh of a sync page).
  import { invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import { ENTITY_TYPES, type EntityType } from '$shared/types/enums';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { submit, submitOrThrow } from '$lib/ui/submit';
  import { timeAgo } from '$lib/home/utils';
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
    readonly entityType: string;
    readonly entityId: string;
    readonly links: readonly LinkItem[];
    readonly readOnly?: boolean;
  }

  const { entityType, entityId, links, readOnly = false }: Props = $props();

  // EntityDetailPage passes its type as a string; anything else can't take a link.
  const linkType = $derived((ENTITY_TYPES as readonly string[]).includes(entityType) ? (entityType as EntityType) : null);

  let adding = $state(false);
  let url = $state('');
  let title = $state('');
  let saving = $state(false);
  let error = $state('');

  const toggleAdding = () => {
    url = '';
    title = '';
    error = '';
    adding = !adding;
  };

  const handleAdd = async () => {
    if (!linkType || !url.trim()) return;
    saving = true;
    const outcome = await submit(() =>
      trpc().link.add.mutate({ entityType: linkType, entityId, url: url.trim(), ...(title.trim() && { title: title.trim() }) })
    );
    saving = false;
    if (!outcome.ok) { error = outcome.error; return; }
    adding = false;
    await invalidateAll();
  };

  const rows = $derived(links.map((link) => {
    // A file uploaded as a link (storage://…) opens from the files route, and removing it deletes the file.
    const isFile = fileLinkKey(link.url) !== null;
    const source = isFile ? null : linkSource(link.url);
    const label = linkLabel(link.title, link.url, source);
    const syncedDate = link.syncedAt ? new Date(link.syncedAt) : null;
    return {
      ...link,
      href: linkHref(link.url),
      isFile,
      source,
      label,
      tooltip: isFile ? `File: ${link.title ?? ''}` : source ? `${source.name}: ${link.url}` : link.url,
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
    {#if !readOnly && linkType}
      <button type="button" class="btn icon sm" onclick={toggleAdding} title="Add link" aria-label="Add link" aria-expanded={adding}>+</button>
    {/if}
  </div>
  {#if adding}
    <form class="add-form" onsubmit={(e: SubmitEvent) => { e.preventDefault(); void handleAdd(); }}>
      <!-- svelte-ignore a11y_autofocus -->
      <input type="url" class="sm" bind:value={url} placeholder="https://…" aria-label="Link address" maxlength="2000" required autofocus />
      <input type="text" class="sm" bind:value={title} placeholder="Title (optional)" aria-label="Link title" maxlength="200" />
      <div class="toolbar">
        <button type="submit" class="btn sm" disabled={saving || !url.trim()} aria-busy={saving}>{saving ? 'Adding…' : 'Add'}</button>
        <button type="button" class="btn ghost sm" onclick={toggleAdding}>Cancel</button>
      </div>
      {#if error}<p class="form-error">{error}</p>{/if}
    </form>
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
            <ConfirmButton label="Remove link {row.label}" variant="icon" onConfirm={() => handleRemove(row.id)} />
          </span>
        {/if}
      </li>
    {/each}
  </ul>
  {/if}
</div>

<style lang="scss">
  .add-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-bottom: var(--sp-2);
  }
  .synced { display: inline-flex; align-items: center; gap: var(--sp-1); white-space: nowrap; flex: none; }
  .stale { color: var(--warning); }
</style>
