<script lang="ts">
  import { marked, Renderer } from 'marked';
  import type { Chart } from 'chart.js';
  import { mountCharts } from '$lib/chart/chart-render';
  import { fileUrl } from '$shared/utils/files';
  import type { ChartBranding } from '$shared/types/branding';
  import ZoomViewer from '$lib/ui/ZoomViewer.svelte';
  import type { ZoomSource } from '$lib/ui/zoom';
  import { lostImageNote } from '$lib/doc/lost-images';
  import { fitTableColumns } from '$lib/doc/table-columns';
  import { separateBreakLines } from '$lib/doc/pdf-pages';

  const escapeAttr = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const renderer = new Renderer();
  renderer.image = ({ href, title, text }) => {
    const widthMatch = title?.match(/w=(\d+)/);
    const widthAttr = widthMatch ? ` width="${widthMatch[1]}"` : '';
    const cleanTitle = title?.replace(/\s*w=\d+/, '').trim();
    const titleAttr = cleanTitle ? ` title="${escapeAttr(cleanTitle)}"` : '';
    // Doc images are saved as storage://<key>; the files route serves them.
    const src = href.startsWith('storage://') ? fileUrl(href.slice('storage://'.length)) : href;
    return `<img src="${escapeAttr(src)}" alt="${escapeAttr(text ?? '')}"${titleAttr}${widthAttr} style="max-width:100%;border-radius:4px;">`;
  };

  // A wide table scrolls sideways inside its own box instead of running past the doc's edge.
  const tableHtml = renderer.table.bind(renderer);
  renderer.table = (token) => `<div class="table-wrap">${tableHtml(token)}</div>`;

  interface Props {
    readonly content: string;
    readonly placeholder?: string;
    /** Colours charts with a branding (the doc print page). Read once: wrap in {#key} to change it. */
    readonly branding?: ChartBranding | null;
    /** Clicking a diagram, an image or a chart opens it in ZoomViewer. Off for the print page. */
    readonly zoomable?: boolean;
  }

  const { content, placeholder = '*No content yet.*', branding = null, zoomable = true }: Props = $props();

  let container: HTMLDivElement;
  let charts: readonly Chart[] = [];
  let zoomed = $state<ZoomSource | null>(null);

  // A diagram's drawn size: mermaid sets its viewBox.
  const svgSize = (svg: SVGSVGElement) => {
    const box = svg.viewBox.baseVal;
    if (box && box.width > 0 && box.height > 0) return { width: box.width, height: box.height };
    const rect = svg.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };

  // What a click opens: a mermaid diagram (or its Zoom button), an image that isn't a link, or a chart.
  const zoomSourceAt = (target: Element): ZoomSource | null => {
    const diagram = target.closest('.mermaid-diagram')?.querySelector('svg');
    if (diagram) return { kind: 'svg', markup: diagram.outerHTML, size: svgSize(diagram) };
    const img = target.closest('img');
    if (img && !img.closest('a')) return { kind: 'image', src: img.currentSrc || img.src, alt: img.alt };
    const canvas = target.closest('.chart-block')?.querySelector('canvas');
    if (canvas) return { kind: 'image', src: canvas.toDataURL('image/png'), alt: 'Chart' };
    return null;
  };

  const handleClick = (e: MouseEvent) => {
    if (!zoomable || e.metaKey || e.ctrlKey || e.shiftKey || !(e.target instanceof Element)) return;
    const source = zoomSourceAt(e.target);
    if (source) zoomed = source;
  };

  // A blob: image that won't load was saved before images were uploaded, so it's gone
  // (`lib/doc/lost-images.ts`): say so instead of showing a broken image. A pasted image
  // in the editor's Preview still loads, so it stays. Errors don't bubble, so the container
  // catches them on the way down (`onerrorcapture`); `showLostImages` also gets ones that failed first.
  const replaceLostImage = (img: HTMLImageElement) => {
    const note = document.createElement('em');
    note.className = 'lost-image';
    note.textContent = lostImageNote(img.alt);
    img.replaceWith(note);
  };

  const handleImageError = (e: Event) => {
    if (e.target instanceof HTMLImageElement && e.target.src.startsWith('blob:')) replaceLostImage(e.target);
  };

  // One still loading fails later, through `onerrorcapture`, which is on before this runs.
  const showLostImages = (el: HTMLDivElement) => {
    for (const img of el.querySelectorAll<HTMLImageElement>('img[src^="blob:"]')) {
      if (img.complete && img.naturalWidth === 0) replaceLostImage(img);
    }
  };

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
        // The keyboard's way in (the SVG can't take focus); a click anywhere on the diagram works too.
        if (zoomable) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn icon sm zoom-hint no-print';
          button.setAttribute('aria-label', 'Zoom diagram');
          button.title = 'Zoom';
          button.textContent = '⤢';
          wrapper.append(button);
        }
        pre.replaceWith(wrapper);
      } catch {
        // Leave the code block as-is if mermaid can't parse it
      }
    }
  };

  $effect(() => {
    if (container && content) {
      // The HTML is in place by now; this doesn't wait for a frame, which a hidden window never draws.
      showLostImages(container);
      fitTableColumns(container);
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

<!-- Clicks on diagrams, images and charts open the zoom viewer; diagrams also have a Zoom button for the keyboard. -->
<div class="md-rendered" role="presentation" class:zoomable bind:this={container} onclick={handleClick} onerrorcapture={handleImageError}>
  <!-- The user's own markdown, in a local app. -->
  {#if content}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html marked.parse(separateBreakLines(content), { renderer })}
  {:else}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html marked.parse(placeholder, { renderer })}
  {/if}
</div>

{#if zoomable}
  <ZoomViewer source={zoomed} onClose={() => (zoomed = null)} />
{/if}

<style lang="scss">
  .md-rendered {
    font-size: var(--fs-md);
    line-height: 1.6;

    :global(p:last-child) { margin-bottom: 0; }

    // Room below a table, so the text after it doesn't sit on its last row.
    :global(.table-wrap) { margin-bottom: var(--sp-4); }
    :global(.table-wrap:last-child) { margin-bottom: 0; }

    :global(.chart-block) {
      margin: 1rem 0;
    }

    :global(.mermaid-diagram) {
      position: relative;
      margin: 1rem 0;
      text-align: center;
      overflow-x: auto;

      :global(svg) {
        max-width: 100%;
        height: auto;
      }
      :global(.zoom-hint) {
        position: absolute;
        top: 0;
        right: 0;
        opacity: 0;
        transition: opacity var(--ease);
      }
      &:hover :global(.zoom-hint),
      :global(.zoom-hint:focus-visible) { opacity: 1; }
    }

    :global(.lost-image) { color: var(--text-3); }

    &.zoomable {
      :global(.mermaid-diagram svg),
      :global(img:not(a img)),
      :global(.chart-block canvas) {
        cursor: zoom-in;
        border-radius: var(--r-sm);
        transition: outline-color var(--ease);
        outline: 1px solid transparent;
        outline-offset: 2px;
      }
      :global(.mermaid-diagram:hover svg),
      :global(img:not(a img):hover),
      :global(.chart-block:hover canvas) { outline-color: var(--border-strong); }
    }
  }
</style>
