<script lang="ts">
  // A sync's state, kept short: a coloured dot and when (green: current; amber: over a week old,
  // a source skipped, or never synced; red: the last sync failed). The full story is the tooltip.
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
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
    background: var(--text-3);
    &.ok { background: var(--success); }
    &.warning { background: var(--warning); }
    &.error { background: var(--danger); }
  }
</style>
