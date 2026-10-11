<script lang="ts">
  // ⌘K: search people, groups, projects, goals, wiki pages, the app's sections
  // and notebooks. Typing autocompletes names; Enter with no match searches
  // titles word by word and, with Remry Pro, full text under the title
  // matches. Rows come from quick-finder.ts.
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { trpc } from '$shared/trpc/client';
  import { loadEntityOptions, type EntityOption } from '$shared/trpc/load-entity-options';
  import { RELATABLE_TYPES } from '$shared/types/enums';
  import { isProActive, type LicenseStatus } from '$shared/types/license';
  import type { NotebookSummary } from '$shared/types/notebook';
  import type { SearchHit } from '$shared/types/search';
  import { ARCHIVE_CHANGED_EVENT } from '$shared/utils/archive';
  import { ENTITY_SEARCH_SCOPES, entityPath, parseTypedIdValue } from '$shared/utils/entity';
  import { model } from '$lib/stores/notebook-model';
  import { quickFinderOpen } from '$lib/stores/quick-finder';
  import { switchNotebook } from '$lib/notebook/switch';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { autocompleteRows, snippetParts, submittedRows, titleMatches, type FinderEntry, type FinderRow } from './quick-finder';

  const CACHE_TTL = 24 * 60 * 60 * 1000;
  const HIT_LIMIT = 20;
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

  // Full-text search is Remry Pro; the /app layout loads the license.
  const pro = $derived.by((): boolean => {
    const license = $page.data.license as LicenseStatus | undefined;
    return license ? isProActive(license) : false;
  });

  /** A query sent with Enter: its title matches and, with Pro, full-text hits (null while they load). */
  interface Submitted {
    readonly query: string;
    readonly titles: readonly FinderEntry[];
    readonly hits: readonly SearchHit[] | null;
  }

  let query = $state('');
  let active = $state(0);
  let entities = $state<readonly EntityOption[]>([]);
  let loading = $state(false);
  let submitted = $state<Submitted | null>(null);
  let searching = $state(false);
  let inputEl = $state<HTMLInputElement | null>(null);

  // Types the notebook doesn't have (goals in a home notebook) are left out of the finder.
  const entries = $derived([
    ...entities.filter((e) => $model.shows(e.scope)).map((e) => ({ ...e, meta: scopeLabel(e.scope) })),
    ...routeEntries,
    ...notebookEntries
  ]);

  const rows = $derived(
    submitted ? submittedRows(submitted.titles, submitted.hits ?? []) : autocompleteRows(query, entries, routeEntries)
  );
  const firstHit = $derived(rows.findIndex((row) => row.kind === 'hit'));

  const close = () => quickFinderOpen.set(false);

  const handleInput = (value: string) => {
    query = value;
    submitted = null;
    active = 0;
  };

  // Enter with nothing to pick: reload the names (the cache can be a day old) and
  // match titles word by word, then, with Pro, add full-text hits beneath them.
  const runSearch = async () => {
    const q = query.trim();
    if (!q || searching) return;
    searching = true;
    try {
      await loadEntities(true);
      if (query.trim() !== q) return;
      submitted = { query: q, titles: titleMatches(entries, q), hits: pro ? null : [] };
      active = 0;
      if (!pro) return;
      const result = await trpc().search.query.query({ q, limit: HIT_LIMIT }).catch(() => null);
      if (submitted?.query !== q) return;
      submitted = { ...submitted, hits: result?.ok ? result.value.results : [] };
    } finally {
      searching = false;
    }
  };

  const openEntry = (id: string): void => {
    const target = parseTypedIdValue(id, RELATABLE_TYPES);
    if (id.startsWith('route:')) void goto(id.slice('route:'.length));
    else if (id.startsWith('notebook:')) void switchNotebook(id.slice('notebook:'.length));
    else if (target) void goto(entityPath(target.type, target.id));
  };

  const select = (row: FinderRow) => {
    close();
    if (row.kind === 'hit') void goto(row.hit.path);
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
      e.preventDefault();
      const row = rows[active];
      if (row) select(row);
      else if (!submitted) void runSearch();
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
      submitted = null;
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
          placeholder="Search"
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
            {#if submitted && i === 0 && row.kind === 'entry'}
              <li class="heading" role="presentation">Titles</li>
            {/if}
            {#if i === firstHit}
              <li class="heading" role="presentation">Full text</li>
            {/if}
            <li
              id="quick-finder-row-{i}"
              class="result-item"
              class:hit={row.kind === 'hit'}
              class:selected={i === active}
              role="option"
              aria-selected={i === active}
              tabindex="-1"
              onmouseenter={() => (active = i)}
              onmousedown={(e) => { e.preventDefault(); select(row); }}
            >
              {#if row.kind === 'hit'}
                <span class="line">
                  <span class="name truncate">{row.hit.name}</span>
                  <span class="kind">{row.hit.on ? `on ${row.hit.on.name}` : ''}</span>
                </span>
                {#if row.hit.snippet}
                  <span class="snippet truncate">
                    {#each snippetParts(row.hit.snippet) as part, p (p)}{#if part.match}<strong>{part.text}</strong>{:else}{part.text}{/if}{/each}
                  </span>
                {/if}
              {:else}
                <span class="name truncate">{row.entry.name}</span>
                <span class="kind">{row.entry.meta}</span>
              {/if}
            </li>
          {/each}
          {#if submitted && submitted.hits === null}
            <li class="heading" role="presentation">Searching full text…</li>
          {/if}
        </ul>
      {:else}
        <div class="no-results">
          <EmptyState message={loading || searching ? 'Searching…' : submitted && submitted.hits === null ? 'Searching full text…' : submitted ? 'No results' : 'No matching names. Press ↵ to search.'} small />
        </div>
      {/if}
      {#if submitted && !pro}
        <p class="pro-note"><a href="/app/license" onclick={close}>Remry Pro</a> also searches notes, docs and todos.</p>
      {/if}
      <div class="finder-footer">
        <span><kbd>↑↓</kbd> navigate</span>
        <span><kbd>↵</kbd> open or search</span>
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

  .result-item.hit {
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    gap: 0;
    height: auto;
    padding: var(--sp-2) var(--sp-3);
  }

  .line {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-width: 0;
  }

  .name {
    flex: 1;
    min-width: 0;
  }

  .snippet {
    font-size: var(--fs-sm);
    color: var(--text-2);
    strong { color: var(--text); }
  }

  .heading {
    padding: var(--sp-2) var(--sp-3) var(--sp-1);
    font-size: var(--fs-xs);
    color: var(--text-3);
  }

  .pro-note {
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    border-top: 1px solid var(--border);
    font-size: var(--fs-xs);
    color: var(--text-3);
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
