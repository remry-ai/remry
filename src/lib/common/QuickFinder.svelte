<script lang="ts">
  // ⌘K: search people, teams, departments, projects, goals, wiki pages, the
  // app's sections and notebooks. Queries read like the add-link search:
  // "/team console" searches teams and "/pro " completes to "/project ". The "/"
  // list also holds commands ("/todo", "/notebook"). Rows come from quick-finder.ts.
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { trpc } from '$shared/trpc/client';
  import { loadEntityOptions, type EntityOption } from '$shared/trpc/load-entity-options';
  import { RELATABLE_TYPES } from '$shared/types/enums';
  import type { NotebookSummary } from '$shared/types/notebook';
  import { ARCHIVE_CHANGED_EVENT } from '$shared/utils/archive';
  import { ENTITY_SEARCH_SCOPES, entityPath, parseTypedIdValue } from '$shared/utils/entity';
  import { model } from '$lib/stores/notebook-model';
  import { quickFinderOpen } from '$lib/stores/quick-finder';
  import { switchNotebook } from '$lib/notebook/switch';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { openPopup } from '$lib/ui/popup-url';
  import { completeScopeWord } from '$lib/ui/search-picker';
  import { finderRows, type FinderEntry, type FinderRow } from './quick-finder';

  const CACHE_TTL = 24 * 60 * 60 * 1000;
  // One cache per notebook, so another notebook's entities never show up.
  const cacheKey = $derived(`quick-finder-cache:${$page.data.notebook?.id ?? ''}`);

  // Every page the nav has, plus the ones it reaches through others (People and Groups under the Org Map).
  const ROUTES: readonly { readonly name: string; readonly href: string }[] = $derived([
    ...$model.nav.map((item) => ({ name: item.label, href: item.href })),
    ...[
      { name: 'People', href: '/app/people' },
      { name: 'Groups', href: '/app/groups' },
      { name: 'Group kinds', href: '/app/groups/kinds' },
      { name: 'Page kinds', href: '/app/wiki/kinds' },
      { name: 'Branding', href: '/app/branding' },
      { name: 'Notebooks', href: '/app/notebooks' }
    ].filter((r) => !$model.nav.some((item) => item.href === r.href))
  ]);

  const COMMANDS = [
    { id: 'todo', label: 'New todo', slash: 'todo', run: () => openPopup('todo') },
    { id: 'notebook', label: 'New notebook', slash: 'notebook', run: () => openPopup('new-notebook') }
  ];

  const routeEntries: readonly FinderEntry[] = $derived(ROUTES.map((r) => ({ id: `route:${r.href}`, name: r.name, meta: 'Go to' })));

  // From the /app layout. A page's own data can shadow the key, so check it's the list.
  const notebookEntries = $derived.by((): readonly FinderEntry[] => {
    const notebooks: unknown = $page.data.notebooks;
    if (!Array.isArray(notebooks)) return [];
    return (notebooks as readonly NotebookSummary[])
      .filter((n) => !n.isCurrent)
      .map((n) => ({ id: `notebook:${n.id}`, name: `Switch to ${n.name}`, meta: 'Notebook' }));
  });

  const scopeLabel = (scope: string): string => ENTITY_SEARCH_SCOPES.find((s) => s.id === scope)?.label ?? '';

  let query = $state('');
  let active = $state(0);
  let entities = $state<readonly EntityOption[]>([]);
  let loading = $state(false);
  let inputEl = $state<HTMLInputElement | null>(null);

  // Types the notebook doesn't have (goals in a home notebook) are left out of the finder.
  const scopes = $derived(ENTITY_SEARCH_SCOPES.filter((s) => $model.shows(s.id)));

  const rows = $derived(
    finderRows(query, {
      scopes,
      commands: COMMANDS,
      entries: [...entities.filter((e) => $model.shows(e.scope)).map((e) => ({ ...e, meta: scopeLabel(e.scope) })), ...routeEntries, ...notebookEntries],
      home: routeEntries
    })
  );

  const close = () => quickFinderOpen.set(false);

  const handleInput = (value: string) => {
    const scopeIndex = rows[active]?.kind === 'scope' ? active : 0;
    query = completeScopeWord(value, scopes, scopeIndex);
    active = 0;
  };

  const openEntry = (id: string): void => {
    const target = parseTypedIdValue(id, RELATABLE_TYPES);
    if (id.startsWith('route:')) void goto(id.slice('route:'.length));
    else if (id.startsWith('notebook:')) void switchNotebook(id.slice('notebook:'.length));
    else if (target) void goto(entityPath(target.type, target.id));
  };

  const select = (row: FinderRow) => {
    if (row.kind === 'scope') {
      query = `/${row.scope.slash} `;
      active = 0;
      inputEl?.focus();
      return;
    }
    close();
    if (row.kind === 'command') COMMANDS.find((c) => c.id === row.command.id)?.run();
    else openEntry(row.entry.id);
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      quickFinderOpen.set(!$quickFinderOpen);
    }
  };

  const handleModalKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' && rows.length > 0) {
      e.preventDefault();
      active = Math.min(active + 1, rows.length - 1);
    } else if (e.key === 'ArrowUp' && rows.length > 0) {
      e.preventDefault();
      active = Math.max(active - 1, 0);
    } else if (e.key === 'Enter') {
      const row = rows[active];
      if (!row) return;
      e.preventDefault();
      select(row);
    }
  };

  interface CacheData {
    readonly ts: number;
    readonly entities: readonly EntityOption[];
  }

  const readCache = (): readonly EntityOption[] | null => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const data = JSON.parse(raw) as Partial<CacheData>;
      // Caches from before people, teams and departments were searchable have no `entities`.
      if (!Array.isArray(data.entities) || !data.ts || Date.now() - data.ts > CACHE_TTL) return null;
      return data.entities;
    } catch {
      return null;
    }
  };

  const writeCache = (list: readonly EntityOption[]) => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), entities: list }));
    } catch { /* quota exceeded — ignore */ }
  };

  const loadEntities = async (force: boolean) => {
    const cached = force ? null : readCache();
    if (cached) {
      entities = cached;
      return;
    }
    loading = true;
    try {
      entities = await loadEntityOptions(trpc());
      writeCache(entities);
    } catch {
      entities = [];
    } finally {
      loading = false;
    }
  };

  // Archived entities leave the finder: forget the cache when one changes.
  $effect(() => {
    const key = cacheKey;
    const forget = () => {
      try { localStorage.removeItem(key); } catch { /* storage unavailable — ignore */ }
      entities = [];
    };
    window.addEventListener(ARCHIVE_CHANGED_EVENT, forget);
    return () => window.removeEventListener(ARCHIVE_CHANGED_EVENT, forget);
  });

  // Reset and load whenever the finder opens, from the shortcut or the nav button.
  $effect(() => {
    if ($quickFinderOpen) {
      query = '';
      active = 0;
      void loadEntities(false);
    }
  });

  $effect(() => {
    if ($quickFinderOpen && inputEl) inputEl.focus();
  });

  const handleRefresh = (e: MouseEvent) => {
    e.stopPropagation();
    void loadEntities(true);
  };
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $quickFinderOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="backdrop" onclick={(e) => { if (e.target === e.currentTarget) close(); }} onkeydown={handleModalKeydown}>
    <div class="finder">
      <div class="finder-header">
        <input
          bind:this={inputEl}
          type="text"
          role="combobox"
          aria-label="Search"
          aria-autocomplete="list"
          aria-controls="quick-finder-results"
          aria-expanded={rows.length > 0}
          aria-activedescendant={rows.length > 0 ? `quick-finder-row-${active}` : undefined}
          placeholder="Search, or / for a type or command"
          autocomplete="off"
          spellcheck="false"
          value={query}
          oninput={(e) => handleInput(e.currentTarget.value)}
        />
        <button type="button" class="btn icon sm" onclick={handleRefresh} title="Refresh data" aria-label="Refresh data" disabled={loading}>
          {#if loading}…{:else}↻{/if}
        </button>
      </div>
      {#if rows.length > 0}
        <ul class="results" id="quick-finder-results" role="listbox" aria-label="Results">
          {#each rows as row, i (row.key)}
            <li
              id="quick-finder-row-{i}"
              class="result-item"
              class:selected={i === active}
              role="option"
              aria-selected={i === active}
              tabindex="-1"
              onmouseenter={() => (active = i)}
              onmousedown={(e) => { e.preventDefault(); select(row); }}
            >
              {#if row.kind === 'scope'}
                <span class="name mono">/{row.scope.slash}</span>
              {:else if row.kind === 'command'}
                <span class="name mono">/{row.command.slash}</span>
                <span class="kind">{row.command.label}</span>
              {:else}
                <span class="name truncate">{row.entry.name}</span>
                <span class="kind">{row.entry.meta}</span>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <div class="no-results">
          <EmptyState message={loading ? 'Loading…' : 'No results'} small />
        </div>
      {/if}
      <div class="finder-footer">
        <span><kbd>↑↓</kbd> navigate</span>
        <span><kbd>↵</kbd> open</span>
        <span><kbd>/</kbd> type or command</span>
        <span><kbd>esc</kbd> close</span>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--scrim);
    backdrop-filter: blur(2px);
    z-index: var(--z-finder);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 15vh var(--sp-4) 0;
  }

  .finder {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    width: min(560px, 100%);
    max-height: 440px;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-3);
    height: fit-content;
    animation: finder-in 140ms ease;
  }

  .finder-header {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-3);
    border-bottom: 1px solid var(--border);

    input {
      flex: 1;
      height: 36px;
      border: none;
      box-shadow: none;
      font-size: var(--fs-base);
      padding: 0;
      background: transparent;
      &:focus { box-shadow: none; }
    }
  }

  .results {
    list-style: none;
    margin: 0;
    overflow-y: auto;
    flex: 1;
    padding: var(--sp-1) 0;
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    height: var(--control-h);
    padding: 0 var(--sp-3);
    font-size: var(--fs-md);
    color: var(--text);
    cursor: pointer;
    &.selected { background: var(--surface-hover); }
  }

  .name {
    flex: 1;
    min-width: 0;
  }

  .kind {
    font-size: var(--fs-xs);
    color: var(--text-3);
  }

  .no-results {
    padding: var(--sp-4);
  }

  .finder-footer {
    border-top: 1px solid var(--border);
    padding: var(--sp-2) var(--sp-3);
    display: flex;
    gap: var(--sp-4);
    font-size: var(--fs-xs);
    color: var(--text-3);
    span { display: inline-flex; align-items: center; gap: var(--sp-1); }
  }

  @keyframes finder-in {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
