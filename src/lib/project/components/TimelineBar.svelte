<script lang="ts">
  // One row of the projects list's Timing swimlane: the project's bar on the
  // shared axis (project-timeline.ts), its late stretch, and the today line.
  import type { TimelineBar } from '../project-timeline';

  interface Props {
    readonly bar: TimelineBar | null;
    /** Today's offset on the axis (0–1). */
    readonly today: number;
  }

  const { bar, today }: Props = $props();
</script>

<div class="lane" title={bar?.title} aria-label={bar?.title ?? 'No dates'} role="img">
  <span class="today" style="--at: {today}"></span>
  {#if bar}
    {#if bar.marker}
      <span class="marker" class:open={bar.tentative} data-tone={bar.tone} style="--at: {bar.left}"></span>
    {:else}
      <span class="bar" class:open={bar.open || bar.tentative} data-tone={bar.tone} style="--left: {bar.left}; --width: {bar.width}"></span>
    {/if}
    {#if bar.late}
      <span class="bar late" style="--left: {bar.late.left}; --width: {bar.late.width}"></span>
    {/if}
  {/if}
</div>

<style lang="scss">
  .lane {
    position: relative;
    height: 14px;
  }
  .today {
    position: absolute;
    top: -6px;
    bottom: -6px;
    left: calc(var(--at) * 100%);
    border-left: 1px dashed var(--border-strong);
  }
  .bar, .marker {
    position: absolute;
    top: 3px;
    height: 8px;
    border-radius: var(--r-full);
    background: var(--tone);
  }
  .bar {
    left: calc(var(--left) * 100%);
    // At least a sliver, so a one-day project still shows.
    width: max(4px, calc(var(--width) * 100%));
    &.open { opacity: 0.45; }
    &.late { --tone: var(--danger); border-radius: 0 var(--r-full) var(--r-full) 0; }
  }
  .marker {
    left: calc(var(--at) * 100%);
    width: 8px;
    margin-left: -4px;
    border-radius: 2px;
    transform: rotate(45deg);
  }
  [data-tone='accent'] { --tone: var(--accent); }
  [data-tone='success'] { --tone: var(--success); }
  [data-tone='warning'] { --tone: var(--warning); }
  [data-tone='danger'] { --tone: var(--danger); }
  [data-tone='muted'] { --tone: var(--text-3); }
  [data-tone='viz-1'] { --tone: var(--viz-1); }
  [data-tone='viz-4'] { --tone: var(--viz-4); }
  .marker.open { opacity: 0.45; }
</style>
