<script lang="ts">
  // The Org Map's Work view: a lane per team, department or person that owns
  // work, its projects and goals as cards, and dependencies and goal links drawn
  // between them. Hovering a card lights up its upstream and downstream chain;
  // hovering a lane lights up the chains of everything it owns.
  import { truncateMiddle } from '$shared/utils/text';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { chainOf } from '$lib/project/dependency-map';
  import { buildWorkMap, layoutWorkMap, WORK_SIZES, type WorkMapInput } from '../work-map';

  interface Props {
    readonly input: WorkMapInput;
  }

  const { input }: Props = $props();

  const { cardWidth: W, cardHeight: H, pad, headerWidth } = WORK_SIZES;

  const map = $derived(buildWorkMap(input));
  const layout = $derived(layoutWorkMap(map));

  let hovered = $state<{ readonly kind: 'item' | 'lane'; readonly key: string } | null>(null);
  const lit = $derived.by(() => {
    if (!hovered) return null;
    if (hovered.kind === 'item') return chainOf(hovered.key, map.edges);
    const lane = map.lanes.find((l) => l.key === hovered?.key);
    return new Set(lane?.items.flatMap((i) => [...chainOf(i.key, map.edges)]) ?? []);
  });

  const departmentsText = (lane: (typeof layout.lanes)[number]): string =>
    lane.departments.map((d) => `${d.name} ${d.count}`).join(' · ');
  const KIND_LABELS = { TEAM: 'Team', DEPARTMENT: 'Department', GROUP: 'Group', PERSON: 'Person', NONE: 'Unowned' } as const;
  const kindLabel = (kind: (typeof layout.lanes)[number]['kind']): string => KIND_LABELS[kind];
</script>

{#if layout.lanes.length === 0}
  <EmptyState boxed message="Nothing is owned yet. Give projects and goals an owner (a team, department or person) and they'll show here." />
{:else}
  <div class="scroll">
    <svg viewBox="0 0 {layout.width} {layout.height}" role="group" aria-label="Work by owner">
      <defs>
        <marker id="work-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" class="arrow" />
        </marker>
        <marker id="work-arrow-lit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" class="arrow lit" />
        </marker>
      </defs>

      <g class="lanes">
        {#each layout.lanes as lane, i (lane.key)}
          {@const deps = departmentsText(lane)}
          <g
            class="lane"
            class:alt={i % 2 === 1}
            class:dim={lit !== null && !lane.items.some((item) => lit.has(item.key))}
            role="presentation"
            onpointerenter={() => (hovered = { kind: 'lane', key: lane.key })}
            onpointerleave={() => (hovered = null)}
          >
            <rect class="band" x={pad} y={lane.y} width={layout.width - pad * 2} height={lane.height} />
            {#if lane.href}
              <a href={lane.href} class="lane-name">
                <text x={pad + 12} y={lane.y + 24}>{truncateMiddle(lane.label, 26)}</text>
              </a>
            {:else}
              <text class="lane-name" x={pad + 12} y={lane.y + 24}>{lane.label}</text>
            {/if}
            <text class="lane-meta" x={pad + 12} y={lane.y + 40}>
              {kindLabel(lane.kind)} · {lane.items.length} {lane.items.length === 1 ? 'item' : 'items'}
            </text>
            {#if deps}
              <text class="lane-meta" x={pad + 12} y={lane.y + 55}>
                <title>People from: {deps}</title>{truncateMiddle(deps, 34)}
              </text>
            {/if}
            <line class="divider" x1={pad + headerWidth - 8} y1={lane.y + 8} x2={pad + headerWidth - 8} y2={lane.y + lane.height - 8} />
          </g>
        {/each}
      </g>

      <g class="edges">
        {#each layout.edges as e (`${e.source}>${e.target}`)}
          {@const on = lit !== null && lit.has(e.source) && lit.has(e.target)}
          <path
            d={e.path}
            data-kind={e.kind}
            class:lit={on}
            class:dim={lit !== null && !on}
            marker-end="url(#{on ? 'work-arrow-lit' : 'work-arrow'})"
          />
        {/each}
      </g>

      <g class="cards">
        {#each layout.items as n (n.key)}
          <a
            href={n.href}
            class="card-node"
            data-tone={n.tone}
            data-kind={n.kind}
            class:dim={lit !== null && !lit.has(n.key)}
            aria-label="{n.label}, {n.kind === 'GOAL' ? 'goal' : 'project'}, {n.detail}"
            onpointerenter={() => (hovered = { kind: 'item', key: n.key })}
            onpointerleave={() => (hovered = null)}
            onfocus={() => (hovered = { kind: 'item', key: n.key })}
            onblur={() => (hovered = null)}
          >
            <title>{n.label}</title>
            <rect class="body" x={n.x} y={n.y} width={W} height={H} rx="6" />
            <rect class="stripe" x={n.x} y={n.y} width="4" height={H} rx="2" />
            <text class="name" x={n.x + 12} y={n.y + 17}>{truncateMiddle(n.label, 27)}</text>
            <text class="detail" x={n.x + 12} y={n.y + 31}>{n.kind === 'GOAL' ? 'Goal · ' : ''}{n.detail}</text>
          </a>
        {/each}
      </g>
    </svg>
  </div>
  <p class="hint text-sm muted">
    Teams aren't part of a department, so each team lists where its people come from. Hover a card to see what it
    depends on and what depends on it.
  </p>
{/if}

<style lang="scss">
  .scroll {
    overflow-x: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
  }
  svg {
    display: block;
    width: 100%;
    min-width: 900px;
    height: auto;
    user-select: none;
  }
  .lane {
    transition: opacity 0.15s;
    .band { fill: transparent; }
    &.alt .band { fill: var(--surface-2); }
    &.dim { opacity: 0.45; }
    .divider { stroke: var(--border); }
  }
  .lane-name {
    text-decoration: none;
    text, &:is(text) {
      font-size: var(--fs-base);
      font-weight: 600;
      fill: var(--text);
    }
    &:hover text { fill: var(--accent); }
  }
  .lane-meta {
    font-size: var(--fs-xs);
    fill: var(--text-2);
  }
  .edges path {
    fill: none;
    stroke: var(--text-3);
    stroke-opacity: 0.45;
    stroke-width: 1.4;
    transition: stroke-opacity 0.15s;
    pointer-events: none;
    &[data-kind='GOAL'] { stroke-dasharray: 4 3; }
    &.lit { stroke: var(--accent); stroke-opacity: 1; stroke-width: 2; }
    &.dim { stroke-opacity: 0.08; }
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
      font-size: var(--fs-sm);
      fill: var(--text);
      pointer-events: none;
    }
    .detail {
      font-size: var(--fs-xs);
      fill: var(--text-2);
      pointer-events: none;
    }
    &:hover .body, &:focus-visible .body { stroke: var(--accent); stroke-width: 2; }
    &.dim { opacity: 0.25; }
  }
  .hint { margin-top: var(--sp-2); }
</style>
