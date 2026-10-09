<script lang="ts">
  // The Timing column's header: month ticks and labels, and today, on the shared axis.
  import type { TimelineAxis } from '../project-timeline';

  interface Props {
    readonly axis: TimelineAxis;
  }

  const { axis }: Props = $props();
</script>

<div class="axis" aria-label="Timing">
  {#each axis.months as month (month.offset)}
    <span class="tick" style="--at: {month.offset}">{month.label ?? ''}</span>
  {/each}
  <span class="today" style="--at: {axis.today}" title="Today"></span>
</div>

<style lang="scss">
  .axis {
    position: relative;
    height: 1.4em;
  }
  .tick {
    position: absolute;
    top: 0;
    left: calc(var(--at) * 100%);
    padding-left: var(--sp-1);
    border-left: 1px solid var(--border);
    white-space: nowrap;
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
