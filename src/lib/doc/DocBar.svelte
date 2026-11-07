<script lang="ts">
  // An open doc's bar, the same for every type: its view tabs (a document's Markdown, Editor and
  // Preview; none for a spreadsheet or drawing), Export PDF, the doc's own actions, then ×. It
  // stays in view while a long doc scrolls, and once it sticks a row above it shows the doc's
  // tag and title, so a doc scrolled down still names itself. That row is pulled up over what's
  // above the bar (hidden, so nothing jumps when it shows); the bar is stuck once it has moved.
  import type { Snippet } from 'svelte';
  import ProBadge from '$lib/ui/ProBadge.svelte';
  import { BODY_LABELS, type BodyType } from '$shared/types/body-types';

  interface Props {
    readonly title: string;
    readonly bodyType: BodyType;
    /** False when a heading above already names it (a wiki page's): no title row. */
    readonly showTitle?: boolean;
    readonly tabs?: Snippet;
    /** The print page (Export PDF), shown while the doc has something to print. */
    readonly exportHref?: string;
    /** A document saves unsaved changes before it goes there. */
    readonly onExport?: (e: MouseEvent) => void;
    /** The doc's own buttons, before ×: a document's pencil or Save, a drawing's pencil. */
    readonly actions?: Snippet;
    readonly onClose?: () => void;
  }

  const { title, bodyType, showTitle = true, tabs, exportHref, onExport, actions, onClose }: Props = $props();

  let sentinelEl = $state<HTMLDivElement>();
  let stickyEl = $state<HTMLDivElement>();
  let titleRowEl = $state<HTMLDivElement>();
  let stuck = $state(false);
  $effect(() => {
    if (!showTitle || !sentinelEl || !stickyEl || !titleRowEl) return;
    const sentinel = sentinelEl, sticky = stickyEl, row = titleRowEl;
    let frame = 0;
    const measure = () => {
      frame = 0;
      stuck = sticky.getBoundingClientRect().top > sentinel.getBoundingClientRect().top - row.offsetHeight + 1;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    // Capture: the page scrolls in the window or in a layout column, depending on its width.
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  });
</script>

<div class="doc-sentinel" bind:this={sentinelEl}></div>
<div class="doc-sticky" class:stuck class:with-title={showTitle} bind:this={stickyEl}>
  {#if showTitle}
    <div class="doc-sticky-title" bind:this={titleRowEl} aria-hidden={!stuck}><span class="badge selected">{BODY_LABELS[bodyType]}</span><span class="truncate">{title}</span></div>
  {/if}
  <div class="doc-bar">
    <div class="tabs scroll">
      {#if tabs}{@render tabs()}{/if}
      {#if exportHref}
        <a class="tab" class:divided={!!tabs} href={exportHref} onclick={onExport}>Export PDF <ProBadge /></a>
      {/if}
    </div>
    <div class="doc-actions">
      {#if actions}{@render actions()}{/if}
      {#if onClose}
        <button type="button" class="btn icon sm" onclick={onClose} aria-label="Close" title="Close">&times;</button>
      {/if}
    </div>
  </div>
</div>

<style lang="scss">
  .doc-sentinel { height: 0; }
  // Above the editor's own sticky toolbar. The title row overlaps what's above it until the
  // bar sticks, so it lets clicks through while hidden. The heights are DocEditor's too
  // (--doc-title-h, --doc-bar-h), which offsets its editor's toolbar by them.
  .doc-sticky {
    --doc-title-h: 0px;
    --doc-bar-h: calc(var(--control-h) + var(--sp-2));
    &.with-title { --doc-title-h: var(--control-h); }
    position: sticky;
    top: var(--sticky-top, 0px);
    z-index: calc(var(--z-sticky) + 1);
    margin-top: calc(-1 * var(--doc-title-h));
    margin-bottom: var(--sp-2);
    pointer-events: none;
    > * { pointer-events: auto; }
  }
  .doc-sticky-title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    height: var(--doc-title-h);
    min-width: 0;
    font-weight: 600;
    background: var(--surface);
    visibility: hidden;
    pointer-events: none;
  }
  .stuck .doc-sticky-title {
    visibility: visible;
    pointer-events: auto;
  }
  .doc-bar {
    display: flex;
    align-items: flex-end;
    height: var(--doc-bar-h);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    .tabs { flex: 1; align-self: stretch; align-items: flex-end; border-bottom: none; }
  }
  // Spaced off the tabs, which scroll under it on a phone, so the buttons aren't crowded.
  .doc-actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding-left: var(--sp-3);
    padding-bottom: var(--sp-1);
  }
</style>
