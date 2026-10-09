<script lang="ts">
  // Check-in values over time, with the target as a flat line and, when the goal
  // has a period, the pace: where it should be on each check-in date.
  import { renderChart } from '$lib/report/chart-render';
  import { paceValue, progressAxis } from '$lib/goal/utils';
  import type { ChartSeries, ChartSpec } from '$shared/types/charts';
  import type { GoalCheckInItem } from '$shared/types/goals';

  interface Props {
    readonly checkIns: readonly GoalCheckInItem[];
    readonly baseline?: number | null;
    readonly target?: number | null;
    readonly unit?: string | null;
    readonly period?: string | null;
  }

  const { checkIns, baseline = null, target = null, unit = null, period = null }: Props = $props();

  const day = (d: Date | string): string => new Date(d).toISOString().slice(0, 10);

  const spec = $derived.by((): ChartSpec | null => {
    const points = checkIns
      .filter((c): c is GoalCheckInItem & { readonly value: number } => c.value !== null)
      .toSorted((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (points.length === 0) return null;

    const series: ChartSeries[] = [{ label: unit ? `Value (${unit})` : 'Value', values: points.map((c) => c.value) }];
    if (target !== null) series.push({ label: 'Target', values: points.map(() => target) });
    if (target !== null && period) {
      const pace = points.map((c) => paceValue(baseline ?? 0, target, period, day(c.date)));
      if (pace.every((v): v is number => v !== null)) series.push({ label: 'Pace', values: pace });
    }

    // The axis covers the check-ins, the target and the baseline, so the line
    // stays readable for a metric that sits far from zero (99.5% to 99.9% uptime).
    const spread = [...points.map((c) => c.value), ...(target !== null ? [target] : []), ...(baseline !== null ? [baseline] : [])];
    const axis = progressAxis(spread);
    const lowest = Math.min(...spread, 0);

    return {
      type: 'line',
      labels: points.map((c) => day(c.date)),
      series,
      ...(axis ? { min: axis.min, max: axis.max } : lowest < 0 && { min: lowest })
    };
  });

  // Each spec gets its own container (see the {#key} below), so a redrawn chart
  // never reuses a canvas or resize observer from the one it replaces.
  const chart = (node: HTMLElement, chartSpec: ChartSpec) => {
    const instance = renderChart(node, chartSpec, null);
    return { destroy: () => instance.destroy() };
  };
</script>

{#if spec}
  {#key spec}
    <div class="chart" use:chart={spec}></div>
  {/key}
{/if}

<style lang="scss">
  .chart {
    max-width: 600px;
    margin-top: var(--sp-3);
  }
</style>
