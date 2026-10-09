# Routes Conventions — `src/routes/`

Routes are thin entry points: load data in `+page.server.ts`, render components from `src/lib/`.

## Structure

- `/` redirects to `/app`, the home dashboard: open todos (`home.todos`, 15 a page with `offset`; it returns `{ items, total }` and the panel's `Pager` keeps the page in `?todoPage=`), latest updates (`home.updates`) and a focus graph (`home.graph`, `$lib/home/components/FocusGraph.svelte`): one entity in the middle with everything one link away grouped around it, and an outer ring of what each of those links to in turn (`branches`, up to 4 each, nothing shown twice). A home notebook's load passes `exclude: ['GOAL']`. `?focus=<TYPE>:<id>` picks the middle (default: the most recently updated project, goal or team), and clicking a neighbour moves it there, so Back returns. Laid out by the pure `$lib/home/focus-layout.ts`.
- `app/` is the app: `projects`, `goals`, `wiki` (pages), `orgmap`, `people`, `groups` (and `groups/kinds`; `teams` and `departments` only redirect there), `todos`, `reports`, `branding`, `notebooks`. Person and group pages show the goals and projects they own; project pages show the owner and linked goals (not in a home notebook, whose projects map also drops goals). The projects list has two views, picked with `?view=` through the Table / Map `ParamToggle` at the right end of the toolbar, after Expand/Collapse all: the table (default) and `map`, a dependency map (`$lib/project/components/DependencyMap.svelte`, laid out by the pure `$lib/project/dependency-map.ts`). The map shows each project to the right of what it depends on and each goal just right of the projects delivering it, and follows `?team=` and `?archived=`. Only the map view loads `project.dependencies`. Projects with sub-projects sort before those without, at every level (`parentsFirst` in `$lib/project/project-list`). The table shows the owner as a muted line under each name (left out when grouped by team, whose heading names it), a Timing swimlane on one axis shared by every group, and a Size bar (`project/components/SizeBar`), a thin vertical bar whose height (square-root scale) shows the PERT estimate relative to the biggest project shown; each column is left out when no project has dates or estimates. Each table row has a peek button (on hover) that opens the project's summary in the right panel's Peek tab, `?peek=<id>` (`$lib/project/components/ProjectPeek.svelte`); the name still links to the full page. The Org Map has two views too, switched by an Org chart / Owned work `ParamToggle` at the right end, after "Jump to person" (passed to `OrgTree` as its `tools` snippet): the org chart (default: reporting lines, departments, teams) and `?view=work`, owner lanes (`$lib/org/components/WorkMap.svelte`, laid out by the pure `$lib/org/work-map.ts`): one lane per team, department or person that owns projects or goals, with dependencies and goal links drawn between cards. Teams don't belong to a department, so a team lane lists its members' departments by count. Only the work view loads projects, goals and dependencies. `app/+layout.server.ts` loads the open notebook and the notebook list (for the switcher), and the notebook's default branding: its icon for the nav and its primary colours, which `app/+layout.svelte` applies with `.branded`.
- Entity detail pages read `?doc=<id>` (or `?doc=new`) to open a doc in the centre pane; see `EntityDetailPage` in `src/lib/CLAUDE.md`.
- `app/wiki?kind=<key>` shows one page kind as a dataset table (`DatasetTable`, through `page.query`), and `app/wiki/kinds` manages the notebook's page kinds.
- `app/notebooks` lists notebooks: open one, rename it, or make it Claude's default. Creating one is the global `?popup=new-notebook`.
- `app/reports/[id]/print/+page@.svelte`, `app/docs/[id]/print/+page@.svelte` and `app/wiki/[id]/print/+page@.svelte` reset to the root layout (no app chrome), so the page prints cleanly to PDF. Mark on-screen-only controls with `class="no-print"`.
- The doc and wiki print pages ("Export PDF") are thin wrappers around `$lib/doc/PrintView`. They read `?branding=<id>|none` (left out = the default branding) and `?header=0` through `lib/doc/print-options.ts`, and its toolbar rewrites them. "Download PDF" saves the `.sheet` with `lib/doc/export-pdf.ts`. It isn't gated by `features.reports`.
- `files/[...key]/+server.ts` serves locally stored files (doc PDFs, branding images) from the request's notebook.
- `api/trpc/` is handled by `trpcHandle` in `src/hooks.server.ts`.
- `hooks.server.ts` `init` puts the data directory in the notebook layout and runs `ensureDatabase()` (migrations and WAL) for the default notebook before the server handles requests. Other notebooks are prepared the first time a request uses them.

## Loading data

```ts
export const load: PageServerLoad = async ({ fetch, params }) => {
  const client = trpc(fetch);
  const result = await client.person.get.query({ id: params.id });
  if (!result.ok) error(404, 'Person not found');
  return { person: result.value };
};
```

Use `trpc(fetch)` so SSR requests pass through the same guard and validation as the browser and the CLI. Calling operations directly is acceptable for read-only aggregate pages (e.g. `orgmap`): use `getReadyRegistry(locals.notebook.id)`, never a notebook of your own choosing.

## Security (`src/hooks.server.ts`)

There is no auth; `localOnlyGuard` is the only protection. It returns 403 for any request whose hostname isn't `localhost`, `127.0.0.1` or `[::1]`, and for any `/api/trpc` request without `x-remry: 1`. Don't add routes that bypass it, don't add CORS headers, and don't bind the server to anything but loopback.

`notebookHandle` runs next and sets `event.locals.notebook` for every request:
- `?notebook=<id or name>` on a page switches: it sets the `wn-notebook` cookie (HttpOnly, SameSite=Strict) and redirects to the same URL without the parameter. An unknown notebook is a 404.
- Otherwise the cookie, and if that notebook is gone, the default.

Links Claude gives the user add `?notebook=<id>`, so they open in the right notebook. The UI switches with `switchNotebook(id)`, a full page load to `/app?notebook=<id>`.

## Styles

- `styles.scss` is the global entry (imported once in `+layout.svelte`). It only `@use`s the partials in `styles/`: `_tokens` (design tokens on `:root`, plus `.branded`, which swaps in a notebook's brand colour), `_base` (reset, elements, tables, breadcrumb), `_controls` (`.btn`, fields, forms, tabs, toolbar), `_layout` (page, card, list, badge, drawer, utilities), `_print` (`.no-print`).
- Vite's `additionalData` injects `_variables.scss` into the entry and component `<style>` blocks only. Partials reached through `@use` must `@use '../_variables.scss' as *` themselves.
- `_variables.scss` holds only breakpoints, font stacks and mixins (`mobile`, `below-md`, `tablet-up`, `desktop-up`, `flex-*`, `visually-hidden`). Colours, type, spacing and radii are CSS custom properties in `styles/_tokens.scss`.
- The token and class vocabulary is documented in `src/lib/CLAUDE.md` § Design system.

## Layout notes

- The top bar (`$lib/common/AppShell`) starts with the brand icon and the open notebook's name (a link to Home), then the switcher chevron (`$lib/notebook/components/NotebookSwitcher`). Its `LINKS` are the notebook model's `nav` (core: Home, People, Groups, Projects, Wiki, Todos; the org module's Org Map stands in for People and Groups, and the goals module adds Goals), with Branding as a secondary link and a search button that opens the ⌘K finder. Under 768px it collapses to a hamburger drawer.
- Entity list layouts (`people`, `groups`, `projects`, `goals`, `wiki`, `todos`) set `layoutConfig.collapseInfoPanel` so the notes panel collapses on medium screens.
