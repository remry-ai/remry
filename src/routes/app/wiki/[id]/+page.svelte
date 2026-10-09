<script lang="ts">
  import type { PageData } from './$types';
  import ProBadge from '$lib/ui/ProBadge.svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import EntityDetailPage from '$lib/common/EntityDetailPage.svelte';
  import DocEditor from '$lib/common/DocEditor.svelte';
  import MarkdownRenderer from '$lib/common/MarkdownRenderer.svelte';
  import PageForm from '$lib/page/components/PageForm.svelte';
  import InlinePicker from '$lib/ui/InlinePicker.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';
  import { submit, submitOrThrow } from '$lib/ui/submit';
  import { ancestorsOf, wouldCreateCycle } from '$shared/utils/hierarchy';
  import { formatPropertyValue, kindName } from '$lib/page/utils';
  import { wikiPrintUrl } from '$lib/doc/print-options';
  import type { PageDetail, PageKindSummary, PageSummary } from '$shared/types/pages';

  const { data } = $props<{ data: PageData }>();
  const wikiPage = $derived(data.page as PageDetail);
  const docs = $derived(data.docs);
  const notes = $derived(data.notes);
  const todos = $derived(data.todos);
  const reports = $derived(data.reports);
  const relations = $derived(data.relations);
  const allPages = $derived(data.allPages as readonly PageSummary[]);

  const kinds = $derived(data.kinds as readonly PageKindSummary[]);
  const fields = $derived(kinds.find((k) => k.key === wikiPage.kind)?.fields ?? []);

  // Any page except this one and its sub-pages can be its parent.
  const parentOptions = $derived.by(() => {
    const parents = new Map(allPages.map((p): [string, string | null] => [p.id, p.parentId]));
    return allPages
      .filter((p) => !p.archivedAt)
      .filter((p) => !wouldCreateCycle((id) => parents.get(id), wikiPage.id, p.id))
      .map((p) => ({ id: p.id, name: p.title }));
  });

  // Every parent up to the top of the wiki, for the breadcrumb.
  const breadcrumbTrail = $derived(
    ancestorsOf(allPages, wikiPage.id, (p) => p.parentId).map((p) => ({ label: p.title, href: `/app/wiki/${p.id}` })),
  );

  let editing = $state(false);

  // Saving while editing doesn't reload the page, so the editor keeps its state; closing does.
  const handleSaveContent = async (content: string) => {
    await submitOrThrow(() => trpc().page.update.mutate({ id: wikiPage.id, content }));
  };

  const handleSaveTitle = async (title: string) => {
    await submitOrThrow(() => trpc().page.update.mutate({ id: wikiPage.id, title }));
  };

  const handleCloseEditor = async () => {
    editing = false;
    await invalidateAll();
  };

  const handleSetParent = async (parentId: string | null) => {
    await submitOrThrow(() => trpc().page.update.mutate({ id: wikiPage.id, parentId }));
    await invalidateAll();
  };

  const handleUnlinkChild = async (childId: string) => {
    await submitOrThrow(() => trpc().page.update.mutate({ id: childId, parentId: null }));
    await invalidateAll();
  };

  const handleDelete = async () => {
    await submitOrThrow(() => trpc().page.delete.mutate({ id: wikiPage.id }));
    await goto('/app/wiki');
  };

  let newChildTitle = $state('');
  let creatingChild = $state(false);
  let childError = $state('');

  const handleCreateChild = async () => {
    if (!newChildTitle.trim()) return;
    creatingChild = true;
    childError = '';
    const outcome = await submit(() => trpc().page.create.mutate({ title: newChildTitle.trim(), parentId: wikiPage.id }));
    creatingChild = false;
    if (!outcome.ok) {
      childError = outcome.error;
      return;
    }
    newChildTitle = '';
    await goto(outcome.value.path);
  };
</script>

{#snippet pageMeta({ openEdit }: { openEdit: () => void })}
  <dl class="meta-list">
    {#each fields as field (field.key)}
      {@const value = wikiPage.properties[field.key]}
      <div>
        <dt>{field.label}</dt>
        <dd>
          {#if value === undefined}
            <span class="muted">—</span>
          {:else if field.input === 'url'}
            <a href={String(value)} target="_blank" rel="noreferrer">{value}</a>
          {:else}
            {formatPropertyValue(field, value)}
          {/if}
        </dd>
      </div>
    {/each}
    <div>
      <dt>Parent</dt>
      <dd>
        {#if wikiPage.parent}
          <a href="/app/wiki/{wikiPage.parent.id}">{wikiPage.parent.title}</a>
          <ConfirmButton label="Unlink" confirmLabel="Unlink parent" onConfirm={() => handleSetParent(null)} />
        {:else}
          <InlinePicker label="Assign parent" options={parentOptions} placeholder="Select a parent page…" onPick={handleSetParent} />
        {/if}
      </dd>
    </div>
  </dl>
  {#if fields.length > 0 && Object.keys(wikiPage.properties).length === 0}
    <button type="button" class="btn link text-sm" onclick={openEdit}>+ Fill in the {kindName(kinds, wikiPage.kind).toLowerCase()} details</button>
  {/if}
{/snippet}

<EntityDetailPage
  entityType="PAGE"
  entityId={wikiPage.id}
  archivedAt={wikiPage.archivedAt}
  entityName={wikiPage.title}
  breadcrumbLabel="Wiki"
  breadcrumbHref="/app/wiki"
  {breadcrumbTrail}
  editPopupTitle="Edit page"
  {docs}
  {notes}
  {todos}
  {reports}
  {relations}
  links={data.links}
  renderMeta={editing ? undefined : pageMeta}
>
  {#snippet renderOverview()}
    {#if editing}
      <DocEditor
        title={wikiPage.title}
        content={wikiPage.content}
        onSave={handleSaveContent}
        onSaveTitle={handleSaveTitle}
        onClose={handleCloseEditor}
        exportHref={wikiPrintUrl(wikiPage.id)}
      />
    {:else}
      <section class="section">
        <div class="section-header">
          <h4>Content</h4>
          <span class="content-actions">
            {#if wikiPage.content.trim()}
              <a class="btn ghost sm" href={wikiPrintUrl(wikiPage.id)} target="_blank" rel="noopener">Export PDF <ProBadge /></a>
            {/if}
            <button type="button" class="btn icon sm" aria-label="Edit the content of {wikiPage.title}" title="Edit content" onclick={() => { editing = true; }}><PencilIcon /></button>
          </span>
        </div>
        {#if wikiPage.content.trim()}
          <MarkdownRenderer content={wikiPage.content} />
        {:else}
          <EmptyState message="This page is empty.">
            <button type="button" class="btn sm" onclick={() => { editing = true; }}>Write it</button>
          </EmptyState>
        {/if}
      </section>

      <section class="section">
        <div class="section-header">
          <h4>Sub-pages <span class="count">{wikiPage.children.length}</span></h4>
        </div>
        {#if wikiPage.children.length > 0}
          <ul class="list">
            {#each wikiPage.children as child (child.id)}
              <li class="list-row">
                <a class="grow truncate" href={child.path}>{child.title}</a>
                <span class="badge">{kindName(kinds, child.kind)}</span>
                <span class="row-actions">
                  <ConfirmButton label="Unlink sub-page" variant="icon" onConfirm={() => handleUnlinkChild(child.id)} />
                </span>
              </li>
            {/each}
          </ul>
        {:else}
          <EmptyState message="No sub-pages." />
        {/if}
        <form class="toolbar child-form" onsubmit={(e: SubmitEvent) => { e.preventDefault(); handleCreateChild(); }}>
          <input type="text" class="sm" bind:value={newChildTitle} placeholder="New sub-page title" aria-label="New sub-page title" />
          <button type="submit" class="btn sm" disabled={creatingChild || !newChildTitle.trim()} aria-busy={creatingChild}>Add</button>
        </form>
        {#if childError}<p class="form-error">{childError}</p>{/if}
      </section>
    {/if}
  {/snippet}

  {#snippet renderAssetHeader()}
    <span class="asset-h-name">{wikiPage.title}</span>
    <a class="badge" href="/app/wiki?kind={wikiPage.kind}">{kindName(kinds, wikiPage.kind)}</a>
  {/snippet}

  {#snippet renderEditForm({ onSuccess, onCancel })}
    <PageForm initial={wikiPage} {kinds} {onSuccess} {onCancel} onDelete={handleDelete} />
  {/snippet}
</EntityDetailPage>

<style lang="scss">
  // Only the "Fill in the details" link can follow the list in the meta panel.
  .meta-list:not(:last-child) { margin-bottom: var(--sp-3); }
  .content-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }
  .child-form {
    margin-top: var(--sp-2);
    max-width: 360px;
    input { flex: 1; }
  }
</style>
