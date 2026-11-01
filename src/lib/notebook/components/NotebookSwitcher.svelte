<script lang="ts">
  // The chevron beside the notebook title in the top bar: the notebooks, then
  // links to create and manage notebooks, then this notebook's Branding, and the
  // computer-wide AI assistant choice and License page (kept here rather than in the nav,
  // which has little room).
  import Menu, { type MenuItem } from '$lib/ui/Menu.svelte';
  import { openPopup } from '$lib/ui/popup-url';
  import type { NotebookInfo, NotebookSummary } from '$shared/types/notebook';
  import { switchNotebook } from '../switch';
  import { LLM_POPUP } from '$lib/assist/llm-choice';

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
    { label: 'Branding', href: '/app/branding', divided: true },
    { label: 'AI assistant…', divided: true, onSelect: () => { openPopup(LLM_POPUP); } },
    { label: 'Other devices', href: '/app/other-devices' },
    { label: 'License', href: '/app/license' }
  ]);
</script>

<Menu label="Switch notebook" iconOnly {items} />
