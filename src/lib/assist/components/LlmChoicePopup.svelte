<script lang="ts">
  // Global popup, `?popup=choose-llm`: which AI assistant the web app runs (Claude Code, GitHub
  // Copilot…), saved for this computer. It opens by itself the first time a feature needs one
  // (`withLlmChoice`), and from the notebook menu's "AI assistant…". Each opening looks up which
  // assistants are installed now.
  import { page } from '$app/state';
  import Popup from '$lib/common/Popup.svelte';
  import { closePopup } from '$lib/ui/popup-url';
  import { submit } from '$lib/ui/submit';
  import { trpc } from '$shared/trpc/client';
  import type { LlmChoiceStatus, LlmProviderId } from '$shared/types/llm';
  import { LLM_POPUP, llmChoicePending, settleLlmChoice } from '../llm-choice';

  const isOpen = $derived(page.url.searchParams.get('popup') === LLM_POPUP);

  let status = $state<LlmChoiceStatus | null>(null);
  let selected = $state<LlmProviderId | null>(null);
  let error = $state<string | null>(null);
  let saving = $state(false);
  // Whether a feature opened it, rather than the menu: then it's started once a default is saved.
  let asked = $state(false);

  const load = async () => {
    status = null;
    error = null;
    const outcome = await submit(() => trpc().llm.available.query());
    if (!outcome.ok) { error = outcome.error; return; }
    status = outcome.value;
    selected = outcome.value.current ?? outcome.value.providers.find((p) => p.installed)?.id ?? null;
  };

  $effect(() => {
    if (isOpen) {
      asked = llmChoicePending();
      void load();
    } else if (llmChoicePending()) {
      // Closed with × or Esc: the feature that asked gets its "choose first" warning.
      settleLlmChoice(false);
    }
  });

  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!selected) return;
    saving = true;
    error = null;
    const provider = selected;
    const outcome = await submit(() => trpc().llm.setDefault.mutate({ provider }));
    saving = false;
    if (!outcome.ok) { error = outcome.error; return; }
    settleLlmChoice(true);
    // Reloads the layout, so labels name the new assistant.
    await closePopup({ invalidate: true });
  };

  const none = $derived(status !== null && !status.providers.some((p) => p.installed));
</script>

<Popup id={LLM_POPUP} title="AI assistant" size="sm">
  <form onsubmit={save}>
    <p class="text-sm muted intro">
      {asked ? 'Choose which assistant to use. Remry remembers it on this computer.' : 'The assistant Remry runs on this computer to convert files, chat and sync.'}
      It runs on your computer, signed in with your own account.
    </p>

    {#if status === null && !error}
      <p class="text-sm muted" aria-busy="true">Looking for installed assistants…</p>
    {:else if status}
      <fieldset class="choices">
        <legend class="sr-only">Assistant</legend>
        {#each status.providers as provider (provider.id)}
          <label class="choice" class:disabled={!provider.installed}>
            <input type="radio" name="llm" value={provider.id} bind:group={selected} disabled={!provider.installed} />
            <span class="choice-text">
              <span class="choice-name">
                {provider.name}
                {#if status.current === provider.id}<span class="badge muted">Default</span>{/if}
              </span>
              {#if !provider.installed}<span class="text-xs muted">Not installed. {provider.installHint}</span>{/if}
            </span>
          </label>
        {/each}
      </fieldset>
      {#if none}<p class="text-sm muted">None is installed yet. Install one, then open this again.</p>{/if}
    {/if}

    {#if error}<p class="form-error" role="alert">{error}</p>{/if}

    <div class="form-actions">
      <button type="submit" class="btn primary" disabled={saving || !selected || none} aria-busy={saving}>Use as default</button>
      <button type="button" class="btn ghost" onclick={() => { void load(); }} disabled={status === null}>Look again</button>
    </div>
  </form>
</Popup>

<style lang="scss">
  .intro { margin: 0 0 var(--sp-4); }
  .choices {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-4);
    padding: 0;
    border: 0;
  }
  .choice {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    padding: var(--sp-3);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    cursor: pointer;
    &:hover:not(.disabled) { background: var(--surface-hover); }
    &.disabled { cursor: default; opacity: 0.7; }
    input { margin-top: 2px; }
  }
  .choice-text { display: flex; flex-direction: column; gap: var(--sp-1); }
  .choice-name { display: flex; align-items: center; gap: var(--sp-2); font-weight: 500; }
</style>
