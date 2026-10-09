<script lang="ts">
  // One kind's pages as a table: a column per field, sortable headers, filters,
  // grouping and a totals row. The view lives in the URL (`$lib/page/dataset-url`);
  // the rows, groups and totals come from page.query in the page's load.
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { formatNumber, formatPropertyValue, optionLabel } from '$lib/page/utils';
  import { DATASET_PARAMS, readDatasetParams, withDatasetParam } from '$lib/page/dataset-url';
  import {
    AGGREGATE_FNS,
    canGroupBy,
    filterOpsFor,
    type AggregateFn,
    type FilterOp
  } from '$shared/utils/dataset';
  import type { PageKindDefinition, PageKindField, PageSummary } from '$shared/types/pages';

  interface Group {
    readonly value: string | null;
    readonly count: number;
    readonly totals: Readonly<Record<string, number | null>>;
    readonly pageIds: readonly string[];
  }

  interface Props {
    readonly kind: PageKindDefinition;
    readonly pages: readonly PageSummary[];
    readonly count: number;
    readonly totals: Readonly<Record<string, number | null>>;
    readonly groups: readonly Group[] | null;
  }

  const { kind, pages, count, totals, groups }: Props = $props();

  const fields = $derived(kind.fields);
  const view = $derived(readDatasetParams(page.url.searchParams));
  const TITLE: PageKindField = { key: 'title', label: 'Title', input: 'text' };
  const filterFields = $derived([TITLE, ...fields]);

  const go = (url: URL) => goto(url, { keepFocus: true, noScroll: true, replaceState: true });
  const setParam = (param: string, value: string | readonly string[] | null) => go(withDatasetParam(page.url, param, value));

  // ----- Sort: a header click goes ascending, descending, then unsorted -----

  const sortOf = $derived.by(() => {
    const [field, dir = 'asc'] = (view.sort ?? '').split(':');
    return field ? { field, dir } : null;
  });

  const toggleSort = (key: string) => {
    const current = sortOf?.field === key ? sortOf.dir : null;
    setParam(DATASET_PARAMS.sort, current === null ? `${key}:asc` : current === 'asc' ? `${key}:desc` : null);
  };

  const sortMark = (key: string): string => (sortOf?.field !== key ? '' : sortOf.dir === 'asc' ? ' ↑' : ' ↓');

  // ----- Filters -----

  const OP_LABELS: Readonly<Record<FilterOp, string>> = {
    is: 'is', not: 'is not', anyOf: 'is any of', contains: 'contains', gte: 'at least', lte: 'at most', empty: 'is empty', set: 'is set'
  };

  const describeFilter = (text: string): string => {
    const [key = '', op = '', ...rest] = text.split(':');
    const field = filterFields.find((f) => f.key === key);
    const values = rest.join(':').split('|').filter(Boolean).map((v) => (field?.options ? optionLabel(v) : v));
    return `${field?.label ?? key} ${OP_LABELS[op as FilterOp] ?? op} ${values.join(', ')}`.trim();
  };

  let newField = $state('');
  let newOp = $state<FilterOp>('is');
  let newValue = $state('');
  const pickedField = $derived(filterFields.find((f) => f.key === newField) ?? null);
  const ops = $derived(pickedField ? filterOpsFor(pickedField) : []);
  const needsValue = $derived(newOp !== 'empty' && newOp !== 'set');

  $effect(() => {
    if (pickedField && !ops.includes(newOp)) newOp = ops[0] ?? 'is';
  });

  const addFilter = () => {
    if (!pickedField || (needsValue && !newValue.trim())) return;
    const text = needsValue ? `${pickedField.key}:${newOp}:${newValue.trim()}` : `${pickedField.key}:${newOp}`;
    setParam(DATASET_PARAMS.filter, [...view.filters, text]);
    newField = '';
    newValue = '';
  };

  const removeFilter = (index: number) => setParam(DATASET_PARAMS.filter, view.filters.filter((_, i) => i !== index));

  // ----- Grouping and totals -----

  const groupFields = $derived(fields.filter(canGroupBy));
  const groupField = $derived(fields.find((f) => f.key === view.groupBy) ?? null);

  const AGG_LABELS: Readonly<Record<AggregateFn, string>> = { sum: 'Sum', avg: 'Average', min: 'Min', max: 'Max' };

  const aggregateFor = (key: string): AggregateFn | '' =>
    (view.aggregates.find((a) => a.startsWith(`${key}:`))?.split(':')[1] as AggregateFn | undefined) ?? '';

  const setAggregate = (key: string, fn: string) =>
    setParam(DATASET_PARAMS.aggregate, [...view.aggregates.filter((a) => !a.startsWith(`${key}:`)), ...(fn ? [`${key}:${fn}`] : [])]);

  const totalText = (field: PageKindField, values: Readonly<Record<string, number | null>>): string => {
    const fn = aggregateFor(field.key);
    const value = fn ? values[`${field.key}:${fn}`] : undefined;
    return value === undefined || value === null ? '' : formatNumber(field, value);
  };

  const groupLabel = (value: string | null): string => {
    if (value === null) return `No ${groupField?.label.toLowerCase() ?? 'value'}`;
    if (groupField?.input === 'checkbox') return `${groupField.label}: ${value === 'true' ? 'Yes' : 'No'}`;
    return groupField?.options ? optionLabel(value) : value;
  };

  const byId = $derived(new Map(pages.map((p) => [p.id, p])));
  const sections = $derived(
    groups
      ? groups.map((g) => ({ ...g, rows: g.pageIds.map((id) => byId.get(id)).filter((p): p is PageSummary => !!p) }))
      : [{ value: null, count, totals, pageIds: [], rows: pages }]
  );

  const cell = (p: PageSummary, field: PageKindField): string => {
    const value = p.properties[field.key];
    return value === undefined ? '' : formatPropertyValue(field, value);
  };

  const numberFields = $derived(fields.filter((f) => f.input === 'number'));
  const hasView = $derived(view.filters.length > 0 || !!view.sort || !!view.groupBy || view.aggregates.length > 0);
  const clearView = () => {
    const url = new URL(page.url);
    for (const param of Object.values(DATASET_PARAMS)) url.searchParams.delete(param);
    void go(url);
  };
</script>

<div class="toolbar filters">
  {#each view.filters as filter, i (`${i}:${filter}`)}
    <span class="badge chip">
      {describeFilter(filter)}
      <button type="button" class="btn icon sm" aria-label="Remove filter {describeFilter(filter)}" onclick={() => removeFilter(i)}>×</button>
    </span>
  {/each}

  <form class="toolbar" onsubmit={(e: SubmitEvent) => { e.preventDefault(); addFilter(); }}>
    <select class="sm" bind:value={newField} aria-label="Filter by field">
      <option value="">Add filter…</option>
      {#each filterFields as field (field.key)}<option value={field.key}>{field.label}</option>{/each}
    </select>
    {#if pickedField}
      <select class="sm" bind:value={newOp} aria-label="Condition">
        {#each ops as op (op)}<option value={op}>{OP_LABELS[op]}</option>{/each}
      </select>
      {#if needsValue}
        {#if pickedField.options && newOp !== 'anyOf'}
          <select class="sm" bind:value={newValue} aria-label="Value">
            <option value="">—</option>
            {#each pickedField.options as option (option)}<option value={option}>{optionLabel(option)}</option>{/each}
          </select>
        {:else if pickedField.input === 'checkbox'}
          <select class="sm" bind:value={newValue} aria-label="Value">
            <option value="">—</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        {:else}
          <input
            class="sm"
            type={pickedField.input === 'number' ? 'number' : pickedField.input === 'date' ? 'date' : 'text'}
            step={pickedField.input === 'number' ? 'any' : undefined}
            bind:value={newValue}
            placeholder={newOp === 'anyOf' ? 'One|Two|Three' : 'Value'}
            aria-label="Value"
          />
        {/if}
      {/if}
      <button type="submit" class="btn sm" disabled={needsValue && !newValue.trim()}>Add</button>
    {/if}
  </form>

  <span class="spacer"></span>

  {#if groupFields.length > 0}
    <select
      class="sm"
      value={view.groupBy ?? ''}
      onchange={(e) => setParam(DATASET_PARAMS.group, e.currentTarget.value || null)}
      aria-label="Group by"
    >
      <option value="">No grouping</option>
      {#each groupFields as field (field.key)}<option value={field.key}>Group by {field.label.toLowerCase()}</option>{/each}
    </select>
  {/if}
  {#if hasView}<button type="button" class="btn sm ghost" onclick={clearView}>Clear view</button>{/if}
</div>

{#if count === 0 && !hasView}
  <EmptyState message="No {kind.name.toLowerCase()} pages yet." />
{:else}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th><button type="button" class="btn link sort" onclick={() => toggleSort('title')}>Title{sortMark('title')}</button></th>
          {#each fields as field (field.key)}
            <th class:num={field.input === 'number'}>
              <button type="button" class="btn link sort" onclick={() => toggleSort(field.key)}>{field.label}{sortMark(field.key)}</button>
            </th>
          {/each}
        </tr>
      </thead>
      {#each sections as section (section.value ?? '\u0000')}
        <tbody>
          {#if groups}
            <tr class="group-row">
              <th scope="rowgroup">{groupLabel(section.value)} <span class="count">{section.count}</span></th>
              {#each fields as field (field.key)}
                <th class:num={field.input === 'number'}>{field.input === 'number' ? totalText(field, section.totals) : ''}</th>
              {/each}
            </tr>
          {/if}
          {#each section.rows as row (row.id)}
            <tr>
              <td><a href={row.path}>{row.title}</a>{#if row.archivedAt} <span class="badge muted">Archived</span>{/if}</td>
              {#each fields as field (field.key)}
                <td class="text-2" class:num={field.input === 'number'}>
                  {#if field.input === 'url' && row.properties[field.key] !== undefined}
                    <a href={String(row.properties[field.key])} target="_blank" rel="noreferrer">{cell(row, field)}</a>
                  {:else}
                    {cell(row, field)}
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      {/each}
      {#if count === 0}
        <tbody><tr><td colspan={fields.length + 1}><EmptyState message="No pages match this view." /></td></tr></tbody>
      {/if}
      <tfoot>
        <tr>
          <th>{count} {count === 1 ? 'page' : 'pages'}</th>
          {#each fields as field (field.key)}
            <th class:num={field.input === 'number'}>
              {#if field.input === 'number'}
                <span class="total">
                  <select
                    class="sm"
                    value={aggregateFor(field.key)}
                    onchange={(e) => setAggregate(field.key, e.currentTarget.value)}
                    aria-label="Total for {field.label}"
                  >
                    <option value="">—</option>
                    {#each AGGREGATE_FNS as fn (fn)}<option value={fn}>{AGG_LABELS[fn]}</option>{/each}
                  </select>
                  {totalText(field, totals)}
                </span>
              {/if}
            </th>
          {/each}
        </tr>
      </tfoot>
    </table>
  </div>
  {#if numberFields.length > 0 && view.aggregates.length === 0}
    <p class="muted text-sm">Pick Sum, Average, Min or Max under a number column to total it{groups ? ' for each group' : ''}.</p>
  {/if}
{/if}

<style lang="scss">
  .total {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    select { width: auto; min-width: 0; }
  }
</style>
