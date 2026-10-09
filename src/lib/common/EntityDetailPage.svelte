<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onDestroy } from 'svelte';
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
  import TodoWidget from '$lib/todo/components/TodoWidget.svelte';
  import TodoForm from '$lib/todo/components/TodoForm.svelte';
  import ReportsWidget from '$lib/report/components/ReportsWidget.svelte';
  import RelationsWidget from '$lib/relation/components/RelationsWidget.svelte';
  import LinksWidget from '$lib/link/components/LinksWidget.svelte';
  import { createDocHandlers } from '$lib/common/use-doc-handlers';
  import { createNoteHandlers } from '$lib/common/use-note-handlers';
  import { rightPanelNotes, rightPanelPage, activeDrawer } from '$lib/stores/right-panel';
  import PencilIcon from '$lib/ui/PencilIcon.svelte';
  import { openPopup, closePopup } from '$lib/ui/popup-url';
  import { errorMessage, submit } from '$lib/ui/submit';
  import { ARCHIVE_CHANGED_EVENT } from '$shared/utils/archive';
  import { features } from '$shared/settings/base/features';
  import { acceptsDocs } from '$shared/utils/entity';

  interface DocItem {
    readonly id: string;
    readonly title: string;
    readonly content: string;
    readonly sourceUrl?: string | null;
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
    /** External links; the sidebar lists them, with their source tool and last sync, when there are any. */
    readonly links?: readonly LinkItem[];
    /** Links between the list and the entity in the breadcrumb, such as a wiki page's parents. */
    readonly breadcrumbTrail?: readonly BreadcrumbLink[];
    /** Markdown, shown in an outlined box above the docs list. */
    readonly description?: string | null;
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
    breadcrumbTrail = [],
    archivedAt = undefined,
    renderOverview,
    renderMeta = undefined,
    renderAssetHeader,
    renderEditForm,
  }: Props = $props();

  const editPopupId = $derived(`edit-${entityType.toLowerCase()}`);

  // ----- Left drawer state -----
  let leftOpen = $state(false);

  const toggleLeft = () => {
    leftOpen = !leftOpen;
    activeDrawer.set(leftOpen ? 'left' : null);
  };

  $effect(() => {
    if ($activeDrawer !== 'left' && leftOpen) {
      leftOpen = false;
    }
  });

  // ----- Center pane state -----
  // The open doc lives in the URL (`?doc=<id>`, or `?doc=new` for a draft) and
  // takes the pane over everything else. Notes and todos are local state.
  type CenterView =
    | { readonly type: 'overview' }
    | { readonly type: 'note'; readonly id: string }
    | { readonly type: 'newNote' }
    | { readonly type: 'newTodo' }
    | { readonly type: 'editTodo'; readonly id: string };

  let center = $state<CenterView>({ type: 'overview' });
  let newDocTitleDraft = $state('Untitled');

  const docParam = $derived(page.url.searchParams.get(DOC_PARAM));
  const newDocOpen = $derived(docParam === NEW_DOC);

  const activeDoc = $derived(
    docParam && docParam !== NEW_DOC ? docs.find((d) => d.id === docParam) ?? null : null,
  );

  // A doc that's gone (deleted, or a stale link) closes; so does a vanished note.
  $effect(() => {
    if (docParam && docParam !== NEW_DOC && !activeDoc) void closeDocUrl({ replace: true });
    const c = center;
    if (c.type === 'note' && !notes.some((n) => n.id === c.id)) {
      center = { type: 'overview' };
    }
  });

  const activeNote = $derived.by(() => {
    const c = center;
    return c.type === 'note' ? notes.find((n) => n.id === c.id) ?? null : null;
  });

  const activeDocId = $derived(activeDoc?.id ?? null);

  // A doc fills the centre pane, so the metadata above it gives way.
  const docOpen = $derived(activeDoc !== null || newDocOpen);

  // Anything else opened in the pane closes the doc first.
  const showInCenter = (view: CenterView) => {
    void closeDocUrl();
    center = view;
  };

  const openDoc = (id: string) => {
    center = { type: 'overview' };
    void openDocUrl(id);
  };
  // Close the notes drawer (mobile) so the editor in the center pane is reachable.
  const openNote = (id: string) => { showInCenter({ type: 'note', id }); activeDrawer.set(null); };
  const openNewNote = () => { showInCenter({ type: 'newNote' }); activeDrawer.set(null); };
  const openNewDoc = () => {
    newDocTitleDraft = 'Untitled';
    openDoc(NEW_DOC);
  };
  const openNewTodo = () => { showInCenter({ type: 'newTodo' }); };
  const openEditTodo = (id: string) => { showInCenter({ type: 'editTodo', id }); };
  const closeCenter = () => { center = { type: 'overview' }; };
  const closeDoc = () => { void closeDocUrl(); };

  const handleTodoSuccess = async () => {
    center = { type: 'overview' };
    await invalidateAll();
  };

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
    rightPanelPage.set(null);
  });

  const handleSaveNote = async (content: string) => {
    if (center.type !== 'note') return;
    await noteHandlers.handleUpdateNote(center.id, content);
  };

  const handleCreateNote = async (content: string) => {
    await noteHandlers.handleAddNote(content);
    center = { type: 'overview' };
  };

  const handleCreateDoc = async (content: string) => {
    await docHandlers.handleAddDoc(newDocTitleDraft);
    // handleAddDoc has put the new doc's id in the URL.
    if (content) await docHandlers.handleSaveDoc(content);
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
    await docHandlers.handleAddDoc(newDocTitleDraft);
    await docHandlers.handleUploadPdf(file);
    if (activeDocId) void runPdfConversion(activeDocId);
  };

  // ----- Edit popup -----
  const openEdit = () => { openPopup(editPopupId); };
  const handleEditSuccess = () => closePopup({ invalidate: true });
  const handleEditCancel = () => { closePopup(); };

  const todoEntityType = $derived(entityType as EntityType);

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

<DetailLayout {leftOpen} onToggleLeft={toggleLeft}>
  {#snippet sidebar()}
    <div class="section">
      <TodoWidget
        {entityType}
        {entityId}
        {todos}
        onCreate={openNewTodo}
        onEditTodo={openEditTodo}
      />
    </div>
    {#if features.reports}
      <div class="section">
        <ReportsWidget {entityType} {entityId} {reports} />
      </div>
    {/if}
    <div class="section">
      <RelationsWidget {entityType} {entityId} groups={relations} readOnly={!!archivedAt} />
    </div>
    {#if links.length > 0}
      <div class="section">
        <LinksWidget {links} readOnly={!!archivedAt} />
      </div>
    {/if}
  {/snippet}

  <div class="center-pane" bind:this={centerEl} style="--sticky-top: {centerHeaderH}px">
    <div class="center-header" bind:offsetHeight={centerHeaderH}>
      <nav aria-label="breadcrumb">
        <ul>
          <li><a href={breadcrumbHref}>{breadcrumbLabel}</a></li>
          {#each breadcrumbTrail as link (link.href)}
            <li><a href={link.href}>{link.label}</a></li>
          {/each}
          <li>{entityName}</li>
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
      <div class="card compact description-panel"><MarkdownRenderer content={description} /></div>
    {/if}

    {#if acceptsDocs(entityType)}
      <div class="docs-panel">
        <DocsManager
          {docs}
          {activeDocId}
          onSelect={openDoc}
          onStartAdd={openNewDoc}
          onRemove={docHandlers.handleRemoveDoc}
          onReorder={docHandlers.handleReorderDocs}
        />
      </div>
    {/if}

    {#if activeDoc}
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
        exportHref={printUrl(activeDoc.id)}
        chartBranding={page.data.chartBranding ?? null}
      />
    {:else if newDocOpen}
      <DocEditor
        title={newDocTitleDraft}
        content=""
        onSave={handleCreateDoc}
        onSaveTitle={handleDraftDocTitle}
        onUploadPdf={handleCreateDocFromPdf}
        onClose={closeDoc}
        autoEditTitle
      />
    {:else if activeNote}
      <NoteEditor
        noteId={activeNote.id}
        content={activeNote.content}
        onSave={handleSaveNote}
        onClose={closeCenter}
      />
    {:else if center.type === 'newNote'}
      <NoteEditor
        noteId="__new__"
        content=""
        onSave={handleCreateNote}
        onClose={closeCenter}
      />
    {:else if center.type === 'newTodo'}
      <section class="card pane-card">
        <div class="pane-header">
          <h2>New todo</h2>
          <button type="button" class="btn icon" aria-label="Close" onclick={closeCenter}>&times;</button>
        </div>
        <TodoForm entityType={todoEntityType} {entityId} onSuccess={handleTodoSuccess} onCancel={closeCenter} />
      </section>
    {:else if center.type === 'editTodo'}
      <section class="card pane-card">
        <div class="pane-header">
          <h2>Edit todo</h2>
          <button type="button" class="btn icon" aria-label="Close" onclick={closeCenter}>&times;</button>
        </div>
        <TodoForm entityType={todoEntityType} {entityId} editId={center.id} onSuccess={handleTodoSuccess} onCancel={closeCenter} />
      </section>
    {:else}
      <div class="overview">
        {@render renderOverview({ openEdit })}
      </div>
    {/if}
  </div>
</DetailLayout>

<Popup id={editPopupId} title={editPopupTitle}>
  {@render renderEditForm({ onSuccess: handleEditSuccess, onCancel: handleEditCancel })}
</Popup>

<style lang="scss">
  .center-pane {
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
    max-width: 720px;
    margin-bottom: var(--sp-2);
  }
  .description-panel { color: var(--text-2); }
  .pane-card { max-width: 640px; }
  .pane-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--sp-3);
    h2 { margin: 0; font-size: var(--fs-base); }
  }
  // Overview children are `.section`s, which space themselves (`margin-top`, none on the first).
  .overview {
    display: flex;
    flex-direction: column;
    max-width: 720px;
  }
</style>
