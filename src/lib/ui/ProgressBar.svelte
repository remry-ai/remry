<script lang="ts">
  // A 0–1 measure as a thin bar, with optional text beside it. A null value
  // renders an empty track.
  interface Props {
    readonly value: number | null;
    readonly tone?: 'accent' | 'success' | 'warning' | 'danger' | 'muted';
    readonly label?: string;
  }

  const { value, tone = 'accent', label }: Props = $props();

  const percent = $derived(value === null ? 0 : Math.round(Math.min(1, Math.max(0, value)) * 100));
</script>

<div class="progress">
  <div
    class="track"
    role="progressbar"
    aria-label={label ?? 'Progress'}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={value === null ? undefined : percent}
  >
    <div class="fill {tone}" style="--value: {percent}%"></div>
  </div>
  {#if label}<span class="text-xs text-2">{label}</span>{/if}
</div>

<style lang="scss">
  .progress {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-width: 0;
  }
  .track {
    flex: 1;
    min-width: 48px;
    height: 6px;
    overflow: hidden;
    border-radius: var(--r-full);
    background: var(--surface-inset);
  }
  .fill {
    width: var(--value);
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
    &.success { background: var(--success); }
    &.warning { background: var(--warning); }
    &.danger { background: var(--danger); }
    &.muted { background: var(--border-strong); }
  }
</style>
