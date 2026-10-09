<script lang="ts">
  // A printable sheet of markdown with branding: the toolbar (branding, header, Print…,
  // Download PDF), the branded header or a plain title, then the body. The doc and wiki
  // print pages render it; each owns its URL (through `urlFor`) and its "Back" link.
  import type { Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import MarkdownRenderer from '$lib/common/MarkdownRenderer.svelte';
  import DocPrintHeader from '$lib/doc/DocPrintHeader.svelte';
  import { NO_BRANDING, withoutLeadingTitle, type PrintOptions } from '$lib/doc/print-options';
  import { downloadPdf } from '$lib/doc/export-pdf';
  import { markPageBreaks } from '$lib/doc/pdf-pages';

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
    readonly urlFor: (choice: string, header: boolean) => string;
    /** Printed between the title and the body (a wiki page's properties). */
    readonly details?: Snippet;
  }

  const { title, content: markdown, backHref, brandings, options, branding, urlFor, details }: Props = $props();

  const defaultBranding = $derived(brandings.find((b) => b.isDefault) ?? null);
  const showHeader = $derived(options.header && !!branding);
  // The title shows once: in the header, or as the page's own heading.
  const body = $derived(showHeader ? withoutLeadingTitle(markdown, title) : markdown);
  const hasOwnTitle = $derived(body.trimStart().startsWith('# '));
  const content = $derived(markPageBreaks(body));

  let sheet = $state<HTMLDivElement | null>(null);
  let exporting = $state(false);
  let exportError = $state('');

  const handleDownload = async (): Promise<void> => {
    if (!sheet || exporting) return;
    exporting = true;
    exportError = '';
    try {
      await downloadPdf(sheet, '.doc-print-header, .plain-title, .print-details, .md-rendered > *', title);
    } catch (e: unknown) {
      exportError = `Couldn't make the PDF: ${e instanceof Error ? e.message : String(e)}. Print it to PDF instead.`;
    } finally {
      exporting = false;
    }
  };

  const choose = (choice: string, header: boolean): void => {
    void goto(urlFor(choice, header), { replaceState: true, keepFocus: true, noScroll: true });
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
    <button type="button" class="btn ghost sm" onclick={() => window.print()}>Print…</button>
    <button type="button" class="btn primary sm" onclick={handleDownload} disabled={exporting} aria-busy={exporting}>
      {exporting ? 'Making PDF…' : 'Download PDF'}
    </button>
  </div>
</div>
{#if exportError}<p class="form-error export-error no-print" role="alert">{exportError}</p>{/if}

<main class="print-page">
  <div class="sheet" bind:this={sheet}>
    {#if showHeader && branding}
      <DocPrintHeader {branding} title={title} />
    {:else if !hasOwnTitle}
      <h1 class="plain-title">{title}</h1>
    {/if}
    {#if details}<div class="print-details">{@render details()}</div>{/if}
    <div
      class="doc-body"
      class:branded={!!branding}
      style:--doc-primary={branding?.primaryColor}
      style:--doc-primary-font={branding?.primaryFontColor}
      style:--doc-accent={branding?.accentColor}
    >
      {#key branding?.id}
        <MarkdownRenderer {content} {branding} />
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
  .print-page {
    max-width: 900px;
    margin: 0 auto;
    padding: var(--sp-8) var(--sp-5) var(--sp-10);
    background: var(--surface);
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
      :global(hr) { border: 0; border-top: 1px solid var(--doc-accent); }
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
  // On screen a declared page break shows as a dashed rule; it's hidden in the PDF and when printing.
  .doc-body :global(.page-break) {
    margin: var(--sp-5) 0;
    border-top: 1px dashed var(--border);
  }
  @media print {
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
