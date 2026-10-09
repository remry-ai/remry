<script lang="ts">
  import type { PageData } from './$types';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';

  const { data }: { data: PageData } = $props();

  const formatDate = (d: Date | string): string =>
    (typeof d === 'string' ? new Date(d) : d).toLocaleDateString('en-CA');
</script>

<svelte:head><title>Reports</title></svelte:head>

<div class="page">
  <PageHeader title="Reports" description="Branded write-ups with charts. Create one from a person, team, department or project page, or ask Claude." />

  {#if data.reports.length === 0}
    <EmptyState message="No reports yet." boxed />
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Title</th><th>About</th><th>Branding</th><th>Updated</th></tr>
        </thead>
        <tbody>
          {#each data.reports as report (report.id)}
            <tr>
              <td><a href="/app/reports/{report.id}">{report.title}</a></td>
              <td class="text-2">
                {#if report.entityName}
                  <a href={report.entityPath} class="plain">{report.entityName}</a>
                {:else}
                  <span class="muted">{report.entityType.toLowerCase()}</span>
                {/if}
              </td>
              <td class="text-2">{report.brandingName ?? 'Default'}</td>
              <td class="text-2">{formatDate(report.updatedAt)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style lang="scss">
  .plain { font-weight: 400; color: var(--text-2); }
</style>
