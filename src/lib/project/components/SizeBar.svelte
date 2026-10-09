<script lang="ts">
  // The projects list's Size: a thin vertical bar whose height shows the
  // estimate relative to the biggest project shown, with "~18d" beside it
  // (project-timeline.ts).
  import { sizeBarHeight, SIZE_BAR_MAX } from '../project-timeline';

  interface Props {
    /** 0–1 of the biggest estimate shown. */
    readonly fraction: number;
    readonly label: string;
  }

  const { fraction, label }: Props = $props();
</script>

<span class="size">
  <span class="slot" style="--max: {SIZE_BAR_MAX}px"><span class="bar" style="--h: {sizeBarHeight(fraction)}px"></span></span>
  <span class="text-xs text-2">{label}</span>
</span>

<style lang="scss">
  .size {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }
  // The full height as a faint track, the bar rising from its bottom.
  .slot {
    display: inline-flex;
    align-items: flex-end;
    width: 6px;
    height: var(--max);
    border-radius: var(--r-sm);
    background: var(--surface-inset);
  }
  .bar {
    width: 100%;
    height: var(--h);
    border-radius: var(--r-sm);
    background: var(--text-3);
  }
</style>
