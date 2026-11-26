<script lang="ts">
  // An entity's sync controls, apart from what they make: a collapsible "Sync" section on the
  // entity's page holding SyncPrompt (the prompt, the sources and Sync now). The sync doc, or a
  // sync page's content, is only the output. Collapsed by default, with the last sync's dot in
  // the heading; open while the prompt is first being written (`creating`). Collapsed, the
  // prompt stays mounted but hidden, so a sync already running still shows when it's opened.
  // Opening it also shows the sync doc in the right panel's peek (`peekDocId`). The heading's
  // Active switch pauses or resumes the sync (`onSetActive`), open or folded.
  import type { ComponentProps } from 'svelte';
  import DisclosureButton from '$lib/ui/DisclosureButton.svelte';
  import SyncPrompt from './SyncPrompt.svelte';
  import SyncStatus from './SyncStatus.svelte';
  import Switch from '$lib/ui/Switch.svelte';
  import { submit } from '$lib/ui/submit';
  import { syncStatus } from '../last-sync';
  import { page } from '$app/state';
  import { closePeek, openPeek, PEEK_PARAM, peekValue } from '$lib/ui/peek-url';

  type Props = Omit<ComponentProps<typeof SyncPrompt>, 'badge'> & {
    /** The sync doc, shown in the right panel's peek while the section is open (not when it's already the open doc). */
    readonly peekDocId?: string | null;
    /** Pauses (false) or resumes (true) the sync: the Active switch. Without it the switch is read-only. */
    readonly onSetActive?: (active: boolean) => Promise<unknown>;
  };

  const { peekDocId = null, onSetActive, ...props }: Props = $props();

  // The switch shows what it was set to at once, and goes back if saving fails.
  let pending = $state<boolean | null>(null);
  let switchError = $state('');
  const active = $derived(pending ?? props.active ?? true);
  const setActive = async (next: boolean) => {
    if (!onSetActive) return;
    pending = next;
    switchError = '';
    const outcome = await submit(() => onSetActive(next));
    pending = null;
    if (!outcome.ok) switchError = outcome.error;
  };

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
    {#if !expanded && status && active}<span class="status"><SyncStatus {...status} /></span>{/if}
    {#if !props.creating}
      <span class="active" class:alone={!(!expanded && status && active)}>
        <Switch checked={active} label="Active" disabled={!onSetActive || pending !== null} title={active ? 'Synced from its sources. Turn off to pause it, keeping the prompt, sources and text.' : 'Paused: nothing syncs it. Turn on to sync it again from its sources.'} onchange={setActive} />
      </span>
    {/if}
  </div>
  {#if switchError}<p class="form-error">{switchError}</p>{/if}
  <div hidden={!expanded}>
    <SyncPrompt {...props} {active} badge={false} />
  </div>
</section>

<style lang="scss">
  .section-header { justify-content: flex-start; }
  .status { margin-left: auto; }
  .active { display: inline-flex; margin-left: var(--sp-3); }
  .active.alone { margin-left: auto; }
</style>
