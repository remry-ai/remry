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
- `attached/` (named so, not `aux`, which Windows reserves as a device name; attach to any entity via `entityType` + `entityId`): `doc`, `note`, `todo`, `link`, `tag`, `comment`, `emoji`, `report`
- flat (infra + top-level entities): `project`, `goal`, `page` (wiki pages), `page-kind` (each notebook's page kinds), `relation`, `branding`, `home`, `search`, `health`, `trpc-meta`
- `notebook`: lists, creates and renames notebooks and sets the default. It works on the notebook store (`ctx.notebooks`), not on a database. See § Notebooks.

Loose backend helpers that aren't domains use an underscore prefix:

- `_entity-labels.ts`: entity reference → display name. Also the existence check for owners, relations and mentions.
- `_owners.ts`: `resolveOwnerInput` validates a goal or project owner (`ownerType` + `ownerId`, set together or both null); `loadOwner` returns its name and path.
- `_entity-cleanup.ts`: `planEntityCleanup`, `relationCleanupOp` and `removeFiles`, for deletes (see § Deletes).

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
- There is no LLM on the registry, and there must not be one. Claude does that work from outside. The one model-backed thing, the web app's PDF conversion, is `ctx.pdfConverter` on the HTTP tRPC context only (see § Files).

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

Nothing polymorphic has a foreign key, so a delete cleans up after itself. Every delete of a person, group, project, goal, page or report calls `planEntityCleanup(reg, type, id)` and runs its `ops` in the same `$transaction` as the delete:

- delete the docs, notes, reports, todos, links, tag attachments, comments, emoji and page chat attached to the entity
- delete relations at either end
- clear goal and project owners that point at it

Then call `removeFiles(reg, cleanup.files)` for the attached docs' PDFs once the transaction commits. Doc and note removal use `relationCleanupOp` alone. Goals and pages move their children up to their own parent; `wouldCreateCycle` (`$shared/utils/hierarchy`) rejects a parent change that would make a loop for projects, goals and pages.

## Archiving

Person, group, project, goal and page (`ARCHIVABLE_TYPES`) have a nullable `archivedAt`. The helpers are in `_archive.ts`:

- `setArchived(reg, type, id, archived)` backs every `<type>.archive` / `<type>.unarchive` procedure. It's idempotent and keeps the first archive date.
- `archiveWhere(filter)` is the `where` fragment for a list's `archived` input (`exclude`, the default; `only`; `include`). Every top-level `list*` takes one.
- `ensureWritable(reg, entityType, entityId)` / `ensureAllWritable` refuse a write to an archived entity **or to anything attached to it**. Call one in every update, membership change and attached-item create/update/remove, before writing. Types that can't be archived pass. Deletes don't check: deleting an archived entity is allowed.
- `loadArchivedIds` + `notAttachedToArchived(ids)` leave rows attached to archived entities out of cross-entity queries (home feed, open todos, `todo.list`).
- Relations check only the `from` end, so a relation can point at an archived entity.

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
- `search.recall` gathers one entity for Claude: the type's own `get`, its attachments (capped, with `truncated`), relations, owned goals and projects, and `unlinkedMentions`, a phrase search for its name that leaves out the entity, what's attached to it, and sources that already link to it (MENTIONS).
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

`profile` (`work` or `home`; missing reads as `work`) is set by `notebook.create --profile` and `notebook.setProfile`, both of which seed the profile's group kinds (and the starter page kinds for work) through the `setUpModules` dep.

## Modules

A profile is a list of modules (`MODULES_BY_PROFILE`, `$shared/modules/model`): `work` = `org` + `goals`, `home` = `personal`. `notebookModel(profile)` merges the core with them: entity types shown, nav, person fields, person relation kind seeds, group kind seeds, home widgets, and which module owns a route or procedure.

- **The core never reads module data.** `person` has only name and email; a module's person fields live in its own table and go through its `PersonExtension` (`modules/person-extensions.ts`: `load`, `detail`, `update`, `structuralLinks`). `person.create/update --extensions '{"org":{…}}'` validates each module's patch (`personExtensionsPatch`, `$shared/types/person`), and the route refuses a module the notebook doesn't have.
- **Gate:** `ctx.model` is on the tRPC context; `moduleGate` in `$shared/trpc/init.ts` throws FORBIDDEN, with `notInModelMessage`, for a procedure an absent module owns (`goal.*` in a home notebook). The CLI and MCP keep one tool list.
- **Graph:** `getFocusGraph(reg, model, focus?)` leaves out types the model doesn't show and adds only active modules' person links. A person's groups appear under their kind's name (Team, Family).
- **Adding a module:** a `ModuleDefinition` in `$shared/modules/`, its entry in `MODULES` and a profile; a person extension (and an extension table, its search triggers, and its columns in the `person_search` view) when it adds person fields.

## Groups

`group` rows have a `kind` (a key into `group_kind`: name, plural, `exclusive`). Teams and departments are groups of kind TEAM and DEPARTMENT (exclusive); old `/app/teams/<id>` and `/app/departments/<id>` links parse as GROUP and redirect. `group.addMember` in an exclusive kind removes the person's other membership of that kind in the same transaction and returns `replaced`. `groupKind.update --exclusive true` is refused while someone is in two groups of the kind; `groupKind.delete` while groups use it, unless `moveTo`.

## Page kinds and datasets

A page's `kind` is a key into the notebook's `page_kind` table (`key`, `name`, `description`, `fields` as JSON). `GENERAL` is built in (`GENERAL_KIND`, no fields) and never stored. Field definitions and their Zod schemas are in `$shared/types/pages` (`pageKindFieldSchema`, `parsePageProperties(kind, input)`); `page/operations.ts` loads the kind with `getPageKind` before every create, update or kind change. The `add_page_kinds` migration gave notebooks that already had data the four kinds that used to be constants (`STARTER_KINDS`).

- `page-kind/operations.ts` keeps pages valid when a kind changes: `planFieldChange` (pure) refuses to drop an option or change an input while pages have values, naming them; removed fields are stripped from pages in the same transaction (`fitProperties`). `pageKind.delete` refuses while pages use the kind, unless `moveTo` names a kind to move them to.
- `page.query` runs the pure `$shared/utils/dataset` (`filterRows`, `sortRows`, `groupRows`, `totalsFor`) over one kind's pages. Its filters, sort and aggregates are strings (`field:op:value`, `field:desc`, `field:sum`) so the CLI, MCP and the wiki's URL share one form; the parsers return errors that list the kind's fields.

## Recurring todos

`todo.recurrence` is `WEEKLY | MONTHLY | QUARTERLY | YEARLY` or null. Completing a recurring todo creates the next one (`nextOccurrence` in `$shared/utils/recurrence`, from its `targetDate`, else now) in the same transaction, and moves the recurrence to it, so reopening the old one doesn't make a second.

## Files

`reg.storage` stores bytes under the notebook's `files/<key>` (`~/Library/Application Support/Remry/Notebooks/<id>/files`). Keys don't include the notebook, and the files route reads from the request's notebook. Keys look like `docs/<docId>/source-<uuid>.pdf` or `branding/<id>/logo-<uuid>.png`. The storage client rejects keys that resolve outside the files root. Hand clients a URL with `fileUrl(key)` (`$shared/utils/files`), which is served by `src/routes/files/[...key]/+server.ts`.

- **Docs:** `attachSourcePdf` stores the PDF and sets `sourceUrl`; it never converts. From the CLI or MCP, Claude reads the PDF and calls `doc.update`.
- **Converting a PDF in the web app** (`attached/doc/convert.ts`):
  - `doc.convertPdf` starts by looking for `claude` (`findClaude` in `$shared/assist/claude-cli`: PATH, then where installers put it). Without it, the result is `{ started: false, warning }`.
  - Otherwise it starts a background job (`$shared/assist/pdf-converter.server`) that runs `claude -p` in the PDF's folder with only the Read tool, and saves the markdown through `updateDoc`. The UI polls `doc.pdfConversion`.
- **Page chat** (`api/assist/chat.ts`, `ctx.pageChat`, web app only like the converter): each entity has one saved conversation, a `PageChat` row with the messages as JSON. `chat.send` takes the entity, the page's visible text and the new message; it stores the message and starts a background `claude -p` job (`$shared/assist/page-chat.server`) with the prompt (the page and the last `CHAT_LIMITS.messages` messages) on stdin and no tools. The job appends the reply to the row (`saveChatReply`, a no-op if the chat was cleared meanwhile) before it reads as done. The UI polls `chat.status` with the returned `chatId`, which reports `done` with the reply (or `failed`) once. `chat.get` loads the conversation and whether a reply is still running; `chat.clear` deletes it. Without `claude`, `chat.send` warns and stores nothing. Chatting doesn't check `ensureWritable`: it never changes the entity. Both features run `claude` through `$shared/assist/claude-process.server`.
  - `chat.*` and the converter's procedures are excluded from the CLI and MCP in `cli/api.ts`.
  - `storage.pathFor(key)` gives the file's path on disk.
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
