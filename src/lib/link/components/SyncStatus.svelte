<script lang="ts">
  // A sync's state, kept short: a dot and when (grey: current; soft amber: over a week old,
  // a source skipped, or never synced; soft red: the last sync failed). The full story is the tooltip.
  import type { SyncTone } from '../last-sync';

  interface Props {
    readonly tone: SyncTone;
    /** When: "2h ago", "12 Oct", or "Not synced". */
    readonly text: string;
    /** The full sentence, for the tooltip and screen readers. */
    readonly title: string;
  }

  const { tone, text, title }: Props = $props();
</script>

<span class="sync-status text-xs text-2" {title}>
  <span class="dot {tone}" aria-hidden="true"></span>
  <span>{text}</span>
  <span class="sr-only">: {title}</span>
</span>

<style lang="scss">
  .sync-status {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    white-space: nowrap;
  }
  // Quiet on purpose: a current sync is a plain grey dot, and only an amber or red one,
  // softened, asks to be looked at.
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex: none;
    background: var(--border-strong);
    &.warning { background: color-mix(in srgb, var(--warning) 55%, transparent); }
    &.error { background: color-mix(in srgb, var(--danger) 60%, transparent); }
  }
</style>
