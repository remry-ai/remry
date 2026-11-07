<script lang="ts">
  import type { PageData } from './$types';
  import PrintView from '$lib/doc/PrintView.svelte';
  import { wikiPrintUrl } from '$lib/doc/print-options';
  import { printableBody } from '$lib/doc/printable-body.svelte';

  const { data }: { data: PageData } = $props();
  const wikiPage = $derived(data.page);
  const body = printableBody(() => wikiPage);
</script>

<PrintView
    title={wikiPage.title}
    content={body.markdown}
    backHref={wikiPage.path}
    brandings={data.brandings}
    options={data.options}
    branding={data.branding}
    brandingLocked={data.brandingLocked}
    urlFor={(choice, header) => wikiPrintUrl(wikiPage.id, choice, header)}
  />
