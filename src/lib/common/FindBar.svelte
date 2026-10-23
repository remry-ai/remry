<script lang="ts">
  // ⌘F in the desktop app's window, which has no find bar of its own. In a browser it renders
  // nothing and leaves ⌘F to the browser's. Matches are painted with the CSS Highlight API
  // (`::highlight(find-match)` in styles/_base.scss), so the page's DOM is never touched.
  import { onMount, tick } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import {
    FIND_SKIP_ATTR,
    findAgainDirection,
    findRanges,
    isFindShortcut,
    matchLabel,
    stepIndex,
  } from './find-in-page';

  let enabled = $state(false);
  let open = $state(false);
  let query = $state('');
  let ranges: Range[] = [];
  let index = $state(-1);
  let total = $state(0);
  let input: HTMLInputElement | undefined = $state();

  const highlights = (): HighlightRegistry | null =>
    typeof CSS !== 'undefined' && 'highlights' in CSS ? CSS.highlights : null;

  const paint = (): void => {
    const registry = highlights();
    if (!registry) return;
    registry.set('find-match', new Highlight(...ranges));
    const current = ranges[index];
    if (current) registry.set('find-current', new Highlight(current));
    else registry.delete('find-current');
  };

  const clear = (): void => {
    highlights()?.delete('find-match');
    highlights()?.delete('find-current');
  };

  const reveal = (): void => {
    const el = ranges[index]?.startContainer.parentElement;
    el?.scrollIntoView({ block: 'center', inline: 'nearest' });
  };

  /** Searches again (the page may have changed), keeping the place, then moves `direction`. */
  const search = (direction: 1 | -1 | 0): void => {
    ranges = findRanges(document.body, query);
    total = ranges.length;
    const kept = Math.min(Math.max(index, -1), total - 1);
    index = direction === 0 ? (total > 0 ? Math.max(kept, 0) : -1) : stepIndex(kept, total, direction);
    paint();
    reveal();
  };

  let typing: ReturnType<typeof setTimeout> | undefined;
  const onInput = (): void => {
    clearTimeout(typing);
    index = -1;
    typing = setTimeout(() => search(0), 120);
  };

  const show = async (): Promise<void> => {
    open = true;
    await tick();
    input?.focus();
    input?.select();
    if (query) search(0);
  };

  const close = (): void => {
    open = false;
    clear();
  };

  const onKeydown = (e: KeyboardEvent): void => {
    if (!enabled) return;
    if (isFindShortcut(e)) {
      e.preventDefault();
      void show();
      return;
    }
    const again = findAgainDirection(e);
    if (again && open && query) {
      e.preventDefault();
      search(again);
    }
  };

  const onInputKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      search(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  onMount(() => {
    enabled = (window as { __remryDesktop?: boolean }).__remryDesktop === true;
    return clear;
  });

  // A new page has different text: search it afresh, from the top.
  afterNavigate(() => {
    if (!open || !query) return;
    index = -1;
    void tick().then(() => search(0));
  });
</script>

<svelte:window onkeydown={onKeydown} />

{#if enabled && open}
  <div class="find-bar" role="search" {...{ [FIND_SKIP_ATTR]: '' }}>
    <input
      bind:this={input}
      bind:value={query}
      oninput={onInput}
      onkeydown={onInputKeydown}
      type="search"
      class="sm"
      placeholder="Find on page"
      aria-label="Find on page"
    />
    <span class="count text-xs" aria-live="polite">{matchLabel(index, total, query)}</span>
    <button type="button" class="btn icon sm" aria-label="Previous match" title="Previous (⇧⌘G)" disabled={total === 0} onclick={() => search(-1)}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m3 7.5 3-3 3 3"/></svg>
    </button>
    <button type="button" class="btn icon sm" aria-label="Next match" title="Next (⌘G)" disabled={total === 0} onclick={() => search(1)}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m3 4.5 3 3 3-3"/></svg>
    </button>
    <button type="button" class="btn icon sm" aria-label="Close find" title="Close (Esc)" onclick={close}>&times;</button>
  </div>
{/if}

<style lang="scss">
  .find-bar {
    position: fixed;
    top: calc(var(--nav-h) + var(--sp-2));
    right: var(--sp-4);
    z-index: var(--z-find);
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    padding: var(--sp-1) var(--sp-2);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    box-shadow: var(--shadow-3);
    input { width: 200px; }
  }
  .count {
    min-width: 5.5em;
    text-align: right;
    color: var(--text-3);
    white-space: nowrap;
  }
</style>
