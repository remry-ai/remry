<script lang="ts">
  import { Chart, RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip } from 'chart.js';
  import { onMount } from 'svelte';
  import { chartColors, type ChartBranding } from '$shared/types/branding';

  Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip);

  const { labels, scores, maxScore = 5, branding } = $props<{
    labels: readonly string[];
    scores: readonly number[];
    maxScore?: number;
    branding?: ChartBranding | null;
  }>();

  const colors = $derived(chartColors(branding));

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  onMount(() => {
    chart = new Chart(canvas, {
      type: 'radar',
      data: {
        labels: [...labels],
        datasets: [{
          data: [...scores],
          backgroundColor: colors.fill.replace('0.7)', '0.2)'),
          borderColor: colors.border,
          borderWidth: 2,
          pointBackgroundColor: colors.border
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0,
            max: maxScore,
            ticks: { stepSize: 1 }
          }
        }
      }
    });

    return () => chart?.destroy();
  });
</script>

<div class="radar-container">
  <canvas bind:this={canvas}></canvas>
</div>

<style lang="scss">
  .radar-container {
    max-width: 400px;
    margin: 0 auto;
  }
</style>
