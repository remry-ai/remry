<script lang="ts">
  // A spreadsheet's buttons in its holder's bar (an open doc's DocBar, a wiki page's Content
  // heading): Full screen, then its save state and Save (SaveButton, as a document's). The
  // close × follows in a doc's bar, as for every doc.
  import ExpandIcon from '$lib/ui/ExpandIcon.svelte';
  import SaveButton from './SaveButton.svelte';
  import type { SheetControl } from './sheet-control.svelte';

  interface Props {
    readonly control: SheetControl;
    /** False when archived: full screen only, nothing to save. */
    readonly editable: boolean;
  }

  const { control, editable }: Props = $props();
</script>

<button type="button" class="btn icon sm" onclick={() => { control.fullScreen = true; }} aria-label="Full screen" title="Full screen"><ExpandIcon /></button>
{#if editable}<SaveButton dirty={control.dirty} saving={control.saving} onSave={() => void control.save()} />{/if}
