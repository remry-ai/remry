<script lang="ts">
  import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
  import { onMount } from 'svelte';
  import { chartColors, type ChartBranding } from '$shared/types/branding';

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

  const { labels, fullLabels, scores, maxScore = 5, branding } = $props<{
    labels: readonly string[];
    fullLabels?: readonly string[];
    scores: readonly number[];
    maxScore?: number;
    branding?: ChartBranding | null;
  }>();

  const colors = $derived(chartColors(branding));

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;
  let selectedIndex = $state<number | null>(null);

  const selectedLabel = $derived(
    selectedIndex !== null && fullLabels
      ? fullLabels[selectedIndex]
      : null
  );

  onMount(() => {
    chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: [...labels],
        datasets: [{
          data: [...scores],
          backgroundColor: colors.fill,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 4,
          maxBarThickness: 32
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        onClick: (_event, elements) => {
          if (elements.length > 0 && fullLabels) {
            const idx = elements[0]!.index;
            selectedIndex = selectedIndex === idx ? null : idx;
          }
        },
        scales: {
          y: { min: 0, max: maxScore, ticks: { stepSize: 1 } }
        }
      }
    });

    return () => chart?.destroy();
  });
</script>

<canvas bind:this={canvas}></canvas>
{#if selectedLabel}
  <p class="selected-label"><strong>{labels[selectedIndex!]}</strong>: {selectedLabel} - <em>{scores[selectedIndex!].toFixed(1)}</em></p>
{/if}

<style lang="scss">
  .selected-label {
    margin-top: var(--sp-2);
    font-size: var(--fs-md);
  }
</style>
