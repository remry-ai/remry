<script lang="ts">
  // The projects page's Map view: each project to the right of the projects it
  // depends on, and each goal just right of the projects that deliver it. Hovering or
  // focusing a card lights up everything upstream and downstream of it.
  import type { ProjectDependencies } from '$shared/types/project-dependencies';
  import { truncateMiddle } from '$shared/utils/text';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import type { ProjectListItem } from '../project-list';
  import { buildDependencyMap, chainOf, layoutDependencyMap, DEFAULT_SIZES } from '../dependency-map';

  interface Props {
    readonly projects: readonly ProjectListItem[];
    readonly dependencies: ProjectDependencies;
    /** A team id, `none`, or null for every team. */
    readonly team: string | null;
    /** Link to the table view, for the unlinked-projects line. */
    readonly tableHref: string;
  }

  const { projects, dependencies, team, tableHref }: Props = $props();

  const MAX_CHARS = 28;
  const { nodeWidth: W, nodeHeight: H } = DEFAULT_SIZES;

  const map = $derived(buildDependencyMap(projects, dependencies, team));
  const layout = $derived(layoutDependencyMap(map));

  let hovered = $state<string | null>(null);
  const lit = $derived(hovered ? chainOf(hovered, map.edges) : null);
</script>

{#if map.nodes.length === 0}
  <EmptyState
    boxed
    message={team === null
      ? "No dependencies yet. Add them from a project's Related section (Depends on), or link projects from a goal's Projects section."
      : "None of this team's projects have dependencies or goals."}
  />
{:else}
  <div class="scroll">
    <svg
      width={layout.width}
      height={layout.height}
      viewBox="0 0 {layout.width} {layout.height}"
      role="group"
      aria-label="Project dependencies"
    >
      <defs>
        <marker id="dep-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" class="arrow" />
        </marker>
        <marker id="dep-arrow-lit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" class="arrow lit" />
        </marker>
      </defs>

      <g class="edges">
        {#each layout.edges as e (`${e.source}>${e.target}`)}
          {@const on = lit !== null && lit.has(e.source) && lit.has(e.target)}
          <path
            d={e.path}
            data-kind={e.kind}
            class:lit={on}
            class:dim={lit !== null && !on}
            marker-end="url(#{on ? 'dep-arrow-lit' : 'dep-arrow'})"
          />
        {/each}
      </g>

      <g class="nodes">
        {#each layout.nodes as n (n.key)}
          <a
            href={n.href}
            class="card-node"
            data-tone={n.tone}
            data-kind={n.kind}
            class:context={n.context}
            class:dim={lit !== null && !lit.has(n.key)}
            aria-label="{n.label}, {n.kind === 'GOAL' ? 'goal' : 'project'}, {n.detail}"
            onpointerenter={() => (hovered = n.key)}
            onpointerleave={() => (hovered = null)}
            onfocus={() => (hovered = n.key)}
            onblur={() => (hovered = null)}
          >
            <title>{n.label}{n.context ? ' (another team)' : ''}</title>
            <rect class="body" x={n.x} y={n.y} width={W} height={H} rx="6" />
            <rect class="stripe" x={n.x} y={n.y} width="4" height={H} rx="2" />
            <text class="name" x={n.x + 14} y={n.y + 18}>{truncateMiddle(n.label, MAX_CHARS)}</text>
            <text class="detail" x={n.x + 14} y={n.y + 34}>{n.kind === 'GOAL' ? 'Goal · ' : ''}{n.detail}</text>
          </a>
        {/each}
      </g>
    </svg>
  </div>
{/if}

<p class="footer text-sm muted">
  {#if map.nodes.length > 0}Upstream work on the left; hover a card to see what it blocks and what blocks it.{/if}
  {#if map.unlinked > 0}
    <a href={tableHref}>{map.unlinked} {map.unlinked === 1 ? 'project has' : 'projects have'} no dependencies or goals.</a>
  {/if}
</p>

<style lang="scss">
  .scroll {
    overflow: auto;
    max-height: 75vh;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
  }
  svg {
    display: block;
    user-select: none;
  }
  .edges path {
    fill: none;
    stroke: var(--text-3);
    stroke-opacity: 0.5;
    stroke-width: 1.4;
    transition: stroke-opacity 0.15s;
    &[data-kind='GOAL'] { stroke-dasharray: 4 3; }
    &.lit { stroke: var(--accent); stroke-opacity: 1; stroke-width: 2; }
    &.dim { stroke-opacity: 0.12; }
  }
  .arrow {
    fill: var(--text-3);
    &.lit { fill: var(--accent); }
  }
  .card-node {
    cursor: pointer;
    outline: none;
    text-decoration: none;
    transition: opacity 0.15s;
    &[data-tone='accent'] { --c: var(--accent); }
    &[data-tone='success'] { --c: var(--success); }
    &[data-tone='warning'] { --c: var(--warning); }
    &[data-tone='danger'] { --c: var(--danger); }
    &[data-tone='muted'] { --c: var(--text-3); }
    .body {
      fill: var(--surface);
      stroke: var(--border-strong);
      stroke-width: 1;
    }
    &[data-kind='GOAL'] .body { fill: var(--surface-2); }
    .stripe { fill: var(--c); }
    .name {
      font-size: var(--fs-md);
      fill: var(--text);
      pointer-events: none;
    }
    .detail {
      font-size: var(--fs-xs);
      fill: var(--text-2);
      pointer-events: none;
    }
    &:hover .body, &:focus-visible .body { stroke: var(--accent); stroke-width: 2; }
    &.context { opacity: 0.55; }
    &.context .body { stroke-dasharray: 3 3; }
    &.dim { opacity: 0.25; }
  }
  .footer {
    margin-top: var(--sp-2);
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
</style>
