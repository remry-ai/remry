<script lang="ts">
  import AppShell from "$lib/common/AppShell.svelte";
  import QuickFinder from "$lib/common/QuickFinder.svelte";
  import CreateTodoPopup from "$lib/todo/components/CreateTodoPopup.svelte";
  import NewNotebookPopup from "$lib/notebook/components/NewNotebookPopup.svelte";
  import { layoutConfig } from "$lib/stores/layout";

  import type { Snippet } from "svelte";
  import type { LayoutData } from "./$types";

  const { children, data } = $props<{ children: Snippet; data: LayoutData }>();
</script>

<!-- The notebook's default branding recolours the accent and selected tokens for everything below, popups included. -->
<div
  class:branded={!!data.brandTheme}
  style:--brand-primary={data.brandTheme?.primary}
  style:--brand-primary-text={data.brandTheme?.primaryText}
  style:--brand-accent={data.brandTheme?.accent}
  style:--brand-accent-text={data.brandTheme?.accentText}
  style:--brand-link={data.brandTheme?.link}
>
  <QuickFinder />
  <CreateTodoPopup />
  <NewNotebookPopup />

  <AppShell
    showInfoPanel={!$layoutConfig.hideInfoPanel}
    collapseInfoPanelOnMedium={$layoutConfig.collapseInfoPanel}
    brandIconUrl={data.defaultBrandingIconUrl ?? null}
    notebook={data.notebook}
    notebooks={data.notebooks}
  >
    {@render children()}
  </AppShell>
</div>
