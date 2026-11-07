<script lang="ts">
  import type { PageData } from './$types';
  import PrintView from '$lib/doc/PrintView.svelte';
  import { wikiPrintUrl } from '$lib/doc/print-options';
  import ProLock from '$lib/ui/ProLock.svelte';
  import { printableBody } from '$lib/doc/printable-body.svelte';

  const { data }: { data: PageData } = $props();
  const wikiPage = $derived(data.page);
  const body = printableBody(() => wikiPage);
</script>

{#if data.locked}
  <ProLock title="PDF export" message={data.locked}>
    <a class="btn sm" href={wikiPage.path}>Back to {wikiPage.title}</a>
  </ProLock>
{:else}
  <PrintView
    title={wikiPage.title}
    content={body.markdown}
    backHref={wikiPage.path}
    brandings={data.brandings}
    options={data.options}
    branding={data.branding}
    urlFor={(choice, header) => wikiPrintUrl(wikiPage.id, choice, header)}
  />
{/if}
