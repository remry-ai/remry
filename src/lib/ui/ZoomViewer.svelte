<script lang="ts">
  // A diagram or image over the whole window, to zoom and pan: the wheel (or a
  // trackpad pinch) zooms at the cursor, dragging pans, double-click switches
  // between fitted and actual size, and Esc, × or a click on the backdrop
  // closes it. MarkdownRenderer opens it; the math is in zoom.ts.
  import { tick } from 'svelte';
  import { ZOOM_LIMITS, centredView, fitView, panBy, scaleLabel, zoomAt, type Size, type ZoomSource, type ZoomView } from './zoom';

  interface Props {
    readonly source: ZoomSource | null;
    readonly onClose: () => void;
  }

  const { source, onClose }: Props = $props();

  const PADDING = 32;

  let stage = $state<HTMLDivElement | null>(null);
  let dialog = $state<HTMLDivElement | null>(null);
  let content = $state<Size | null>(null);
  let view = $state<ZoomView>({ scale: 1, x: 0, y: 0 });
  let drag = $state<{ readonly id: number; readonly x: number; readonly y: number } | null>(null);
  let returnFocus: HTMLElement | null = null;

  const viewport = (): Size => ({ width: stage?.clientWidth ?? 0, height: stage?.clientHeight ?? 0 });
  const centre = () => ({ x: viewport().width / 2, y: viewport().height / 2 });
  const fit = () => { if (content) view = fitView(content, viewport(), PADDING); };
  const actualSize = () => { if (content) view = centredView(content, viewport(), 1); };
  const zoomBy = (factor: number, point = centre()) => { view = zoomAt(view, factor, point); };

  // An SVG knows its size; an image only once it has loaded.
  $effect(() => {
    if (!source) return;
    content = source.kind === 'svg' ? source.size : null;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void tick().then(() => { fit(); dialog?.focus(); });
    return () => { returnFocus?.focus(); };
  });

  const handleImageLoad = (e: Event) => {
    const img = e.currentTarget as HTMLImageElement;
    content = { width: img.naturalWidth, height: img.naturalHeight };
    fit();
  };

  const point = (e: MouseEvent) => {
    const rect = stage?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    // A pinch arrives as a wheel event with ctrlKey and small deltas; scale both smoothly.
    zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), point(e));
  };

  // Svelte's onwheel is passive, and zooming must stop the page scrolling.
  $effect(() => {
    const el = stage;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  });

  const handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    view = panBy(view, e.clientX - drag.x, e.clientY - drag.y);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (drag?.id === e.pointerId) drag = null;
  };

  const handleDoubleClick = (e: MouseEvent) => {
    if (!content) return;
    const fitted = fitView(content, viewport(), PADDING);
    if (Math.abs(view.scale - fitted.scale) < 0.01) zoomBy(1 / view.scale, point(e));
    else view = fitted;
  };

  // Keys stay in the viewer: Esc mustn't also close a popup underneath.
  const handleKeydown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') onClose();
    else if (e.key === '+' || e.key === '=') zoomBy(ZOOM_LIMITS.step);
    else if (e.key === '-') zoomBy(1 / ZOOM_LIMITS.step);
    else if (e.key === '0') fit();
    else return;
    e.preventDefault();
  };
</script>

<svelte:window onresize={fit} />

{#if source}
  <!-- Esc closes it from the keyboard (handled in the dialog). -->
  <div class="backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="viewer" role="dialog" aria-modal="true" aria-label="Zoomed diagram" tabindex="-1" bind:this={dialog} onkeydown={handleKeydown}>
      <div class="toolbar">
        <button type="button" class="btn icon sm" aria-label="Zoom out" title="Zoom out (−)" onclick={() => zoomBy(1 / ZOOM_LIMITS.step)}>−</button>
        <span class="scale" aria-live="polite">{scaleLabel(view)}</span>
        <button type="button" class="btn icon sm" aria-label="Zoom in" title="Zoom in (+)" onclick={() => zoomBy(ZOOM_LIMITS.step)}>+</button>
        <button type="button" class="btn sm" title="Fit to the window (0)" onclick={fit}>Fit</button>
        <button type="button" class="btn sm" title="Actual size" onclick={actualSize}>100%</button>
        <button type="button" class="btn icon sm close" aria-label="Close" title="Close (Esc)" onclick={onClose}>&times;</button>
      </div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="stage"
        class:dragging={drag !== null}
        bind:this={stage}
        onpointerdown={handlePointerDown}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
        onpointercancel={handlePointerUp}
        ondblclick={handleDoubleClick}
      >
        <div
          class="content"
          style="--x: {view.x}px; --y: {view.y}px; --s: {view.scale}; --w: {content?.width ?? 0}px; --h: {content?.height ?? 0}px"
        >
          {#if source.kind === 'svg'}
            <!-- A copy of a diagram the page already shows. -->
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html source.markup}
          {:else}
            <img src={source.src} alt={source.alt} draggable="false" onload={handleImageLoad} />
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-viewer);
    background: var(--scrim);
    padding: var(--sp-6);
    display: flex;
  }
  .viewer {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-3);
    overflow: hidden;
    &:focus { outline: none; }
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    padding: var(--sp-2) var(--sp-3);
    border-bottom: 1px solid var(--border);
    .close { margin-left: auto; }
  }
  .scale {
    min-width: 4ch;
    text-align: center;
    font-size: var(--fs-sm);
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }
  .stage {
    position: relative;
    flex: 1;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    user-select: none;
    &.dragging { cursor: grabbing; }
  }
  .content {
    position: absolute;
    top: 0;
    left: 0;
    width: var(--w);
    height: var(--h);
    transform: translate(var(--x), var(--y)) scale(var(--s));
    transform-origin: 0 0;
    :global(svg),
    img {
      display: block;
      width: 100%;
      height: 100%;
      max-width: none;
    }
  }
</style>
