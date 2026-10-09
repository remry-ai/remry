<script lang="ts">
  import { goto } from '$app/navigation';
  import { trpc } from '$shared/trpc/client';
  import type { EntityType } from '$shared/types/enums';
  import { submit } from '$lib/ui/submit';
  import EmptyState from '$lib/ui/EmptyState.svelte';

  interface ReportItem {
    readonly id: string;
    readonly title: string;
    readonly updatedAt: Date | string;
  }

  interface Props {
    readonly entityType: string;
    readonly entityId: string;
    readonly reports: readonly ReportItem[];
  }

  const { entityType, entityId, reports }: Props = $props();

  let creating = $state(false);
  let error = $state('');

  const createReport = async (): Promise<void> => {
    creating = true;
    error = '';
    const outcome = await submit(() => trpc().report.create.mutate({
      entityType: entityType as EntityType,
      entityId,
      title: 'Untitled report',
    }));
    creating = false;
    if (outcome.ok) await goto(`/app/reports/${outcome.value.id}`);
    else error = outcome.error;
  };

  const formatDate = (d: Date | string): string =>
    (typeof d === 'string' ? new Date(d) : d).toLocaleDateString('en-CA');
</script>

<div class="reports-widget">
  <div class="section-header">
    <h4>Reports <span class="count">{reports.length}</span></h4>
    <button type="button" class="btn icon sm" onclick={createReport} disabled={creating} aria-busy={creating} aria-label="New report" title="New report">+</button>
  </div>
  {#if error}
    <p class="form-error">{error}</p>
  {/if}
  {#if reports.length === 0}
    <EmptyState message="No reports yet." small />
  {:else}
    <ul class="list">
      {#each reports as report (report.id)}
        <li class="list-row">
          <a class="grow truncate" href="/app/reports/{report.id}">{report.title}</a>
          <span class="meta">{formatDate(report.updatedAt)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
