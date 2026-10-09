<script module lang="ts">
  let nextId = 0;
</script>

<script lang="ts">
  // Type to search a long list and pick one. A query starting with "/" names a
  // scope: "/" lists them, "/team console" searches teams, and a partly typed
  // word completes once a space follows it ("/pro " becomes "/project "). The
  // query stays plain text. Like InlinePicker, it shows an error only when
  // onPick throws.
  import EmptyState from './EmptyState.svelte';
  import { completeScopeWord, parseSearchQuery, searchOptions, type SearchOption, type SearchScope } from './search-picker';

  interface Props {
    readonly label: string;
    readonly options: readonly SearchOption[];
    readonly scopes?: readonly SearchScope[];
    readonly loading?: boolean;
    readonly onPick: (id: string) => Promise<void> | void;
    readonly onCancel?: () => void;
    /** Always on screen (a toolbar search): no autofocus, and the query clears after a pick or on Escape. */
    readonly persistent?: boolean;
    readonly placeholder?: string;
  }

  const {
    label,
    options,
    scopes = [],
    loading = false,
    onPick,
    onCancel,
    persistent = false,
    placeholder = 'Search, or / for a type'
  }: Props = $props();

  const listId = `search-picker-${nextId++}`;

  let query = $state('');
  let active = $state(0);
  let busy = $state(false);
  let error = $state('');
  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (!persistent) inputEl?.focus();
  });

  const parsed = $derived(parseSearchQuery(query, scopes));
  const results = $derived(
    parsed.scopes || (!parsed.scope && !parsed.text.trim()) ? [] : searchOptions(options, parsed.text, parsed.scope?.id ?? null)
  );
  const count = $derived(parsed.scopes ? parsed.scopes.length : results.length);

  const scopeLabel = (id: string | undefined): string => scopes.find((s) => s.id === id)?.label ?? '';

  const handleInput = (value: string) => {
    query = completeScopeWord(value, scopes, active);
    active = 0;
    error = '';
  };

  const pickScope = (picked: SearchScope) => {
    query = `/${picked.slash} `;
    active = 0;
    inputEl?.focus();
  };

  const pick = async (option: SearchOption) => {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await onPick(option.id);
      if (persistent) {
        query = '';
        active = 0;
      }
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Could not save.';
    } finally {
      busy = false;
    }
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (persistent) {
        query = '';
        active = 0;
        error = '';
      }
      onCancel?.();
    } else if (e.key === 'ArrowDown' && count > 0) {
      e.preventDefault();
      active = Math.min(active + 1, count - 1);
    } else if (e.key === 'ArrowUp' && count > 0) {
      e.preventDefault();
      active = Math.max(active - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const scopeMatch = parsed.scopes?.[active];
      const result = results[active];
      if (scopeMatch) pickScope(scopeMatch);
      else if (result) void pick(result);
    }
  };
</script>

<div class="search-picker">
  <input
    bind:this={inputEl}
    class="sm"
    type="text"
    role="combobox"
    autocomplete="off"
    spellcheck="false"
    aria-label={label}
    aria-autocomplete="list"
    aria-controls={listId}
    aria-expanded={count > 0}
    aria-activedescendant={count > 0 ? `${listId}-${active}` : undefined}
    aria-busy={busy}
    {placeholder}
    value={query}
    oninput={(e) => handleInput(e.currentTarget.value)}
    onkeydown={handleKeydown}
  />
  {#if count > 0 || loading || query.trim()}
  <!-- Floats below the input so opening it never moves the surrounding form. -->
  <div class="results">
  {#if count > 0}
    <ul class="list" role="listbox" id={listId} aria-label={label}>
      {#if parsed.scopes}
        {#each parsed.scopes as s, i (s.id)}
          <li
            id="{listId}-{i}"
            class="list-row"
            class:active={i === active}
            role="option"
            aria-selected={i === active}
            tabindex="-1"
            onmousedown={(e) => { e.preventDefault(); pickScope(s); }}
          >
            <span class="grow mono">/{s.slash}</span>
          </li>
        {/each}
      {:else}
        {#each results as o, i (o.id)}
          <li
            id="{listId}-{i}"
            class="list-row"
            class:active={i === active}
            role="option"
            aria-selected={i === active}
            tabindex="-1"
            onmousedown={(e) => { e.preventDefault(); void pick(o); }}
          >
            <span class="grow truncate">{o.name}</span>
            {#if !parsed.scope && o.scope}<span class="meta">{scopeLabel(o.scope)}</span>{/if}
          </li>
        {/each}
      {/if}
    </ul>
  {:else if loading}
    <p class="text-xs muted">Loading…</p>
  {:else if query.trim()}
    <EmptyState message="No matches." small />
  {/if}
  </div>
  {/if}
  {#if error}<span class="inline-error" role="alert">{error}</span>{/if}
</div>

<style lang="scss">
  .search-picker {
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .results {
    position: absolute;
    top: calc(100% + var(--sp-1));
    left: 0;
    right: 0;
    // Above the sticky detail header and cards, below drawers.
    z-index: var(--z-drawer-backdrop);
    max-height: 280px;
    overflow-y: auto;
    padding: var(--sp-1);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    box-shadow: var(--shadow-2);
  }
  [role='option'] { cursor: pointer; }
  p { margin: 0; }
</style>
