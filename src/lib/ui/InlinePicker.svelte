<script lang="ts">
  // A single-pick relationship editor: a link-style trigger that reveals a
  // compact select, or a SearchPicker once the list is too long to scroll.
  // Options with a `group` are shown under that heading (a "/" scope when searching).
  import GroupedOptions from './GroupedOptions.svelte';
  import SearchPicker from './SearchPicker.svelte';
  import type { SearchScope } from './search-picker';

  interface Option {
    readonly id: string;
    readonly name: string;
    readonly group?: string;
  }

  interface Props {
    readonly label: string;
    readonly options: readonly Option[];
    readonly placeholder?: string;
    readonly onPick: (id: string) => Promise<void> | void;
  }

  const { label, options, placeholder = 'Choose…', onPick }: Props = $props();

  /** More options than this and the picker searches instead of showing a select. */
  const SEARCH_THRESHOLD = 8;

  let open = $state(false);
  let busy = $state(false);
  let error = $state('');
  let selectEl = $state<HTMLSelectElement | null>(null);

  const searchable = $derived(options.length > SEARCH_THRESHOLD);
  const searchOptions = $derived(options.map((o) => ({ id: o.id, name: o.name, scope: o.group })));
  const scopes = $derived<readonly SearchScope[]>(
    [...new Set(options.flatMap((o) => (o.group ? [o.group] : [])))].map((group) => ({
      id: group,
      label: group,
      slash: group.toLowerCase().replace(/s$/, ''),
    })),
  );

  $effect(() => {
    if (open) selectEl?.focus();
  });

  const close = () => {
    open = false;
    error = '';
  };

  const handleSearchPick = async (id: string) => {
    await onPick(id);
    open = false;
  };

  const handleChange = async (e: Event) => {
    const value = (e.currentTarget as HTMLSelectElement).value;
    if (!value) return;
    busy = true;
    error = '';
    try {
      await onPick(value);
      open = false;
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Could not save.';
    } finally {
      busy = false;
    }
  };
</script>

{#if options.length > 0}
  {#if open && searchable}
    <div class="search">
      <SearchPicker {label} options={searchOptions} {scopes} onPick={handleSearchPick} onCancel={close} />
    </div>
  {:else if open}
    <div class="picker">
      <select
        class="sm"
        bind:this={selectEl}
        onchange={handleChange}
        onkeydown={(e) => { if (e.key === 'Escape') close(); }}
        disabled={busy}
        aria-busy={busy}
        aria-label={label}
      >
        <option value="">{placeholder}</option>
        <GroupedOptions {options} />
      </select>
      <button type="button" class="btn ghost sm" onclick={close}>Cancel</button>
      {#if error}<span class="inline-error" role="alert">{error}</span>{/if}
    </div>
  {:else}
    <button type="button" class="btn link text-sm" onclick={() => { open = true; }}>+ {label}</button>
  {/if}
{/if}

<style lang="scss">
  .picker {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    max-width: 320px;
    select { flex: 1; }
  }
  .search {
    width: 100%;
    max-width: 360px;
  }
</style>
