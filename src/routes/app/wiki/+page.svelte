<script lang="ts">
  import type { PageData } from './$types';
  import Popup from '$lib/common/Popup.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ArchiveFilter from '$lib/ui/ArchiveFilter.svelte';
  import PageForm from '$lib/page/components/PageForm.svelte';
  import { openPopup, closePopup } from '$lib/ui/popup-url';
  import type { PageSummary } from '$shared/types/pages';
  import DisclosureButton from '$lib/ui/DisclosureButton.svelte';
  import { buildTree, flattenTree } from '$shared/utils/hierarchy';
  import { page as appPage } from '$app/state';
  import PagePeek from '$lib/page/components/PagePeek.svelte';
  import PeekIcon from '$lib/ui/PeekIcon.svelte';
  import { openPeek, parsePeek, PEEK_PARAM } from '$lib/ui/peek-url';

  const { data } = $props<{ data: PageData }>();
  const pages = $derived(data.pages as readonly PageSummary[]);
  // Pages start expanded; this holds the ones collapsed.
  let collapsed = $state<ReadonlySet<string>>(new Set());

  const toggleRow = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    collapsed = next;
  };

  // Sub-pages whose parent is filtered out show at the top level.
  const rows = $derived(
    flattenTree(
      buildTree(pages, (p) => p.parentId),
      (node) => collapsed.has(node.item.id),
    ),
  );

  const formatDate = (d: Date | string): string => new Date(d).toLocaleDateString('en-CA');

  const peekId = $derived(parsePeek(appPage.url.searchParams.get(PEEK_PARAM))?.id ?? null);

  const handleCreated = () => closePopup({ invalidate: true });
</script>

<svelte:head><title>Wiki</title></svelte:head>

<div class="page">
  <PageHeader title="Wiki" description="Pages for anything worth writing down, as documents or spreadsheets.">
    <button type="button" class="btn primary" onclick={() => openPopup('new-page')}>Add page</button>
  </PageHeader>

  <div class="toolbar filters">
    <ArchiveFilter />
  </div>

  {#if data.pages.length > 0}
    {#if rows.length > 0}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as { item: page, depth, children } (page.id)}
              <tr class:active={peekId === page.id}>
                <td>
                  <span class="page-name" style="--depth: {depth}">
                    {#if depth > 0}<span class="tree-indent">└</span>{/if}
                    {#if children.length > 0}
                      <DisclosureButton expanded={!collapsed.has(page.id)} label={page.title} onToggle={() => toggleRow(page.id)} />
                    {:else}
                      <span class="disclosure-spacer"></span>
                    {/if}
                    <a href={page.path}>{page.title}</a>{#if page.bodyType === 'sheet'} <span class="badge muted">Sheet</span>{/if}{#if page.archivedAt} <span class="badge muted">Archived</span>{/if}
                    <span class="row-actions">
                      <button type="button" class="btn icon sm" aria-label="Peek at {page.title}" title="Peek" onclick={() => openPeek(page.id)}><PeekIcon /></button>
                    </span>
                  </span>
                </td>
                <td class="text-2">{formatDate(page.updatedAt)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <EmptyState message="No pages." />
    {/if}
  {:else}
    <EmptyState message="No pages yet." boxed>
      <button type="button" class="btn sm" onclick={() => openPopup('new-page')}>Add page</button>
    </EmptyState>
  {/if}
</div>

{#if peekId}
  <PagePeek id={peekId} />
{/if}

<Popup id="new-page" title="Add page">
  <PageForm onSuccess={handleCreated} onCancel={() => closePopup()} />
</Popup>

<style lang="scss">
  .page-name {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    padding-left: calc(var(--depth) * var(--sp-5));
  }
  .disclosure-spacer {
    flex-shrink: 0;
    width: var(--control-h-sm);
  }
  .tree-indent {
    color: var(--border-strong);
    font-size: var(--fs-sm);
  }
</style>
