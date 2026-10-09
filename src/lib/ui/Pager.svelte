<script lang="ts">
  import { page } from '$app/state';
  import { pageCount } from './pager';

  // Previous / next links for a list paged by one query parameter (`?page=2`).
  // Page 1 removes the parameter. Each link is a plain link, like ParamToggle, so
  // it works before hydration. Shows nothing when everything fits on one page.
  interface Props {
    readonly param: string;
    /** The page shown, 1-based. */
    readonly current: number;
    readonly total: number;
    readonly pageSize: number;
    readonly ariaLabel: string;
  }

  const { param, current, total, pageSize, ariaLabel }: Props = $props();

  const pages = $derived(pageCount(total, pageSize));

  const hrefFor = (target: number): string => {
    const url = new URL(page.url);
    if (target <= 1) url.searchParams.delete(param);
    else url.searchParams.set(param, String(target));
    return `${url.pathname}${url.search}`;
  };
</script>

{#if pages > 1}
  <nav class="pager" aria-label={ariaLabel} data-sveltekit-noscroll data-sveltekit-keepfocus data-sveltekit-replacestate>
    {#if current > 1}
      <a class="btn sm" href={hrefFor(current - 1)} rel="prev">← Previous</a>
    {:else}
      <span class="btn sm" aria-disabled="true">← Previous</span>
    {/if}
    <span class="position">Page {current} of {pages}</span>
    {#if current < pages}
      <a class="btn sm" href={hrefFor(current + 1)} rel="next">Next →</a>
    {:else}
      <span class="btn sm" aria-disabled="true">Next →</span>
    {/if}
  </nav>
{/if}

<style lang="scss">
  .pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    padding-top: var(--sp-2);
  }
  .position { font-size: var(--fs-sm); color: var(--text-3); }
  [aria-disabled='true'] { opacity: 0.45; pointer-events: none; }
</style>
