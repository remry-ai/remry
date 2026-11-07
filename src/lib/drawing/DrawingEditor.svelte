<script lang="ts">
  // A drawing page's editor: Excalidraw (a React component, mounted here with
  // createRoot) over the whole window, opened from the page's picture
  // (DrawingImage) and closed with Done. It sits on <body>, like ZoomViewer, so
  // nothing on the page draws over it. Esc stays with Excalidraw (deselect,
  // leave a tool) and never closes it, so an edit isn't lost. Every change
  // saves itself after a short pause as the scene's JSON (see
  // $shared/utils/drawing). A skeleton Claude wrote is laid out and expanded
  // when it opens, and the first edit saves it as a scene. Its menu opens and
  // saves .excalidraw files (on this computer), and "Share link" uploads an
  // encrypted copy to excalidraw.com, after saying so (onShare).
  import { onMount } from 'svelte';
  import '@excalidraw/excalidraw/index.css';
  import type { Root } from 'react-dom/client';
  import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
  import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
  import { isSkeleton, readDrawingContent, type DrawingScene as StoredScene } from '$shared/utils/drawing';
  import Field from '$lib/ui/Field.svelte';
  import { errorMessage } from '$lib/ui/submit';
  import { loadExcalidraw, toScene, type ExcalidrawModule } from './excalidraw';

  interface Props {
    readonly content: string;
    /** False for an archived page: the drawing shows but doesn't edit. */
    readonly editable?: boolean;
    readonly onSave: (content: string) => Promise<void>;
    /** The file name "Save to…" suggests. */
    readonly title?: string;
    /** Uploads the saved drawing and returns its share link; without it, no Share link button. */
    readonly onShare?: () => Promise<string>;
    /** Done: called once any change still waiting has saved. */
    readonly onClose: () => void;
  }

  const { content, editable = true, onSave, title = 'Drawing', onShare, onClose }: Props = $props();

  const SAVE_DELAY_MS = 600;

  let host: HTMLDivElement;
  let root: Root | null = null;
  let status = $state<'loading' | 'idle' | 'saving' | 'saved'>('loading');
  let error = $state('');
  let closing = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> = Promise.resolve();
  // What was last saved (or loaded): a save only goes out when the scene changed.
  let savedKey = '';
  let latest: StoredScene | null = null;
  let api: ExcalidrawImperativeAPI | null = null;
  let lib: ExcalidrawModule | null = null;
  // A skeleton is stored until the first save writes the scene the app laid out.
  // svelte-ignore state_referenced_locally
  let storedSkeleton = isSkeleton(readDrawingContent(content));

  const sceneOf = (elements: readonly ExcalidrawElement[], background: string, from: ExcalidrawModule): StoredScene => ({
    version: 1,
    elements: from.getNonDeletedElements(elements) as unknown as StoredScene['elements'],
    ...(background !== '#ffffff' && { appState: { viewBackgroundColor: background } })
  });

  const sceneKey = (version: number, background: string): string => `${version}:${background}`;

  const save = async () => {
    if (!latest) return;
    const json = JSON.stringify(latest);
    status = 'saving';
    error = '';
    try {
      await onSave(json);
      status = 'saved';
      storedSkeleton = false;
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

  /** Sends any change still waiting, and a skeleton's laid-out scene, so the server has what's on screen. */
  const saveNow = async (): Promise<void> => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      pending = pending.then(save);
    } else if (storedSkeleton && editable && api && lib) {
      latest = sceneOf(api.getSceneElements(), api.getAppState().viewBackgroundColor, lib);
      pending = pending.then(save);
    }
    await pending;
    if (error) throw new Error(error);
  };

  // Share link: say what it does, then upload and show the link.
  let share = $state<'closed' | 'confirm' | 'working' | 'done'>('closed');
  let shareUrl = $state('');
  let shareError = $state('');
  let copied = $state(false);

  const createLink = async () => {
    if (!onShare) return;
    share = 'working';
    shareError = '';
    try {
      await saveNow();
      shareUrl = await onShare();
      share = 'done';
    } catch (e) {
      shareError = errorMessage(e);
      share = 'confirm';
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
      setTimeout(() => { copied = false; }, 1500);
    } catch {
      shareError = 'Copying was blocked; select the link and copy it instead.';
    }
  };

  // Done: wait for the save, so the page's picture shows what was drawn.
  const handleDone = async () => {
    closing = true;
    try {
      await saveNow();
      onClose();
    } catch {
      // The error shows under the bar; the editor stays open so nothing is lost.
      closing = false;
    }
  };

  // Mounted on <body>, so no stacking context on the page can draw over it.
  const portal = (node: HTMLElement): { destroy: () => void } => {
    document.body.append(node);
    return { destroy: () => node.remove() };
  };

  // Esc belongs to Excalidraw; it mustn't also close a popup under the editor.
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') event.stopPropagation();
  };

  onMount(() => {
    let destroyed = false;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Excalidraw takes focus itself (autoFocus), so its shortcuts work at once.
    (async () => {
      try {
        const [loaded, React, ReactDOM] = await Promise.all([loadExcalidraw(), import('react'), import('react-dom/client')]);
        if (destroyed) return;
        lib = loaded;
        const scene = await toScene(loaded, readDrawingContent(content));
        const background = scene.viewBackgroundColor ?? '#ffffff';
        savedKey = sceneKey(loaded.getSceneVersion(scene.elements), background);

        const handleChange = (elements: readonly ExcalidrawElement[], appState: AppState) => {
          if (!editable) return;
          const key = sceneKey(loaded.getSceneVersion(elements), appState.viewBackgroundColor);
          if (key === savedKey) return;
          savedKey = key;
          latest = sceneOf(elements, appState.viewBackgroundColor, loaded);
          schedule();
        };

        const { createElement: h } = React;
        const { MainMenu, WelcomeScreen } = loaded;
        // Remry links nowhere outside the app: the menu keeps only what works on this drawing.
        // Open and Save to… read and write .excalidraw files on this computer.
        const menu = h(
          MainMenu,
          null,
          editable ? h(MainMenu.DefaultItems.LoadScene) : null,
          h(MainMenu.DefaultItems.Export),
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
            loaded.Excalidraw,
            {
              name: title,
              initialData: { elements: scene.elements, appState: { viewBackgroundColor: background }, scrollToContent: true },
              // Open with the whole drawing in view, zoomed out if it's bigger than the canvas (never in past 100%).
              excalidrawAPI: (ready: ExcalidrawImperativeAPI) => {
                api = ready;
                if (scene.elements.length === 0) return;
                requestAnimationFrame(() => {
                  if (!destroyed) ready.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.9, maxZoom: 1, animate: false });
                });
              },
              viewModeEnabled: !editable,
              theme: 'light',
              autoFocus: true,
              handleKeyboardGlobally: false,
              onChange: handleChange,
              UIOptions: {
                // export: only "Save to disk" (no onExportToBackend, so no Excalidraw+ or link card there).
                canvasActions: { loadScene: editable, saveToActiveFile: false, export: { saveFileToDisk: true }, toggleTheme: null, saveAsImage: true, clearCanvas: editable, changeViewBackgroundColor: editable },
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
    return () => {
      destroyed = true;
      returnFocus?.focus();
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

<div class="drawing-editor" role="dialog" aria-modal="true" aria-label="{editable ? 'Edit' : 'View'} {title}" tabindex="-1" use:portal onkeydown={handleKeydown}>
  <div class="drawing-toolbar">
    <span class="drawing-title truncate">{title}</span>
    <p class="drawing-status text-xs muted" aria-live="polite">
      {#if status === 'loading'}Loading the drawing…{:else if status === 'saving'}Saving…{:else if status === 'saved'}Saved{:else if editable}Changes save themselves. Done closes the editor.{/if}
    </p>
    <span class="drawing-actions">
      {#if onShare}
        <button type="button" class="btn ghost sm" disabled={status === 'loading'} onclick={() => { share = share === 'closed' ? 'confirm' : 'closed'; shareError = ''; }} aria-expanded={share !== 'closed'}>Share link</button>
      {/if}
      <button type="button" class="btn primary sm" onclick={handleDone} disabled={closing} aria-busy={closing}>{closing ? 'Saving…' : 'Done'}</button>
    </span>
  </div>
  {#if share === 'confirm' || share === 'working'}
    <div class="card compact share-panel">
      <p class="text-sm">A share link uploads an encrypted copy of this drawing to <strong>excalidraw.com</strong>. Anyone with the link can open it there (the key is in the link, so Excalidraw can't read it), and it stays there: Remry can't take it down. It's a snapshot; later changes need a new link.</p>
      <div class="toolbar">
        <button type="button" class="btn primary sm" onclick={createLink} disabled={share === 'working'} aria-busy={share === 'working'}>{share === 'working' ? 'Creating…' : 'Create link'}</button>
        <button type="button" class="btn ghost sm" onclick={() => { share = 'closed'; }} disabled={share === 'working'}>Cancel</button>
      </div>
      {#if shareError}<p class="form-error" role="alert">{shareError}</p>{/if}
    </div>
  {:else if share === 'done'}
    <div class="card compact share-panel">
      <Field label="Share link" hint="Anyone with this link can open the drawing on excalidraw.com.">
        {#snippet children({ id })}
          <input {id} type="text" class="sm" readonly value={shareUrl} onfocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
        {/snippet}
      </Field>
      <div class="toolbar">
        <button type="button" class="btn primary sm" onclick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
        <button type="button" class="btn ghost sm" onclick={() => { share = 'closed'; }}>Close</button>
      </div>
      {#if shareError}<p class="form-error" role="alert">{shareError}</p>{/if}
    </div>
  {/if}
  <div class="drawing-canvas" bind:this={host}></div>
  {#if error}<p class="form-error" role="alert">{error}</p>{/if}
</div>

<style lang="scss">
  .drawing-editor {
    position: fixed;
    inset: 0;
    z-index: var(--z-viewer);
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3) var(--sp-3);
    background: var(--bg);

    &:focus { outline: none; }
  }

  .drawing-title {
    font-weight: 600;
    min-width: 0;
  }

  .drawing-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }

  .share-panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .drawing-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
  }

  .drawing-status {
    flex: 1;
    margin: 0;
    min-height: 1.4em;
  }

  .drawing-canvas {
    flex: 1;
    min-height: 0;
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
