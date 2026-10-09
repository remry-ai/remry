<script lang="ts">
  import type { PageData } from './$types';
  import MarkdownReport from '$lib/report/components/MarkdownReport.svelte';

  const { data }: { data: PageData } = $props();
  const report = $derived(data.report);
</script>

<svelte:head>
  <title>{report.title}</title>
</svelte:head>

<div class="print-toolbar no-print">
  <a href="/app/reports/{report.id}" class="btn ghost sm">← Back to editor</a>
  <button type="button" class="btn primary sm" onclick={() => window.print()}>Print / Save as PDF</button>
</div>

<main class="print-page">
  <MarkdownReport markdown={report.content} branding={report.branding} />
</main>

<style lang="scss">
  .print-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 900px;
    margin: 0 auto;
    padding: var(--sp-4) var(--sp-5) 0;
  }
  .print-page {
    max-width: 900px;
    margin: 0 auto;
    padding: var(--sp-8) var(--sp-5) var(--sp-10);
    background: var(--surface);
  }
  @media print {
    .print-page {
      padding: 0;
      max-width: none;
    }
    :global(.chart-block) {
      break-inside: avoid;
    }
  }
</style>
