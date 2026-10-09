<script lang="ts">
  import { marked } from 'marked';
  import type { Chart } from 'chart.js';
  import type { AggregatedSection } from '$shared/types/charts';
  import { mountCharts } from '$lib/report/chart-render';

  interface ReportBranding {
    readonly logoUrl: string | null;
    readonly primaryColor: string;
    readonly accentColor: string;
    readonly primaryFontColor: string;
    readonly accentFontColor?: string;
  }

  interface Props {
    readonly markdown: string;
    /** Survey sections for legacy [chart:key] tags. */
    readonly sections?: readonly AggregatedSection[];
    readonly branding?: ReportBranding | null;
  }

  const { markdown, sections = [], branding = null }: Props = $props();

  let container: HTMLDivElement;
  let charts: readonly Chart[] = [];

  const escapeAttr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  const renderContent = (): void => {
    if (!container) return;
    for (const c of charts) c.destroy();
    const preprocessed = markdown.replace(/\[chart:([^\]]+)\]/g, (_match: string, key: string) =>
      `<div data-chart-key="${escapeAttr(key)}"></div>`
    );
    container.innerHTML = marked.parse(preprocessed) as string;
    charts = mountCharts(container, branding, sections);
  };

  $effect(() => {
    void markdown;
    void sections;
    void branding;
    renderContent();
    return () => {
      for (const c of charts) c.destroy();
      charts = [];
    };
  });
</script>

{#if branding}
  <div class="report-branding" style:--report-primary={branding.primaryColor} style:--report-accent={branding.accentColor} style:--report-primary-font={branding.primaryFontColor}>
    {#if branding.logoUrl}
      <img class="report-logo" src={branding.logoUrl} alt="Logo" />
    {/if}
    <div class="report-rendered" bind:this={container}></div>
  </div>
{:else}
  <div class="report-rendered" bind:this={container}></div>
{/if}

<style lang="scss">
  .report-branding {
    .report-logo {
      max-height: 80px;
      margin-bottom: 2rem;
    }

    :global(h1), :global(h2) {
      color: var(--report-primary);
    }
    :global(th) {
      background: var(--report-primary) !important;
      color: var(--report-primary-font) !important;
      border-color: var(--report-primary) !important;
    }
  }
  .report-rendered {
    font-size: 0.9rem;

    :global(table) {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--border);
      margin: 1.5rem 0;
    }
    :global(th) {
      background: var(--text);
      color: var(--surface);
      font-weight: 600;
      padding: 0.35rem 0.5rem;
      border: 1px solid var(--text);
      font-size: var(--fs-sm);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    :global(td) {
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--border);
    }
    :global(code) {
      background: var(--surface-inset);
      color: var(--text);
    }
    :global(pre) {
      background: var(--surface-inset);
      color: var(--text);
    }
    :global(img) {
      max-width: 100%;
      height: auto;
    }
    :global(h1) { font-size: 1.5rem; }
    :global(h2) { font-size: 1.2rem; margin-top: 1.5rem; }
    :global(h3) { font-size: 1rem; margin-top: 1rem; }
    :global(.chart-block) { margin: 1rem 0; }
  }
</style>
