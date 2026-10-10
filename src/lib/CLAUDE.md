# Frontend Conventions — `src/lib/`

`src/lib/` holds frontend code: components (per domain), stores (centralized), and chart rendering. Anything the backend also imports belongs in `src/shared/`.

```
src/lib/
├── stores/            # ALL Svelte stores — centralized
├── common/            # App-wide components (shell, entity detail page, editors, renderers)
├── report/            # chart-render.ts + report components
├── {domain}/components/
└── shared/components/ # Reusable, logic-free components (Milkdown editor + plugins)
```

## Data access

Components call the API through `trpc()` from `$shared/trpc/client` (a browser singleton; pass SvelteKit's `fetch` in load functions). The client always sends the `x-remry` header; never call `/api/trpc` with a bare `fetch`.

There is no session, user or org anywhere in the UI, and nothing is gated on ownership: everything is editable.

The one app-wide context is the open notebook. The `/app` layout provides `data.notebook` and `data.notebooks`, and the server picks the notebook for every request, so components never pass it to the API.
- Switch with `switchNotebook(id)` (`$lib/notebook/switch`). It's a full page load, so no ids, lists or popups from the old notebook carry over. Never edit the cookie or `?notebook=` yourself.
- Anything cached in the browser must be keyed by notebook id (QuickFinder's localStorage is).
- The layout also applies the notebook's default branding: its primary colour replaces the `--accent*` tokens (and `--focus`), and its accent colour the `--selected*` tokens, through `.branded` in `styles/_tokens.scss`. Components keep using the accent tokens and never read branding colours for app chrome.
- `notebook/components/`: `NotebookSwitcher` (the chevron beside the notebook title in the top bar, props `current`, `notebooks`; it also links to the License page, which is kept out of the nav), `NotebookForm` (create, or rename with `initial`), and `NewNotebookPopup` (global `?popup=new-notebook`; opens the new notebook).

## Stores

`stores/notebook-model.ts` gives `$model`, the open notebook's `NotebookModel` (`$shared/modules/model`): `$model.has('goals')`, `$model.shows(type)` (the finder, `AddRelation`, the focus graph's picker and `RelationsWidget` leave out types the notebook doesn't have), `$model.nav`, `$model.personFields` (the columns and inputs modules add to people; read them with `$lib/person/fields`), `$model.personRelationKinds` (the kinds the notebook's modules seed; the notebook's own list is `personRelationKind.list`). Ask the model, never the profile. Load functions use `notebookModel(locals.notebook.profile)`; module-owned routes are guarded once, in the `/app` layout (`requireRoute`, `$lib/modules/guard`).

Use classic Svelte stores (`writable`, `readable`, `derived`), not rune modules. Entity caches use a normalized `{ [entityType]: { [id]: entity } }` shape, and lists hold ids.

## Svelte

- Svelte 5 syntax: `$props()`, `$state()`, `$derived()`, `{@render children()}`
- `<style lang="scss">`, scoped. Breakpoint mixins from `src/routes/_variables.scss` are auto-injected.
- Keep components small; heavy logic goes in stores or utils.

## Design system

Global styles live in `src/routes/styles/` (see `src/routes/CLAUDE.md`). Components only use the tokens and classes below; no hex, rgba or pixel literals for colour, type, spacing or radius.

- **Tokens** (`styles/_tokens.scss`, CSS custom properties on `:root`): surfaces `--bg --surface --surface-2 --surface-hover --surface-inset`; text `--text --text-2 --text-3`; borders `--border --border-strong`; accent `--accent --accent-hover --accent-soft --accent-text`; selected `--selected --selected-hover --selected-text` (the current option of a toggle: the accent by default, the branding's accent colour when branded); status `--danger --success --warning` (+ `-soft`); categorical `--viz-1..4`; type `--fs-xs/sm/md/base/lg/xl` (11–20px on a 14px root); space `--sp-1..10` (4px grid); radius `--r-sm/md/lg/full`; `--shadow-1..3`, `--focus`, `--scrim`, `--ease`; sizes `--control-h` (32px), `--control-h-sm` (26px), `--nav-h`, `--sidebar-w`, `--panel-w`; layers `--z-*`. A dark theme is a `[data-theme="dark"]` block reassigning the colour rows.
- **Buttons:** a bare `<button>` is a reset (no background, border or padding). Add `.btn` for a control, plus `primary`, `ghost`, `danger` (`danger solid` for filled), `link`, `sm`, `icon`, `block`. Loading is `aria-busy` plus a text swap. `.btn` also works on `<a>`.
- **Inputs** are styled at the element level (32px). Add `.sm` for 26px inline rows. Wrap label + control in `Field` (`$lib/ui/Field.svelte`), lay out with `.form-grid`, `.form-row` (`.thirds`) and `.form-actions`; show failures with `.form-error`.
- **Mutations** go through `submit()` from `$lib/ui/submit`, which turns both `Result`-returning and throwing procedures into `{ ok, value } | { ok, error }` so every form renders its error.
- **Layout classes** (`styles/_layout.scss`): `.page`, `.page-header`, `.card` (`compact`, `hover`), `.section` + `.section-header` (with `.count`), `.eyebrow`, `.list` + `.list-row` (`.grow`, `.meta`, `.row-actions` shown on hover, `.active`; table rows take `.row-actions` and `.active` too; `.list.divided` for bordered rows), `.badge` (`accent success warning danger muted`), `.meta-list` (an entity's label–value metadata, one wrapping row), `.empty` (`boxed`), `.tabs` + `.tab`, `.toolbar`, `.drawer-handle`, `.drawer-backdrop`, utilities `.muted .text-2 .text-xs .text-sm .mono .truncate .pre-line .ml-auto`. Put `.pre-line` on every plain-text description so its line breaks show.

### UI primitives (`src/lib/ui/`)

| Component | Props | Use for |
|---|---|---|
| `Field` | `label`, `hint?`, `error?`, children snippet `({ id })` | every labelled form control |
| `InlinePicker` | `label`, `options: {id,name,group?}[]`, `placeholder?`, `onPick(id)` | single-pick relationship edits (assign lead, add member, set parent). Options with a `group` render in an `<optgroup>`; owner pickers use composite ids like `TEAM:<id>`. With more than 8 options it opens a `SearchPicker` instead (groups become `/` scopes). Renders nothing when there are no options |
| `ProgressBar` | `value: number \| null` (0–1), `tone?: accent \| success \| warning \| danger \| muted`, `label?` | any 0–1 measure, such as goal progress (`muted` for time elapsed, so it reads as secondary) |
| `SearchPicker` | `label`, `options: {id,name,scope?}[]`, `scopes?: {id,label,slash}[]`, `loading?`, `onPick(id)`, `onCancel?`, `persistent?`, `placeholder?` | picking one item from a list too long for a `<select>` (link targets). Type to search; a query starting with `/` names a scope (singular words: `/person`, `/project`). `/` lists them, `/team console` searches teams, and a partly typed word completes in the box once a space follows it (`/pro ` → `/project `, the highlighted one when several match). The query stays plain text, never a chip. Enter picks the highlighted row; Escape cancels. Parsing and matching are in `search-picker.ts`; `common/QuickFinder` (⌘K) reads queries the same way through `common/quick-finder.ts`, with commands (`/todo`, `/notebook`) after the types in its `/` list. Shows an error only when `onPick` throws |
| `GroupedOptions` | `options: {id,name,group?}[]` | the `<option>`s inside a `<select>`, under `<optgroup>`s when options carry a `group` (owner selects in `GoalForm` and `ProjectForm`; `InlinePicker` uses it too) |
| `ConfirmButton` | `label`, `confirmLabel?`, `onConfirm`, `variant: link \| button \| icon`, `timeoutMs?` | any destructive action. Never use `window.confirm()` |
| `Menu` | `label`, `items: {label, href?, onSelect?, current?, divided?}[]`, `trigger?` snippet, `iconOnly?` (just a chevron, named by `label`), `align?: start \| end` | a button that opens a short list of links and actions (the notebook switcher). Handles Escape, click-outside and arrow keys. Not for picking a relationship; that's `InlinePicker` |
| `EmptyState` | `message`, `boxed?`, `small?`, children (action) | "nothing here yet" |
| `PageHeader` | `title`, `description?`, children (actions) | top of every list page |
| `ParamSelect` | `param`, `options: {id,name,group?}[]`, `defaultValue`, `ariaLabel` | a list page's toolbar select whose value lives in one query parameter (picking `defaultValue` removes it). The projects page's team filter (`?team=`) and grouping (`?group=`) use it |
| `ParamToggle` | `param`, `options: {id,name}[]`, `defaultValue`, `ariaLabel` | switching a page between views held in one query parameter: joined `.btn sm` links in `.segmented`, the current one filled (the projects page's Table / Map, `?view=map`; the Org Map's Org chart / Owned work, `?view=work`; People's Graph / Table, `?view=`, which opens on the home page's `FocusGraph` centred on "me" in a home notebook and on the table in a work one (`$lib/person/people-view`); the home Todos panel's Priority / Status sort, `?todoSort=status`). Use `ParamSelect` for filters |
| `Pager` | `param`, `current` (1-based), `total`, `pageSize`, `ariaLabel` | Previous / "Page n of m" / Next links for a list paged by one query parameter (page 1 removes it); renders nothing on a single page. The load reads the page with `parsePageParam` and `clampPage` (`ui/pager.ts`) and passes `offset`. The home Todos panel uses it (`?todoPage=`) |
| `ArchiveFilter` | – | the Active / Archived / All select in a list page's `.toolbar.filters`, built on `ParamSelect`. It sets `?archived=`; the page's load passes `parseArchiveFilter(url.searchParams.get('archived'))` to `*.list` |
| `DisclosureButton` | `expanded`, `label`, `onToggle`, children? | the chevron that shows or hides a tree row's children (collapsible sub-projects). Use `flattenTree(forest, isCollapsed)` from `$shared/utils/hierarchy` for the rows. Pass children to put the label inside the button, so the whole thing toggles; wrap the component in the heading (`<h4><DisclosureButton>Docs</DisclosureButton></h4>`), as the Docs header does |
| `ChevronIcon` | `size?` (14) | every expand/collapse chevron (`DisclosureButton`, the Todos widget, the org map's reports badge). It points right; the parent rotates it. Don't use `▸`/`▾` glyphs, which render too small |
| `PencilIcon` | – | the edit affordance, inside `<button class="btn icon sm" aria-label="Edit …">` |
| `PeekIcon` | – | the side peek affordance, inside `<button class="btn icon sm" aria-label="Peek at …">` in a row's `.row-actions` |
| `SidePeek` | `title`, `href` (the full page, for its Open link), `param?` (`peek`), children | showing an entity's summary in the right panel's Peek tab without leaving a list page. It renders nothing in place: while `?peek=<id>` is set it hands its children to `rightPanelPeek`, and the panel switches to that tab (opening its drawer where the panel is one). Escape or the tab's × close it. The domain component renders it and loads its own data (`project/components/ProjectPeek`). Only on pages that show the right panel |
| `peek-url.ts` | `openPeek(id)`, `closePeek()`, pure `peekHref(url, id)` | opening and closing `SidePeek`. The first peek pushes history, so Back closes it; another peek while one is open replaces it |
| `popup-url.ts` | `openPopup(id, extra?)`, `closePopup({ invalidate?, clear? })` | opening and closing `Popup` (`?popup=<id>`) |
| `submit.ts` | `submit(fn)`, `submitOrThrow(fn)`, `errorMessage(e)` | all tRPC mutations from the UI |

`Popup` (`common/Popup.svelte`, props `id`, `title`, `size?`, `clearParams?`) is for entity create/edit only; small edits render inline.

### Rules for UI code

Use a standard component or class before writing markup or styles yourself. If none fits, extend the primitive in `src/lib/ui/` or the partial in `src/routes/styles/`, and update the tables above. Don't make a one-off copy.

**Pages**
- A list page is `<div class="page">`, then `PageHeader` (its primary action is `.btn primary`), then the content, then `EmptyState boxed` with the same action when the list is empty. `src/routes/app/people/+page.svelte` is the reference.
- An entity detail page is `EntityDetailPage`. It supplies only `renderMeta` (its `.meta-list`, if it has one), `renderOverview`, `renderAssetHeader` and `renderEditForm`. Never rebuild the sidebar, notes panel, breadcrumb or edit popup.
- Inside an overview, group content in `.section`, with a `.section-header` holding an `h4` and `.count`. Render collections as `.list` + `.list-row`, with per-row actions in `.row-actions`. Put a wide table in `.table-wrap`.

**Forms and mutations**
- Every labelled control goes in `Field` and uses the `id` from its snippet. Don't write a raw `<label>` for a form control. Toolbar filters without a visible label are the exception; give them an `aria-label`.
- Entity create and edit use the domain `*Form` component (`PersonForm`, `GroupForm`, `ProjectForm`, `GoalForm`, `PageForm`, `TodoForm`) inside a `Popup`. Don't rebuild the form fields on a page.
- Open and close popups only through `openPopup` and `closePopup`. Never edit `?popup=` by hand. After a write, call `closePopup({ invalidate: true })`.
- Send every tRPC mutation through `submit()` and handle `outcome.ok`. Most procedures return `Result`, so a failed call does not throw. A bare `await trpc().x.mutate(...)` drops the error without a word.
- `InlinePicker` and `ConfirmButton` show an error only when their callback throws. In `onPick` and `onConfirm` (and a form's `onDelete`, which goes to a `ConfirmButton`), call `submitOrThrow(() => trpc()….mutate(…))`.
- Everywhere else, use `submit()` and render `outcome.error`. Show a form or list error in `.form-error`, a field error through `Field`'s `error` prop, and an error beside an inline control in `.inline-error`. Don't write inline `style="color: …"`.

**Actions**
- Use `ConfirmButton` for every destructive action (delete, remove, detach). Use `variant="icon"` inside `.row-actions`, `link` in text and `button` in form actions. Never call `window.confirm()` or `alert()`.
- Use `InlinePicker` to set or add one relationship (lead, member, parent), or `SearchPicker` when the choices span several entity types or are too many to scroll. Don't write `<details>`/`<select onchange>` pickers.
- Edit affordances are `PencilIcon` inside `.btn icon sm`, with an `aria-label` that names the entity.
- Every clickable control is `.btn` plus modifiers, or an `<a>`. A bare `<button>` is unstyled on purpose. Show loading with `disabled` + `aria-busy` and a text swap, not a spinner.
- Show todo state with `todo/components/StatusDot` and `PriorityBadge`. Don't restyle status or priority locally.

**Empty and loading states**
- Use `EmptyState` for every "nothing here" message: `boxed` for a whole page, plain inside a section, `small` in sidebar widgets. Don't hand-write `<p class="empty">`.

**Styling**
- Component `<style>` blocks handle layout only (flex, grid, positioning). Colour, font size, spacing, radius, shadow and z-index come from tokens (`var(--…)`). Don't use hex, `rgb()`, named colours or `px` for these.
- Pixel literals are allowed only for fixed geometry the token scale can't express: hairline borders (`1px`), icon and dot sizes, chart and org-map cell widths.
- Brand colours from a `Branding` record are the only values allowed in `style=` attributes (for example, swatches and the branding preview). Pass dynamic numbers as CSS custom properties (`style="--depth: {n}"`), not as whole declarations.
- Don't restyle a global class (`.btn`, `.card`, `.list-row`, `.badge`, inputs) from inside a component. Add a modifier to the partial instead.
- Use the breakpoint mixins (`mobile`, `below-md`, `tablet-up`, `desktop-up`) from `_variables.scss`. A raw `@media` width is only for shell layout that needs its own breakpoint (today, `DetailLayout` at 849px and `AppShell` at 768–1149px). Leave a comment saying why.

## Charts and diagrams

- `src/lib/report/chart-render.ts` is the only chart renderer. `renderChart(el, spec, branding)` draws a `ChartSpec` in brand colours; `mountCharts(container, branding, sections?)` replaces rendered ```` ```chart ```` code blocks (and legacy `[data-chart-key]` placeholders) inside a container.
- It's used by `MarkdownRenderer` (docs and notes; a doc's Preview tab and print page colour charts with a branding), `report/components/MarkdownReport` (branded print view) and `shared/components/milkdown-chart-plugin` (live previews in the editor).
- Destroy the charts it returns when content changes or the component unmounts.
- Charts draw in the branding's accent colour, or its primary colour when the accent is too pale on white (`chartBaseColor` in `$shared/types/branding`).
- Mermaid diagrams render in `MarkdownRenderer` from `<pre>` blocks starting with a mermaid keyword.

## Goal periods

A goal's `period` (`2026`, `2026-H2`, `2026-Q3`) is a calendar year, half or quarter. `$shared/utils/period` turns it into dates, pure and on `YYYY-MM-DD` strings (`localDay()` for today): `periodRange`, `periodSpan` (`Jul–Dec 2026`), `periodPhase` (past, current, future), `periodElapsed` (0–1) and `periodOptions` for the form's select. `$lib/goal/utils` builds on them: `goalTimeFlag` ("Period ended", "Behind pace", badges in `GOAL_TIME_FLAGS`; hints only, never a status change) and `paceValue` (the pace line in `ProgressLineChart`). The goal page shows time elapsed as a `muted` `ProgressBar` under progress, and the goals list's period filter opens on current periods when any goal has one.

## Shared components

| Component | Props | Owns |
|---|---|---|
| `common/EntityDetailPage` | `entityType`, `entityId`, `entityName`, `breadcrumbLabel`, `breadcrumbHref`, `editPopupTitle`, `docs`, `notes`, `todos`, `reports?`, `relations?`, `description?`, `links?` (the entity's `link.list`), `breadcrumbTrail?` (`{ label, href }[]` between the list and the entity: the parents of a wiki page, project or goal, from `ancestorsOf` in `$shared/utils/hierarchy`), snippets `renderOverview({ openEdit })`, `renderMeta?({ openEdit })`, `renderAssetHeader`, `renderEditForm({ onSuccess, onCancel })` | Detail shell: sidebar (todos, reports, related, then links when there are any), right-panel notes, center pane (`renderMeta`, then `description` as markdown in a `.card compact`, both giving way while a doc is open, then the docs list unless `acceptsDocs` says no, as on wiki pages, then overview/doc/note/todo), edit popup. The open doc lives in the URL, `?doc=<id>` (`?doc=new` for a draft), through `openDocUrl`/`closeDocUrl` in `lib/doc/doc-url.ts`: opening one pushes history, so Back closes it, and an id that isn't on the page is dropped. Link to one with `docPath` (`$shared/utils/entity`). `renderMeta` is the entity's `.meta-list`; it sits above the docs and gives way while a doc is open. A page that wants it gone for its own reasons passes it conditionally (`renderMeta={editing ? undefined : pageMeta}`, as the wiki page does while its content editor is open). `loadEntityAssets` (`$shared/trpc/load-entity-assets`) loads docs, notes, todos, reports and relations |
| `common/DocsManager` | `docs`, `activeDocId`, `onSelect`, `onStartAdd`, `onRemove`, `onReorder` | Doc list with reorder. Titles are `?doc=<id>` links, so a modified click opens the doc in a new tab. It sits at the top of the centre pane, above whatever that pane has open, so a doc is one click away from any view. The header is a `DisclosureButton`, open on arrival unless a doc is already open; opening or adding a doc closes it, since the doc then has the pane |
| `common/DocEditor` | `title`, `content`, `hasSourcePdf?`, `converting?`, `pdfNotice?` (`{ tone: warning \| error, message }`), `onSave`, `onSaveTitle?`, `onUploadPdf?`, `onOpenSourcePdf?`, `onConvertPdf?`, `onClose?`, `exportHref?`, `chartBranding?` (the layout's `chartBranding`, so Preview charts match the PDF) | Editor/Markdown/Preview tabs, with the doc's actions at the right end of the tab row (sticky above the editor's own toolbar, which it offsets through `--sticky-top`): "Export PDF" (with `exportHref`, while the doc has content; `printUrl` from `doc/print-options`), "● Unsaved" and Save (not in Preview). Dirty means the draft differs from the text last loaded or saved, so a wiki page, which saves without reloading, clears it too. "Attach PDF" (only while no PDF is attached), "Convert with Claude" (only while the doc has a PDF and no content). `EntityDetailPage` owns the conversion state and converts a PDF attached to an empty doc straight away |
| `common/RightPanel` / `common/PageChat` | `PageChat`: `page` (`RightPanelPage`) | Right panel tabs: Notes (`rightPanelNotes`), Chat (`rightPanelPage`, set by `EntityDetailPage`) and, while a `SidePeek` is open, Peek (`rightPanelPeek`). Its left edge is a resize handle (drag, arrow keys, double-click resets): `panelWidth` in `stores/right-panel.ts` keeps the width in localStorage, `AppShell` sets it as `--panel-w`, clamped by the pure `common/panel-width.ts` to leave room for the page. Hidden where the panel is a drawer. Chat asks the local Claude about the open page through `askAboutPage` (`common/use-page-chat.ts`); the conversation is saved on the server per entity (`chat.get` on mount), so it resumes after a reload, in another browser, or while Claude is still replying (`waitForReply`); Clear deletes it (`chat.clear`) |
| `doc/export-pdf` (`downloadPdf`) | `sheet`, `blockSelector`, `title` | Saves an element as an A4 PDF in the browser; page breaks are planned by the pure `doc/pdf-pages.ts`, which also turns `<!-- pagebreak -->` lines into `.page-break` elements that always start a page |
| `common/MarkdownRenderer` | `content`, `placeholder?`, `branding?` | Markdown + charts + mermaid. `branding` colours charts and is read once, so wrap it in `{#key}` to change it |
| `doc/PrintView` | `title`, `content`, `backHref`, `brandings`, `options`, `branding`, `urlFor(choice, header)`, `details?` snippet | A printable, branded sheet of markdown with its toolbar (branding, header, Print…, Download PDF); `details` prints between the title and the body. The doc and wiki print pages render it, with `printUrl` / `wikiPrintUrl` from `doc/print-options` |
| `doc/DocPrintHeader` | `branding`, `title` | The letterhead at the top of an exported doc: the logo (or icon) on white over a rule in the primary colour, then the title. The page's body takes the other brand colours as accents |
| `common/NotesList` | `notes`, `onEdit?`, `onRemove?`, `maxHeight?` | Note list with clamp/expand |
| `report/components/ReportsWidget` | `entityType`, `entityId`, `reports` | Sidebar report list + "new report" |
| `relation/components/RelationsWidget` | `entityType`, `entityId`, `groups` (`RelationGroup[]`), `readOnly?`, `onChange?` (after an add or remove, for a caller that loads `groups` itself) | Sidebar "Related" list grouped by label, with a remove button on every row except `MENTIONS` (a person relation row removes through `personRelation.remove`). The header's "+" (hidden when `readOnly`, i.e. archived) opens `AddRelation` |
| `relation/components/AddRelation` | `self` (`RelationEnd` from `relationEnd()` in `$shared/utils/relations`, or null for an entity not saved yet), `onPickLink?`, `onChange?`, `onDone` | Kind select (`relationChoices`): "Related to", "Depends on", "Needed by", and on a person's page the notebook's `personRelationKind.list` (each kind's label, and its inverse unless it's symmetric). A person kind (`isPersonChoice`) limits the targets to people and adds through `personRelation.add` (`toPersonRelationInput`); the others through `relation.add` (`toRelationInput`). An inverse choice swaps the ends. then a `SearchPicker` over `loadEntityOptions` (`$shared/trpc/load-entity-options`) scoped by `ENTITY_SEARCH_SCOPES` (`$shared/utils/entity`). Picking a target adds the link, or with `onPickLink` hands the form a `PickedLink` to add once it saves. No note field for now |
| `link/components/LinksWidget` | `links` (`link.list` rows), `readOnly?` | Sidebar "Links", rendered by `EntityDetailPage` only when the entity has links. Each row: `SourceIcon`, the label (`linkLabel`, which drops a leading tool name the icon already shows), opening in a new tab, and for a source link its `syncedAt` as a sync icon plus `timeAgo`, in `--warning` once `isSyncStale` (over `SYNC_STALE_DAYS`, 7, the same age the skill re-syncs at). Remove in `.row-actions`, hidden when `readOnly`. No add form: Claude adds links |
| `link/components/SourceIcon` | `source` (`LinkSource \| null` from `linkSource` in `link/source.ts`) | A 16px letter mark for a known tool (Linear, Notion, GitHub, Jira, Confluence, Google Docs, Figma, Slack and a few more, matched by host and path in `link/source.ts`), or a chain icon. No logos or favicons: nothing is fetched |
| `{person,group,project}/components/*Form` | `initial?`, `onSuccess`, `onCancel?`, `onDelete?` (`PersonForm` also `personOptions?` for a person field such as the org lead, and renders `$model.personFields`; `GroupForm` also `kinds`; `ProjectForm` also `ownerOptions?`). `group/components/GroupKindForm` (`initial?`, `onSuccess`, `onCancel?`) edits a group kind | Create/edit forms, used in list popups, detail edit popups and Org Map |
| `goal/components/GoalForm` | `initial?`, `ownerOptions`, `onSuccess`, `onCancel?`, `onDelete?` | Goal create/edit: title, description, owner, period (a select from `periodOptions`: last, this and next year's years, halves and quarters; no free text), status, unit, baseline, target. Get `ownerOptions` (grouped by type, for this form and `ProjectForm`) from `loadOwnerOptions(client)` in `$shared/trpc/load-owner-options` |
| `page/components/PageForm` | `initial?`, `kinds` (the notebook's `pageKind.list`, from the page's load), `onSuccess`, `onCancel?`, `onDelete?` | Page create/edit: title, kind, and an input per field of the kind (multiselect as a multiple `<select>`, checkbox as a checkbox). Content is edited on the page itself |
| `relation/components/PersonRelationKindForm` | `initial?`, `onSuccess`, `onCancel?` | Person relation kind create/edit at `/app/people/kinds`: label, the label from the other end (empty for a symmetric kind), key, and on create "One each" (exclusive). An edit changes labels only |
| `page/components/PageKindForm` | `initial?`, `onSuccess`, `onCancel?` | Page kind create/edit at `/app/wiki/kinds`: name, key (made from the name until typed), description, and field rows (label, type, key, options or money format; reorder and remove). Pure parts in `page/kind-form.ts` |
| `page/components/DatasetTable` | `kind`, `pages`, `count`, `totals`, `groups` (a `page.query` result) | `/app/wiki?kind=<key>`: a column per field, sortable headers, filter chips and an add-filter row, group-by select, and a totals row where each number column picks Sum/Average/Min/Max. Every choice lives in the URL (`page/dataset-url.ts`), and the load runs `page.query` with it |
| `goal/components/ProgressLineChart` | `checkIns`, `baseline?`, `target?`, `unit?`, `period?` | Check-in values over time with the target line and, with a period, the pace line, drawn with `renderChart` |
| `goal/components/GoalRows` | `goals`, `showOwner?`, `removeLabel?`, `onRemove?` | Goals as `.list-row`s with period, status badge, time flag and progress; used for sub-goals and a project's goals |
| `project/components/DependencyMap` | `projects` (`ProjectListItem[]`), `dependencies` (`project.dependencies`), `team`, `tableHref` | The projects page's Map view: `DEPENDS_ON` links between projects and goal–project links, left to right, with hover lighting a node's whole upstream and downstream chain |
| `project/components/StatusBadge` | `status` | Every project status badge: the label (`projectStatusLabel`: "in progress") in its colour (`statusBadgeClass` in `project/utils`, from `projectStatusTone`). The six statuses, their synonyms, labels and colours are `$shared/utils/project-status` (proposed `viz-4`, committed accent, in-progress success, blocked danger, done `viz-1`, abandoned muted); the swimlane bar uses the same tone, and a proposed bar is faded. `ProjectForm` has a Status select (a new project starts committed) and the project page's status is a `Menu` on the badge |
| `project/components/TimelineBar` / `TimelineHead` | `bar` (`TimelineBar \| null`), `today` / `axis` (`TimelineAxis`) | The projects list's Timing swimlane: one shared axis of whole months (`timelineAxis`; three-letter month labels, with the year on a line below where it changes), each row's bar from start to target (`timelineBar`; open-ended and faded with no target, a diamond with only a target, the stretch past a missed target in `--danger`), and a dashed today line down every row. Pure parts, with the Size column's PERT estimate (`expectedDays`, `sizeText`, `relativeSize`, `sizeBarHeight`), are in `project/project-timeline.ts`. `SizeBar` (`fraction`, `label`) draws the Size column: a thin vertical bar rising from the bottom of a faint full-height track, its height on a square-root scale so small projects stay apart, so the bars compare like a small chart down the column |
| `project/components/ProjectPeek` | `id` | A project's summary in the right panel's Peek tab (a `SidePeek`) on the projects list: status, owner, parent, dates, description, then goals, sub-projects, open todos (each opens the todo popup) and docs. Loads in the browser on each id, and again when a popup closes. Read-only; its Open link goes to the full page |
| `org/components/WorkMap` | `input` (`WorkMapInput`: projects, goals, `project.dependencies`, TEAM and DEPARTMENT groups with members) | The Org Map's Work view: owner lanes of project and goal cards, with dependency and goal-link arrows and hover chains (reuses `chainOf`, `projectTone`, `goalTone` and `goalDetail` from `project/dependency-map`) |
| `goal/components/OwnedWork` | `goals`, `projects` | The "Goals" and "Projects owned" sections on person and group overviews (goals only where `$model.has('goals')`) |
| `todo/components/TodoForm` | `entityType?`, `entityId?`, `editId?`, `onSuccess`, `onCancel?` | Todo create/edit; asks for the entity when none is given, and an edit links to the entity at the top and shows the description rendered (so its links work) until its pencil opens the editor. In any `MarkdownEditor`, ⌘/Ctrl-click opens a link in a new tab, and the Link field has an Open button. Its `TodoLinks` section links the todo to other entities: live on an edit, and on a create the picks are added once the todo saves |
| `todo/components/CreateTodoPopup` | – | Global `?popup=todo[&todo=<id>]`, a `Popup` around `TodoForm`; infers the entity from the current detail route |
| `report/components/MarkdownReport` | `markdown`, `branding?`, `sections?` | Branded report rendering (logo, heading/table colours, charts) |
| `shared/components/MilkdownEditor` | `value`, `onChange`, `branding?`, `sections?` | WYSIWYG markdown with live chart previews |

Use `EntityDetailPage` for every entity detail page; the page supplies only the overview and edit form.
