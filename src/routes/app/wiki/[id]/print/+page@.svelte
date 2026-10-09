<script lang="ts">
  import type { PageData } from './$types';
  import PrintView from '$lib/doc/PrintView.svelte';
  import { wikiPrintUrl } from '$lib/doc/print-options';
  import ProLock from '$lib/ui/ProLock.svelte';
  import { formatPropertyValue } from '$lib/page/utils';

  const { data }: { data: PageData } = $props();
  const wikiPage = $derived(data.page);
  // The kind's details that are filled in, in the kind's order.
  const properties = $derived(
    data.fields
      .filter((field) => wikiPage.properties[field.key] !== undefined)
      .map((field) => ({ label: field.label, value: formatPropertyValue(field, wikiPage.properties[field.key]!) })),
  );
</script>

{#snippet details()}
  <dl class="meta-list">
    {#each properties as property (property.label)}
      <div>
        <dt>{property.label}</dt>
        <dd>{property.value}</dd>
      </div>
    {/each}
  </dl>
{/snippet}

{#if data.locked}
  <ProLock title="PDF export" message={data.locked}>
    <a class="btn sm" href={wikiPage.path}>Back to {wikiPage.title}</a>
  </ProLock>
{:else}
  <PrintView
    title={wikiPage.title}
    content={wikiPage.content}
    backHref={wikiPage.path}
    brandings={data.brandings}
    options={data.options}
    branding={data.branding}
    urlFor={(choice, header) => wikiPrintUrl(wikiPage.id, choice, header)}
    details={properties.length > 0 ? details : undefined}
  />
{/if}
