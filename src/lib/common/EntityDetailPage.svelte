<script lang="ts">
  import Menu from '$lib/ui/Menu.svelte';
  import { planBreadcrumb } from '$lib/common/breadcrumb';
  import EntityPeek from '$lib/common/EntityPeek.svelte';
  import type { Snippet } from 'svelte';
  import { onDestroy, setContext } from 'svelte';
  import { PEEKS_CONTEXT } from '$lib/ui/peek-url';
  import { invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import type { EntityType } from '$shared/types/enums';
  import type { RelationGroup } from '$shared/types/relations';
  import DetailLayout from '$lib/common/DetailLayout.svelte';
  import DocsManager from '$lib/common/DocsManager.svelte';
  import { page } from '$app/state';
  import DocEditor from '$lib/common/DocEditor.svelte';
  import MarkdownRenderer from '$lib/common/MarkdownRenderer.svelte';
  import { printUrl } from '$lib/doc/print-options';
  import { DOC_PARAM, NEW_DOC, openDocUrl, closeDocUrl } from '$lib/doc/doc-url';
  import NoteEditor from '$lib/common/NoteEditor.svelte';
  import Popup from '$lib/common/Popup.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ReportsWidget from '$lib/report/components/ReportsWidget.svelte';
  import RelationsWidget from '$lib/relation/components/RelationsWidget.svelte';
  import LinksWidget from '$lib/link/components/LinksWidget.svelte';
  import SourceLinks from '$lib/link/components/SourceLinks.svelte';
  import SyncPrompt from '$lib/link/components/SyncPrompt.svelte';
  import { createDocHandlers } from '$lib/common/use-doc-handlers';
  import { createNoteHandlers } from '$lib/common/use-note-handlers';
  import { rightPanelNotes, rightPanelPage, rightPanelTodos } from '$lib/stores/right-panel';
  import { activeDrawer } from '$lib/stores/drawers';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';
  import { openPopup, closePopup } from '$lib/ui/popup-url';
  import { errorMessage, submit, submitOrThrow } from '$lib/ui/submit';
  import { ARCHIVE_CHANGED_EVENT } from '$shared/utils/archive';
  import { features } from '$shared/settings/base/features';
  import { acceptsDocs } from '$shared/utils/entity';

  interface DocItem {
    readonly id: string;
    readonly title: string;
    readonly content: string;
    readonly sourceUrl?: string | null;
    /** Set on a sync doc: what Claude pulls from its sources. */
    readonly prompt?: string | null;
    readonly sortOrder: number;
  }

  interface NoteItem {
    readonly id: string;
    readonly parentId: string | null;
    readonly content: string;
    readonly createdAt: Date | string;
  }

  interface TodoItem {
    readonly id: string;
    readonly title: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly status: any;
    readonly priority: number;
    readonly targetDate: Date | null;
    readonly completedAt: Date | null;
  }

  interface ReportItem {
    readonly id: string;
    readonly title: string;
    readonly updatedAt: Date | string;
  }

  interface LinkItem {
    readonly id: string;
    readonly url: string;
    readonly title: string | null;
    readonly syncedAt: Date | string | null;
  }

  interface EditFormCtx {
    readonly onSuccess: () => Promise<void>;
    readonly onCancel: () => void;
  }

  interface OverviewCtx {
    readonly openEdit: () => void;
  }

  interface BreadcrumbLink {
    readonly label: string;
    readonly href: string;
  }

  interface Props {
    readonly entityType: string;
    readonly entityId: string;
    readonly entityName: string;
    readonly breadcrumbLabel: string;
    readonly breadcrumbHref: string;
    readonly editPopupTitle: string;
    readonly docs: readonly DocItem[];
    readonly notes: readonly NoteItem[];
    readonly todos: readonly TodoItem[];
    readonly reports?: readonly ReportItem[];
    readonly relations?: readonly RelationGroup[];
    /** External links; the sidebar lists them, with their source tool and last sync, and adds one by hand. */
    readonly links?: readonly LinkItem[];
    /** Links between the list and the entity in the breadcrumb, such as a wiki page's parents. */
    readonly breadcrumbTrail?: readonly BreadcrumbLink[];
    /** Markdown, shown in an outlined box above the docs list. */
    readonly description?: string | null;
    /** A small heading on that box (a project's "Brief"). */
    readonly descriptionLabel?: string;
    /** Start the docs list folded, so a page with an overview of its own leads with that. */
    readonly docsFolded?: boolean;
    /** Set for archivable entities. An archived entity shows a banner and no edit button. */
    readonly archivedAt?: Date | string | null;
    readonly renderOverview: Snippet<[OverviewCtx]>;
    /** The entity's label–value metadata. It sits above the docs, under the header. */
    readonly renderMeta?: Snippet<[OverviewCtx]>;
    readonly renderAssetHeader: Snippet;
    readonly renderEditForm: Snippet<[EditFormCtx]>;
  }

  const {
    entityType,
    entityId,
    entityName,
    breadcrumbLabel,
    breadcrumbHref,
    editPopupTitle,
    docs,
    notes,
    todos,
    reports = [],
    relations = [],
    links = [],
    description = null,
    descriptionLabel = undefined,
    docsFolded = false,
    breadcrumbTrail = [],
    archivedAt = undefined,
    renderOverview,
    renderMeta = undefined,
    renderAssetHeader,
    renderEditForm,
  }: Props = $props();

  // A long trail folds its middle into a dropdown (lib/common/breadcrumb.ts).
  const crumbs = $derived(planBreadcrumb({ label: breadcrumbLabel, href: breadcrumbHref }, breadcrumbTrail, entityName));

  const editPopupId = $derived(`edit-${entityType.toLowerCase()}`);

  // EntityPeek below shows typed peeks, so the EntityRows on this page get peek buttons.
  setContext(PEEKS_CONTEXT, true);

  // ----- Center pane state -----
  // The open doc lives in the URL (`?doc=<id>`, or `?doc=new` for a draft) and
  // takes the pane over everything else. Notes and todos open in popups (`?popup=note`,
  // with `&note=<id>` to edit one; the app's `?popup=todo`, with `&todo=<id>`), so the page
  // and an open doc stay in view.
  let newDocTitleDraft = $state('Untitled');

  const docParam = $derived(page.url.searchParams.get(DOC_PARAM));
  const newDocOpen = $derived(docParam === NEW_DOC);

  const activeDoc = $derived(
    docParam && docParam !== NEW_DOC ? docs.find((d) => d.id === docParam) ?? null : null,
  );

  // A doc that's gone (deleted, or a stale link) closes.
  $effect(() => {
    if (docParam && docParam !== NEW_DOC && !activeDoc) void closeDocUrl({ replace: true });
  });

  // The open doc's links: the sources Claude writes it from, one line under its title.
  // Loaded here, since a page's load carries only the entity's own links; it reloads
  // whenever the page's data does (activeDoc is a new object then).
  interface DocLink {
    readonly id: string;
    readonly url: string;
    readonly title: string | null;
    readonly syncedAt: Date | string | null;
  }
  let docLinks = $state<readonly DocLink[]>([]);
  const loadDocLinks = async (id: string): Promise<void> => {
    const result = await trpc().link.list.query({ entityType: 'DOC', entityId: id });
    if (activeDoc?.id === id) docLinks = result.ok ? result.value : [];
  };
  $effect(() => {
    const id = activeDoc?.id;
    if (!id) { docLinks = []; return; }
    void loadDocLinks(id);
  });

  // A source added by hand isn't synced: Claude reads it on its next refresh.
  const handleAddDocLink = async (link: { readonly url: string; readonly title?: string }): Promise<void> => {
    if (!activeDoc) return;
    const id = activeDoc.id;
    await submitOrThrow(() => trpc().link.add.mutate({ entityType: 'DOC', entityId: id, ...link }));
    await loadDocLinks(id);
  };

  // The doc "Make sync doc" is open on, until its prompt is saved or cancelled.
  let makingSyncDoc = $state<string | null>(null);

  const handleSaveDocPrompt = async (prompt: string | null): Promise<void> => {
    if (!activeDoc) return;
    const id = activeDoc.id;
    await submitOrThrow(() => trpc().doc.update.mutate({ id, prompt }));
    await invalidateAll();
  };

  // The note popup: `?popup=note` adds one, `&note=<id>` edits that one.
  const NOTE_POPUP = 'note';
  const NOTE_PARAM = 'note';
  const editingNoteId = $derived(page.url.searchParams.get(NOTE_PARAM));
  const editingNote = $derived(editingNoteId ? notes.find((n) => n.id === editingNoteId) ?? null : null);

  const activeDocId = $derived(activeDoc?.id ?? null);

  // A doc fills the centre pane, so the metadata above it gives way.
  const docOpen = $derived(activeDoc !== null || newDocOpen);

  const openDoc = (id: string) => { void openDocUrl(id); };
  // Close a floating drawer so the editor in the center pane is reachable.
  const openNote = (id: string) => { activeDrawer.set(null); void openPopup(NOTE_POPUP, { [NOTE_PARAM]: id }); };
  const openNewNote = () => { activeDrawer.set(null); void openPopup(NOTE_POPUP); };
  const closeNotePopup = (invalidate = false) => closePopup({ invalidate, clear: [NOTE_PARAM] });
  const openNewDoc = () => {
    newDocTitleDraft = 'Untitled';
    draftDocId = null;
    openDoc(NEW_DOC);
  };
  // From the right panel: the app's todo popup (CreateTodoPopup), which takes this page's entity
  // for a new one. A floating panel closes first, so it doesn't sit over the popup.
  const openNewTodo = () => { activeDrawer.set(null); void openPopup('todo'); };
  const openEditTodo = (id: string) => { activeDrawer.set(null); void openPopup('todo', { todo: id }); };
  const closeDoc = () => { void closeDocUrl(); };

  // ----- Handlers -----
  const docHandlers = $derived(
    createDocHandlers(
      trpc().doc,
      entityType,
      entityId,
      () => activeDocId,
      // Replace, so a created doc takes the draft's place in history and Back skips a deleted one.
      (id) => (id ? openDocUrl(id, { replace: true }) : closeDocUrl({ replace: true })),
    ),
  );

  const noteHandlers = $derived(
    createNoteHandlers(trpc().note, entityType, entityId),
  );

  $effect(() => {
    rightPanelNotes.set({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notes: notes as any,
      onAdd: noteHandlers.handleAddNote,
      onRemove: noteHandlers.handleRemoveNote,
      onStartAdd: openNewNote,
      onEdit: (id) => openNote(id),
    });
  });
  $effect(() => {
    rightPanelTodos.set({ todos, onCreate: openNewTodo, onEdit: openEditTodo });
  });
  // The chat tab reads the page as the user sees it: the center pane, then the notes.
  let centerEl: HTMLDivElement | undefined = $state();
  // Sticky things in the pane (the doc editor's toolbar) sit below the sticky header.
  let centerHeaderH = $state(0);
  const getPageText = (): string => {
    const notesText = notes.map((n) => n.content).join('\n\n---\n\n');
    return [centerEl?.innerText ?? '', notesText ? `Notes:\n\n${notesText}` : ''].filter(Boolean).join('\n\n');
  };

  $effect(() => {
    rightPanelPage.set({ entityType: entityType as EntityType, entityId, entityName, getPageText });
  });
  onDestroy(() => {
    rightPanelNotes.set(null);
    rightPanelTodos.set(null);
    rightPanelPage.set(null);
  });

  const handleSaveNote = async (content: string) => {
    if (!editingNote) return;
    await noteHandlers.handleUpdateNote(editingNote.id, content);
    await closeNotePopup(true);
  };

  const handleCreateNote = async (content: string) => {
    await noteHandlers.handleAddNote(content);
    await closeNotePopup(true);
  };

  // A new doc exists on the server only once it's saved, but an image needs the doc's id to
  // upload to. So the first image (or the save) creates it, without opening it: the draft's
  // editor, which holds the images still to upload, stays put. The save then fills it in and
  // opens it; closing the draft unsaved deletes it again.
  let draftDocId: string | null = null;
  const ensureDraftDoc = async (): Promise<string> => {
    draftDocId ??= await docHandlers.handleCreateDraftDoc(newDocTitleDraft);
    return draftDocId;
  };
  const handleUploadDraftImage = async (file: File): Promise<string> =>
    docHandlers.handleUploadImageTo(await ensureDraftDoc(), file);

  const handleCreateDoc = async (content: string) => {
    const id = await ensureDraftDoc();
    draftDocId = null;
    await docHandlers.handleFinishDraftDoc(id, newDocTitleDraft, content);
  };

  const closeNewDoc = async () => {
    const id = draftDocId;
    draftDocId = null;
    closeDoc();
    if (id) await docHandlers.handleDiscardDraftDoc(id).catch(() => undefined);
  };

  const handleDraftDocTitle = async (title: string) => {
    newDocTitleDraft = title;
  };

  // ----- PDF conversion (the local Claude Code CLI, run by the server) -----
  interface PdfJob {
    readonly docId: string;
    readonly running: boolean;
    readonly notice: { readonly tone: 'warning' | 'error'; readonly message: string } | null;
  }
  let pdfJob = $state<PdfJob | null>(null);

  const runPdfConversion = async (docId: string): Promise<void> => {
    pdfJob = { docId, running: true, notice: null };
    try {
      const warning = await docHandlers.handleConvertPdf(docId);
      pdfJob = warning ? { docId, running: false, notice: { tone: 'warning', message: warning } } : null;
    } catch (e: unknown) {
      pdfJob = { docId, running: false, notice: { tone: 'error', message: errorMessage(e) } };
    }
  };

  const handleConvertActiveDoc = async () => {
    if (activeDoc) await runPdfConversion(activeDoc.id);
  };

  // Attaching a PDF to an empty doc converts it straight away.
  const handleUploadPdfToDoc = async (file: File) => {
    const doc = activeDoc;
    await docHandlers.handleUploadPdf(file);
    if (doc && doc.content.trim() === '') void runPdfConversion(doc.id);
  };

  const handleCreateDocFromPdf = async (file: File) => {
    const id = await ensureDraftDoc();
    draftDocId = null;
    await docHandlers.handleFinishDraftDoc(id, newDocTitleDraft, '');
    await docHandlers.handleUploadPdf(file);
    if (activeDocId) void runPdfConversion(activeDocId);
  };

  // ----- Edit popup -----
  const openEdit = () => { openPopup(editPopupId); };
  const handleEditSuccess = () => closePopup({ invalidate: true });
  const handleEditCancel = () => { closePopup(); };

  // ----- Archive -----
  const archivable = $derived(archivedAt !== undefined);
  const isArchived = $derived(archivedAt !== undefined && archivedAt !== null);
  let archiveBusy = $state(false);
  let archiveError = $state<string | null>(null);

  const setArchived = (archived: boolean) => {
    const c = trpc();
    const input = { id: entityId };
    switch (entityType) {
      case 'PERSON': return archived ? c.person.archive.mutate(input) : c.person.unarchive.mutate(input);
      case 'GROUP': return archived ? c.group.archive.mutate(input) : c.group.unarchive.mutate(input);
      case 'PROJECT': return archived ? c.project.archive.mutate(input) : c.project.unarchive.mutate(input);
      case 'GOAL': return archived ? c.goal.archive.mutate(input) : c.goal.unarchive.mutate(input);
      case 'PAGE': return archived ? c.page.archive.mutate(input) : c.page.unarchive.mutate(input);
      default: return Promise.reject(new Error(`${entityType} can't be archived`));
    }
  };

  const handleToggleArchive = async () => {
    archiveBusy = true;
    archiveError = null;
    const outcome = await submit(() => setArchived(!isArchived));
    archiveBusy = false;
    if (!outcome.ok) {
      archiveError = outcome.error;
      return;
    }
    window.dispatchEvent(new Event(ARCHIVE_CHANGED_EVENT));
    await invalidateAll();
  };

  const formatArchivedDate = (d: Date | string): string => new Date(d).toLocaleDateString('en-CA');
</script>

<svelte:head><title>{entityName}</title></svelte:head>

<DetailLayout>
  {#snippet sidebar()}
    {#if features.reports}
      <div class="section">
        <ReportsWidget {entityType} {entityId} {reports} />
      </div>
    {/if}
    <div class="section">
      <RelationsWidget {entityType} {entityId} groups={relations} readOnly={!!archivedAt} selfLabel={entityName} />
    </div>
    <div class="section">
      <LinksWidget {entityType} {entityId} {links} readOnly={!!archivedAt} />
    </div>
  {/snippet}

  <div class="center-pane" bind:this={centerEl} style="--sticky-top: {centerHeaderH}px">
    <div class="center-header" bind:offsetHeight={centerHeaderH}>
      <nav aria-label="breadcrumb">
        <ul>
          <li><a href={crumbs.first.href} title={crumbs.first.label}>{crumbs.first.label}</a></li>
          {#if crumbs.folded.length > 0}
            <li class="crumb-menu">
              <Menu label="Show {crumbs.folded.length} more" items={crumbs.folded.map((c) => ({ label: c.label, href: c.href }))}>
                {#snippet trigger()}<span aria-hidden="true">…</span><span class="sr-only">Show {crumbs.folded.length} more</span>{/snippet}
              </Menu>
            </li>
          {/if}
          {#each crumbs.rest as link (link.href)}
            <li><a href={link.href} title={link.label}>{link.label}</a></li>
          {/each}
          <li><span title={entityName}>{entityName}</span></li>
        </ul>
      </nav>
      <div class="asset-header-row">
        <div class="asset-header-content">{@render renderAssetHeader()}</div>
        {#if !isArchived}
          <button type="button" class="btn icon sm edit-btn" onclick={openEdit} aria-label="Edit {entityName}" title="Edit"><PencilIcon /></button>
        {/if}
        {#if archivable}
          <button type="button" class="btn sm" onclick={handleToggleArchive} disabled={archiveBusy} aria-busy={archiveBusy}>
            {archiveBusy ? 'Saving…' : isArchived ? 'Unarchive' : 'Archive'}
          </button>
        {/if}
      </div>
      {#if archiveError}<p class="inline-error">{archiveError}</p>{/if}
      {#if isArchived && archivedAt}
        <p class="archived-banner">
          <span class="badge warning">Archived</span>
          <span>Archived on {formatArchivedDate(archivedAt)}. It's read-only and hidden from lists; unarchive it to make changes.</span>
        </p>
      {/if}
    </div>

    {#if renderMeta && !docOpen}
      <div class="meta-panel">{@render renderMeta({ openEdit })}</div>
    {/if}

    {#if description?.trim() && !docOpen}
      <div class="card compact description-panel">
        {#if descriptionLabel}<div class="eyebrow">{descriptionLabel}</div>{/if}
        <MarkdownRenderer content={description} />
      </div>
    {/if}

    {#if acceptsDocs(entityType)}
      <div class="docs-panel">
        <DocsManager
          {docs}
          {activeDocId}
          startExpanded={!docsFolded}
          onSelect={openDoc}
          onStartAdd={openNewDoc}
          onRemove={docHandlers.handleRemoveDoc}
          onReorder={docHandlers.handleReorderDocs}
        />
      </div>
    {/if}

    {#if activeDoc}
      <!-- Keyed, so each doc opens on its own first tab (Preview) rather than the last one's. -->
      {#key activeDoc.id}
      <DocEditor
        title={activeDoc.title}
        content={activeDoc.content}
        hasSourcePdf={!!activeDoc.sourceUrl}
        converting={pdfJob?.docId === activeDoc.id && pdfJob.running}
        pdfNotice={pdfJob?.docId === activeDoc.id ? pdfJob.notice : null}
        onSave={docHandlers.handleSaveDoc}
        onSaveTitle={docHandlers.handleSaveTitle}
        onUploadPdf={handleUploadPdfToDoc}
        onOpenSourcePdf={docHandlers.handleOpenSourcePdf}
        onConvertPdf={handleConvertActiveDoc}
        onUploadImage={docHandlers.handleUploadImage}
        onResolveImages={docHandlers.handleResolveImages}
        onClose={closeDoc}
        sources={docLinks.length > 0 || activeDoc.prompt || !archivedAt ? docSources : undefined}
        exportHref={printUrl(activeDoc.id)}
        chartBranding={page.data.chartBranding ?? null}
      />
      {/key}
    {:else if newDocOpen}
      <DocEditor
        title={newDocTitleDraft}
        content=""
        onSave={handleCreateDoc}
        onSaveTitle={handleDraftDocTitle}
        onUploadPdf={handleCreateDocFromPdf}
        onUploadImage={handleUploadDraftImage}
        onClose={closeNewDoc}
        autoEditTitle
      />
    {:else}
      <div class="overview">
        {@render renderOverview({ openEdit })}
      </div>
    {/if}
  </div>
</DetailLayout>

<!-- A row's peek button (?peek=<TYPE>:<id>) shows the item in the right panel's Peek tab. -->
<EntityPeek />

{#snippet docSources()}
  {#if activeDoc?.prompt}
    <SyncPrompt prompt={activeDoc.prompt} links={docLinks} empty={!activeDoc.content.trim()} onSave={archivedAt ? undefined : handleSaveDocPrompt} onAddLink={archivedAt ? undefined : handleAddDocLink} />
  {:else if makingSyncDoc === activeDoc?.id}
    <SyncPrompt prompt="" links={docLinks} creating onSave={async (prompt) => { await handleSaveDocPrompt(prompt); makingSyncDoc = null; }} onAddLink={handleAddDocLink} onCancel={() => { makingSyncDoc = null; }} />
  {:else}
    <SourceLinks links={docLinks} onAdd={archivedAt ? undefined : handleAddDocLink} onMakeSync={archivedAt ? undefined : () => { makingSyncDoc = activeDoc?.id ?? null; }} />
  {/if}
{/snippet}

<Popup id={NOTE_POPUP} title={editingNoteId ? 'Edit note' : 'New note'} size="lg" clearParams={[NOTE_PARAM]}>
  {#if editingNoteId && !editingNote}
    <EmptyState message="This note is gone." />
  {:else}
    {#key editingNoteId}
      <NoteEditor
        bare
        noteId={editingNote?.id ?? '__new__'}
        content={editingNote?.content ?? ''}
        onSave={editingNote ? handleSaveNote : handleCreateNote}
        onClose={() => closeNotePopup()}
      />
    {/key}
  {/if}
</Popup>

<Popup id={editPopupId} title={editPopupTitle}>
  {@render renderEditForm({ onSuccess: handleEditSuccess, onCancel: handleEditCancel })}
</Popup>

<style lang="scss">
  .center-pane {
    // Every block fills the column, so the header (title, Edit, Archive), the metadata, the docs
    // list and whatever is open below them always share one width. Nothing caps itself.
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }
  .center-header {
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
    padding-bottom: var(--sp-3);
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    nav[aria-label='breadcrumb'] ul { margin-bottom: var(--sp-1); }
  }
  .asset-header-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    .edit-btn { opacity: 0; transition: opacity var(--ease); }
    &:hover .edit-btn, .edit-btn:focus-visible { opacity: 1; }
  }
  .asset-header-content {
    flex: 1;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--sp-2);
    min-width: 0;
    :global(.asset-h-name) { font-size: var(--fs-lg); font-weight: 600; letter-spacing: -0.01em; }
    :global(.asset-h-meta) { font-size: var(--fs-md); color: var(--text-2); }
  }
  .archived-banner {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: var(--sp-2) 0 0;
    font-size: var(--fs-sm);
    color: var(--text-2);
  }
  // The metadata and the docs list sit at the top of the centre pane, above
  // whatever is open. The extra margin puts them on the same rhythm as the
  // `.section`s in the overview below.
  .meta-panel,
  .description-panel,
  .docs-panel {
    margin-bottom: var(--sp-2);
  }
  .description-panel { color: var(--text-2); }
  // Overview children are `.section`s, which space themselves (`margin-top`, none on the first).
  .overview {
    display: flex;
    flex-direction: column;
  }
</style>
