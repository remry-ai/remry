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
  import { hasPro } from '$lib/license/pro';
  import DocEditor from '$lib/common/DocEditor.svelte';
  import DocBodyCard from '$lib/doc/DocBodyCard.svelte';
  import { BODY_LABELS, isGridOrDrawing, type BodyType } from '$shared/types/body-types';
  import { isEmptyBody } from '$shared/utils/body';
  import MarkdownRenderer from '$lib/common/MarkdownRenderer.svelte';
  import { printUrl } from '$lib/doc/print-options';
  import { DOC_PARAM, openDocUrl, closeDocUrl } from '$lib/doc/doc-url';
  import NoteEditor from '$lib/common/NoteEditor.svelte';
  import Popup from '$lib/common/Popup.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import RelationsWidget from '$lib/relation/components/RelationsWidget.svelte';
  import LinksWidget from '$lib/link/components/LinksWidget.svelte';
  import SourceLinks from '$lib/link/components/SourceLinks.svelte';
  import { convertFileLinkAndWait, newestFileLink, transcribeInBackground, uploadFileLink } from '$lib/link/file-links';
  import SyncPrompt from '$lib/link/components/SyncPrompt.svelte';
  import { syncNowAndWait } from '$lib/link/sync-now';
  import type { LastSyncView } from '$lib/link/last-sync';
  import type { SyncNeed } from '$shared/types/sync-now';
  import { createDocHandlers } from '$lib/common/use-doc-handlers';
  import { createNoteHandlers } from '$lib/common/use-note-handlers';
  import { rightPanelNotes, rightPanelPage, rightPanelTodos } from '$lib/stores/right-panel';
  import { activeDrawer } from '$lib/stores/drawers';
  import EditBoxIcon from '$lib/ui/EditBoxIcon.svelte';
  import DocForm from '$lib/doc/DocForm.svelte';
  import { openPopup, closePopup } from '$lib/ui/popup-url';
  import { errorMessage, submit, submitOrThrow } from '$lib/ui/submit';
  import { ARCHIVE_CHANGED_EVENT } from '$shared/utils/archive';
  import { acceptsDocs } from '$shared/utils/entity';
  import { isSyncHolder } from '$shared/utils/file-links';

  interface DocItem {
    readonly id: string;
    readonly title: string;
    /** A document (markdown), a spreadsheet or a drawing; a document when left out. */
    readonly bodyType?: BodyType;
    readonly content: string;
    /** Set on a sync doc: what Claude pulls from its sources. */
    readonly prompt?: string | null;
    /** The entity's sync doc: written only from the entity's sources, so it opens read-only. */
    readonly isSync?: boolean;
    /** A sync doc's last sync (doc.list). */
    readonly lastSync?: LastSyncView | null;
    /** Why a sync doc wants syncing (doc.list); null when it doesn't. */
    readonly syncNeed?: SyncNeed | null;
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


  interface LinkItem {
    readonly id: string;
    readonly url: string;
    readonly title: string | null;
    readonly syncedAt: Date | string | null;
    /** One of the entity's sync sources. */
    readonly syncSource?: boolean;
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
    readonly relations?: readonly RelationGroup[];
    /** External links; the sidebar lists them, with their source tool and last sync, and adds one by hand. */
    readonly links?: readonly LinkItem[];
    /** A wiki page that's synced (or being set up): the sidebar's Links shows and toggles its sources. */
    readonly synced?: boolean;
    /** After a file is uploaded from the sidebar's Links, with its link's id: true when it writes the page from it (an empty wiki page), which saves the file's text too. */
    readonly onFileLinkUploaded?: (linkId: string) => boolean;
    /** Links between the list and the entity in the breadcrumb, such as a wiki page's parents. */
    readonly breadcrumbTrail?: readonly BreadcrumbLink[];
    /** Markdown, shown in an outlined box above the docs list. */
    readonly description?: string | null;
    /** A small heading on that box (a project's "Brief"). */
    readonly descriptionLabel?: string;
    /** Set for archivable entities. An archived entity shows a banner and no edit button. */
    readonly archivedAt?: Date | string | null;
    readonly renderOverview: Snippet<[OverviewCtx]>;
    /** The entity's label–value metadata. It sits above the docs, under the header. */
    readonly renderMeta?: Snippet<[OverviewCtx]>;
    /** After the name and its edit button: a status, a subtitle. */
    readonly renderAssetHeader?: Snippet;
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
    relations = [],
    links = [],
    synced = false,
    onFileLinkUploaded,
    description = null,
    descriptionLabel = undefined,
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
  // The open doc lives in the URL (`?doc=<id>`) and
  // takes the pane over everything else. Notes and todos open in popups (`?popup=note`,
  // with `&note=<id>` to edit one; the app's `?popup=todo`, with `&todo=<id>`), so the page
  // and an open doc stay in view.

  const docParam = $derived(page.url.searchParams.get(DOC_PARAM));
  const activeDoc = $derived(docParam ? docs.find((d) => d.id === docParam) ?? null : null);

  // A doc that's gone (deleted, or a stale link such as an old `?doc=new`) closes.
  $effect(() => {
    if (docParam && !activeDoc) void closeDocUrl({ replace: true });
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

  // ----- Syncing the entity (a person, group, project or goal) into its one sync doc -----
  // Its prompt is on that doc; its sources are the entity's own links marked as sources, which
  // the sidebar's Links marks and the doc's banner lists. The doc is made by saving a first prompt
  // ("Sync doc…" in the Docs menu), never by hand, and only a sync writes its text.
  const syncHolder = $derived.by(() => (isSyncHolder(entityType) ? { entityType, entityId } : null));
  const syncDoc = $derived(docs.find((d) => d.isSync) ?? null);
  const syncSources = $derived(links.filter((l) => l.syncSource));
  // "Sync doc…" is open: the prompt box, until it's saved or cancelled.
  let makingSync = $state(false);

  const handleSavePrompt = async (prompt: string | null): Promise<void> => {
    const holder = syncHolder;
    if (!holder) return;
    const { docId } = await submitOrThrow(() => trpc().sync.setPrompt.mutate({ ...holder, prompt }));
    await invalidateAll();
    if (makingSync) {
      makingSync = false;
      if (docId) openDoc(docId);
    }
  };

  // A source added from the banner isn't synced yet: the next sync reads it.
  const handleAddSource = async (link: { readonly url: string; readonly title?: string }): Promise<void> => {
    const holder = syncHolder;
    if (!holder) return;
    await submitOrThrow(() => trpc().link.add.mutate({ ...holder, ...link, syncSource: true }));
    await invalidateAll();
  };

  const handleUploadSource = async (file: File): Promise<void> => {
    const holder = syncHolder;
    if (!holder) return;
    const linkId = await uploadFileLink(holder.entityType, holder.entityId, file, { syncSource: true });
    transcribeInBackground(linkId);
    await invalidateAll();
  };

  // The note popup: `?popup=note` adds one, `&note=<id>` edits that one.
  const NOTE_POPUP = 'note';
  const NOTE_PARAM = 'note';
  const editingNoteId = $derived(page.url.searchParams.get(NOTE_PARAM));
  const editingNote = $derived(editingNoteId ? notes.find((n) => n.id === editingNoteId) ?? null : null);

  const activeDocId = $derived(activeDoc?.id ?? null);

  // A doc fills the centre pane, so the metadata above it gives way.
  const docOpen = $derived(activeDoc !== null);

  const openDoc = (id: string) => { newDocId = null; void openDocUrl(id); };
  // Close a floating drawer so the editor in the center pane is reachable.
  const openNote = (id: string) => { activeDrawer.set(null); void openPopup(NOTE_POPUP, { [NOTE_PARAM]: id }); };
  const openNewNote = () => { activeDrawer.set(null); void openPopup(NOTE_POPUP); };
  const closeNotePopup = (invalidate = false) => closePopup({ invalidate, clear: [NOTE_PARAM] });
  // From the right panel: the app's todo popup (CreateTodoPopup), which takes this page's entity
  // for a new one. A floating panel closes first, so it doesn't sit over the popup.
  const openNewTodo = () => { activeDrawer.set(null); void openPopup('todo'); };
  const openEditTodo = (id: string) => { activeDrawer.set(null); void openPopup('todo', { todo: id }); };

  // Every type of doc is added the same way: made at once, empty, as "Untitled <type>", and
  // opened with its title selected to type over. Closed untouched (still empty, still that
  // title), it's deleted again, so trying "+" leaves nothing behind.
  let newDocId = $state<string | null>(null);
  const untitled = (bodyType: BodyType): string => `Untitled ${BODY_LABELS[bodyType].toLowerCase()}`;
  const handleAddDoc = async (bodyType: BodyType) => {
    await docHandlers.handleAddDoc(untitled(bodyType), bodyType, (id) => { newDocId = id; });
  };

  const activeBodyType = $derived<BodyType>(activeDoc?.bodyType ?? 'doc');

  // "From an Excalidraw link" on an empty drawing doc, as on an empty drawing page.
  const handleImportDocDrawing = async (url: string): Promise<void> => {
    const id = activeDoc?.id;
    if (!id) return;
    await submitOrThrow(() => trpc().drawing.importLink.mutate({ url, docId: id }));
    await invalidateAll();
  };

  // "Share link" on a drawing doc: the server uploads an encrypted copy to excalidraw.com.
  const handleShareDocDrawing = async (): Promise<string> => {
    const id = activeDoc?.id;
    if (!id) throw new Error('No drawing is open.');
    return (await submitOrThrow(() => trpc().drawing.shareLink.mutate({ docId: id }))).url;
  };

  // Closes the open doc, of any type, then reloads, so reopening it shows what was saved. In
  // that order: a reload started alongside the navigation cancelled it, and × did nothing.
  // A spreadsheet or drawing saves without reloading, so `activeDoc.content` is still what it
  // opened with: what it last saved decides whether it's untouched. (Judged on the loaded
  // content, a new sheet with rows typed in looked empty and was deleted on close.)
  const closeDoc = async (): Promise<void> => {
    const doc = activeDoc;
    const content = doc && savedBody?.id === doc.id ? savedBody.content : doc?.content ?? '';
    const untouched = doc !== null && doc.id === newDocId && doc.title === untitled(doc.bodyType ?? 'doc') && isEmptyBody(doc.bodyType ?? 'doc', content);
    newDocId = null;
    await closeDocUrl();
    if (untouched) await docHandlers.handleRemoveDoc(doc.id).catch(() => undefined);
    await invalidateAll();
  };

  // A spreadsheet's Save, or a drawing saving itself as it's edited; the page reloads only when
  // the doc closes, so what was saved last is kept for closeDoc.
  let savedBody: { readonly id: string; readonly content: string } | null = null;
  const handleSaveBody = async (content: string) => {
    const id = activeDoc?.id;
    if (!id) return;
    await submitOrThrow(() => trpc().doc.update.mutate({ id, content }));
    savedBody = { id, content };
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

  // ----- Writing a doc from a file link (the local Claude Code CLI, run by the server) -----
  interface PdfJob {
    readonly docId: string;
    readonly running: boolean;
    readonly notice: { readonly tone: 'warning' | 'error'; readonly message: string } | null;
  }
  let pdfJob = $state<PdfJob | null>(null);

  // Runs a conversion for the doc, showing its progress and any warning or error on the doc.
  const runConversion = async (docId: string, convert: () => Promise<string | null>): Promise<void> => {
    pdfJob = { docId, running: true, notice: null };
    try {
      const warning = await convert();
      pdfJob = warning ? { docId, running: false, notice: { tone: 'warning', message: warning } } : null;
    } catch (e: unknown) {
      pdfJob = { docId, running: false, notice: { tone: 'error', message: errorMessage(e) } };
    }
  };

  // Writes the doc from a file uploaded as a link, then reloads it.
  const runFileConversion = (docId: string, linkId: string): Promise<void> =>
    runConversion(docId, async () => {
      try {
        return await convertFileLinkAndWait(linkId, 'DOC', docId);
      } finally {
        await invalidateAll();
      }
    });

  // The newest file uploaded as a link: what "Convert with Claude" writes the doc from.
  const docFileLink = $derived(newestFileLink(docLinks));

  const handleConvertActiveDoc = async () => {
    if (activeDoc && docFileLink) await runFileConversion(activeDoc.id, docFileLink.id);
  };

  // Uploading a file to an empty doc writes the doc from it straight away.
  const handleUploadDocFile = async (file: File) => {
    const doc = activeDoc;
    if (!doc) return;
    const linkId = await uploadFileLink('DOC', doc.id, file);
    await loadDocLinks(doc.id);
    // Writing the doc saves the file's text too; otherwise save it on its own. Writing it is
    // Remry Pro (AI assist), so without it the file stays a link, its text saved.
    if (doc.content.trim() === '' && hasPro(page.data ?? {})) void runFileConversion(doc.id, linkId);
    else transcribeInBackground(linkId);
  };

  const docUploadFile = $derived(archivedAt ? undefined : handleUploadDocFile);

  // "Sync now": the local Claude rewrites the sync doc from the entity's sources; then reload.
  const handleSyncDoc = async () => {
    const holder = syncHolder;
    if (!holder) return null;
    try {
      return await syncNowAndWait(holder);
    } finally {
      await invalidateAll();
    }
  };

  // ----- A doc's edit popup: its title and Delete, as an entity's has -----
  const DOC_EDIT_POPUP = 'edit-doc';
  const openDocEdit = () => { void openPopup(DOC_EDIT_POPUP); };
  const handleDocEditSave = async (title: string) => {
    await docHandlers.handleSaveTitle(title);
    await closePopup();
  };
  // Deleting closes the doc (handleRemoveDoc), then the popup.
  const handleDocEditDelete = async (id: string) => {
    newDocId = null;
    await docHandlers.handleRemoveDoc(id);
    await closePopup();
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
    if (!isArchived) closePopup({ invalidate: true });
    else await invalidateAll();
  };

  const formatArchivedDate = (d: Date | string): string => new Date(d).toLocaleDateString('en-CA');
</script>

<svelte:head><title>{entityName}</title></svelte:head>

<DetailLayout>
  {#snippet sidebar()}
    <div class="section">
      <RelationsWidget {entityType} {entityId} groups={relations} readOnly={!!archivedAt} selfLabel={entityName} collapsible />
    </div>
    <div class="section">
      <LinksWidget {entityType} {entityId} {links} readOnly={!!archivedAt} onFileUploaded={onFileLinkUploaded} syncing={synced || !!syncDoc || makingSync} />
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
      <!-- The name, then the boxed pencil that opens the edit popup (title, details, delete,
           archive), then what the page adds after it (a status, a subtitle). -->
      <div class="asset-header-row">
        <span class="asset-h-name">{entityName}</span>
        {#if !isArchived}
          <button type="button" class="btn icon sm edit-btn" onclick={openEdit} aria-label="Edit {entityName}" title={editPopupTitle}><EditBoxIcon /></button>
        {/if}
        {#if renderAssetHeader}{@render renderAssetHeader()}{/if}
      </div>
      {#if isArchived && archivedAt}
        <p class="archived-banner">
          <span class="badge warning">Archived</span>
          <span>Archived on {formatArchivedDate(archivedAt)}. It's read-only and hidden from lists; unarchive it to make changes.</span>
          <button type="button" class="btn sm" onclick={handleToggleArchive} disabled={archiveBusy} aria-busy={archiveBusy}>{archiveBusy ? 'Saving…' : 'Unarchive'}</button>
        </p>
        {#if archiveError}<p class="inline-error">{archiveError}</p>{/if}
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
          onSelect={openDoc}
          onAdd={archivedAt ? undefined : handleAddDoc}
          onRemove={docHandlers.handleRemoveDoc}
          onReorder={docHandlers.handleReorderDocs}
          onAddSync={syncHolder && !syncDoc && !archivedAt ? () => { makingSync = true; void closeDocUrl(); } : undefined}
        />
      </div>
    {/if}

    {#if makingSync && !activeDoc}
      <section class="card">
        <SyncPrompt prompt="" links={syncSources} creating onSave={handleSavePrompt} onAddLink={handleAddSource} onUploadFile={handleUploadSource} onCancel={() => { makingSync = false; }} />
      </section>
    {/if}

    {#if activeDoc && isGridOrDrawing(activeBodyType)}
      {#key activeDoc.id}
      <DocBodyCard
        title={activeDoc.title}
        bodyType={activeBodyType}
        autoEditTitle={activeDoc.id === newDocId}
        content={activeDoc.content}
        editable={!archivedAt}
        onSave={handleSaveBody}
        onSaveTitle={docHandlers.handleSaveTitle}
        onClose={closeDoc}
        onDrawingClosed={invalidateAll}
        onShare={handleShareDocDrawing}
        onEdit={openDocEdit}
        onImportLink={handleImportDocDrawing}
        exportHref={printUrl(activeDoc.id)}
        sources={docLinks.length > 0 || !archivedAt ? bodySources : undefined}
      />
      {/key}
    {:else if activeDoc}
      <!-- Keyed, so each doc opens on its own first tab (Preview) rather than the last one's. -->
      {#key activeDoc.id}
      <DocEditor
        title={activeDoc.title}
        content={activeDoc.content}
        readOnly={activeDoc.isSync}
        hasSourceFile={!activeDoc.isSync && !!docFileLink}
        converting={pdfJob?.docId === activeDoc.id && pdfJob.running}
        convertNotice={pdfJob?.docId === activeDoc.id ? pdfJob.notice : null}
        onSave={docHandlers.handleSaveDoc}
        onSaveTitle={activeDoc.isSync ? undefined : docHandlers.handleSaveTitle}
        onConvert={handleConvertActiveDoc}
        onUploadImage={docHandlers.handleUploadImage}
        onResolveImages={docHandlers.handleResolveImages}
        onClose={closeDoc}
        sources={docLinks.length > 0 || activeDoc.isSync || !archivedAt ? docSources : undefined}
        exportHref={printUrl(activeDoc.id)}
        chartBranding={page.data.chartBranding ?? null}
        autoEditTitle={activeDoc.id === newDocId}
        onEdit={archivedAt || activeDoc.isSync ? undefined : openDocEdit}
      />
      {/key}
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
  {#if activeDoc?.isSync && activeDoc.prompt}
    <!-- The entity's sources, not the doc's: the sidebar's Links marks which links they are. -->
    <SyncPrompt prompt={activeDoc.prompt} links={syncSources} empty={!activeDoc.content.trim()} onSave={archivedAt ? undefined : handleSavePrompt} onAddLink={archivedAt ? undefined : handleAddSource} onUploadFile={archivedAt ? undefined : handleUploadSource} onSyncNow={archivedAt ? undefined : handleSyncDoc} lastSync={activeDoc.lastSync ?? null} target={syncHolder ?? undefined} onRefresh={invalidateAll} />
  {:else}
    <SourceLinks links={docLinks} onAdd={archivedAt ? undefined : handleAddDocLink} onUploadFile={docUploadFile} />
  {/if}
{/snippet}

<!-- A spreadsheet or drawing doc takes links, but isn't synced or written from a file. -->
{#snippet bodySources()}
  <SourceLinks links={docLinks} onAdd={archivedAt ? undefined : handleAddDocLink} />
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

<Popup id={DOC_EDIT_POPUP} title="Edit {BODY_LABELS[activeDoc?.bodyType ?? 'doc'].toLowerCase()}">
  {#if activeDoc}
    {#key activeDoc.id}
      <DocForm title={activeDoc.title} bodyType={activeDoc.bodyType ?? 'doc'} onSave={handleDocEditSave} onCancel={() => { void closePopup(); }} onDelete={() => handleDocEditDelete(activeDoc.id)} />
    {/key}
  {:else}
    <EmptyState message="Open a doc to edit it." />
  {/if}
</Popup>

<Popup id={editPopupId} title={editPopupTitle}>
  {@render renderEditForm({ onSuccess: handleEditSuccess, onCancel: handleEditCancel })}
  <!-- Archiving lives here, beside the form's Delete, rather than on the page; an archived
       entity has no edit button, so its banner holds Unarchive. -->
  {#if archivable && !isArchived}
    <div class="archive-row">
      <div>
        <strong>Archive</strong>
        <p class="text-sm muted">Hide it from lists and make it read-only. You can unarchive it later.</p>
      </div>
      <button type="button" class="btn sm" onclick={handleToggleArchive} disabled={archiveBusy} aria-busy={archiveBusy}>{archiveBusy ? 'Archiving…' : 'Archive'}</button>
    </div>
    {#if archiveError}<p class="form-error">{archiveError}</p>{/if}
  {/if}
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
    flex-wrap: wrap;
    gap: var(--sp-2);
    min-width: 0;
    .asset-h-name { min-width: 0; font-size: var(--fs-lg); font-weight: 600; letter-spacing: -0.01em; }
    :global(.asset-h-meta) { font-size: var(--fs-md); color: var(--text-2); }
    .edit-btn { opacity: 0; transition: opacity var(--ease); }
    &:hover .edit-btn, .edit-btn:focus-visible { opacity: 1; }
    // A touch screen has no hover.
    @media (hover: none) { .edit-btn { opacity: 1; } }
  }
  .archive-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    margin-top: var(--sp-4);
    padding-top: var(--sp-4);
    border-top: 1px solid var(--border);
    p { margin: var(--sp-1) 0 0; }
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
