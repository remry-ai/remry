<script lang="ts">
  // The chevron beside the notebook title in the top bar: the notebooks, then
  // links to create and manage notebooks, then the computer-wide License page
  // (kept here rather than in the nav, which has little room).
  import Menu, { type MenuItem } from '$lib/ui/Menu.svelte';
  import { openPopup } from '$lib/ui/popup-url';
  import type { NotebookInfo, NotebookSummary } from '$shared/types/notebook';
  import { switchNotebook } from '../switch';

  interface Props {
    readonly current: NotebookInfo;
    readonly notebooks: readonly NotebookSummary[];
  }

  const { current, notebooks }: Props = $props();

  const items = $derived<readonly MenuItem[]>([
    ...notebooks.map((n) => ({
      label: n.name,
      current: n.id === current.id,
      onSelect: () => {
        if (n.id !== current.id) switchNotebook(n.id);
      }
    })),
    { label: 'New notebook…', divided: true, onSelect: () => { openPopup('new-notebook'); } },
    { label: 'Manage notebooks', href: '/app/notebooks' },
    { label: 'License', href: '/app/license', divided: true }
  ]);
</script>

<Menu label="Switch notebook" iconOnly {items} />
