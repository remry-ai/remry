<script lang="ts">
  // The one "add link" form, wherever links are shown (a doc's or page's line of sources, a sync
  // banner, the sidebar's Links): an address and an optional title, or, with onUploadFile, a file
  // to upload as a link ("or upload a file"). `stacked` lays it out for a narrow sidebar.
  import { submit } from '$lib/ui/submit';

  interface Props {
    /** Adds a link to an address; without it the form only uploads ("Choose a file"). */
    readonly onAdd?: (link: { readonly url: string; readonly title?: string }) => Promise<unknown>;
    /** Uploads a file as a link (any file Claude can read; the server says what to do with others). */
    readonly onUploadFile?: (file: File) => Promise<unknown>;
    /** Called once a link is added or a file uploaded, and on Cancel. */
    readonly onDone: () => void;
    readonly stacked?: boolean;
  }

  const { onAdd, onUploadFile, onDone, stacked = false }: Props = $props();

  let url = $state('');
  let title = $state('');
  let saving = $state(false);
  let uploading = $state(false);
  let error = $state('');

  const add = async () => {
    if (!onAdd || !url.trim()) return;
    saving = true;
    error = '';
    const outcome = await submit(() => onAdd({ url: url.trim(), ...(title.trim() && { title: title.trim() }) }));
    saving = false;
    if (!outcome.ok) { error = outcome.error; return; }
    onDone();
  };

  const upload = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const chosen = input.files?.[0];
    if (!chosen || !onUploadFile) return;
    uploading = true;
    error = '';
    const outcome = await submit(() => onUploadFile(chosen));
    uploading = false;
    input.value = '';
    if (!outcome.ok) { error = outcome.error; return; }
    onDone();
  };
</script>

<form class="add-link" class:stacked onsubmit={(e: SubmitEvent) => { e.preventDefault(); void add(); }}>
  {#if onAdd}
    <!-- svelte-ignore a11y_autofocus -->
    <input type="url" class="sm url" bind:value={url} placeholder="https://…" aria-label="Link address" maxlength="2000" required autofocus />
    <input type="text" class="sm" bind:value={title} placeholder="Title (optional)" aria-label="Link title" maxlength="200" />
  {/if}
  <div class="actions">
    {#if onAdd}
      <button type="submit" class="btn sm" disabled={saving || uploading || !url.trim()} aria-busy={saving}>{saving ? 'Adding…' : 'Add'}</button>
    {/if}
    {#if onUploadFile}
      <label class="btn ghost sm" aria-busy={uploading}>
        {uploading ? 'Uploading…' : onAdd ? 'or upload a file' : 'Choose a file'}
        <input type="file" onchange={upload} disabled={uploading} hidden />
      </label>
    {/if}
    <button type="button" class="btn ghost sm" onclick={onDone}>Cancel</button>
  </div>
  {#if error}<p class="form-error">{error}</p>{/if}
</form>

<style lang="scss">
  // One row on a doc or page: the address takes the room, the title less; they wrap on a narrow pane.
  .add-link {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    input { width: auto; min-width: 0; flex: 1 1 10rem; }
    .url { flex: 3 1 16rem; }
    .form-error { flex-basis: 100%; margin: 0; }
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }
  // In a sidebar: one field per line, the buttons under them.
  .stacked {
    flex-direction: column;
    align-items: stretch;
    input, .url { flex: none; width: 100%; }
  }
</style>
