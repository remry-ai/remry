<script lang="ts">
  // An entity's sync controls, apart from what they make: a collapsible "Sync" section on the
  // entity's page holding SyncPrompt (the prompt, the sources and Sync now). The sync doc, or a
  // sync page's content, is only the output. Collapsed by default, with the last sync's dot in
  // the heading; open while the prompt is first being written (`creating`). Collapsed, the
  // prompt stays mounted but hidden, so a sync already running still shows when it's opened.
  // Opening it also shows the sync doc in the right panel's peek (`peekDocId`).
  import type { ComponentProps } from 'svelte';
  import DisclosureButton from '$lib/ui/DisclosureButton.svelte';
  import SyncPrompt from './SyncPrompt.svelte';
  import SyncStatus from './SyncStatus.svelte';
  import { syncStatus } from '../last-sync';
  import { page } from '$app/state';
  import { closePeek, openPeek, PEEK_PARAM, peekValue } from '$lib/ui/peek-url';

  type Props = Omit<ComponentProps<typeof SyncPrompt>, 'badge'> & {
    /** The sync doc, shown in the right panel's peek while the section is open (not when it's already the open doc). */
    readonly peekDocId?: string | null;
  };

  const { peekDocId = null, ...props }: Props = $props();

  // Opening the section shows what it writes beside it: the sync doc, in the peek. Folding it
  // closes that peek (and only that one).
  const toggle = () => {
    expanded = !expanded;
    if (!peekDocId) return;
    const value = peekValue('DOC', peekDocId);
    if (expanded) void openPeek(value);
    else if (page.url.searchParams.get(PEEK_PARAM) === value) void closePeek();
  };

  // Read once: it opens for a new prompt, and otherwise starts folded.
  // svelte-ignore state_referenced_locally
  let expanded = $state(props.creating ?? false);
  $effect(() => { if (props.creating) expanded = true; });

  const status = $derived(props.links.length > 0 || props.lastSync ? syncStatus(props.lastSync ?? null) : null);
</script>

<section class="sync-section" aria-label="Sync">
  <div class="section-header">
    <h4>
      <DisclosureButton {expanded} label="Sync" onToggle={toggle}>
        Sync
      </DisclosureButton>
    </h4>
    {#if !expanded && status}<span class="status"><SyncStatus {...status} /></span>{/if}
  </div>
  <div hidden={!expanded}>
    <SyncPrompt {...props} badge={false} />
  </div>
</section>

<style lang="scss">
  .section-header { justify-content: flex-start; }
  .status { margin-left: auto; }
</style>
