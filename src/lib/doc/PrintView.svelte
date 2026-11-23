<script lang="ts">
  // A doc's or wiki page's export page: the toolbar (the format, then for a PDF the branding,
  // header, Print… and Download PDF), for markdown the export's choices (`MarkdownExportPanel`),
  // then the sheet: the branded header or a plain title, then the body. The doc and wiki
  // export pages render it; each owns its URL (through `urlFor`) and its "Back" link.
  import type { Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import ProIcon from '$lib/ui/ProIcon.svelte';
  import MarkdownRenderer from '$lib/common/MarkdownRenderer.svelte';
  import DocPrintHeader from '$lib/doc/DocPrintHeader.svelte';
  import MarkdownExportPanel from '$lib/doc/MarkdownExportPanel.svelte';
  import {
    EXPORT_FORMATS,
    EXPORT_FORMAT_LABELS,
    NO_BRANDING,
    withoutLeadingTitle,
    type ExportFormat,
    type PrintOptions
  } from '$lib/doc/print-options';
  import { downloadPdf } from '$lib/doc/export-pdf';
  import { markPageBreaks } from '$lib/doc/pdf-pages';
  import { printPage } from '$lib/doc/print';

  interface BrandingOption {
    readonly id: string;
    readonly name: string;
    readonly isDefault: boolean;
  }

  interface PrintBranding {
    readonly id: string;
    readonly name: string;
    readonly logoUrl: string | null;
    readonly iconUrl: string | null;
    readonly primaryColor: string;
    readonly primaryFontColor: string;
    readonly accentColor: string;
    readonly accentFontColor?: string;
  }

  interface Props {
    readonly title: string;
    /** Markdown. */
    readonly content: string;
    readonly backHref: string;
    readonly brandings: readonly BrandingOption[];
    readonly options: PrintOptions;
    readonly branding: PrintBranding | null;
    /** This page's URL with other print options. */
    readonly urlFor: (choice: string, header: boolean, format: ExportFormat) => string;
    /** What Export makes (`?format=`). */
    readonly format: ExportFormat;
    /** What a markdown export reads its tree from: this doc, or this page with its sub-pages. */
    readonly exportTarget: { readonly entityType: 'DOC' | 'PAGE'; readonly id: string };
    /** Printed between the title and the body (a wiki page's properties). */
    readonly details?: Snippet;
    /** Branded export is Remry Pro: it prints plain, and the branding choice links to the License page. */
    readonly brandingLocked?: boolean;
  }

  const { title, content: markdown, backHref, brandings, options, branding, urlFor, format, exportTarget, details, brandingLocked = false }: Props = $props();

  const defaultBranding = $derived(brandings.find((b) => b.isDefault) ?? null);
  const showHeader = $derived(options.header && !!branding);
  // The title shows once: in the header, or as the page's own heading.
  const body = $derived(showHeader ? withoutLeadingTitle(markdown, title) : markdown);
  const hasOwnTitle = $derived(body.trimStart().startsWith('# '));
  const content = $derived(markPageBreaks(body));

  let exporting = $state(false);
  let exportError = $state('');

  const handleDownload = async (): Promise<void> => {
    if (exporting) return;
    exporting = true;
    exportError = '';
    try {
      await downloadPdf({ title, markdown: body, branding, letterhead: showHeader, showTitle: !hasOwnTitle });
    } catch (e: unknown) {
      exportError = `Couldn't make the PDF: ${e instanceof Error ? e.message : String(e)}. Print it to PDF instead.`;
    } finally {
      exporting = false;
    }
  };

  const choose = (choice: string, header: boolean, nextFormat: ExportFormat = format): void => {
    void goto(urlFor(choice, header, nextFormat), { replaceState: true, keepFocus: true, noScroll: true });
  };
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<div class="print-toolbar no-print">
  <a href={backHref} class="btn ghost sm">← Back</a>
  <div class="options">
    <select
      class="sm"
      aria-label="Export format"
      onchange={(e) => choose(options.choice, options.header, e.currentTarget.value as ExportFormat)}
    >
      {#each EXPORT_FORMATS as f (f)}
        <option value={f} selected={format === f}>{EXPORT_FORMAT_LABELS[f]}</option>
      {/each}
    </select>
    {#if format !== 'pdf'}
      <!-- A markdown export's Download is in its panel, below. -->
    {:else if brandingLocked}
      <a class="branding-locked text-sm text-2" href="/app/license" title="Branded PDFs are part of Remry Pro">Branding<ProIcon show label="Branded PDFs are part of Remry Pro" /></a>
    {:else}
    <select
      class="sm"
      aria-label="Branding"
      onchange={(e) => choose(e.currentTarget.value, options.header)}
    >
      <option value="" selected={options.choice === ''}>{defaultBranding ? `Default (${defaultBranding.name})` : 'No branding'}</option>
      {#each brandings as b (b.id)}
        <option value={b.id} selected={options.choice === b.id}>{b.name}</option>
      {/each}
      {#if defaultBranding}<option value={NO_BRANDING} selected={options.choice === NO_BRANDING}>No branding</option>{/if}
    </select>
    <label class="toggle">
      <input
        type="checkbox"
        role="switch"
        checked={options.header}
        disabled={!branding}
        onchange={(e) => choose(options.choice, e.currentTarget.checked)}
      />
      <span>Header</span>
    </label>
    {/if}
    {#if format === 'pdf'}
      <button type="button" class="btn ghost sm" onclick={() => printPage()}>Print…</button>
      <button type="button" class="btn primary sm" onclick={handleDownload} disabled={exporting} aria-busy={exporting}>
        {exporting ? 'Making PDF…' : 'Download PDF'}
      </button>
    {/if}
  </div>
</div>
{#if exportError}<p class="form-error export-error no-print" role="alert">{exportError}</p>{/if}
{#if format !== 'pdf'}
  <div class="export-choices">
    {#key format}
      <MarkdownExportPanel entityType={exportTarget.entityType} id={exportTarget.id} {format} {branding} />
    {/key}
  </div>
{/if}

<main class="print-page">
  <div class="sheet">
    {#if showHeader && branding}
      <DocPrintHeader {branding} title={title} />
    {:else if !hasOwnTitle}
      <h1 class="plain-title">{title}</h1>
    {/if}
    {#if details}<div class="print-details">{@render details()}</div>{/if}
    <div
      class="doc-body doc-text"
      class:branded={!!branding}
      style:--doc-primary={branding?.primaryColor}
      style:--doc-primary-font={branding?.primaryFontColor}
      style:--doc-accent={branding?.accentColor}
    >
      {#key branding?.id}
        <MarkdownRenderer {content} {branding} zoomable={false} />
      {/key}
    </div>
  </div>
</main>

<style lang="scss">
  .print-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--sp-3);
    max-width: 900px;
    margin: 0 auto;
    padding: var(--sp-4) var(--sp-5) 0;
  }
  .options {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    select { width: auto; max-width: 200px; }
  }
  .branding-locked {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
    &:hover { color: var(--text); }
  }
  .print-page {
    max-width: 900px;
    margin: 0 auto;
    padding: var(--sp-8) var(--sp-5) var(--sp-10);
    background: var(--surface);
  }
  .export-choices {
    max-width: 900px;
    margin: var(--sp-4) auto 0;
    padding: 0 var(--sp-5);
  }
  .export-error {
    max-width: 900px;
    margin: var(--sp-2) auto 0;
    padding: 0 var(--sp-5);
  }
  .sheet {
    background: #fff;
  }
  .print-details {
    margin: 0 0 var(--sp-5);
  }
  .plain-title {
    margin: 0 0 var(--sp-5);
    font-size: 1.6rem;
  }
  .doc-body {
    :global(table) {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
    }
    :global(th), :global(td) {
      padding: 0.3rem 0.5rem;
      border: 1px solid var(--border);
    }
    &.branded {
      :global(h1), :global(h2) { color: var(--doc-primary); }
      :global(h2) {
        padding-bottom: 0.2rem;
        border-bottom: 1px solid var(--doc-accent);
      }
      :global(blockquote) { border-left: 3px solid var(--doc-accent); }
      :global(a) { color: var(--doc-primary); }
      :global(th) {
        background: var(--doc-primary);
        color: var(--doc-primary-font);
        border-color: var(--doc-primary);
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
    }
  }
  // On screen a page break (a horizontal rule, or a `<!-- pagebreak -->` line) shows as a faint
  // gray rule, never in brand colours: it marks where the page ends rather than decorating it.
  // It's hidden in the PDF and when printing.
  .doc-body :global(hr),
  .doc-body :global(.page-break) {
    border: 0;
    margin: var(--sp-5) 0;
    border-top: 1px solid var(--border);
  }
  @media print {
    // Paper can't scroll, so a wide table runs on rather than being cut at its box's edge.
    .doc-body :global(.table-wrap) { overflow: visible; }
    .doc-body :global(hr),
    .doc-body :global(.page-break) {
      margin: 0;
      border: 0;
      break-after: page;
    }
    .print-page {
      padding: 0;
      max-width: none;
    }
    .doc-body {
      :global(.chart-block), :global(.mermaid-diagram), :global(img), :global(pre), :global(tr) {
        break-inside: avoid;
      }
    }
  }
</style>
