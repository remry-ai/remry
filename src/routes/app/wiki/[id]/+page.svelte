<script lang="ts">
  import EntityRow from '$lib/ui/EntityRow.svelte';
  import type { PageData } from './$types';
  import ProBadge from '$lib/ui/ProBadge.svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import EntityDetailPage from '$lib/common/EntityDetailPage.svelte';
  import DocEditor from '$lib/common/DocEditor.svelte';
  import MarkdownRenderer from '$lib/common/MarkdownRenderer.svelte';
  import PageForm from '$lib/page/components/PageForm.svelte';
  import SheetEditor from '$lib/page/components/SheetEditor.svelte';
  import InlinePicker from '$lib/ui/InlinePicker.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';
  import SyncPrompt from '$lib/link/components/SyncPrompt.svelte';
  import SourceLinks from '$lib/link/components/SourceLinks.svelte';
  import { errorMessage, submit, submitOrThrow } from '$lib/ui/submit';
  import { ancestorsOf, wouldCreateCycle } from '$shared/utils/hierarchy';
  import { wikiPrintUrl } from '$lib/doc/print-options';
  import { fileToBase64 } from '$lib/common/use-doc-handlers';
  import { fileUrl } from '$shared/utils/files';
  import { convertFileLinkAndWait, newestFileLink, transcribeInBackground, uploadFileLink } from '$lib/link/file-links';
  import type { EditorImageType } from '$api/_images';
  import type { PageDetail, PageSummary } from '$shared/types/pages';

  const { data } = $props<{ data: PageData }>();
  const wikiPage = $derived(data.page as PageDetail);
  const docs = $derived(data.docs);
  const notes = $derived(data.notes);
  const todos = $derived(data.todos);
  const reports = $derived(data.reports);
  const relations = $derived(data.relations);
  const allPages = $derived(data.allPages as readonly PageSummary[]);

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
  const isSheet = $derived(wikiPage.bodyType === 'sheet');

  // Saving while editing doesn't reload the page, so the editor keeps its state; closing does.
  // A sync page's sources are its links: synced ones, and ones added by hand that Claude reads next.
  const sourceLinks = $derived(data.links ?? []);

  // "Make sync page": a document page only (a spreadsheet's rows aren't rewritten from sources).
  let makingSync = $state(false);
  const canMakeSync = $derived(!wikiPage.prompt && !makingSync && !isSheet && !wikiPage.archivedAt);
  $effect(() => { void wikiPage.id; makingSync = false; });

  const handleAddLink = async (link: { readonly url: string; readonly title?: string }) => {
    await submitOrThrow(() => trpc().link.add.mutate({ entityType: 'PAGE', entityId: wikiPage.id, ...link }));
    await invalidateAll();
  };

  // Files uploaded from Add link's "or upload a file" are links like any other, pointing at the
  // file in the page's folder; the newest one is what "Convert with Claude" writes the page from.
  const fileLink = $derived(newestFileLink(sourceLinks));

  let converting = $state(false);
  let convertNotice = $state<{ readonly tone: 'warning' | 'error'; readonly message: string } | null>(null);
  $effect(() => { void wikiPage.id; convertNotice = null; });

  const handleConvert = async (linkId: string | undefined = fileLink?.id) => {
    if (!linkId) return;
    converting = true;
    convertNotice = null;
    try {
      const warning = await convertFileLinkAndWait(linkId, 'PAGE', wikiPage.id);
      if (warning) convertNotice = { tone: 'warning', message: warning };
    } catch (e: unknown) {
      convertNotice = { tone: 'error', message: errorMessage(e) };
    } finally {
      converting = false;
      await invalidateAll();
    }
  };

  // Uploading a file to an empty page writes the page from it straight away, as on a doc.
  const handleUploadSource = async (file: File): Promise<void> => {
    const empty = !wikiPage.content.trim();
    const linkId = await uploadFileLink('PAGE', wikiPage.id, file);
    await invalidateAll();
    // Writing the page saves the file's text too; otherwise save it on its own.
    if (empty) void handleConvert(linkId);
    else transcribeInBackground(linkId);
  };
  const uploadSource = $derived(!wikiPage.archivedAt && !isSheet ? handleUploadSource : undefined);

  const handleSavePrompt = async (prompt: string | null) => {
    await submitOrThrow(() => trpc().page.update.mutate({ id: wikiPage.id, prompt }));
    await invalidateAll();
  };

  const handleSaveContent = async (content: string) => {
    await submitOrThrow(() => trpc().page.update.mutate({ id: wikiPage.id, content }));
  };

  // Images pasted or dropped into the content upload on save, into the page's files.
  const handleUploadImage = async (file: File): Promise<string> => {
    const dataBase64 = await fileToBase64(file);
    const { key } = await submitOrThrow(() => trpc().page.uploadImage.mutate({ pageId: wikiPage.id, contentType: file.type as EditorImageType, dataBase64 }));
    return key;
  };

  // Keys are served by the files route, so resolving them needs no request.
  const handleResolveImages = async (keys: string[]): Promise<Record<string, string>> =>
    Object.fromEntries(keys.map((key) => [key, fileUrl(key)]));

  const handleCloseEditor = async () => {
    editing = false;
    await invalidateAll();
  };

  let sheetError = $state('');
  const handleMakeSheet = async () => {
    sheetError = '';
    const outcome = await submit(() => trpc().page.update.mutate({ id: wikiPage.id, bodyType: 'sheet' }));
    if (!outcome.ok) {
      sheetError = outcome.error;
      return;
    }
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

{#snippet pageMeta()}
  <dl class="meta-list">
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
  onFileLinkUploaded={(linkId) => {
    if (wikiPage.content.trim() || isSheet) return false;
    void handleConvert(linkId);
    return true;
  }}
  renderMeta={editing ? undefined : pageMeta}
>
  {#snippet renderOverview()}
    {#if wikiPage.prompt}
      <SyncPrompt prompt={wikiPage.prompt} links={sourceLinks} empty={!wikiPage.content.trim()} onSave={wikiPage.archivedAt ? undefined : handleSavePrompt} onAddLink={wikiPage.archivedAt ? undefined : handleAddLink} onUploadFile={uploadSource} />
    {:else if makingSync}
      <SyncPrompt prompt="" links={sourceLinks} creating onSave={async (prompt) => { await handleSavePrompt(prompt); makingSync = false; }} onAddLink={handleAddLink} onUploadFile={uploadSource} onCancel={() => { makingSync = false; }} />
    {:else if sourceLinks.length > 0 || !wikiPage.archivedAt}
      <!-- Not a sync page: its links on one line all the same, as on a doc, with Add link and Make sync page. -->
      <SourceLinks links={sourceLinks} onAdd={wikiPage.archivedAt ? undefined : handleAddLink} onUploadFile={uploadSource} onMakeSync={canMakeSync ? () => { makingSync = true; } : undefined} makeSyncLabel="Make sync page" />
    {/if}
    {#if isSheet}
      <section class="section">
        <div class="section-header">
          <h4>Spreadsheet</h4>
          <span class="content-actions">
            <a class="btn ghost sm" href={wikiPrintUrl(wikiPage.id)}>Export PDF <ProBadge /></a>
          </span>
        </div>
        {#key wikiPage.id}
          <SheetEditor content={wikiPage.content} editable={!wikiPage.archivedAt} onSave={handleSaveContent} />
        {/key}
      </section>
    {:else if editing}
      <!-- A section, so it keeps the Content section's gap below the sync banner or links line. -->
      <section class="section">
      <DocEditor
        title={wikiPage.title}
        content={wikiPage.content}
        onSave={handleSaveContent}
        onUploadImage={handleUploadImage}
        onResolveImages={handleResolveImages}
        onClose={handleCloseEditor}
        exportHref={wikiPrintUrl(wikiPage.id)}
        startIn="editor"
        showTitle={false}
        hasSourceFile={!!fileLink}
        {converting}
        {convertNotice}
        onConvert={wikiPage.archivedAt ? undefined : () => handleConvert()}
      />
      </section>
    {:else}
      <section class="section">
        <div class="section-header">
          <h4>Content</h4>
          <span class="content-actions">
            {#if wikiPage.content.trim()}
              <a class="btn ghost sm" href={wikiPrintUrl(wikiPage.id)}>Export PDF <ProBadge /></a>
            {:else if fileLink && !converting && !wikiPage.archivedAt && !isSheet}
              <button type="button" class="btn ghost sm" title="Write the page from {fileLink.title ?? 'the newest file'}" onclick={() => handleConvert()}>Convert with Claude</button>
            {/if}
            <button type="button" class="btn icon sm" aria-label="Edit the content of {wikiPage.title}" title="Edit content" onclick={() => { editing = true; }}><PencilIcon /></button>
          </span>
        </div>
        {#if convertNotice}<p class={convertNotice.tone === 'error' ? 'form-error' : 'form-warning'} role="alert">{convertNotice.message}</p>{/if}
        {#if converting}
          <p class="text-sm muted" aria-busy="true">Converting the file with Claude… This can take a minute or two.</p>
        {:else if wikiPage.content.trim()}
          <MarkdownRenderer content={wikiPage.content} />
        {:else}
          <EmptyState message="This page is empty.">
            <button type="button" class="btn sm" onclick={() => { editing = true; }}>Write it</button>
            <button type="button" class="btn ghost sm" onclick={handleMakeSheet}>Make it a spreadsheet</button>
          </EmptyState>
          {#if sheetError}<p class="form-error">{sheetError}</p>{/if}
        {/if}
      </section>
    {/if}

    {#if !editing || isSheet}
      <section class="section">
        <div class="section-header">
          <h4>Sub-pages <span class="count">{wikiPage.children.length}</span></h4>
        </div>
        {#if wikiPage.children.length > 0}
          <ul class="list">
            {#each wikiPage.children as child (child.id)}
              <EntityRow href={child.path} label={child.title}>
                {#snippet actions()}<ConfirmButton label="Unlink sub-page" variant="icon" onConfirm={() => handleUnlinkChild(child.id)} />{/snippet}
              </EntityRow>
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
  {/snippet}

  {#snippet renderEditForm({ onSuccess, onCancel })}
    <PageForm initial={wikiPage} {onSuccess} {onCancel} onDelete={handleDelete} />
  {/snippet}
</EntityDetailPage>

<style lang="scss">
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
