<script lang="ts">
  // 16px icon for a link: the tool's letter mark when linkSource knows the
  // address, otherwise a chain. Decorative; the row names the tool in its title.
  import type { LinkSource } from '../source';

  const { source }: { readonly source: LinkSource | null } = $props();
</script>

{#if source}
  <span class="mark" class:wide={source.mark.length > 1} aria-hidden="true">{source.mark}</span>
{:else}
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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

  svg { flex: none; color: var(--text-3); }
</style>
