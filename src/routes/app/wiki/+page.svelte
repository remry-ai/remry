<script lang="ts">
  import type { PageData } from './$types';
  import Popup from '$lib/common/Popup.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ArchiveFilter from '$lib/ui/ArchiveFilter.svelte';
  import PageForm from '$lib/page/components/PageForm.svelte';
  import { openPopup, closePopup } from '$lib/ui/popup-url';
  import type { PageKindSummary, PageSummary } from '$shared/types/pages';
  import DisclosureButton from '$lib/ui/DisclosureButton.svelte';
  import ParamSelect from '$lib/ui/ParamSelect.svelte';
  import DatasetTable from '$lib/page/components/DatasetTable.svelte';
  import { buildTree, flattenTree } from '$shared/utils/hierarchy';
  import { formatPropertyValue, kindName } from '$lib/page/utils';
  import { model } from '$lib/stores/notebook-model';

  const { data } = $props<{ data: PageData }>();
  const pages = $derived(data.pages as readonly PageSummary[]);
  const kinds = $derived(data.kinds as readonly PageKindSummary[]);
  // ?kind= shows that kind's pages as a dataset table instead of the tree.
  const currentKind = $derived(kinds.find((k) => k.key === data.kind) ?? null);
  const kindOptions = $derived([
    { id: '', name: 'All kinds' },
    ...kinds.filter((k) => k.pageCount > 0 || k.key === data.kind).map((k) => ({ id: k.key, name: `${k.name} (${k.pageCount})` }))
  ]);
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

  const details = (page: PageSummary): string =>
    (kinds.find((k) => k.key === page.kind)?.fields ?? [])
      .flatMap((field) => {
        const value = page.properties[field.key];
        return value === undefined ? [] : [`${field.label}: ${formatPropertyValue(field, value)}`];
      })
      .slice(0, 3)
      .join(' · ');

  const formatDate = (d: Date | string): string => new Date(d).toLocaleDateString('en-CA');

  const handleCreated = () => closePopup({ invalidate: true });
</script>

<svelte:head><title>{currentKind ? `${currentKind.name} · Wiki` : 'Wiki'}</title></svelte:head>

<div class="page">
  <PageHeader
    title={currentKind ? currentKind.name : 'Wiki'}
    description={currentKind?.description ?? ($model.profile === 'home'
      ? 'Recipes, places, bills, home things and anything else worth keeping. Each kind of page has its own fields.'
      : 'Policies, products, software, decisions and anything else worth writing down.')}
  >
    <a class="btn" href="/app/wiki/kinds">Page kinds</a>
    <button type="button" class="btn primary" onclick={() => openPopup('new-page')}>Add {currentKind && currentKind.key !== 'GENERAL' ? currentKind.name.toLowerCase() : 'page'}</button>
  </PageHeader>

  <div class="toolbar filters">
    <ArchiveFilter />
    <ParamSelect param="kind" options={kindOptions} defaultValue="" ariaLabel="Show one kind as a table" />
  </div>

  {#if data.kind && !currentKind}
    <EmptyState message="This notebook has no page kind {data.kind}." boxed>
      <a class="btn sm" href="/app/wiki/kinds">See page kinds</a>
    </EmptyState>
  {:else if currentKind && data.dataset}
    {#if data.dataset.ok}
      <DatasetTable
        kind={currentKind}
        pages={data.dataset.value.pages}
        count={data.dataset.value.count}
        totals={data.dataset.value.totals}
        groups={data.dataset.value.groups}
      />
    {:else}
      <p class="form-error">{data.dataset.error}</p>
      <a class="btn sm" href="/app/wiki?kind={currentKind.key}">Reset the view</a>
    {/if}
  {:else if data.pages.length > 0}
    {#if rows.length > 0}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Kind</th>
              <th>Details</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as { item: page, depth, children } (page.id)}
              <tr>
                <td>
                  <span class="page-name" style="--depth: {depth}">
                    {#if depth > 0}<span class="tree-indent">└</span>{/if}
                    {#if children.length > 0}
                      <DisclosureButton expanded={!collapsed.has(page.id)} label={page.title} onToggle={() => toggleRow(page.id)} />
                    {:else}
                      <span class="disclosure-spacer"></span>
                    {/if}
                    <a href={page.path}>{page.title}</a>{#if page.archivedAt} <span class="badge muted">Archived</span>{/if}
                  </span>
                </td>
                <td><a class="badge" href="/app/wiki?kind={page.kind}">{kindName(kinds, page.kind)}</a></td>
                <td class="text-2">{details(page)}</td>
                <td class="text-2">{formatDate(page.updatedAt)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <EmptyState message="No pages of this kind." />
    {/if}
  {:else}
    <EmptyState message="No pages yet." boxed>
      <button type="button" class="btn sm" onclick={() => openPopup('new-page')}>Add page</button>
    </EmptyState>
  {/if}
</div>

<Popup id="new-page" title="Add page">
  <PageForm initial={{ kind: currentKind?.key ?? 'GENERAL' }} {kinds} onSuccess={handleCreated} onCancel={() => closePopup()} />
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
