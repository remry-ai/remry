<script lang="ts">
  import { onMount } from 'svelte';
  import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core';
  import {
    commonmark,
    toggleStrongCommand,
    toggleEmphasisCommand,
    toggleInlineCodeCommand,
    wrapInHeadingCommand,
    wrapInBulletListCommand,
    wrapInOrderedListCommand,
    wrapInBlockquoteCommand,
    turnIntoTextCommand,
    linkSchema,
  } from '@milkdown/preset-commonmark';
  import { gfm, toggleStrikethroughCommand } from '@milkdown/preset-gfm';
  import { listener, listenerCtx } from '@milkdown/plugin-listener';
  import { history, undoCommand, redoCommand } from '@milkdown/kit/plugin/history';
  import { applyLink, findLinkRange } from '$lib/shared/components/milkdown-link';
  import { exitCodeBlockPlugin } from '$lib/shared/components/milkdown-exit-code-block';
  import { createImageDropPlugin } from '$lib/shared/components/milkdown-image-drop';
  import { imageResizeView } from '$lib/shared/components/milkdown-image-resize';

  const { value, onChange, pendingImages } = $props<{
    value: string;
    onChange: (markdown: string) => void;
    pendingImages?: Map<string, File>;
  }>();

  let editorEl: HTMLDivElement;
  let editor: Editor | null = null;

  // ProseMirror's own focus, so its selection and the DOM's stay in step.
  const focusEditor = (): void => {
    editor?.action((ctx) => ctx.get(editorViewCtx).focus());
  };

  const runCommand = <Args extends unknown[]>(
    cmd: { run: (...args: Args) => boolean },
    ...args: Args
  ): void => {
    cmd.run(...args);
    focusEditor();
  };

  const clearFormatting = () => {
    if (!editor) return;
    turnIntoTextCommand.run();
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state, dispatch } = view;
      const { from, to } = state.selection;
      const tr = state.tr;
      state.doc.nodesBetween(from, to, (node) => {
        node.marks.forEach(mark => { tr.removeMark(from, to, mark.type); });
      });
      dispatch(tr);
    });
    focusEditor();
  };

  // The Link button opens a URL field under the toolbar. The editor keeps its
  // selection while the field has focus, so Apply links whatever was selected.
  let linkOpen = $state(false);
  let linkHref = $state('');
  let linkInput = $state<HTMLInputElement | null>(null);

  const openLink = () => {
    if (!editor) return;
    linkHref = editor.action((ctx) => {
      const { state } = ctx.get(editorViewCtx);
      return findLinkRange(state, linkSchema.type(ctx))?.href ?? '';
    });
    linkOpen = true;
    queueMicrotask(() => linkInput?.select());
  };

  const closeLink = () => {
    linkOpen = false;
    focusEditor();
  };

  const saveLink = (href: string) => {
    editor?.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const tr = applyLink(view.state, linkSchema.type(ctx), href);
      if (tr) view.dispatch(tr);
    });
    closeLink();
  };

  const onLinkKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); saveLink(linkHref); }
    if (e.key === 'Escape') { e.preventDefault(); closeLink(); }
  };

  // A click in the editor places the cursor, so a link opens with ⌘/Ctrl-click
  // instead, in a new tab so this editor keeps its unsaved text.
  const openLinkOnModClick = (e: MouseEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const href = (e.target as Element | null)?.closest('a[href]')?.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    window.open(href, '_blank', 'noopener');
  };

  const imagePlugin = pendingImages ? createImageDropPlugin(pendingImages) : undefined;

  onMount(() => {
    let builder = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, editorEl);
        ctx.set(defaultValueCtx, value);
        ctx.get(listenerCtx)
          .markdownUpdated((_ctx, md, _prev) => {
            onChange(md);
          });
      })
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .use(history)
      .use(exitCodeBlockPlugin);

    if (imagePlugin) builder = builder.use(imagePlugin);
    builder = builder.use(imageResizeView);

    builder.create().then((e) => { editor = e; });

    return () => {
      editor?.destroy();
    };
  });
</script>

<div class="md-editor-container">
  <div class="editor-bar">
    <div class="editor-toolbar">
      <div class="toolbar-group">
        <button type="button" class="btn ghost sm tb" title="Undo (Ctrl+Z)" aria-label="Undo" onclick={() => editor && runCommand(undoCommand)}>
          &#8630;
        </button>
        <button type="button" class="btn ghost sm tb" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onclick={() => editor && runCommand(redoCommand)}>
          &#8631;
        </button>
      </div>
      <span class="toolbar-sep"></span>
      <div class="toolbar-group">
        <button type="button" class="btn ghost sm tb" title="Heading 1" onclick={() => editor && runCommand(wrapInHeadingCommand, 1)}>H1</button>
        <button type="button" class="btn ghost sm tb" title="Heading 2" onclick={() => editor && runCommand(wrapInHeadingCommand, 2)}>H2</button>
        <button type="button" class="btn ghost sm tb" title="Heading 3" onclick={() => editor && runCommand(wrapInHeadingCommand, 3)}>H3</button>
      </div>
      <span class="toolbar-sep"></span>
      <div class="toolbar-group">
        <button type="button" class="btn ghost sm tb" title="Bold (Ctrl+B)" onclick={() => editor && runCommand(toggleStrongCommand)}>
          <strong>B</strong>
        </button>
        <button type="button" class="btn ghost sm tb" title="Italic (Ctrl+I)" onclick={() => editor && runCommand(toggleEmphasisCommand)}>
          <em>I</em>
        </button>
        <button type="button" class="btn ghost sm tb" title="Strikethrough" onclick={() => editor && runCommand(toggleStrikethroughCommand)}>
          <s>S</s>
        </button>
        <button type="button" class="btn ghost sm tb" title="Inline code" onclick={() => editor && runCommand(toggleInlineCodeCommand)}>
          <code>&lt;/&gt;</code>
        </button>
      </div>
      <span class="toolbar-sep"></span>
      <div class="toolbar-group">
        <button type="button" class="btn ghost sm tb" title="Bullet list" onclick={() => editor && runCommand(wrapInBulletListCommand)}>
          &#8226;&#8801;
        </button>
        <button type="button" class="btn ghost sm tb" title="Ordered list" onclick={() => editor && runCommand(wrapInOrderedListCommand)}>
          1.&#8801;
        </button>
        <button type="button" class="btn ghost sm tb" title="Blockquote" onclick={() => editor && runCommand(wrapInBlockquoteCommand)}>
          &#10077;
        </button>
      </div>
      <span class="toolbar-sep"></span>
      <div class="toolbar-group">
        <button type="button" class="btn ghost sm tb" title="Link (⌘-click a link to open it)" aria-label="Link" aria-expanded={linkOpen} onclick={openLink}>
          &#128279;
        </button>
        <button type="button" class="btn ghost sm tb" title="Clear formatting" onclick={clearFormatting}>
          &#10005;
        </button>
      </div>
    </div>
    {#if linkOpen}
      <div class="link-bar">
        <input
          class="sm"
          type="text"
          placeholder="https://… or /app/…"
          aria-label="Link URL"
          bind:value={linkHref}
          bind:this={linkInput}
          onkeydown={onLinkKeydown}
        />
        <button type="button" class="btn primary sm" onclick={() => saveLink(linkHref)}>Apply</button>
        {#if linkHref.trim()}<a class="btn ghost sm" href={linkHref.trim()} target="_blank" rel="noopener">Open</a>{/if}
        <button type="button" class="btn ghost sm" onclick={() => saveLink('')}>Remove</button>
        <button type="button" class="btn ghost sm" onclick={closeLink}>Cancel</button>
      </div>
    {/if}
  </div>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="md-editor-wrap" bind:this={editorEl} onclick={openLinkOnModClick}></div>
</div>

<style lang="scss">
  .md-editor-container {
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
    // clip, not hidden: hidden would make this box the scroll container the
    // toolbar sticks to, and it never scrolls, so the toolbar would scroll away.
    overflow: clip;
  }

  // The toolbar and link field stay in view while a long doc scrolls. A page
  // with its own sticky header sets --sticky-top to that header's height.
  .editor-bar {
    position: sticky;
    top: var(--sticky-top, 0);
    z-index: var(--z-sticky);
    background: var(--surface);
  }

  .editor-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
    padding: var(--sp-1) var(--sp-2);
    border-bottom: 1px solid var(--border);
  }

  .toolbar-group {
    display: flex;
    gap: 2px;
  }

  .link-bar {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-1) var(--sp-2);
    border-bottom: 1px solid var(--border);

    input { flex: 1; }
  }

  .toolbar-sep {
    width: 1px;
    height: 16px;
    background: var(--border);
    margin: 0 var(--sp-1);
  }

  .tb {
    min-width: var(--control-h-sm);
    padding: 0 6px;
    color: var(--text-3);
    font-size: var(--fs-sm);
    code { font-size: var(--fs-xs); background: none; padding: 0; color: inherit; }
  }

  .md-editor-wrap {
    min-height: 200px;

    :global(.milkdown) {
      padding: var(--sp-2) var(--sp-3);
    }

    :global(.editor) {
      outline: none;
      min-height: 180px;
      font-family: inherit;
      font-size: var(--fs-md);
      line-height: 1.55;
    }

    :global(.editor p) {
      margin: 0.25em 0;
    }

    :global(h1) { font-size: var(--fs-xl); }
    :global(h2) { font-size: var(--fs-lg); margin-top: var(--sp-4); }
    :global(h3) { font-size: var(--fs-base); margin-top: var(--sp-3); }

    :global(ul), :global(ol) {
      padding-left: var(--sp-5);
    }
    :global(blockquote) {
      border-left: 3px solid var(--border-strong);
      padding-left: var(--sp-3);
      color: var(--text-2);
    }

    :global(.editor img) {
      max-width: 100%;
      border-radius: var(--r-sm);
    }
  }
</style>
