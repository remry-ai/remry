<script lang="ts">
  import type { PageData } from './$types';
  import { page } from '$app/state';
  import Popup from '$lib/common/Popup.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ArchiveFilter from '$lib/ui/ArchiveFilter.svelte';
  import ParamSelect from '$lib/ui/ParamSelect.svelte';
  import ParamToggle from '$lib/ui/ParamToggle.svelte';
  import DisclosureButton from '$lib/ui/DisclosureButton.svelte';
  import ProjectForm from '$lib/project/components/ProjectForm.svelte';
  import DependencyMap from '$lib/project/components/DependencyMap.svelte';
  import ProjectPeek from '$lib/project/components/ProjectPeek.svelte';
  import PeekIcon from '$lib/ui/PeekIcon.svelte';
  import SizeBar from '$lib/project/components/SizeBar.svelte';
  import TimelineBar from '$lib/project/components/TimelineBar.svelte';
  import TimelineHead from '$lib/project/components/TimelineHead.svelte';
  import { expectedDays, relativeSize, sizeText, timelineAxis, timelineBar } from '$lib/project/project-timeline';
  import { localDay } from '$shared/utils/period';
  import { openPopup, closePopup } from '$lib/ui/popup-url';
  import { openPeek, PEEK_PARAM } from '$lib/ui/peek-url';
  import StatusBadge from '$lib/project/components/StatusBadge.svelte';
  import {
    defaultCollapseBase,
    isRowCollapsed,
    parseProjectListParams,
    projectListGroups,
    projectTeamOptions,
    type CollapseBase,
    type ProjectListItem
  } from '$lib/project/project-list';
  import { flattenTree } from '$shared/utils/hierarchy';

  const VIEW_OPTIONS = [
    { id: 'table', name: 'Table' },
    { id: 'map', name: 'Map' }
  ];
  const GROUPING_OPTIONS = [
    { id: 'none', name: 'No grouping' },
    { id: 'team', name: 'Group by team' }
  ];

  const { data } = $props<{ data: PageData }>();
  const allProjects = $derived((data.projects.ok ? data.projects.value : []) as readonly ProjectListItem[]);
  const teams = $derived(projectTeamOptions(allProjects));
  const teamFilterOptions = $derived([{ id: '', name: 'All teams' }, ...teams]);
  const params = $derived(parseProjectListParams(page.url.searchParams, teams));
  const groups = $derived(projectListGroups(allProjects, params, teams));

  // Rows flipped away from the view's starting state. Changing the team filter or grouping starts over.
  interface CollapseState {
    readonly viewKey: string;
    readonly base: CollapseBase;
    readonly toggled: ReadonlySet<string>;
  }
  const viewKey = $derived(`${params.team ?? ''}|${params.groupBy}`);
  let collapseState = $state.raw<CollapseState | null>(null);
  const collapse = $derived<CollapseState>(
    collapseState?.viewKey === viewKey ? collapseState : { viewKey, base: defaultCollapseBase(params), toggled: new Set() }
  );

  const toggleRow = (id: string) => {
    const toggled = new Set(collapse.toggled);
    if (toggled.has(id)) toggled.delete(id);
    else toggled.add(id);
    collapseState = { viewKey, base: collapse.base, toggled };
  };
  const setAll = (base: CollapseBase) => {
    collapseState = { viewKey, base, toggled: new Set() };
  };

  const tables = $derived(
    groups.map((group) => ({
      group,
      rows: flattenTree(group.nodes, (node) => isRowCollapsed(node.item.id, collapse.base, collapse.toggled))
    }))
  );
  const hasNesting = $derived(groups.some((group) => group.nodes.some((node) => node.children.length > 0)));
  const grouped = $derived(params.groupBy === 'team');

  const isMap = $derived(page.url.searchParams.get('view') === 'map');
  const tableHref = $derived.by(() => {
    const url = new URL(page.url);
    url.searchParams.delete('view');
    return `${url.pathname}${url.search}`;
  });

  const peekId = $derived(page.url.searchParams.get(PEEK_PARAM));

  // Timing and Size share one scale across every group, collapsed rows included, so collapsing never rescales them.
  const today = localDay();
  const shown = $derived(groups.flatMap((group) => flattenTree(group.nodes, () => false).map((row) => row.item)));
  const axis = $derived(timelineAxis(shown, today));
  const maxDays = $derived(Math.max(0, ...shown.map((p) => expectedDays(p) ?? 0)));

  const handleCreated = () => closePopup({ invalidate: true });
</script>

<svelte:head><title>Projects</title></svelte:head>

<div class="page">
  <PageHeader title="Projects" description="Track project health, documentation, and feedback.">
    <button type="button" class="btn primary" onclick={() => openPopup('new-project')}>Add project</button>
  </PageHeader>

  <div class="toolbar filters">
    <ArchiveFilter />
    {#if teams.length > 0}
      <ParamSelect param="team" options={teamFilterOptions} defaultValue="" ariaLabel="Filter by team" />
      {#if !isMap}
        <ParamSelect param="group" options={GROUPING_OPTIONS} defaultValue="none" ariaLabel="Group projects" />
      {/if}
    {/if}
    <span class="spacer"></span>
    {#if hasNesting && !isMap}
      <button type="button" class="btn sm ghost" onclick={() => setAll('expanded')}>Expand all</button>
      <button type="button" class="btn sm ghost" onclick={() => setAll('collapsed')}>Collapse all</button>
    {/if}
    <ParamToggle param="view" options={VIEW_OPTIONS} defaultValue="table" ariaLabel="View" />
  </div>

  {#snippet projectTable(rows: (typeof tables)[number]['rows'])}
    <div class="table-wrap">
      <table class="project-table">
        <thead>
          <tr>
            <th>Name</th>
            <th class="status-col">Status</th>
            {#if axis}<th class="timing-col"><TimelineHead {axis} /></th>{/if}
            {#if maxDays > 0}<th class="size-col">Size</th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each rows as { item: project, depth, context, children } (project.id)}
            <tr class:context class:active={peekId === project.id}>
              <td>
                <span class="project-name" style="--depth: {depth}">
                  {#if depth > 0}<span class="tree-indent">└</span>{/if}
                  {#if children.length > 0}
                    <DisclosureButton
                      expanded={!isRowCollapsed(project.id, collapse.base, collapse.toggled)}
                      label={project.name}
                      onToggle={() => toggleRow(project.id)} />
                  {:else}
                    <span class="disclosure-spacer"></span>
                  {/if}
                  <span class="name-stack">
                    <span class="name-line">
                      <a href="/app/projects/{project.id}">{project.name}</a>{#if project.archivedAt} <span class="badge muted">Archived</span>{/if}
                    </span>
                    <!-- Grouped by team, the group's heading already names the owner. -->
                    {#if project.owner && !grouped}
                      <a class="owner text-xs" href={project.owner.path}>{project.owner.label ?? 'Missing owner'}</a>
                    {/if}
                  </span>
                  <!-- Beside the stack, level with the name line, whether or not an owner line follows. -->
                  <span class="row-actions">
                    <button type="button" class="btn icon sm" aria-label="Peek at {project.name}" title="Peek" onclick={() => openPeek(project.id)}><PeekIcon /></button>
                  </span>
                </span>
              </td>
              <td>
                <StatusBadge status={project.status} />
              </td>
              {#if axis}
                <td class="timing-col"><TimelineBar bar={timelineBar(project, axis, today)} today={axis.today} /></td>
              {/if}
              {#if maxDays > 0}
                {@const size = sizeText(project)}
                <td class="size-col" title={size?.title}>
                  {#if size}<SizeBar fraction={relativeSize(expectedDays(project) ?? 0, maxDays)} label={size.label} />{/if}
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/snippet}

  {#if allProjects.length === 0}
    <EmptyState message="No projects yet." boxed>
      <button type="button" class="btn sm" onclick={() => openPopup('new-project')}>Add project</button>
    </EmptyState>
  {:else if isMap}
    {#if data.dependencies}
      <DependencyMap projects={allProjects} dependencies={data.dependencies} team={params.team} {tableHref} />
    {:else}
      <EmptyState message="The dependency map couldn't be loaded. Reload the page to try again." boxed />
    {/if}
  {:else if tables.length === 0}
    <EmptyState message="No projects match these filters." boxed />
  {:else if grouped}
    {#each tables as { group, rows } (group.key)}
      <section class="section">
        <div class="section-header">
          <h3>
            {#if group.path}<a href={group.path}>{group.label}</a>{:else}{group.label}{/if}
            <span class="count">{group.count}</span>
          </h3>
        </div>
        {@render projectTable(rows)}
      </section>
    {/each}
  {:else}
    {#each tables as { group, rows } (group.key)}
      {@render projectTable(rows)}
    {/each}
  {/if}
</div>

{#if peekId}
  <ProjectPeek id={peekId} />
{/if}

<Popup id="new-project" title="Add project">
  <ProjectForm ownerOptions={data.ownerOptions} onSuccess={handleCreated} onCancel={() => closePopup()} />
</Popup>

<style lang="scss">
  .project-name {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    padding-left: calc(var(--depth) * var(--sp-5));
  }
  .tree-indent {
    color: var(--border-strong);
    font-size: var(--fs-sm);
  }
  // A parent from another team, shown only so its sub-projects keep their place.
  .context,
  .context a {
    color: var(--text-3);
  }
  .name-stack {
    display: inline-flex;
    flex-direction: column;
    min-width: 0;
  }
  // Top-aligned, centred on the name line: the button is taller than the line, so it moves up by half the difference.
  .project-name > .row-actions {
    align-self: flex-start;
    margin-top: calc((1lh - var(--control-h-sm)) / 2);
  }
  .name-line {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
  }
  .owner {
    color: var(--text-3);
    font-weight: 400;
    &:hover { color: var(--accent); }
  }
  // Fixed column widths, so every group's table (and its timing axis) lines up; Name takes what the others leave.
  .project-table {
    table-layout: fixed;
    min-width: 720px;
  }
  .status-col { width: 110px; }
  .timing-col { width: 35%; }
  .size-col { width: 76px; }
  .disclosure-spacer {
    flex-shrink: 0;
    width: var(--control-h-sm);
  }
</style>
