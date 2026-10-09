<script lang="ts">
  // The home page's focus graph: one entity in the middle, everything one link
  // away grouped by how the link reads ("Reports to", "Depends on"), and an
  // outer ring of what each of those links to in turn.
  // Clicking a neighbour moves it to the middle through `?focus=TYPE:id`, so
  // Back returns to the previous one. Docs, notes, todos and reports can't be
  // the middle, so they open instead.
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { trpc } from '$shared/trpc/client';
  import { loadEntityOptions, type EntityOption } from '$shared/trpc/load-entity-options';
  import { focusKey, type FocusBranch, type FocusGraph, type FocusNode } from '$shared/types/home';
  import type { RelatableType } from '$shared/types/enums';
  import { ENTITY_SEARCH_SCOPES, entityTypeLabel, typedIdValue } from '$shared/utils/entity';
  import { model } from '$lib/stores/notebook-model';
  import SearchPicker from '$lib/ui/SearchPicker.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { errorMessage } from '$lib/ui/submit';
  import { truncateMiddle } from '$shared/utils/text';
  import { focusHeight, layoutFocus } from '../focus-layout';

  interface Props {
    readonly graph: FocusGraph & { readonly focus: FocusNode };
  }

  const { graph }: Props = $props();

  const WIDTH = 1000;
  const MAX_CHARS = 24;
  const PILL_H = 26;

  const truncate = (s: string): string => truncateMiddle(s, MAX_CHARS);
  /** Rough pill width for 11px text; the layout only needs it to centre the pill. */
  const pillWidth = (text: string, dot = true): number => Math.round(text.length * 6.3 + (dot ? 30 : 20));

  /** Colour groups: projects, people, goals, org units, and everything else. */
  const colourOf = (type: RelatableType): string => {
    switch (type) {
      case 'PROJECT': return 'project';
      case 'PERSON': return 'person';
      case 'GOAL': return 'goal';
      case 'GROUP': return 'org';
      default: return 'other';
    }
  };
  const COLOUR_LABEL: Record<string, string> = {
    project: 'Projects',
    person: 'People',
    goal: 'Goals',
    org: 'Groups',
    other: 'Wiki and other'
  };

  const branchOf = (n: FocusNode): FocusBranch | undefined => graph.branches[focusKey(n)];
  const branchSize = (b: FocusBranch | undefined): number => (b ? b.nodes.length + (b.more > 0 ? 1 : 0) : 0);

  const outerCount = $derived(Object.values(graph.branches).reduce((n, b) => n + branchSize(b), 0));
  const pillCount = $derived(graph.groups.reduce((n, g) => n + g.nodes.length + (g.more > 0 ? 1 : 0), 0) + outerCount);
  const height = $derived(focusHeight(pillCount));
  const layout = $derived(
    layoutFocus(
      graph.groups.map((g) => ({
        size: g.nodes.length + (g.more > 0 ? 1 : 0),
        branches: [...g.nodes.map((n) => branchSize(branchOf(n))), ...(g.more > 0 ? [0] : [])]
      })),
      WIDTH,
      height
    )
  );
  const types = $derived([
    ...new Set([
      ...graph.groups.flatMap((g) => g.nodes.map((n) => colourOf(n.type))),
      ...Object.values(graph.branches).flatMap((b) => b.nodes.map((n) => colourOf(n.type)))
    ])
  ]);

  // Hover keys: `gi:ni` an inner pill (lights its branch), `group:gi` a group label, `o:gi:ni:ci` an outer pill.
  const innerLit = (gi: number, ni: number): boolean =>
    hovered === `${gi}:${ni}` || hovered === `group:${gi}` || (hovered?.startsWith(`o:${gi}:${ni}:`) ?? false);
  const outerLit = (gi: number, ni: number, ci: number): boolean =>
    hovered === `${gi}:${ni}` || hovered === `o:${gi}:${ni}:${ci}`;

  const centreText = $derived(truncate(graph.focus.label));
  const centreWidth = $derived(Math.round(centreText.length * 7.6 + 32));

  let hovered = $state<string | null>(null);
  let picking = $state(false);
  let options = $state<readonly EntityOption[]>([]);
  let loadingOptions = $state(false);
  let loadError = $state('');

  const focusHref = (n: FocusNode): string => {
    const url = new URL(page.url);
    url.searchParams.set('focus', typedIdValue(n.type, n.id));
    url.searchParams.delete('popup');
    return `${url.pathname}${url.search}`;
  };

  const openPicker = async () => {
    picking = true;
    if (options.length > 0) return;
    loadingOptions = true;
    try {
      options = await loadEntityOptions(trpc(), { entityType: graph.focus.type, entityId: graph.focus.id });
    } catch (e: unknown) {
      loadError = errorMessage(e);
    } finally {
      loadingOptions = false;
    }
  };

  const pick = async (id: string) => {
    picking = false;
    const url = new URL(page.url);
    url.searchParams.set('focus', id);
    await goto(`${url.pathname}${url.search}`, { noScroll: true, keepFocus: true });
  };
</script>

<section class="focus-section section" data-sveltekit-noscroll data-sveltekit-keepfocus>
  <header class="section-header">
    <h2>
      Around <a href={graph.focus.href}>{graph.focus.label}</a>
      <span class="muted text-sm">{entityTypeLabel(graph.focus.type)}</span>
    </h2>
    <div class="actions">
      {#if picking}
        <SearchPicker
          label="Focus on"
          options={options.filter((o) => $model.shows(o.scope))}
          scopes={ENTITY_SEARCH_SCOPES.filter((s) => $model.shows(s.id))}
          loading={loadingOptions}
          onPick={pick}
          onCancel={() => (picking = false)}
        />
        {#if loadError}<span class="inline-error" role="alert">{loadError}</span>{/if}
      {:else}
        <button type="button" class="btn sm" onclick={openPicker}>Change focus</button>
      {/if}
    </div>
  </header>

  <div class="scroll">
    <svg viewBox="0 0 {WIDTH} {height}" role="group" aria-label="Everything linked to {graph.focus.label}">
      <g class="edges">
        {#each graph.groups as group, gi (group.label)}
          {#each layout.nodes[gi] ?? [] as p, ni}
            <line
              x1={layout.centre.x}
              y1={layout.centre.y}
              x2={p.x}
              y2={p.y}
              class:lit={innerLit(gi, ni)}
              class:dim={hovered !== null && !innerLit(gi, ni)}
            />
          {/each}
        {/each}
        {#each graph.groups as group, gi (group.label)}
          {#each group.nodes as n, ni (`${n.type}:${n.id}`)}
            {@const from = layout.nodes[gi]?.[ni]}
            {#each layout.outer[gi]?.[ni] ?? [] as p, ci}
              {#if from}
                <line
                  class="branch"
                  x1={from.x}
                  y1={from.y}
                  x2={p.x}
                  y2={p.y}
                  class:lit={outerLit(gi, ni, ci)}
                  class:dim={hovered !== null && !outerLit(gi, ni, ci)}
                />
              {/if}
            {/each}
          {/each}
        {/each}
      </g>

      <g class="labels">
        {#each graph.groups as group, gi (group.label)}
          {@const p = layout.labels[gi]}
          {#if p}
            <text
              class="group-label"
              class:lit={hovered?.startsWith(`${gi}:`) || hovered === `group:${gi}`}
              x={p.x}
              y={p.y}
              role="presentation"
              onpointerenter={() => (hovered = `group:${gi}`)}
              onpointerleave={() => (hovered = null)}
            >{group.label}</text>
          {/if}
        {/each}
      </g>

      <g class="nodes">
        {#each graph.groups as group, gi (group.label)}
          {#each group.nodes as n, ni (`${n.type}:${n.id}`)}
            {@const p = layout.nodes[gi]?.[ni]}
            {@const text = truncate(n.label)}
            {@const w = pillWidth(text)}
            {#if p}
              <a
                href={n.focusable ? focusHref(n) : n.href}
                class="pill"
                data-colour={colourOf(n.type)}
                class:dim={hovered !== null && !innerLit(gi, ni)}
                aria-label="{n.label} ({entityTypeLabel(n.type)}, {group.label.toLowerCase()})"
                onpointerenter={() => (hovered = `${gi}:${ni}`)}
                onpointerleave={() => (hovered = null)}
                onfocus={() => (hovered = `${gi}:${ni}`)}
                onblur={() => (hovered = null)}
              >
                <title>{n.label} · {entityTypeLabel(n.type)}{n.focusable ? '' : ' (opens)'}</title>
                <rect x={p.x - w / 2} y={p.y - PILL_H / 2} width={w} height={PILL_H} rx={PILL_H / 2} />
                <circle cx={p.x - w / 2 + 13} cy={p.y} r="4" />
                <text x={p.x - w / 2 + 23} y={p.y + 4}>{text}</text>
              </a>
            {/if}
          {/each}
          {#if group.more > 0}
            {@const p = layout.nodes[gi]?.[group.nodes.length]}
            {@const text = `+${group.more} more`}
            {@const w = pillWidth(text, false)}
            {#if p}
              <a
                href={graph.focus.href}
                class="pill more"
                class:dim={hovered !== null && hovered !== `group:${gi}`}
                aria-label="{group.more} more: open {graph.focus.label}"
              >
                <rect x={p.x - w / 2} y={p.y - PILL_H / 2} width={w} height={PILL_H} rx={PILL_H / 2} />
                <text x={p.x - w / 2 + 10} y={p.y + 4}>{text}</text>
              </a>
            {/if}
          {/if}
        {/each}

        {#each graph.groups as group, gi (group.label)}
          {#each group.nodes as parent, ni (`${parent.type}:${parent.id}`)}
            {@const branch = branchOf(parent)}
            {#if branch}
              {#each branch.nodes as n, ci (`${n.type}:${n.id}`)}
                {@const p = layout.outer[gi]?.[ni]?.[ci]}
                {@const text = truncate(n.label)}
                {@const w = pillWidth(text)}
                {#if p}
                  <a
                    href={n.focusable ? focusHref(n) : n.href}
                    class="pill outer"
                    data-colour={colourOf(n.type)}
                    class:dim={hovered !== null && !outerLit(gi, ni, ci)}
                    aria-label="{n.label} ({entityTypeLabel(n.type)}, via {parent.label})"
                    onpointerenter={() => (hovered = `o:${gi}:${ni}:${ci}`)}
                    onpointerleave={() => (hovered = null)}
                    onfocus={() => (hovered = `o:${gi}:${ni}:${ci}`)}
                    onblur={() => (hovered = null)}
                  >
                    <title>{n.label} · {entityTypeLabel(n.type)}, via {parent.label}{n.focusable ? '' : ' (opens)'}</title>
                    <rect x={p.x - w / 2} y={p.y - PILL_H / 2} width={w} height={PILL_H} rx={PILL_H / 2} />
                    <circle cx={p.x - w / 2 + 13} cy={p.y} r="4" />
                    <text x={p.x - w / 2 + 23} y={p.y + 4}>{text}</text>
                  </a>
                {/if}
              {/each}
              {#if branch.more > 0}
                {@const p = layout.outer[gi]?.[ni]?.[branch.nodes.length]}
                {@const text = `+${branch.more} more`}
                {@const w = pillWidth(text, false)}
                {#if p}
                  <a
                    href={parent.focusable ? focusHref(parent) : parent.href}
                    class="pill more outer"
                    class:dim={hovered !== null && hovered !== `${gi}:${ni}`}
                    aria-label="{branch.more} more linked to {parent.label}"
                  >
                    <rect x={p.x - w / 2} y={p.y - PILL_H / 2} width={w} height={PILL_H} rx={PILL_H / 2} />
                    <text x={p.x - w / 2 + 10} y={p.y + 4}>{text}</text>
                  </a>
                {/if}
              {/if}
            {/if}
          {/each}
        {/each}

        <a href={graph.focus.href} class="pill centre" data-colour={colourOf(graph.focus.type)} aria-label="Open {graph.focus.label}">
          <title>Open {graph.focus.label}</title>
          <rect x={layout.centre.x - centreWidth / 2} y={layout.centre.y - 17} width={centreWidth} height="34" rx="17" />
          <text x={layout.centre.x} y={layout.centre.y + 5}>{centreText}</text>
        </a>
      </g>
    </svg>
  </div>

  {#if graph.groups.length === 0}
    <EmptyState message="Nothing is linked to {graph.focus.label} yet. Add links from its Related section." small />
  {:else}
    <div class="footer">
      <ul class="legend">
        {#each types as t (t)}
          <li data-colour={t}><span class="swatch"></span>{COLOUR_LABEL[t]}</li>
        {/each}
      </ul>
      <p class="text-sm muted">The outer ring is one link further. Click anything to move it to the middle. Back returns.</p>
    </div>
  {/if}
</section>

<style lang="scss">
  .focus-section {
    [data-colour='project'] { --c: var(--viz-1); }
    [data-colour='person'] { --c: var(--viz-2); }
    [data-colour='goal'] { --c: var(--viz-3); }
    [data-colour='org'] { --c: var(--viz-4); }
    [data-colour='other'] { --c: var(--text-3); }
  }
  h2 {
    font-size: var(--fs-base);
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    a { color: inherit; }
  }
  .actions {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-width: 0;
  }
  .scroll {
    overflow-x: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
  }
  svg {
    display: block;
    width: 100%;
    min-width: 640px;
    height: auto;
    user-select: none;
  }
  line {
    stroke: var(--text-3);
    stroke-opacity: 0.35;
    stroke-width: 1.2;
    transition: stroke-opacity 0.15s;
    &.lit { stroke: var(--accent); stroke-opacity: 1; }
    &.dim { stroke-opacity: 0.12; }
    &.branch { stroke-opacity: 0.2; stroke-dasharray: 3 3; }
    &.branch.lit { stroke-opacity: 1; }
    &.branch.dim { stroke-opacity: 0.08; }
  }
  .group-label {
    font-size: var(--fs-xs);
    fill: var(--text-3);
    text-anchor: middle;
    paint-order: stroke;
    stroke: var(--surface);
    stroke-width: 4px;
    stroke-linejoin: round;
    &.lit { fill: var(--accent); }
  }
  .pill {
    cursor: pointer;
    text-decoration: none;
    outline: none;
    transition: opacity 0.15s;
    rect {
      fill: var(--surface);
      stroke: var(--c, var(--border-strong));
      stroke-width: 1.5;
    }
    circle { fill: var(--c); }
    text {
      font-size: var(--fs-xs);
      fill: var(--text);
      pointer-events: none;
    }
    &:hover rect, &:focus-visible rect { stroke: var(--accent); stroke-width: 2; }
    &.dim { opacity: 0.35; }
    // The outer ring reads as secondary until it's hovered.
    &.outer { opacity: 0.8; }
    &.outer:hover, &.outer:focus-visible { opacity: 1; }
    &.outer.dim { opacity: 0.25; }
    &.more {
      rect { stroke: var(--border-strong); stroke-dasharray: 3 3; }
      text { fill: var(--text-2); }
    }
    &.centre {
      rect { fill: var(--c); stroke: var(--surface); stroke-width: 3; }
      text {
        font-size: var(--fs-base);
        font-weight: 600;
        fill: var(--accent-text);
        text-anchor: middle;
      }
    }
  }
  .footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    margin-top: var(--sp-2);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--fs-xs);
    color: var(--text-2);
    li { display: inline-flex; align-items: center; gap: var(--sp-1); }
  }
  .swatch {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
  }
</style>
