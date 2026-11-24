<script lang="ts">
  // Import markdown: a Remry markdown export (.zip), or .md files and their images, or a whole
  // folder (an Obsidian vault). `entity.import` makes the pages, projects and docs, stores the
  // images and links them up; this shows what it made and anything it couldn't do.
  // Rendered in a Popup (`?popup=import`) on the wiki and projects lists, and on a wiki page or
  // project (with `under`), where what has no parent in the import goes beneath it.
  import { trpc } from '$shared/trpc/client';
  import type { ImportResult, ImportUnderType } from '$shared/types/import';
  import Field from '$lib/ui/Field.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import EntityRow from '$lib/ui/EntityRow.svelte';
  import { submit } from '$lib/ui/submit';
  import { fileToBase64 } from '$lib/common/use-doc-handlers';

  interface Props {
    /** Where items with no parent in the import go; left out, the top level. */
    readonly under?: { readonly type: ImportUnderType; readonly id: string; readonly label: string } | null;
    readonly onDone: () => void;
    readonly onCancel: () => void;
  }

  const { under = null, onDone, onCancel }: Props = $props();

  // A little under the server's limit for one request.
  const MAX_BYTES = 17 * 1024 * 1024;
  const MARKDOWN = /\.(md|markdown)$/i;
  const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

  let picked = $state<readonly File[]>([]);
  let overwrite = $state(false);
  let importing = $state(false);
  let error = $state('');
  let result = $state<ImportResult | null>(null);

  /** A file's path in the import: its place in a picked folder, or its name. */
  const pathOf = (file: File): string => (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

  const usable = $derived(picked.filter((f) => /\.zip$/i.test(f.name) || MARKDOWN.test(f.name) || IMAGE.test(f.name)));
  const zips = $derived(usable.filter((f) => /\.zip$/i.test(f.name)));
  const summary = $derived.by(() => {
    if (zips.length) return zips.length === 1 ? zips[0]!.name : `${zips.length} .zip files: choose one`;
    const md = usable.filter((f) => MARKDOWN.test(f.name)).length;
    const images = usable.length - md;
    return `${md} markdown file${md === 1 ? '' : 's'}${images ? `, ${images} image${images === 1 ? '' : 's'}` : ''}`;
  });

  const pick = (list: FileList | null): void => {
    picked = list ? [...list] : [];
    error = '';
  };

  const handleImport = async (e: SubmitEvent): Promise<void> => {
    e.preventDefault();
    if (importing) return;
    error = '';
    if (zips.length > 1 || (zips.length === 1 && usable.length > 1)) {
      error = 'Import one .zip at a time, on its own.';
      return;
    }
    if (!usable.some((f) => /\.zip$/i.test(f.name) || MARKDOWN.test(f.name))) {
      error = 'Choose a .zip, or .md files (with their images), or a folder of them.';
      return;
    }
    if (usable.reduce((sum, f) => sum + f.size, 0) > MAX_BYTES) {
      error = 'That is more than 17 MB. Import it in parts (a folder at a time), or leave out large images.';
      return;
    }
    importing = true;
    try {
      const files = zips.length
        ? null
        : await Promise.all(usable.map(async (f) => (MARKDOWN.test(f.name) ? { path: pathOf(f), text: await f.text() } : { path: pathOf(f), dataBase64: await fileToBase64(f) })));
      const archiveBase64 = zips.length ? await fileToBase64(zips[0]!) : undefined;
      const outcome = await submit(() => trpc().entity.import.mutate({
        ...(archiveBase64 !== undefined ? { archiveBase64 } : { files: files! }),
        ...(under && { underType: under.type, underId: under.id }),
        existing: overwrite ? 'overwrite' : 'skip'
      }));
      if (outcome.ok) result = outcome.value;
      else error = outcome.error;
    } finally {
      importing = false;
    }
  };

  const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
  const tops = $derived(result ? result.items.filter((i) => i.top) : []);
</script>

{#if result}
  <div class="import-result">
    <p>
      {plural(result.created, 'item')} imported{#if result.updated}, {result.updated} updated{/if}{#if result.skipped}, {result.skipped} already here and left as they were{/if}{#if result.images}, with {plural(result.images, 'image')}{/if}.
    </p>
    {#if tops.length}
      <ul class="list">
        {#each tops as item (item.id)}
          <EntityRow href={item.path} label={item.title} peek={null} onclick={onDone}>
            {#snippet trailing()}<span class="meta">{item.outcome}</span>{/snippet}
          </EntityRow>
        {/each}
      </ul>
    {:else}
      <EmptyState message="Nothing new was made." />
    {/if}
    {#if result.imagesMissing.length}
      <p class="text-sm text-2">
        {plural(result.imagesMissing.length, 'image')} the text shows {result.imagesMissing.length === 1 ? "wasn't" : "weren't"} in the import, and {result.imagesMissing.length === 1 ? 'is' : 'are'} marked "Image lost": {result.imagesMissing.join(', ')}.
      </p>
    {/if}
    {#if result.problems.length}
      <div class="form-error" role="alert">
        <p>{plural(result.problems.length, 'thing')} couldn't be imported:</p>
        <ul>
          {#each result.problems as problem, i (i)}<li><strong>{problem.file}</strong>: {problem.message}</li>{/each}
        </ul>
      </div>
    {/if}
    <div class="form-actions">
      <button type="button" class="btn primary" onclick={onDone}>Done</button>
    </div>
  </div>
{:else}
  <form class="form-grid" onsubmit={handleImport}>
    <p class="text-sm text-2 hint">
      A Remry markdown export comes back as it was: pages, projects and docs, with their images and the links between them.
      Other markdown comes in as pages, a folder's files under the page beside it (<code>Guide.md</code> and <code>Guide/</code>).
      {#if under}What has no parent in the import goes under <strong>{under.label}</strong>.{/if}
    </p>
    <Field label="Files" hint="A .zip, or .md files with their images">
      {#snippet children({ id })}
        <input {id} type="file" multiple accept=".zip,.md,.markdown,image/png,image/jpeg,image/gif,image/webp" onchange={(e) => pick(e.currentTarget.files)} />
      {/snippet}
    </Field>
    <Field label="Or a folder" hint="Every .md file and image in it, keeping its sub-folders">
      {#snippet children({ id })}
        <input {id} type="file" webkitdirectory onchange={(e) => pick(e.currentTarget.files)} />
      {/snippet}
    </Field>
    {#if usable.length}<p class="text-sm text-2">{summary}</p>{/if}
    <Field label="Overwrite what's already here" hint="An item exported from this notebook keeps its id. Off: it's left as it is. On: its title and text are replaced.">
      {#snippet children({ id })}
        <input {id} type="checkbox" bind:checked={overwrite} />
      {/snippet}
    </Field>

    {#if error}<p class="form-error">{error}</p>{/if}

    <div class="form-actions">
      <button type="submit" class="btn primary" disabled={importing || usable.length === 0} aria-busy={importing}>
        {importing ? 'Importing…' : 'Import'}
      </button>
      <button type="button" class="btn ghost" onclick={onCancel}>Cancel</button>
    </div>
  </form>
{/if}

<style lang="scss">
  .hint { margin: 0; }
  .import-result {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    p { margin: 0; }
    ul { margin: 0; }
  }
</style>
