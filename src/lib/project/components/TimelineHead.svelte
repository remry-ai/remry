<script lang="ts">
  // The Timing column's header: month ticks and labels, and today, on the shared axis.
  import type { TimelineAxis } from '../project-timeline';

  interface Props {
    readonly axis: TimelineAxis;
  }

  const { axis }: Props = $props();
  const hasYear = $derived(axis.months.some((m) => m.year !== null));
</script>

<div class="axis" class:has-year={hasYear} aria-label="Timing">
  {#each axis.months as month (month.offset)}
    <span class="tick" style="--at: {month.offset}">{month.label ?? ''}{#if month.year}<span class="year">{month.year}</span>{/if}</span>
  {/each}
  <span class="today" style="--at: {axis.today}" title="Today"></span>
</div>

<style lang="scss">
  .axis {
    position: relative;
    height: 1.4em;
    &.has-year { height: 2.8em; }
  }
  .tick {
    position: absolute;
    top: 0;
    left: calc(var(--at) * 100%);
    padding-left: var(--sp-1);
    border-left: 1px solid var(--border);
    white-space: nowrap;
    // The table header's uppercase and tracking make three letters wider than a month.
    text-transform: none;
    letter-spacing: normal;
  }
  .year {
    display: block;
    color: var(--text-3);
  }
  // Continues the rows' dashed today line up through the header.
  .today {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--at) * 100%);
    border-left: 1px dashed var(--border-strong);
  }
</style>
