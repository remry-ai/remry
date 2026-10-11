<script lang="ts">
  import { PANEL_KEY_STEP } from '$lib/common/panel-width';

  interface Props {
    /** The drawer edge it sits on: the right panel's left edge, the sidebar's right edge. */
    readonly edge: 'left' | 'right';
    /** The stored width, for screen readers; null while it's the default. */
    readonly width: number | null;
    readonly label: string;
    readonly onResize: (width: number) => void;
    readonly onReset: () => void;
  }

  const { edge, width, label, onResize, onReset }: Props = $props();

  // Dragging is relative to where it started, so it works wherever the drawer sits.
  let start: { readonly x: number; readonly width: number } | null = $state(null);
  let handle = $state<HTMLElement | null>(null);

  const drawerWidth = (): number => handle?.parentElement?.offsetWidth ?? 0;
  // Dragging away from the drawer widens it.
  const grow = (dx: number): number => (edge === 'left' ? -dx : dx);

  const startDrag = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start = { x: e.clientX, width: drawerWidth() };
  };
  const drag = (e: PointerEvent) => {
    if (start) onResize(start.width + grow(e.clientX - start.x));
  };
  const endDrag = () => { start = null; };

  $effect(() => {
    if (!start) return;
    document.body.classList.add('resizing-drawer');
    return () => document.body.classList.remove('resizing-drawer');
  });

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') onResize(drawerWidth() + grow(-PANEL_KEY_STEP));
    else if (e.key === 'ArrowRight') onResize(drawerWidth() + grow(PANEL_KEY_STEP));
    else return;
    e.preventDefault();
  };
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  bind:this={handle}
  class="resize-handle"
  class:active={start !== null}
  data-edge={edge}
  role="separator"
  aria-orientation="vertical"
  aria-label={label}
  aria-valuenow={width ?? undefined}
  tabindex="0"
  title="Drag to resize, double-click to reset"
  onpointerdown={startDrag}
  onpointermove={drag}
  onpointerup={endDrag}
  onpointercancel={endDrag}
  ondblclick={onReset}
  onkeydown={handleKey}
></div>

<style lang="scss">
  // A strip over the drawer's border: drag it to resize the drawer.
  .resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 6px;
    z-index: var(--z-sticky);
    cursor: col-resize;
    touch-action: none;
    &[data-edge='left'] { left: -3px; }
    &[data-edge='right'] { right: -3px; }
    &::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: 2px;
      width: 2px;
      background: transparent;
      transition: background var(--ease);
    }
    &:hover::after, &:focus-visible::after, &.active::after { background: var(--accent); }
    &:focus-visible { outline: none; }
  }
  // No text selection or transitions while dragging.
  :global(body.resizing-drawer) { user-select: none; cursor: col-resize; }
  :global(body.resizing-drawer .right-panel), :global(body.resizing-drawer .col-left) { transition: none; }
</style>
