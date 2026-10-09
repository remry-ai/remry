<script lang="ts">
  import type { PageData } from './$types';
  import { goto, invalidateAll } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import MilkdownEditor from '$lib/shared/components/MilkdownEditor.svelte';
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import { submit } from '$lib/ui/submit';

  const { data }: { data: PageData } = $props();
  const report = $derived(data.report);

  let title = $state(data.report.title);
  let content = $state(data.report.content);
  let brandingId = $state(data.report.brandingId ?? '');
  let mode = $state<'editor' | 'markdown'>('editor');
  let saving = $state(false);
  let saved = $state(false);
  let error = $state('');

  const effectiveBrandingId = $derived(brandingId || data.defaultBrandingId || '');
  const activeBranding = $derived(data.brandings.find((b) => b.id === effectiveBrandingId) ?? null);

  const handleSave = async (): Promise<void> => {
    saving = true;
    error = '';
    const outcome = await submit(() => trpc().report.update.mutate({
      id: report.id,
      title: title.trim() || 'Untitled report',
      content,
      brandingId: brandingId || null,
    }));
    saving = false;
    if (!outcome.ok) {
      error = outcome.error;
      return;
    }
    saved = true;
    setTimeout(() => { saved = false; }, 2000);
    await invalidateAll();
  };

  const handleDelete = async (): Promise<void> => {
    const outcome = await submit(() => trpc().report.remove.mutate({ id: report.id }));
    if (outcome.ok) await goto(report.entityName ? report.entityPath : '/app/reports');
    else error = outcome.error;
  };

  const CHART_EXAMPLE = [
    '```chart',
    '{',
    '  "type": "bar",',
    '  "title": "Velocity",',
    '  "labels": ["Sprint 1", "Sprint 2", "Sprint 3"],',
    '  "series": [{ "label": "Points", "values": [21, 34, 29] }]',
    '}',
    '```'
  ].join('\n');
</script>

<svelte:head><title>{report.title} - Report</title></svelte:head>

<div class="page">
  <nav aria-label="breadcrumb">
    <ul>
      <li><a href="/app/reports">Reports</a></li>
      {#if report.entityName}
        <li><a href={report.entityPath}>{report.entityName}</a></li>
      {/if}
      <li>{report.title}</li>
    </ul>
  </nav>

  <div class="toolbar report-toolbar">
    <input class="title-input" bind:value={title} aria-label="Report title" placeholder="Report title" />
    <select class="sm branding-select" bind:value={brandingId} aria-label="Branding">
      <option value="">
        {data.defaultBrandingId ? `Default (${data.brandings.find((b) => b.id === data.defaultBrandingId)?.name})` : 'No branding'}
      </option>
      {#each data.brandings as b (b.id)}
        <option value={b.id}>{b.name}</option>
      {/each}
    </select>
    {#if saved}<span class="saved text-sm">Saved</span>{/if}
    <button type="button" class="btn primary sm" onclick={handleSave} disabled={saving} aria-busy={saving}>Save</button>
    <a href="/app/reports/{report.id}/print" target="_blank" rel="noopener" class="btn sm">Print / PDF</a>
  </div>

  {#if error}
    <p class="form-error">{error}</p>
  {/if}

  <div class="tabs">
    <button type="button" class="tab" class:active={mode === 'editor'} onclick={() => { mode = 'editor'; }}>Editor</button>
    <button type="button" class="tab" class:active={mode === 'markdown'} onclick={() => { mode = 'markdown'; }}>Markdown</button>
  </div>

  {#if mode === 'editor'}
    {#key effectiveBrandingId}
      <MilkdownEditor
        value={content}
        onChange={(md) => { content = md; }}
        branding={activeBranding}
      />
    {/key}
  {:else}
    <textarea class="markdown-input mono" bind:value={content} rows={24} spellcheck="false"></textarea>
  {/if}

  <details class="chart-help">
    <summary>Chart syntax</summary>
    <p class="text-sm">Add a fenced <code>chart</code> block. Types: <code>bar</code>, <code>line</code>, <code>radar</code>; up to 6 series, each with one value per label. Optional <code>title</code>, <code>min</code>, <code>max</code>.</p>
    <pre>{CHART_EXAMPLE}</pre>
  </details>

  <div class="danger-zone">
    <ConfirmButton label="Delete report" confirmLabel="Delete report" variant="button" onConfirm={handleDelete} />
  </div>
</div>

<style lang="scss">
  .report-toolbar {
    margin-bottom: var(--sp-4);
    flex-wrap: nowrap;
    @include mobile { flex-wrap: wrap; }
  }
  .title-input {
    flex: 1;
    min-width: 12rem;
    height: var(--control-h);
    font-size: var(--fs-lg);
    font-weight: 600;
    border-color: transparent;
    background: transparent;
    padding-left: var(--sp-1);
    &:hover { border-color: var(--border-strong); background: var(--surface); }
    &:focus { background: var(--surface); }
  }
  .branding-select { width: auto; max-width: 200px; }
  .saved { color: var(--success); }
  .tabs { margin: var(--sp-2) 0 var(--sp-3); }
  .markdown-input {
    width: 100%;
    font-size: var(--fs-sm);
    min-height: 400px;
  }
  .chart-help {
    margin-top: var(--sp-5);
    pre { font-size: var(--fs-sm); margin-top: var(--sp-2); }
    p { margin-top: var(--sp-2); }
  }
  .danger-zone {
    margin-top: var(--sp-8);
    padding-top: var(--sp-4);
    border-top: 1px solid var(--border);
  }
</style>
