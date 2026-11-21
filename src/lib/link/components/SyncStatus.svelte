<script lang="ts">
  // A sync's state, kept short: a dot and when (blue: synced and current; amber: over a week old,
  // a source skipped, or never synced; red: the last sync failed). The full story is the tooltip.
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
  // The sync state colours (--sync-*, shared with a source link's icon): blue says it's done and
  // current (grey would read as not done), amber or red asks to be looked at. Grey is left for
  // nothing to sync (no sources).
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex: none;
    background: var(--border-strong);
    &.ok { background: var(--sync-ok); }
    &.warning { background: var(--sync-warning); }
    &.error { background: var(--sync-error); }
  }
</style>
