<script lang="ts">
  // A sync's state, kept short: a dot and when (soft green: synced and current; soft amber: over a week old,
  // a source skipped, or never synced; soft red: the last sync failed). The full story is the tooltip.
  import type { SyncTone } from '../last-sync';

  interface Props {
    readonly tone: SyncTone;
    /** When: "2h ago", "12 Oct", or "Not synced". Empty for the dot alone. */
    readonly text: string;
    /** The full sentence, for the tooltip and screen readers. */
    readonly title: string;
  }

  const { tone, text, title }: Props = $props();
</script>

<span class="sync-status text-xs text-2" {title}>
  <span class="dot {tone}" aria-hidden="true"></span>
  {#if text}<span>{text}</span>{/if}
  <span class="sr-only">: {title}</span>
</span>

<style lang="scss">
  .sync-status {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    white-space: nowrap;
  }
  // Softened on purpose: green says it's done and current (grey would read as not done), and
  // only amber or red asks to be looked at. Grey is left for nothing to sync (no sources).
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex: none;
    background: var(--border-strong);
    &.ok { background: color-mix(in srgb, var(--success) 55%, transparent); }
    &.warning { background: color-mix(in srgb, var(--warning) 55%, transparent); }
    &.error { background: color-mix(in srgb, var(--danger) 60%, transparent); }
  }
</style>
