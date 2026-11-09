<script lang="ts">
  // The Delete button in a person's, group's, project's, goal's or page's edit form. It asks
  // what the delete takes with it (entity.deletePreview) when the form opens: with nothing, it's
  // the usual two-click ConfirmButton; otherwise its click asks again and a ConfirmDialog lists the docs, todos, files and links deleted with
  // it, and what's kept (sub-items moving up, owned work losing its owner).
  import ConfirmButton from '$lib/ui/ConfirmButton.svelte';
  import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
  import { trpc } from '$shared/trpc/client';
  import { submit } from '$lib/ui/submit';
  import { deletePreviewSections, isEmptyPreview, type PreviewableType, type PreviewSections } from '$shared/types/delete-preview';

  interface Props {
    readonly entityType: PreviewableType;
    readonly entityId: string;
    /** "Delete project". */
    readonly confirmLabel: string;
    readonly onConfirm: () => Promise<void> | void;
  }

  const { entityType, entityId, confirmLabel, onConfirm }: Props = $props();

  let name = $state('');
  let sections = $state<PreviewSections | null>(null);
  let open = $state(false);
  let busy = $state(false);
  let error = $state('');

  const load = async (): Promise<boolean> => {
    const outcome = await submit(() => trpc().entity.deletePreview.query({ entityType, id: entityId }));
    if (!outcome.ok) {
      error = outcome.error;
      return false;
    }
    name = outcome.value.name;
    sections = deletePreviewSections(entityType, outcome.value);
    return true;
  };

  // Looked up when the form opens, so the button knows which confirm to use.
  $effect(() => { void load(); });

  // Looked up again on click, in case something was added since.
  const start = async () => {
    busy = true;
    error = '';
    const loaded = await load();
    busy = false;
    if (loaded) open = true;
  };

  const close = () => { open = false; };
</script>

{#if sections && isEmptyPreview(sections) && !open}
  <ConfirmButton label="Delete" {confirmLabel} variant="button" {onConfirm} />
{:else}
  <button type="button" class="btn danger" onclick={start} disabled={busy || !sections} aria-busy={busy}>{busy ? 'Checking…' : 'Delete'}</button>
{/if}
{#if error}<span class="inline-error" role="alert">{error}</span>{/if}

{#if open && sections}
  <ConfirmDialog title="Delete {name}?" {confirmLabel} {onConfirm} onCancel={close}>
    {#if sections.deleted.length > 0}
      <p class="text-sm">Deleted with it, for good:</p>
      {#each sections.deleted as section (section.heading)}
        <div class="section">
          <h4 class="text-sm">{section.heading}</h4>
          {#if section.items.length > 0}
            <ul class="items text-sm">{#each section.items as item, i (i)}<li class="wrap">{item}</li>{/each}</ul>
          {/if}
        </div>
      {/each}
    {/if}
    {#if sections.kept.length > 0}
      <p class="text-sm">Kept:</p>
      {#each sections.kept as section (section.heading)}
        <div class="section">
          <h4 class="text-sm">{section.heading}</h4>
          <ul class="items text-sm text-2">{#each section.items as item, i (i)}<li class="wrap">{item}</li>{/each}</ul>
        </div>
      {/each}
    {/if}
  </ConfirmDialog>
{/if}

<style lang="scss">
  .section { margin-block: var(--sp-2); }
  h4 { margin: 0; }
  .items {
    margin: var(--sp-1) 0 0;
    padding-inline-start: var(--sp-5);
  }
  p { margin: var(--sp-3) 0 0; }
</style>
