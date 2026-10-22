<script lang="ts">
  import type { PageData } from './$types';
  import PrintView from '$lib/doc/PrintView.svelte';
  import { wikiPrintUrl } from '$lib/doc/print-options';
  import ProLock from '$lib/ui/ProLock.svelte';
  import { readSheetContent, sheetToMarkdown } from '$shared/utils/sheet';

  const { data }: { data: PageData } = $props();
  const wikiPage = $derived(data.page);
  // A spreadsheet prints as a table of the values its cells showed.
  const body = $derived(wikiPage.bodyType === 'sheet' ? sheetToMarkdown(readSheetContent(wikiPage.content)) : wikiPage.content);
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
