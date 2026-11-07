<script lang="ts">
  import type { PageData } from './$types';
  import PrintView from '$lib/doc/PrintView.svelte';
  import { wikiPrintUrl } from '$lib/doc/print-options';
  import ProLock from '$lib/ui/ProLock.svelte';
  import { readSheetContent, sheetToMarkdown } from '$shared/utils/sheet';
  import { isSkeleton, readDrawingContent } from '$shared/utils/drawing';
  import { renderDrawing } from '$lib/drawing/render-drawing';

  const { data }: { data: PageData } = $props();
  const wikiPage = $derived(data.page);

  // A drawing prints as its picture: drawn here as a PNG, then shown (and put in the PDF)
  // like any image, at its own size.
  let drawing = $state<string | null>(null);
  $effect(() => {
    if (wikiPage.bodyType !== 'drawing') return;
    const content = readDrawingContent(wikiPage.content);
    let cancelled = false;
    let url: string | null = null;
    drawing = null;
    renderDrawing(content, { scale: 3, background: !isSkeleton(content) && content.appState?.viewBackgroundColor !== undefined }).then(
      (rendered) => {
        if (cancelled) return;
        if (!rendered) {
          drawing = '*Nothing drawn yet.*';
          return;
        }
        url = URL.createObjectURL(rendered.blob);
        drawing = `![${wikiPage.title.replace(/[[\]]/g, '')}](${url} "w=${Math.round(rendered.width)}")`;
      },
      (e: unknown) => { if (!cancelled) drawing = `*The drawing couldn't be drawn: ${e instanceof Error ? e.message : String(e)}*`; }
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  });

  // A spreadsheet prints as a table of the values its cells showed.
  const body = $derived(
    wikiPage.bodyType === 'sheet' ? sheetToMarkdown(readSheetContent(wikiPage.content))
    : wikiPage.bodyType === 'drawing' ? (drawing ?? '*Drawing…*')
    : wikiPage.content
  );
</script>

{#if data.locked}
  <ProLock title="PDF export" message={data.locked}>
    <a class="btn sm" href={wikiPage.path}>Back to {wikiPage.title}</a>
  </ProLock>
{:else}
  <PrintView
    title={wikiPage.title}
    content={body}
    backHref={wikiPage.path}
    brandings={data.brandings}
    options={data.options}
    branding={data.branding}
    urlFor={(choice, header) => wikiPrintUrl(wikiPage.id, choice, header)}
  />
{/if}
