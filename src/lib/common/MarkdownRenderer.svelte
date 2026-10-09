<script lang="ts">
  import { onMount } from 'svelte';
  import { marked, Renderer } from 'marked';
  import type { Chart } from 'chart.js';
  import { mountCharts } from '$lib/report/chart-render';
  import { fileUrl } from '$shared/utils/files';
  import type { ChartBranding } from '$shared/types/branding';

  const renderer = new Renderer();
  renderer.image = ({ href, title, text }) => {
    const widthMatch = title?.match(/w=(\d+)/);
    const widthAttr = widthMatch ? ` width="${widthMatch[1]}"` : '';
    const cleanTitle = title?.replace(/\s*w=\d+/, '').trim();
    const titleAttr = cleanTitle ? ` title="${cleanTitle}"` : '';
    // Doc images are saved as storage://<key>; the files route serves them.
    const src = href.startsWith('storage://') ? fileUrl(href.slice('storage://'.length)) : href;
    return `<img src="${src}" alt="${text ?? ''}"${titleAttr}${widthAttr} style="max-width:100%;border-radius:4px;">`;
  };

  interface Props {
    readonly content: string;
    readonly placeholder?: string;
    /** Colours charts with a branding (the doc print page). Read once: wrap in {#key} to change it. */
    readonly branding?: ChartBranding | null;
  }

  const { content, placeholder = '*No content yet.*', branding = null }: Props = $props();

  let container: HTMLDivElement;
  let charts: readonly Chart[] = [];

  const renderMermaid = async (el: HTMLDivElement) => {
    // Find all <pre> blocks whose text starts with common mermaid keywords
    const pres = el.querySelectorAll('pre');
    const mermaidPres: HTMLPreElement[] = [];

    for (const pre of pres) {
      const text = (pre.textContent ?? '').trim();
      if (/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline|journey)\b/.test(text)) {
        mermaidPres.push(pre);
      }
    }

    if (mermaidPres.length === 0) return;

    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({ startOnLoad: false, theme: 'default' });

    for (const pre of mermaidPres) {
      const source = (pre.textContent ?? '').trim();
      const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;

      try {
        const { svg } = await mermaid.render(id, source);
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-diagram';
        wrapper.innerHTML = svg;
        pre.replaceWith(wrapper);
      } catch {
        // Leave the code block as-is if mermaid can't parse it
      }
    }
  };

  $effect(() => {
    if (container && content) {
      // Wait a tick for the HTML to render, then draw charts and mermaid diagrams
      requestAnimationFrame(() => {
        // The renderer may be gone by the next frame (a {#key} remount).
        if (!container) return;
        for (const c of charts) c.destroy();
        charts = mountCharts(container, branding);
        renderMermaid(container);
      });
    }
    return () => {
      for (const c of charts) c.destroy();
      charts = [];
    };
  });
</script>

<div class="md-rendered" bind:this={container}>
  {#if content}
    {@html marked.parse(content, { renderer })}
  {:else}
    {@html marked.parse(placeholder, { renderer })}
  {/if}
</div>

<style lang="scss">
  .md-rendered {
    font-size: var(--fs-md);
    line-height: 1.6;

    :global(p:last-child) { margin-bottom: 0; }

    :global(.chart-block) {
      margin: 1rem 0;
    }

    :global(.mermaid-diagram) {
      margin: 1rem 0;
      text-align: center;
      overflow-x: auto;

      :global(svg) {
        max-width: 100%;
        height: auto;
      }
    }
  }
</style>
