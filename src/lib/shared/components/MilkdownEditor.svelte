<script lang="ts">
  import { onMount } from 'svelte';
  import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
  import { commonmark } from '@milkdown/preset-commonmark';
  import { gfm } from '@milkdown/preset-gfm';
  import { listener, listenerCtx } from '@milkdown/plugin-listener';
  import { chartSectionsCtx, chartBrandingCtx, chartWidgetPlugin } from './milkdown-chart-plugin';
  import { exitCodeBlockPlugin } from './milkdown-exit-code-block';
  import type { AggregatedSection } from '$shared/types/charts';
  import type { ChartBranding } from '$shared/types/branding';

  const { value, onChange, sections, branding } = $props<{
    value: string;
    onChange: (markdown: string) => void;
    sections?: readonly AggregatedSection[];
    branding?: ChartBranding | null;
  }>();

  let editorEl: HTMLDivElement;
  let editor: Editor | null = null;

  onMount(() => {
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, editorEl);
        ctx.set(defaultValueCtx, value);
        ctx.get(listenerCtx)
          .markdownUpdated((_ctx, md, _prev) => {
            onChange(md);
          });
      })
      .config((ctx) => {
        ctx.set(chartSectionsCtx.key, sections ?? []);
        ctx.set(chartBrandingCtx.key, branding ?? null);
      })
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .use(chartSectionsCtx)
      .use(chartBrandingCtx)
      .use(chartWidgetPlugin)
      .use(exitCodeBlockPlugin)
      .create()
      .then((e) => { editor = e; });

    return () => {
      editor?.destroy();
    };
  });

  $effect(() => {
    if (editor) {
      editor.ctx.set(chartBrandingCtx.key, branding ?? null);
    }
  });
</script>

<div
  class="milkdown-wrap"
  bind:this={editorEl}
  style:--editor-th-bg={branding?.primaryColor}
  style:--editor-th-color={branding?.primaryFontColor}
></div>

<style lang="scss">
  .milkdown-wrap {
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
    min-height: 400px;

    :global(.milkdown) {
      padding: 1rem;
    }

    :global(.editor) {
      outline: none;
      min-height: 350px;
      font-family: inherit;
      font-size: 0.9rem;
      line-height: 1.6;
    }

    :global(h1) { font-size: 1.5rem; }
    :global(h2) { font-size: 1.2rem; margin-top: 1.5rem; }
    :global(h3) { font-size: 1rem; margin-top: 1rem; }

    :global(table) {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--border);
      margin: 1.5rem 0;
    }
    :global(th) {
      background: var(--editor-th-bg, var(--text));
      color: var(--editor-th-color, var(--surface));
      font-weight: 600;
      text-align: left;
      padding: 0.35rem 0.5rem;
      border: 1px solid var(--editor-th-bg, var(--text));
      font-size: var(--fs-sm);
      text-transform: uppercase;
      letter-spacing: 0.03em;

      :global(p) {
        color: inherit;
        margin: 0;
      }
    }
    :global(td) {
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--border);
    }

    :global(code) {
      background: var(--surface-inset);
      color: var(--text);
      padding: 0.15rem 0.3rem;
      border-radius: 3px;
      font-size: 0.85em;
    }
    :global(pre) {
      background: var(--surface-inset);
      color: var(--text);
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
    }
    :global(pre code) {
      background: none;
      padding: 0;
    }

    :global(ul), :global(ol) {
      padding-left: 1.5rem;
    }
    :global(blockquote) {
      border-left: 3px solid var(--border);
      padding-left: 1rem;
      color: var(--text-2);
    }
  }
</style>
