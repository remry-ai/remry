<script lang="ts">
  // ⌘K: find people, groups, projects, goals and wiki pages by name. Enter with
  // no match searches titles word by word. "project: api" narrows to one type
  // (docs and todos too, loaded when first narrowed to), on Enter as well. "/search …" searches the full text and
  // "/ask …" asks the local Claude a question about the notebook, answered once
  // with links (both Remry Pro). Rows come from quick-finder.ts.
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { trpc } from '$shared/trpc/client';
  import { loadEntityOptions, type EntityOption } from '$shared/trpc/load-entity-options';
  import { RELATABLE_TYPES } from '$shared/types/enums';
  import { isProActive, type LicenseStatus } from '$shared/types/license';
  import type { SearchHit } from '$shared/types/search';
  import { ARCHIVE_CHANGED_EVENT } from '$shared/utils/archive';
  import { ENTITY_SEARCH_SCOPES, entityPath, parseTypedIdValue } from '$shared/utils/entity';
  import { model } from '$lib/stores/notebook-model';
  import { quickFinderOpen } from '$lib/stores/quick-finder';
  import { waitForReply } from '$lib/common/use-page-chat';
  import MarkdownRenderer from '$lib/common/MarkdownRenderer.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { errorMessage, submitOrThrow } from '$lib/ui/submit';
  import {
    FINDER_SCOPES,
    appLink,
    autocompleteRows,
    commandRows,
    completeCommand,
    completeScope,
    docEntries,
    parseFinderQuery,
    parseScope,
    todoEntries,
    snippetParts,
    submittedRows,
    titleMatches,
    type FinderEntry,
    type FinderRow,
    type FinderScopeType
  } from './quick-finder';

  const CACHE_TTL = 24 * 60 * 60 * 1000;
  const HIT_LIMIT = 20;
  // One cache per notebook, so another notebook's entities never show up.
  const cacheKey = $derived(`quick-finder-cache:${$page.data.notebook?.id ?? ''}`);

  const scopeLabel = (scope: string): string => ENTITY_SEARCH_SCOPES.find((s) => s.id === scope)?.label ?? '';

  // Full-text search and Ask are Remry Pro; the /app layout loads the license.
  const pro = $derived.by((): boolean => {
    const license = $page.data.license as LicenseStatus | undefined;
    return license ? isProActive(license) : false;
  });

  /** A query sent with Enter: title matches for a name, full-text hits for "/search" (null while they load). */
  interface Submitted {
    readonly query: string;
    readonly titles: readonly FinderEntry[];
    readonly hits: readonly SearchHit[] | null;
    readonly error?: string;
  }

  /** "/ask": Claude's one answer to the question. */
  interface Answer {
    readonly query: string;
    readonly state: 'running' | 'done' | 'failed';
    readonly text: string;
  }

  let query = $state('');
  let active = $state(0);
  let entities = $state<readonly EntityOption[]>([]);
  // Docs and todos aren't in the name list; each loads the first time a query narrows to it.
  let attached = $state<Partial<Record<FinderScopeType, readonly FinderEntry[]>>>({});
  let loading = $state(false);
  let submitted = $state<Submitted | null>(null);
  let answer = $state<Answer | null>(null);
  let searching = $state(false);
  let inputEl = $state<HTMLInputElement | null>(null);
  let polling: AbortController | null = null;

  // Types the notebook doesn't have (goals in a home notebook) are left out of the finder.
  const entries: readonly FinderEntry[] = $derived(
    entities.filter((e) => $model.shows(e.scope)).map((e) => ({ ...e, meta: scopeLabel(e.scope) }))
  );

  // The types this notebook has (no goals in a home notebook).
  const available = $derived(FINDER_SCOPES.filter((s) => $model.shows(s.type)));
  const parsed = $derived(parseFinderQuery(query));
  // "project: api" (also after /search): the type it's narrowed to.
  const scoped = $derived(parsed.kind === 'names' || parsed.kind === 'search' ? parseScope(parsed.text, available) : { scope: null, text: '' });
  const scope = $derived(scoped.scope);
  const allEntries = $derived([...entries, ...(attached.DOC ?? []), ...(attached.TODO ?? [])]);
  const needsPro = $derived((parsed.kind === 'search' || parsed.kind === 'ask') && !pro);

  const rows = $derived.by((): readonly FinderRow[] => {
    if (submitted) return submittedRows(submitted.titles, submitted.hits ?? []);
    if (parsed.kind === 'names') return autocompleteRows(parsed.text, allEntries, available);
    if (parsed.kind === 'commands') return commandRows(parsed.commands);
    return [];
  });
  const firstHit = $derived(rows.findIndex((row) => row.kind === 'hit'));
  // Waiting on the server: names reloading for a title search, full-text hits, or Claude's answer.
  const waiting = $derived(
    searching || submitted?.hits === null || (parsed.kind === 'ask' && answer?.query === query && answer.state === 'running')
  );

  const emptyMessage = $derived.by((): string => {
    if (loading || searching) return 'Searching…';
    if (submitted?.error) return submitted.error;
    if (submitted?.hits === null) return 'Searching full text…';
    if (submitted) return scope ? `No ${scope.label.toLowerCase()} found` : 'No results';
    if (parsed.kind === 'search') return parsed.text.trim() ? 'Press ↵ to search the full text.' : 'Type words to find in notes, docs, wiki pages and todos.';
    if (parsed.kind === 'ask') return parsed.text.trim() ? 'Press ↵ to ask Claude.' : 'Type a question about this notebook.';
    if (parsed.kind === 'commands') return 'No such command. Try /search or /ask.';
    if (scope && (scope.type === 'DOC' || scope.type === 'TODO') && !attached[scope.type]) return `Loading ${scope.label.toLowerCase()}…`;
    if (scope) return `No matching ${scope.label.toLowerCase()}. Press ↵ to search ${pro ? 'their titles and text' : 'their titles'}.`;
    return 'No matching names. Press ↵ to search titles.';
  });

  const close = () => quickFinderOpen.set(false);

  const stopPolling = () => {
    polling?.abort();
    polling = null;
  };

  const handleInput = (value: string) => {
    query = value;
    submitted = null;
    active = 0;
  };

  // Enter on a name with nothing to pick: reload the names (in case one was added
  // since the finder opened) and match titles word by word.
  const searchTitles = async (q: string) => {
    searching = true;
    try {
      await loadEntities(true);
      if (query !== q) return;
      submitted = { query: q, titles: titleMatches(entries, q), hits: [] };
      active = 0;
    } finally {
      searching = false;
    }
  };

  // Enter narrowed to a type: its titles, reloaded, and with Remry Pro its full text.
  const searchScoped = async (q: string, type: FinderScopeType, text: string) => {
    searching = true;
    try {
      if (type === 'DOC' || type === 'TODO') await loadAttached(type);
      else await loadEntities(true);
      if (query !== q) return;
      const titles = titleMatches(allEntries.filter((e) => e.scope === type), text);
      submitted = { query: q, titles, hits: pro ? null : [] };
      active = 0;
    } finally {
      searching = false;
    }
    if (pro) await searchHits(q, text, type);
  };

  const searchText = async (q: string, text: string, type?: FinderScopeType) => {
    submitted = { query: q, titles: [], hits: null };
    active = 0;
    await searchHits(q, text, type);
  };

  // Full-text hits for the submitted query, of one type when it's narrowed.
  const searchHits = async (q: string, text: string, type?: FinderScopeType) => {
    try {
      const results = await submitOrThrow(() => trpc().search.query.query({ q: text, limit: HIT_LIMIT, ...(type && { types: [type] }) }));
      if (submitted?.query === q) submitted = { ...submitted, hits: results.results };
    } catch (e: unknown) {
      if (submitted?.query === q) submitted = { ...submitted, hits: [], error: errorMessage(e) };
    }
  };

  const ask = async (q: string, question: string) => {
    stopPolling();
    answer = { query: q, state: 'running', text: '' };
    const controller = new AbortController();
    polling = controller;
    try {
      const started = await submitOrThrow(() => trpc().chat.ask.mutate({ question }));
      if (!started.started) {
        answer = { query: q, state: 'failed', text: started.warning };
        return;
      }
      const reply = await waitForReply(trpc().chat, started.chatId, { signal: controller.signal });
      if (controller.signal.aborted) return;
      answer = reply === null
        ? { query: q, state: 'failed', text: "The answer didn't arrive. Ask again." }
        : { query: q, state: 'done', text: reply };
    } catch (e: unknown) {
      if (!controller.signal.aborted) answer = { query: q, state: 'failed', text: errorMessage(e) };
    }
  };

  const openEntry = (entry: FinderEntry): void => {
    if (entry.href) {
      void goto(entry.href);
      return;
    }
    const target = parseTypedIdValue(entry.id, RELATABLE_TYPES);
    if (target) void goto(entityPath(target.type, target.id));
  };

  const select = (row: FinderRow) => {
    if (row.kind === 'scope') {
      handleInput(`${row.scope.keywords[0]}: `);
      inputEl?.focus();
      return;
    }
    if (row.kind === 'command') {
      query = `/${row.command.id} `;
      submitted = null;
      active = 0;
      inputEl?.focus();
      return;
    }
    close();
    if (row.kind === 'hit') void goto(row.hit.path);
    else openEntry(row.entry);
  };

  const submit = () => {
    const row = rows[active];
    if (row) {
      select(row);
      return;
    }
    if (submitted || searching || needsPro) return;
    if (parsed.kind === 'names' && scope && scoped.text.trim()) void searchScoped(query, scope.type, scoped.text.trim());
    else if (parsed.kind === 'names' && !scope && parsed.text.trim()) void searchTitles(query);
    else if (parsed.kind === 'search' && scoped.text.trim()) void searchText(query, scoped.text.trim(), scope?.type);
    else if (parsed.kind === 'ask' && parsed.text.trim() && !(answer?.query === query && answer.state === 'running')) {
      void ask(query, parsed.text.trim());
    }
  };

  // A link in Claude's answer opens in the app, and the finder closes.
  const handleAnswerClick = (e: MouseEvent) => {
    const anchor = (e.target as Element | null)?.closest('a');
    const href = appLink(anchor?.getAttribute('href') ?? null);
    if (!href || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    close();
    void goto(href);
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
      submit();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      const completed = completeCommand(query, active) ?? completeScope(query, available);
      if (completed === null) return;
      e.preventDefault();
      handleInput(completed);
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

  // The cache shows names at once; the names are then reloaded on every open, since
  // Claude adds most of them through the CLI or MCP, which this page never hears about.
  const loadEntities = async (force: boolean) => {
    const cached = force ? null : readCache();
    if (cached) entities = cached;
    else loading = true;
    try {
      entities = await loadEntityOptions(trpc());
      writeCache(entities);
    } catch {
      if (!cached) entities = [];
    } finally {
      loading = false;
    }
  };

  // Docs and todos for a query narrowed to them, once per opening (they change often).
  const loadAttached = async (type: 'DOC' | 'TODO'): Promise<void> => {
    try {
      if (type === 'DOC') {
        const docs = await submitOrThrow(() => trpc().doc.titles.query());
        attached = { ...attached, DOC: docEntries(docs) };
      } else {
        attached = { ...attached, TODO: todoEntries(await trpc().todo.list.query({})) };
      }
    } catch {
      attached = { ...attached, [type]: [] };
    }
  };

  $effect(() => {
    const type = scope?.type;
    if ((type === 'DOC' || type === 'TODO') && !attached[type]) void loadAttached(type);
  });

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
      answer = null;
      attached = {};
      active = 0;
      void loadEntities(false);
    } else {
      stopPolling();
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
          placeholder="Find by name, project: to narrow, /search the text, /ask"
          autocomplete="off"
          spellcheck="false"
          value={query}
          oninput={(e) => handleInput(e.currentTarget.value)}
        />
        {#if scope}<span class="badge accent scope-badge" title="Searching {scope.label.toLowerCase()} only">{scope.label}</span>{/if}
        <button type="button" class="btn icon sm" onclick={handleRefresh} title="Refresh data" aria-label="Refresh data" disabled={loading}>
          {#if loading}…{:else}↻{/if}
        </button>
      </div>
      <div class="loading-bar" class:active={waiting} role="progressbar" aria-label="Loading" aria-hidden={!waiting}></div>
      {#if needsPro}
        <p class="pro-note">
          {parsed.kind === 'ask' ? 'Ask' : 'Full-text search'} is part of Remry Pro. <a href="/app/license" onclick={close}>See the License page</a>.
        </p>
      {:else if parsed.kind === 'ask' && answer?.query === query}
        <!-- Enter on a focused link fires click too, so the links work from the keyboard. -->
        <div class="answer" role="presentation" onclick={handleAnswerClick}>
          {#if answer.state === 'running'}
            <EmptyState message="Asking Claude… this can take a minute." small />
          {:else if answer.state === 'failed'}
            <p class="form-error">{answer.text}</p>
          {:else}
            <MarkdownRenderer content={answer.text} />
          {/if}
        </div>
      {:else if rows.length > 0}
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
              {#if row.kind === 'scope'}
                <span class="name mono">{row.scope.keywords[0]}:</span>
                <span class="kind">Search {row.scope.label.toLowerCase()} only <kbd>tab</kbd></span>
              {:else if row.kind === 'command'}
                <span class="name mono">/{row.command.id}</span>
                <span class="kind">{row.command.label}</span>
              {:else if row.kind === 'hit'}
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
        </ul>
      {:else}
        <div class="no-results">
          <EmptyState message={emptyMessage} small />
        </div>
      {/if}
      <div class="finder-footer">
        <span><kbd>↑↓</kbd> navigate</span>
        <span><kbd>↵</kbd> open or search</span>
        <span><kbd>project:</kbd> narrow</span>
        <span><kbd>/search</kbd> full text</span>
        <span><kbd>/ask</kbd> ask Claude</span>
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

  // An indeterminate bar under the box while a search or an answer is on its way.
  .loading-bar {
    position: relative;
    height: 2px;
    margin-top: -1px;
    overflow: hidden;
    &.active::after {
      content: '';
      position: absolute;
      inset: 0 auto 0 0;
      width: 30%;
      background: var(--accent);
      animation: loading-slide 1.1s var(--ease) infinite;
    }
  }

  @keyframes loading-slide {
    from { transform: translateX(-100%); }
    to { transform: translateX(340%); }
  }

  @media (prefers-reduced-motion: reduce) {
    .loading-bar.active::after { animation: none; width: 100%; opacity: 0.5; }
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

  .answer {
    overflow-y: auto;
    flex: 1;
    padding: var(--sp-3);
    // Claude's answer is a .md-rendered block: its links take the content link style (_base.scss).
  }

  .pro-note {
    margin: 0;
    padding: var(--sp-3);
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
