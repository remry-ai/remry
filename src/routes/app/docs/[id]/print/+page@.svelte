<script lang="ts">
  import type { PageData } from './$types';
  import PrintView from '$lib/doc/PrintView.svelte';
  import { printUrl } from '$lib/doc/print-options';
  import { docPath } from '$shared/utils/entity';
  import { printableBody } from '$lib/doc/printable-body.svelte';

  const { data }: { data: PageData } = $props();
  const doc = $derived(data.doc);
  // Back to the doc itself, open on its entity's page.
  const backHref = $derived(docPath(doc.entityType, doc.entityId, doc.id));
  const body = printableBody(() => doc);
</script>

<PrintView
    title={doc.title}
    content={body.markdown}
    {backHref}
    brandings={data.brandings}
    options={data.options}
    branding={data.branding}
    brandingLocked={data.brandingLocked}
    urlFor={(choice, header) => printUrl(doc.id, choice, header)}
  />
