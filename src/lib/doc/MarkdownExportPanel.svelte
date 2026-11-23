<script lang="ts">
  // A markdown export's choices and its Download button: which sub-pages, docs and
  // sub-projects go in (all by default; leaving one out leaves out what's under it), then
  // the download, a `.md` file or a `.zip` with an `images/` folder (`export-markdown.ts`).
  // The doc and wiki export pages show it for the markdown formats, the project export page always.
  import { onMount } from 'svelte';
  import { trpc } from '$shared/trpc/client';
  import type { ChartBranding } from '$shared/types/branding';
  import type { ExportNode, ExportNodeKind } from '$shared/types/export-tree';
  import { BODY_LABELS } from '$shared/types/body-types';
  import { errorMessage } from '$lib/ui/submit';
  import { allDescendantIds, type MarkdownFormat } from '$lib/doc/markdown-export';
  import { EXPORT_FORMAT_HINTS } from '$lib/doc/print-options';

  interface Props {
    readonly entityType: ExportNodeKind;
    readonly id: string;
    readonly format: MarkdownFormat;
    readonly branding?: ChartBranding | null;
  }

  const { entityType, id, format, branding = null }: Props = $props();

  let root = $state<ExportNode | null>(null);
  let loadError = $state('');
  let selected = $state<ReadonlySet<string>>(new Set());
  let exporting = $state(false);
  let exportError = $state('');
  let result = $state('');

  onMount(() => {
    trpc().entity.exportTree.query({ entityType, id }).then(
      (tree) => {
        if (!tree.ok) {
          loadError = tree.error.message;
          return;
        }
        root = tree.value;
        selected = new Set(allDescendantIds(tree.value));
      },
      (e: unknown) => { loadError = errorMessage(e); }
    );
  });

  interface Row {
    readonly node: ExportNode;
    readonly depth: number;
    /** Left out because a node above it is. */
    readonly blocked: boolean;
  }

  const rowsOf = (node: ExportNode, depth: number, blocked: boolean, picked: ReadonlySet<string>): Row[] =>
    node.children.flatMap((child) => [
      { node: child, depth, blocked },
      ...rowsOf(child, depth + 1, blocked || !picked.has(child.id), picked)
    ]);

  const rows = $derived(root ? rowsOf(root, 0, false, selected) : []);
  const allIds = $derived(root ? allDescendantIds(root) : []);

  const toggle = (nodeId: string, on: boolean): void => {
    const next = new Set(selected);
    if (on) next.add(nodeId);
    else next.delete(nodeId);
    selected = next;
  };

  const kindLabel = (node: ExportNode): string => {
    if (node.kind === 'PROJECT') return 'Project';
    if (node.kind === 'PAGE') return node.bodyType === 'doc' ? 'Page' : BODY_LABELS[node.bodyType];
    return node.prompt ? 'Sync' : BODY_LABELS[node.bodyType];
  };

  const handleDownload = async (): Promise<void> => {
    if (!root || exporting) return;
    exporting = true;
    exportError = '';
    result = '';
    try {
      const { downloadMarkdown } = await import('$lib/doc/export-markdown');
      const done = await downloadMarkdown({ root, selected, format, branding });
      const files = done.files === 1 ? '1 file' : `${done.files} files`;
      result = `Saved ${done.fileName} (${files}).${done.missing > 0 ? ` ${done.missing === 1 ? 'One picture' : `${done.missing} pictures`} couldn't be made and ${done.missing === 1 ? 'is' : 'are'} kept as text.` : ''}`;
    } catch (e: unknown) {
      exportError = `Couldn't make the export: ${errorMessage(e)}`;
    } finally {
      exporting = false;
    }
  };
</script>

<section class="export-panel card compact no-print" aria-label="Markdown export">
  <div class="panel-head">
    <p class="text-sm text-2">{EXPORT_FORMAT_HINTS[format]}.</p>
    <button type="button" class="btn primary sm" onclick={handleDownload} disabled={!root || exporting} aria-busy={exporting}>
      {exporting ? 'Exporting…' : 'Download'}
    </button>
  </div>

  {#if loadError}
    <p class="form-error" role="alert">{loadError}</p>
  {:else if root && rows.length > 0}
    <div class="section-header">
      <h4>Include</h4>
      <span class="count">{rows.filter((r) => !r.blocked && selected.has(r.node.id)).length} of {rows.length}</span>
      <span class="ml-auto pick-all">
        <button type="button" class="btn link sm" onclick={() => (selected = new Set(allIds))}>All</button>
        <button type="button" class="btn link sm" onclick={() => (selected = new Set())}>None</button>
      </span>
    </div>
    <ul class="tree">
      {#each rows as row (row.node.id)}
        <li style="--depth: {row.depth}">
          <label class="pick" class:blocked={row.blocked}>
            <input
              type="checkbox"
              checked={selected.has(row.node.id) && !row.blocked}
              disabled={row.blocked}
              onchange={(e) => toggle(row.node.id, e.currentTarget.checked)}
            />
            <span class="truncate">{row.node.title}</span>
            <span class="badge muted">{kindLabel(row.node)}</span>
          </label>
        </li>
      {/each}
    </ul>
  {/if}

  {#if exportError}<p class="form-error" role="alert">{exportError}</p>{/if}
  {#if result}<p class="text-sm text-2" role="status">{result}</p>{/if}
</section>

<style lang="scss">
  .export-panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    p { margin: 0; }
  }
  .pick-all {
    display: inline-flex;
    gap: var(--sp-2);
  }
  .tree {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 40vh;
    overflow-y: auto;
  }
  li {
    padding-left: calc(var(--depth) * var(--sp-5));
  }
  .pick {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-1) 0;
    min-width: 0;
    &.blocked { color: var(--text-3); }
  }
</style>
