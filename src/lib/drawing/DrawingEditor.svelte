<script lang="ts">
  // A drawing page's body (bodyType 'drawing'), drawn and edited in place with
  // Excalidraw (a React component, mounted here with createRoot). Every change
  // saves itself after a short pause as the scene's JSON (see
  // $shared/utils/drawing). A skeleton Claude wrote is laid out and expanded
  // when it opens, and the first edit saves it as a scene.
  import { onMount } from 'svelte';
  import '@excalidraw/excalidraw/index.css';
  import type { Root } from 'react-dom/client';
  import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
  import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
  import { readDrawingContent, type DrawingScene as StoredScene } from '$shared/utils/drawing';
  import { loadExcalidraw, toScene } from './excalidraw';

  interface Props {
    readonly content: string;
    /** False for an archived page: the drawing shows but doesn't edit. */
    readonly editable?: boolean;
    readonly onSave: (content: string) => Promise<void>;
  }

  const { content, editable = true, onSave }: Props = $props();

  const SAVE_DELAY_MS = 600;

  let host: HTMLDivElement;
  let root: Root | null = null;
  let status = $state<'loading' | 'idle' | 'saving' | 'saved'>('loading');
  let error = $state('');
  let expanded = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> = Promise.resolve();
  // What was last saved (or loaded): a save only goes out when the scene changed.
  let savedKey = '';
  let latest: StoredScene | null = null;

  const sceneKey = (version: number, background: string): string => `${version}:${background}`;

  const save = async () => {
    if (!latest) return;
    const json = JSON.stringify(latest);
    status = 'saving';
    error = '';
    try {
      await onSave(json);
      status = 'saved';
    } catch (e) {
      status = 'idle';
      error = e instanceof Error ? e.message : String(e);
    }
  };

  // Saves run one after another, so an older scene never lands after a newer one.
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      pending = pending.then(save);
    }, SAVE_DELAY_MS);
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && expanded) expanded = false;
  };

  onMount(() => {
    let destroyed = false;
    (async () => {
      try {
        const [lib, React, ReactDOM] = await Promise.all([loadExcalidraw(), import('react'), import('react-dom/client')]);
        if (destroyed) return;
        const scene = await toScene(lib, readDrawingContent(content));
        const background = scene.viewBackgroundColor ?? '#ffffff';
        savedKey = sceneKey(lib.getSceneVersion(scene.elements), background);

        const handleChange = (elements: readonly ExcalidrawElement[], appState: AppState) => {
          if (!editable) return;
          const key = sceneKey(lib.getSceneVersion(elements), appState.viewBackgroundColor);
          if (key === savedKey) return;
          savedKey = key;
          latest = {
            version: 1,
            elements: lib.getNonDeletedElements(elements) as unknown as StoredScene['elements'],
            ...(appState.viewBackgroundColor !== '#ffffff' && { appState: { viewBackgroundColor: appState.viewBackgroundColor } })
          };
          schedule();
        };

        const { createElement: h } = React;
        const { MainMenu, WelcomeScreen } = lib;
        // Remry links nowhere outside the app: the menu keeps only what works on this drawing.
        const menu = h(
          MainMenu,
          null,
          h(MainMenu.DefaultItems.SaveAsImage),
          editable ? h(MainMenu.DefaultItems.ClearCanvas) : null,
          h(MainMenu.Separator),
          editable ? h(MainMenu.DefaultItems.ChangeCanvasBackground) : null,
          h(MainMenu.DefaultItems.Help)
        );
        const welcome = h(
          WelcomeScreen,
          null,
          h(WelcomeScreen.Hints.ToolbarHint),
          h(WelcomeScreen.Hints.HelpHint),
          h(WelcomeScreen.Center, null, h(WelcomeScreen.Center.Heading, null, 'Pick a tool and start drawing.'))
        );
        root = ReactDOM.createRoot(host);
        root.render(
          h(
            lib.Excalidraw,
            {
              initialData: { elements: scene.elements, appState: { viewBackgroundColor: background }, scrollToContent: true },
              // Open with the whole drawing in view, zoomed out if it's bigger than the canvas (never in past 100%).
              excalidrawAPI: (api: ExcalidrawImperativeAPI) => {
                if (scene.elements.length === 0) return;
                requestAnimationFrame(() => {
                  if (!destroyed) api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.9, maxZoom: 1, animate: false });
                });
              },
              viewModeEnabled: !editable,
              theme: 'light',
              autoFocus: false,
              handleKeyboardGlobally: false,
              onChange: handleChange,
              UIOptions: {
                canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: null, saveAsImage: true, clearCanvas: editable, changeViewBackgroundColor: editable },
                tools: { image: false }
              }
            },
            menu,
            welcome
          )
        );
        status = 'idle';
      } catch (e) {
        error = `The drawing couldn't load: ${e instanceof Error ? e.message : String(e)}`;
      }
    })();
    window.addEventListener('keydown', onKey);

    return () => {
      destroyed = true;
      window.removeEventListener('keydown', onKey);
      // Leaving the page with a save still waiting: send it now.
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
        void save();
      }
      const mounted = root;
      root = null;
      // Unmounting while Svelte tears down the host is safe once this task ends.
      if (mounted) queueMicrotask(() => mounted.unmount());
    };
  });
</script>

<div class="drawing-editor" class:expanded>
  <div class="drawing-toolbar">
    <p class="drawing-status text-xs muted" aria-live="polite">
      {#if status === 'loading'}Loading the drawing…{:else if status === 'saving'}Saving…{:else if status === 'saved'}Saved{:else if editable}Changes save themselves. Double-click to add text; drag from a shape's edge to connect it with an arrow.{/if}
    </p>
    <button type="button" class="btn ghost sm" onclick={() => { expanded = !expanded; }} aria-pressed={expanded}>{expanded ? 'Close full screen' : 'Full screen'}</button>
  </div>
  <div class="drawing-canvas" bind:this={host}></div>
  {#if error}<p class="form-error" role="alert">{error}</p>{/if}
</div>

<style lang="scss">
  .drawing-editor {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);

    &.expanded {
      position: fixed;
      inset: 0;
      z-index: var(--z-viewer);
      background: var(--bg);
      padding: var(--sp-2) var(--sp-3) var(--sp-3);

      .drawing-canvas { height: auto; flex: 1; }
    }
  }

  .drawing-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
  }

  .drawing-status {
    margin: 0;
    min-height: 1.4em;
  }

  .drawing-canvas {
    height: min(70vh, 720px);
    min-height: 420px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    overflow: hidden;
    // Excalidraw sets its own fonts on the canvas; its interface wears the app's.
    font-family: var(--font-text);

    :global(.excalidraw) {
      --ui-font: var(--font-text);
    }
    // The library sidebar offers to browse libraries on excalidraw.com; Remry links nowhere outside.
    :global(.default-sidebar-trigger) { display: none; }
    // A web embed is an iframe, which the CSP refuses (frame-src 'none'), so it would only show blank.
    :global([data-testid='toolbar-embeddable']) { display: none; }
  }
</style>
