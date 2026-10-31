<script lang="ts">
  // 16px icon for a link: a page for a file uploaded as a link, the tool's letter mark when
  // linkSource knows the address, otherwise a chain. Decorative; the row names it in its title.
  import type { LinkSource } from '../source';

  // small: 12px, for a line of small text (a doc's sources).
  const { source, small = false, file = false }: { readonly source: LinkSource | null; readonly small?: boolean; readonly file?: boolean } = $props();
</script>

{#if file}
  <svg width={small ? 12 : 14} height={small ? 12 : 14} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 1.5h5.5L13 5v9.5H4z" /><path d="M9.5 1.5V5H13" />
  </svg>
{:else if source}
  <span class="mark" class:wide={source.mark.length > 1} class:small aria-hidden="true">{source.mark}</span>
{:else}
  <svg width={small ? 11 : 14} height={small ? 11 : 14} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M6.8 9.2a2.8 2.8 0 0 0 4 0l2.4-2.4a2.8 2.8 0 0 0-4-4l-.9.9" />
    <path d="M9.2 6.8a2.8 2.8 0 0 0-4 0L2.8 9.2a2.8 2.8 0 0 0 4 4l.9-.9" />
  </svg>
{/if}

<style lang="scss">
  .mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex: none;
    border: 1px solid var(--border-strong);
    border-radius: var(--r-sm);
    background: var(--surface-2);
    color: var(--text-2);
    font-size: var(--fs-xs);
    font-weight: 600;
    line-height: 1;
    letter-spacing: -0.02em;
  }

  .wide { width: 20px; }
  .small {
    width: 13px;
    height: 13px;
    font-size: 9px; // the 13px mark's letter: below the type scale
    &.wide { width: 17px; }
  }

  svg { flex: none; color: var(--text-3); }
</style>
