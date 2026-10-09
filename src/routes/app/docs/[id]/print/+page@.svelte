<script lang="ts">
  import type { PageData } from './$types';
  import PrintView from '$lib/doc/PrintView.svelte';
  import { printUrl } from '$lib/doc/print-options';
  import ProLock from '$lib/ui/ProLock.svelte';

  const { data }: { data: PageData } = $props();
  const doc = $derived(data.doc);
</script>

{#if data.locked}
  <ProLock title="PDF export" message={data.locked}>
    <a class="btn sm" href={doc.entityPath}>Back to {doc.title}</a>
  </ProLock>
{:else}
  <PrintView
    title={doc.title}
    content={doc.content}
    backHref={doc.entityPath}
    brandings={data.brandings}
    options={data.options}
    branding={data.branding}
    urlFor={(choice, header) => printUrl(doc.id, choice, header)}
  />
{/if}
