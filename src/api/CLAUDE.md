# Backend Conventions — `src/api/`

## Domains

Each domain is flat until it hurts:

```
src/api/{domain}/
├── routes.ts         # tRPC router: Zod input validation, calls operations
├── operations.ts     # Business logic + Prisma queries
└── tests/            # Unit tests with a mocked registry, only for logic worth testing
```

Split into sub-domain folders with the same shape once an operations file passes ~300 lines or clearly holds unrelated noun-clusters.

Current domains, grouped into folders:

- `person` (core fields only) and `group` + `group-kind` (groups of kinds the notebook defines)
- `modules/`: what modules add to the core, today `person-extensions.ts` (org: title and lead in `org_person`; personal: birthday and known-as in `personal_person`)
- `entities/`: `ports.ts`, each type's label and archive state, which `_entity-labels` and `_archive` dispatch to
- `entity`: `entity.archive` and `entity.delete`, one archive and one delete for every type, dispatching to `setArchived` and each domain's delete. The CLI and MCP offer these instead of the per-type procedures (`APP_ONLY` in `cli/api.ts`), which the app keeps using
- `attached/` (named so, not `aux`, which Windows reserves as a device name; attach to any entity via `entityType` + `entityId`): `doc`, `note`, `todo`, `link`, `tag`, `comment`, `emoji`, `report`
- flat (infra + top-level entities): `project`, `goal`, `page` (wiki pages), `relation`, `branding`, `home`, `search`, `health`, `trpc-meta`
- `notebook`: lists, creates and renames notebooks and sets the default. It works on the notebook store (`ctx.notebooks`), not on a database. See § Notebooks.

Loose backend helpers that aren't domains use an underscore prefix:

- `_entity-labels.ts`: entity reference → display name (`resolveEntityLabel`; for a list, `resolveEntityLabels`, one query per type however many rows). Also the existence check for owners, relations and mentions.
- `_owners.ts`: `resolveOwnerInput` validates a goal or project owner (`ownerType` + `ownerId`, set together or both null); `loadOwner` returns its name and path.
- `_duplicates.ts`: the duplicate-name guard on `person.create`, `group.create` and `project.create` (`allowDuplicate` skips it).
- `_entity-cleanup.ts`: `planEntityCleanup` and `removeFiles`, for deletes (see § Deletes).

## The Registry

Every operation receives its dependencies as the first parameter, declared with `Pick`:

```ts
// src/shared/registry.ts
export interface Registry {
  readonly prisma: PrismaClient;   // SQLite via @prisma/adapter-libsql
  readonly now: () => Date;
  readonly uuid: () => string;
  readonly logger: Logger;
  readonly storage: StorageClient; // local disk under the notebook's files/ folder
}
```

```ts
export const updateNote = async (
  reg: Pick<Registry, 'prisma'>,
  id: string,
  input: { readonly content: string }
): Promise<Result<{ readonly id: string }>> => {
  const existing = await reg.prisma.note.findUnique({ where: { id } });
  if (!existing) return err(new Error('Note not found'));
  await reg.prisma.note.update({ where: { id }, data: { content: input.content } });
  return ok({ id });
};
```

- `reg` is always the first parameter. Use `Pick<Registry, ...>`, never bare `Registry`.
- Never call `new Date()`, `crypto.randomUUID()` or `console.log` in an operation. Use `reg.now()`, `reg.uuid()`, `reg.logger`.
- `new PrismaClient()` appears only in `src/shared/registry.server.ts`, which keeps one Registry per notebook: `getRegistry(notebookId)`. Outside tRPC (a load function, a script), use `getReadyRegistry(notebookId)` from `$shared/db/bootstrap.server`, which migrates that notebook first. Tests build registries with `createTestRegistry()` from `src/shared/registry.test.ts`.
- Operations never know which notebook they're in. The Registry they're given already points at one.
- There is no LLM on the registry, and there must not be one. Claude does that work from outside. The model-backed things, the web app's file conversion and page chat, are `ctx.pdfConverter` and `ctx.pageChat` on the HTTP tRPC context only (see § Files).

## Result

Operations that can fail return `Result<T>`: `ok(value)` or `err(new Error(message))`. The message travels to the UI and the CLI as JSON (`err()` makes it serializable), so write messages a reader can act on. "chart block at line 12: series.0.values has 2 values but there are 3 labels" beats "Invalid input".

## tRPC

- `src/shared/trpc/init.ts` exports `router`, `procedure`, `middleware`. There is one kind of procedure: no auth, no org scoping.
- Context is `{ reg, notebook, notebooks, pdfConverter? }` (`context.server.ts`): the Registry of the notebook the call runs against, that notebook, the notebook store, and (over HTTP only) the PDF converter. Over HTTP the notebook comes from `event.locals.notebook`; the CLI and MCP server build the context with `createNotebookContext(notebook)`. Domain routes pass only `ctx.reg`.
- Validate inputs with Zod inline in `routes.ts`. Use `z.enum(ENTITY_TYPES)` / `z.enum(TODO_STATUSES)` from `$shared/types/enums`. SQLite has no enums, so these unions are the source of truth.
- Register new routers in `src/shared/trpc/router.ts`. The CLI (`remry`) and its MCP server (`remry mcp`) call every procedure in-process through `cli/api.ts` and `createCallerFactory`, and build their help and tool lists from `src/shared/trpc/meta.ts`, so new procedures need no CLI or MCP changes.

## Polymorphic assets

Docs, notes, reports, todos, links, comments, emoji and tag attachments hang off any entity through `entityType` + `entityId`. The exception is docs on a wiki page: `addDoc` refuses a type that fails `acceptsDocs` (`$shared/utils/entity`), and `EntityDetailPage` hides the docs list for it. Prisma returns `entityType` as `string`; cast to `EntityType` when mapping to typed results. `entityPath()` (`$shared/utils/entity`) gives the app route; `resolveEntityLabel()` (`$api/_entity-labels`) gives the display name.

Goal and project owners (`ownerType` + `ownerId`) and both ends of a relation are polymorphic in the same way, with no foreign key.

## Deletes

Nothing polymorphic has a foreign key, so a delete cleans up after itself. Every delete (a person, group, project, goal or page, and a report, doc, note, todo, link or comment) calls `planEntityCleanup(reg, type, id)` and runs its `ops` in the same `$transaction` as the delete:

- delete the docs, notes, reports, todos, links and comments attached to the entity **at any depth** (a comment on a note, a todo on that comment, replies to a note), found pass by pass until a pass finds nothing new
- delete the tag attachments, emoji and page chat of the entity and of all of those
- delete relations at either end of any of them
- clear goal and project owners that point at the entity

Each statement takes at most `CLEANUP_BATCH` (5,000) ids of one type, so a delete reaching tens of thousands of rows stays under SQLite's limit on values per statement. Deleting thousands of attached rows is still slow (about 1 ms a row, growing with the search index), since each row's search trigger deletes from `search_index` by column, which FTS5 does by scanning.

Then call `removeFiles(reg, cleanup)` once the transaction commits. It removes the file folder of the deleted entity and of every doc deleted with it (`entityFileFolder`: `docs/<id>/`, `pages/<id>/`, `projects/<id>/`…, through `storage.deleteFolder`), so a file link's file goes with its entity. Their images go to the trash first (`trashImages`: one flat `trash/` folder, `trash/docs.<id>.image-….png`) and are deleted a day later (`purgeTrash`, run on every delete and every text save; pure `planTrashPurge`), so text copied from a doc deleted first can still take them (`adoptForeignImages` looks there). Nothing else a deleted entity stored stays on disk. `src/api/tests/cleanup-prisma.ts` fakes the models it touches for unit tests.

Attaching is checked the other way: `ensureAttachable` (`_archive.ts`) refuses to attach a note, doc, todo, link, tag, comment, emoji or report to an id that doesn't exist (or is archived), and `addNote` refuses a reply whose parent is on another entity.

Goals and pages move their children up to their own parent; `wouldCreateCycle` (`$shared/utils/hierarchy`) rejects a parent change that would make a loop for projects, goals and pages.

## Archiving

Person, group, project, goal and page (`ARCHIVABLE_TYPES`) have a nullable `archivedAt`. The helpers are in `_archive.ts`:

- `setArchived(reg, type, id, archived)` backs every `<type>.archive` / `<type>.unarchive` procedure. It's idempotent and keeps the first archive date.
- `archiveWhere(filter)` is the `where` fragment for a list's `archived` input (`exclude`, the default; `only`; `include`). Every top-level `list*` takes one.
- **`ACTIVE`** (`{ archivedAt: null }`) is the `where` fragment for every read that reaches an archivable entity through a relation: a lead and reports (`ORG_PERSON`), person relations, group members and a person's groups, sub-projects, sub-goals, sub-pages, a goal's projects, and relation counts (`_count: { select: { children: { where: ACTIVE } } }`). `relation.forEntity` drops an archived other end, and anything attached to an archived entity, with `loadArchivedIds` + `isArchivedRef`. An archived entity shows only on its own page and in lists asked for archived ones. Kind counts (`groupCount`, `relationCount`) still count archived rows on purpose: they decide whether a kind can be deleted. **`tests/integration/archive-leaks.test.ts`** links an archived entity of each type to active ones and fails if any read returns one; add a new relation read to its `reads`.
- `ensureWritable(reg, entityType, entityId)` / `ensureAllWritable` refuse a write to an archived entity **or to anything attached to it**. Call one in every update, membership change and attached-item create/update/remove, before writing. Types that can't be archived pass. Deletes don't check: deleting an archived entity is allowed.
- `loadArchivedIds` + `notAttachedToArchived(ids)` leave rows attached to archived entities out of cross-entity queries (home feed, open todos, `todo.list`).
- Relations check only the `from` end, so a relation can point at an archived entity (it's hidden from reads, and shows again on unarchive).

Archiving is not a status. `Project.status` is one of six (`proposed committed in-progress blocked done abandoned`, `$shared/utils/project-status`) and separate; don't derive one from the other. `createProject` and `updateProject` map common words onto them (`active` → `in-progress`) and refuse anything else with an error naming the six; the `project_statuses` migration mapped what was stored before, and a unit test keeps its word list in step with the code's.

## Relations and mentions

A `Relation` is a link (`fromType`/`fromId` → `toType`/`toId`) between any two entities, with a `kind` and an optional `note`, unique per pair and kind. Its kinds are fixed in code (`RELATION_LABELS`, `$shared/types/relations`): `RELATED` (no direction, so `findDuplicate` in `relation/operations.ts` also checks the reverse pair), `DEPENDS_ON`, and the derived `MENTIONS`. The ends are polymorphic, so there are no foreign keys; `_entity-cleanup.ts` removes an entity's relations when it's deleted. `relation.forEntity` groups by the label from the asking entity's side, and for a person includes their person relations (items with `personRelation: true`), so the Related sidebar, the focus graph and recall read one list.

### Person relations

Relationships between two people are `person_relation` (`person-relation/operations.ts`, `personRelation.add/update/remove/forPerson`), with real foreign keys: deleting a person deletes their relationships in the database, and a relationship to a missing person or to oneself is refused. There's no history: ending one deletes it.

- **Kinds are data:** `person_relation_kind` (`person-relation-kind/operations.ts`, `personRelationKind.*`), a `label` read from the `from` person and an `inverseLabel` from the `to` person, `symmetric` and `exclusive`. Direction and one-each are set at create; `update` changes labels and order; `delete --moveTo` moves a kind's relationships (not into a one-each kind), dropping any that would repeat one. Modules seed theirs (`ModuleDefinition.personRelationKinds`, through `seedPersonRelationKinds` in `notebook.create` and `setProfile`): org brings `LEAD_OF` ("Lead of" / "Reports to", one each), personal brings partner, parent, sibling, friend and in-law kinds.
- **Symmetric** kinds are stored with the smaller person id first (`orderedEnds`, `$shared/types/person-relations`), so the unique index covers both directions; a trigger refuses a row stored the other way.
- **One each** (`exclusive`): the `to` person has one relationship of the kind at most. `personRelation.add` and `update` replace the old one in the same transaction and return it as `replaced`; a trigger refuses a second one written around the app (the libsql adapter reports a trigger's failure as a foreign key error). A one-each kind forms a tree, so the operations also refuse a loop (`wouldLoop`: someone leading a person above them). SQLite triggers can't recurse, so the loop check is app code.
- **Leads** are `LEAD_OF` person relations; `org_person` keeps only `title`. The org extension reads leads and reports from them and writes `extensions.org.leadId` through `setExclusiveRelation` (`ORG_PERSON` in `modules/person-extensions.ts`), so the org map and `person.update --extensions` work unchanged.
- **Me.** `person.is_me` marks the notebook's owner (`person.setMe`, at most one). `person.list` and `person.get` return `toMe`: each relationship between that person and me, labelled from their side ("Child of", "Reports to"; `relationsToPerson`).

- `MENTIONS` relations are derived. `syncMentions` (`relation/mentions.ts`) runs whenever page, doc, note or report content is saved. It reads app links with `extractEntityLinks` (`$shared/utils/mentions`, which skips code blocks and uses `parseEntityPath`), keeps the ones whose entity exists, and replaces that source's `MENTIONS` rows. Nothing matches by title, so a rename needs no rescan.
- `relation.add`, `update` and `remove` refuse `MENTIONS`; only the sync writes them.
- Any new content save must call `syncMentions` after it writes.

## Search

`search.query` and `search.recall` (`search/`) read one FTS5 table, `search_index`: a row per entity, note, doc, report, todo, comment, link and goal check-in, with `entity_type`, `entity_id`, `parent_type`/`parent_id` (what an attachment hangs off), `title` and `body`. It uses the porter tokenizer with diacritics removed, so "leaving" finds "leave" and "cafe" finds "café".

- **Triggers keep it current.** The `add_search_index` migration puts `AFTER INSERT/UPDATE/DELETE` triggers on every indexed table and backfills existing rows. No operation writes to the index, so a new write path needs nothing. `page_chat`, relation notes and tag names aren't indexed.
- **Raw input never reaches `MATCH`.** `buildFtsQuery` (`search/fts-query.ts`) rebuilds the query from its letters and digits: words ANDed with a prefix match, `"phrases"`, `OR`, `-exclude`. `phraseQuery` quotes a name.
- **Filters run in SQL:** types (reports only while `features.reports` is on), `within` one entity and its attachments, and hidden ids (archived entities and what's attached to them, from `loadArchivedIds`). Ranking is `bm25` with titles weighted 10×.
- `search.recall` gathers one entity for Claude: the type's own `get`, its attachments (capped, with `truncated`; links carry `syncedAt` and `sourceEditedAt`, so Claude sees which sources to check and what to compare, and `docSources` are the links on its docs, each with its `docId`), relations, owned goals and projects, and `unlinkedMentions`, a phrase search for its name that leaves out the entity, what's attached to it, and sources that already link to it (MENTIONS).
- **Indexing a new table or field** takes a new migration: drop and recreate the affected triggers, then `DELETE FROM search_index WHERE entity_type = '<TYPE>'` and backfill with an `INSERT … SELECT`. Add the table to the trigger list in `tests/integration/search.test.ts`, the type to `SEARCH_TYPES` (`$shared/types/search`), and its path to `hitPath`.
- Prisma doesn't know about any of this; see `prisma/CLAUDE.md` § Migrations.

## Notebooks

A notebook is a folder, `<data dir>/Notebooks/<id>/`, holding `notebook.json` (name, profile, createdAt), `working-notes.db` and `files/`. The default notebook is in `<data dir>/settings.json`. The code lives in `src/shared/notebooks/`:

- `id.ts`: `isNotebookId` (1–40 lowercase letters, digits and dashes) and `notebookIdFromName`. Client-safe.
- `resolve.ts`: `resolveNotebook`, pure. Named on the call (id, or a name matching exactly one notebook), then `REMRY_NOTEBOOK`, then the UI cookie, then the default. An unknown named notebook is an error listing the ones that exist.
- `layout.ts` / `layout.server.ts`: `planLayout` (pure) and `ensureLayout`, which moves a pre-notebooks data directory into `work-work` and makes sure a default exists.
- `store.server.ts`: `NotebookStore`, the raw filesystem reads and writes. `$api/notebook/operations` does the validation and writes the messages.
- `current.server.ts`: `getNotebookStore`, `readNotebooks` and `resolveCurrentNotebook`. Every entry point resolves through these, so the layout is always in place first.
- `handle.server.ts`: `notebookHandle`, which sets `event.locals.notebook` for each request.

There is no `notebook.delete`, on purpose: Claude should never be one tool call away from removing a whole notebook.

`profile` (`work` or `home`; missing reads as `work`) is set by `notebook.create --profile` and `notebook.setProfile`, both of which seed the profile's group and person relation kinds through the `setUpModules` dep.

## Modules

A profile is a list of modules (`MODULES_BY_PROFILE`, `$shared/modules/model`): `work` = `org` + `goals`, `home` = `personal`. `notebookModel(profile)` merges the core with them: entity types shown, nav, person fields, person relation kind seeds, group kind seeds, home widgets, and which module owns a route or procedure.

- **The core never reads module data.** `person` has only name and email; a module's person fields live in its own table and go through its `PersonExtension` (`modules/person-extensions.ts`: `load`, `detail`, `update`, `structuralLinks`). `person.create/update --extensions '{"org":{…}}'` validates each module's patch (`personExtensionsPatch`, `$shared/types/person`), and the route refuses a module the notebook doesn't have.
- **Gate:** `ctx.model` is on the tRPC context; `moduleGate` in `$shared/trpc/init.ts` throws FORBIDDEN, with `notInModelMessage`, for a procedure an absent module owns (`goal.*` in a home notebook). The CLI and MCP keep one tool list.
- **Graph:** `getFocusGraph(reg, model, focus?)` leaves out types the model doesn't show and adds only active modules' person links. A person's groups appear under their kind's name (Team, Family).
- **Adding a module:** a `ModuleDefinition` in `$shared/modules/`, its entry in `MODULES` and a profile; a person extension (and an extension table, its search triggers, and its columns in the `person_search` view) when it adds person fields.

## Groups

`group` rows have a `kind` (a key into `group_kind`: name, plural, `exclusive`). Teams and departments are groups of kind TEAM and DEPARTMENT (exclusive); old `/app/teams/<id>` and `/app/departments/<id>` links parse as GROUP and redirect. `group.addMember` in an exclusive kind removes the person's other membership of that kind in the same transaction and returns `replaced`. `groupKind.update --exclusive true` is refused while someone is in two groups of the kind; `groupKind.delete` while groups use it, unless `moveTo`.

## Wiki pages

A page is a document or a spreadsheet, with no kinds or fields. Page kinds (`page_kind`, `page.kind`, `page.properties`, `page.query`) were removed in 0.16.42: the `drop_page_kinds` migration writes each page's kind and filled-in values into the top of its text as a list, then drops them. It isn't additive, so an older Remry refuses a notebook that has it.

- **Body type:** `page.body_type` is `doc` (markdown in `content`) or `sheet` (a spreadsheet's JSON in `content`: columns, raw cells and the values they showed; `$shared/utils/sheet`). `prepareContent` validates either and normalises a sheet before it's stored; sheets skip chart validation and `syncMentions`. `bodyType` changes only while `isEmptyBody`. The `page_body_type` migration's search triggers index a sheet's `values`, not its JSON.

## Sync docs

`doc.prompt` and `page.prompt` (nullable, up to 2000 characters, `synthesis_prompt` migration) mark a doc or wiki page as a **sync doc**, kept in sync with its linked sources: the prompt says what Claude takes from each when it rewrites the text (the skill's **Sync docs**; the concept was called a synthesis until 0.16.38, hence the migration's name). `doc.update` and `page.update` set it, trimmed, and blank or null clears it; `doc.get`/`doc.list`, `page.get` and `search.recall`'s docs return it. The app never acts on it: it only shows it (`SyncPrompt`). It isn't indexed for search.

## Recurring todos

`todo.recurrence` is `WEEKLY | MONTHLY | QUARTERLY | YEARLY` or null. Completing a recurring todo creates the next one (`nextOccurrence` in `$shared/utils/recurrence`, from its `targetDate`, else now) in the same transaction, and moves the recurrence to it, so reopening the old one doesn't make a second.

## Files

`reg.storage` stores bytes under the notebook's `files/<key>` (`~/Library/Application Support/Remry/Notebooks/<id>/files`). Keys don't include the notebook, and the files route reads from the request's notebook. Keys look like `docs/<docId>/file-<uuid>.pdf`, `projects/<id>/file-<uuid>.csv` or `branding/<id>/logo-<uuid>.png`. The storage client rejects keys that resolve outside the files root. Hand clients a URL with `fileUrl(key)` (`$shared/utils/files`), which is served by `src/routes/files/[...key]/+server.ts`.

- **Files as links:** the one way a file is attached. A file uploaded from "+ Add link" on a person, group, project, goal, wiki page or doc (`FILE_LINK_HOLDERS`) is a link (`link.upload`, `uploadLinkFile`, taking `text` for a text file's contents (`textSourceFile`, no base64) or `dataBase64` for any readable file's bytes, exactly one): the file goes in the entity's own folder, `docs/<id>/file-<uuid>.<ext>`, `pages/<id>/…`, `people/<id>/…`, `groups/…`, `projects/…`, `goals/…` (`entityFileFolder`, `$shared/utils/file-links`), and the link row points at it, `url: storage://<key>`, `title` the file's name. Any file Claude can read (`decodeSourceFile`); others are refused. It lists, opens (`linkHref`: the files route) and is removed like any link; removing it deletes the file (only ever one in the entity's own folder), and deleting the entity takes the folder. `link.add` refuses a hand-typed `storage://` address. **Saved text:** `link.text` is a file link's text, so a read needn't open a PDF or image again: a text file's own text, set at upload; a PDF's or image's markdown, set by `link.update --text` (`updateLink`, which refuses it on an outside link; null or blank clears it), by `link.transcribe` (app-only, `transcribeFileLink`, job key `<notebook>/LINK:<id>`, polled with `link.conversion --entityType LINK`), or by `link.convert`, which saves it along with the page and writes a page from it without Claude when it's already there (not for a text file, whose saved text is the raw file, a CSV that still needs Claude to become a page). The prompt (`pdfPrompt`) marks what text can't hold with `[Figure: …]` lines. `link.list` and `link.find` say `hasText` and never return the text. The link search triggers index it after the URL (`link_text_and_source_edited` migration). `link.read` (`readLinkFile`) returns the saved text first (`savedTextOf: pdf | image`), or with `original: true` or none saved, the file: a text file's text (cut at `READ_TEXT_LIMIT`, `truncated`), or an image (up to 5 MB) or PDF (up to 20 MB) as an `attachment` (`mimeType`, `dataBase64`, and `textSaved`), which the MCP server sends as an image part or an embedded PDF resource (`withAttachment` in `cli/mcp-protocol.ts`) rather than base64 in the JSON. `link.convert` and `link.conversion` (`link/convert.ts`, app-only, job key `<notebook>/<TYPE>:<id>`) write the doc or document page from it with the local Claude: they look for `claude` (`findClaude` in `$shared/assist/claude-cli`; without it, `{ started: false, warning }`), then start a background job (`$shared/assist/pdf-converter.server`, named for its first use) that runs `claude -p` in the file's folder with only the Read tool and saves the markdown through `updateDoc` or `updatePage`. A person's, group's, project's or goal's files are kept as they are. A doc's attached PDF (`doc.attachSource`, `doc.convertPdf`, `sourceUrl`) is gone: the `doc_sources_to_links` migration made each one a file link titled "Original.pdf", and the column stays, empty.
- **Page chat** (`api/assist/chat.ts`, `ctx.pageChat`, web app only like the converter): each entity has one saved conversation, a `PageChat` row with the messages as JSON. `chat.send` takes the entity, the page's visible text and the new message; it stores the message and starts a background `claude -p` job (`$shared/assist/page-chat.server`) with the prompt (the page and the last `CHAT_LIMITS.messages` messages) on stdin and no tools. The job appends the reply to the row (`saveChatReply`, a no-op if the chat was cleared meanwhile) before it reads as done. The UI polls `chat.status` with the returned `chatId`, which reports `done` with the reply (or `failed`) once. `chat.get` loads the conversation and whether a reply is still running; `chat.clear` deletes it. Without `claude`, `chat.send` warns and stores nothing. Chatting doesn't check `ensureWritable`: it never changes the entity.
- **Ask** (`api/assist/ask.ts`, `chat.ask`, web app only, gated as `search`): the ⌘K finder's `/ask`. It turns the question into an any-word search (`askSearchQuery`), takes the top `ASK_LIMITS.sources` index hits with longer snippets (`snippetTokens: 64`), and starts a `claude -p` job through the same `PageChat` with `askPrompt` (`$shared/assist/claude-cli`), which tells Claude to answer once from those hits and link each one by its app path. Its id is `ask-<uuid>`; the UI polls `chat.status` with it. Nothing is stored. Both features run `claude` through `$shared/assist/claude-process.server`.
  - `chat.*` and `link.convert`/`link.conversion` are excluded from the CLI and MCP in `cli/api.ts`.
  - `storage.pathFor(key)` gives the file's path on disk.
- **Editor images:** an image pasted or dropped into a doc or a wiki page's content shows from a `blob:` address until save, when the editor uploads it (`doc.uploadImage`, `page.uploadImage`; `storeEditorImage` in `_images.ts`, under `docs/<id>/` or `pages/<id>/`) and writes `storage://<key>` in its place. Claude uploads one from a chat the same way (both are MCP tools); Every image upload goes through `decodeUpload` (`_uploads.ts`): it takes a `data:` URL and line breaks, refuses text that isn't base64 or bytes that aren't a kind the call accepts (`sniffFileType`: PNG, JPEG, GIF, WebP, PDF), with what to do, and stores the type the bytes are (the `contentType` inputs are optional). An image upload's result carries `markdown` to put in the content. A `blob:` address lasts only as long as its tab, so the editor refuses to save one it can't upload, and `refuseBlobUrls` rejects doc and page content that still holds one. A new doc (`?doc=new`) has no id until it's saved, so `EntityDetailPage` creates it on the server, unopened, when its save starts (`handleCreateDraftDoc`), uploads its images there, then fills in its title and text and opens it (`handleFinishDraftDoc`); a draft closed after that is deleted (`handleDiscardDraftDoc`). Before 0.16.11 wiki pages saved the `blob:` address itself, so some content still holds dead ones; those would make the page unsaveable, so the editor turns any `blob:` image that was already in the content when it loaded into an italic "Image lost: <name>. Paste it again." on save, and `MarkdownRenderer` shows the same note for a `blob:` image that won't load (`lib/doc/lost-images.ts`, pure). After each save of a doc's or page's text, `tidyEditorImages` moves images no longer in it to the folder's `removed/` (so an undo can bring them back on the next save), and deletes ones that have sat there over a day (`planImageTidy`, pure). Only `image-*` files move; file links' files stay.
- **Moving a doc, and images from elsewhere:** `doc.update --entityType --entityId` moves a doc to a person, group, project or goal (`DOC_HOLDERS`; a wiki page takes no docs), last in its list. It keeps its id, so its `docs/<id>/` folder, links (file links among them), notes and prompt go with it. Before, Claude moved a doc by copying its text into a new doc and deleting the old one, and the copy's images were deleted with the old doc's folder. So every save of doc or page text (`updateDoc`, `createPage`, `updatePage`) also runs `adoptForeignImages`: an image the text shows from another doc's or page's folder (`foreignImagesIn`, pure; it also looks in that folder's `removed/`) is copied into this one's folder and the text points at the copy. It also looks in the trash, so the order of a copy and a delete doesn't matter within a day. One gone for good stays as it is.
- **Branding:** images upload as base64 through `branding.uploadImage`, which returns a storage key. `branding.update` saves the key and deletes any file it replaces.

## Reports

A `Report` is markdown attached to an entity, with an optional `brandingId`. `getReport` resolves branding as: the report's own, else the default profile, else none. The print view is `/app/reports/<id>/print`.

`createReport`, `updateReport`, `createPage` and `updatePage` run `validateChartBlocks` (`$shared/types/charts`) and reject the write if any chart block is invalid. Chart blocks are fenced `chart` code blocks containing JSON:

````markdown
```chart
{
  "type": "bar",
  "title": "Velocity",
  "labels": ["Sprint 1", "Sprint 2", "Sprint 3"],
  "series": [
    { "label": "Committed", "values": [30, 32, 28] },
    { "label": "Delivered", "values": [21, 34, 29] }
  ],
  "min": 0
}
```
````

- `type`: `bar` | `line` | `radar`
- `labels`: 1–100 strings
- `series`: 1–6 series, each with exactly one number per label, an optional `label` and an optional `color` (`#rrggbb`)
- Optional: `title`, `min`, `max`. No other keys are allowed.
- Charts render in brand colours in the editor, in doc/note views and in the print view. A series with a `color` draws its line, bars or area in that colour instead; the others fade from the brand colour.
- Legacy `[chart:key]` tags (`avg_by_section`, `scores:<section>`, `radar:<section>`) render survey sections and are reserved for results imported from form-engine.

## Adding a domain

1. `prisma/schema.prisma` model + `bun run db:migrate --name <change>`
2. `src/api/{domain}/operations.ts` — operations take `reg: Pick<Registry, ...>` first and return `Result`
3. `src/api/{domain}/routes.ts` — Zod inputs, call operations with `ctx.reg`
4. Register the router in `src/shared/trpc/router.ts`
5. Shared interfaces in `src/shared/types/{name}.ts`, components in `src/lib/{domain}/components/`, stores in `src/lib/stores/`
6. Tests: unit tests only for real logic; add to the integration smoke tests if it's a core flow
7. If it's a new entity type:
   - add it to `ENTITY_TYPES` (and `RELATABLE_TYPES` if relations can point at it)
   - add it to `ROUTE_SEGMENTS` and `TYPE_LABELS` in `src/shared/utils/entity.ts`, which drive `entityPath()`, `parseEntityPath()` and `entityTypeLabel()`
   - add a case to `resolveEntityLabel()`
   - call `planEntityCleanup` in its delete
   - add a list + detail page using `EntityDetailPage`, and add it to the `AppShell` nav
