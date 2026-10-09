<script lang="ts">
  // Global popup, opened with `?popup=new-notebook`. Opens the notebook once it's created.
  import Popup from '$lib/common/Popup.svelte';
  import { closePopup } from '$lib/ui/popup-url';
  import NotebookForm from './NotebookForm.svelte';
  import { switchNotebook } from '../switch';
</script>

<Popup id="new-notebook" title="New notebook" size="sm">
  <NotebookForm onSuccess={(notebook) => switchNotebook(notebook.id)} onCancel={() => closePopup()} />
</Popup>
