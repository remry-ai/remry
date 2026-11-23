<script lang="ts">
  // A project's Export: the format (Markdown or Remry markdown), then which docs and
  // sub-projects go in, and Download.
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import MarkdownExportPanel from '$lib/doc/MarkdownExportPanel.svelte';
  import { EXPORT_FORMAT_LABELS, projectExportUrl } from '$lib/doc/print-options';
  import { MARKDOWN_FORMATS, type MarkdownFormat } from '$lib/doc/markdown-export';

  const { data }: { data: PageData } = $props();
  const project = $derived(data.project);

  const choose = (format: MarkdownFormat): void => {
    void goto(projectExportUrl(project.id, format), { replaceState: true, keepFocus: true, noScroll: true });
  };
</script>

<svelte:head>
  <title>Export {project.name}</title>
</svelte:head>

<div class="export-toolbar">
  <a href={project.path} class="btn ghost sm">← Back</a>
  <select class="sm" aria-label="Export format" onchange={(e) => choose(e.currentTarget.value as MarkdownFormat)}>
    {#each MARKDOWN_FORMATS as f (f)}
      <option value={f} selected={data.format === f}>{EXPORT_FORMAT_LABELS[f]}</option>
    {/each}
  </select>
</div>

<main class="export-page">
  <h1 class="export-title">Export {project.name}</h1>
  {#key `${project.id}:${data.format}`}
    <MarkdownExportPanel entityType="PROJECT" id={project.id} format={data.format} />
  {/key}
</main>

<style lang="scss">
  .export-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--sp-3);
    max-width: 900px;
    margin: 0 auto;
    padding: var(--sp-4) var(--sp-5) 0;
    select { width: auto; max-width: 200px; }
  }
  .export-page {
    max-width: 900px;
    margin: 0 auto;
    padding: var(--sp-5);
  }
  .export-title {
    margin: 0 0 var(--sp-4);
  }
</style>
