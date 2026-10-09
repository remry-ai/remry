// The one chart renderer. Used by the Milkdown editor plugin, MarkdownReport
// (branded print view) and MarkdownRenderer (doc/note views).

import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  RadarController,
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  Filler,
  Legend,
  Title,
  Tooltip,
  type ChartConfiguration
} from 'chart.js';
import { chartColors, solidRgba, type ChartBranding } from '$shared/types/branding';
import { parseChartSpec, sectionsToSpec, type AggregatedSection, type ChartSpec } from '$shared/types/charts';

Chart.register(
  BarController, BarElement, LineController, LineElement, PointElement, RadarController,
  RadialLinearScale, CategoryScale, LinearScale, Filler, Legend, Title, Tooltip
);

const withAlpha = (rgba: string, alpha: number): string => rgba.replace(/[\d.]+\)$/, `${alpha})`);

export const chartMaxWidth = (spec: ChartSpec): string => (spec.type === 'radar' ? '400px' : '600px');

export const renderChart = (el: HTMLElement, spec: ChartSpec, branding: ChartBranding | null): Chart => {
  const colors = chartColors(branding);
  const canvas = document.createElement('canvas');
  el.appendChild(canvas);

  const multi = spec.series.length > 1;
  const datasets = spec.series.map((series, i) => {
    // A series with its own colour draws in it at full strength. The others fade from the
    // brand colour so several stay distinguishable.
    const base = series.color ? solidRgba(series.color) : colors.solid;
    const strength = series.color ? 1 : 1 - i * (0.6 / spec.series.length);
    const fill = spec.type === 'bar' ? withAlpha(base, 0.7 * strength) : withAlpha(base, 0.15);
    // Lines use the colour itself; `colors.border` is the accent *font* colour (often white).
    const line = withAlpha(base, strength);
    return {
      label: series.label ?? (multi ? `Series ${i + 1}` : spec.title ?? ''),
      data: [...series.values],
      backgroundColor: fill,
      borderColor: line,
      pointBackgroundColor: line,
      borderWidth: spec.type === 'bar' ? 1 : 2,
      ...(spec.type === 'bar' && { borderRadius: 4, maxBarThickness: 32 }),
      ...(spec.type === 'line' && { tension: 0.25 }),
      ...(spec.type === 'radar' && { fill: true })
    };
  });

  const range = {
    beginAtZero: true,
    ...(spec.min !== undefined && { min: spec.min }),
    ...(spec.max !== undefined && { max: spec.max })
  };

  const config = {
    type: spec.type,
    data: { labels: [...spec.labels], datasets },
    options: {
      responsive: true,
      animation: false,
      plugins: {
        legend: { display: multi },
        title: { display: !!spec.title, text: spec.title ?? '' }
      },
      scales: spec.type === 'radar' ? { r: range } : { y: range }
    }
  } as ChartConfiguration;

  return new Chart(canvas, config);
};

export const renderChartError = (el: HTMLElement, message: string): void => {
  el.classList.add('chart-error');
  el.style.cssText =
    'padding:0.5rem 0.75rem;border:1px solid var(--color-danger,#c0392b);border-radius:4px;' +
    'color:var(--color-danger,#c0392b);font-size:0.8rem;white-space:pre-wrap;';
  el.textContent = `Chart error: ${message}`;
};

/**
 * Replace rendered ```chart code blocks (and legacy [data-chart-key] placeholders)
 * inside `container` with charts. Returns the charts so callers can destroy them.
 */
export const mountCharts = (
  container: HTMLElement,
  branding: ChartBranding | null,
  sections: readonly AggregatedSection[] = []
): readonly Chart[] => {
  const charts: Chart[] = [];

  for (const code of container.querySelectorAll<HTMLElement>('pre > code.language-chart')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chart-block';
    code.parentElement!.replaceWith(wrapper);
    const parsed = parseChartSpec(code.textContent ?? '');
    if (parsed.ok) {
      wrapper.style.maxWidth = chartMaxWidth(parsed.value);
      charts.push(renderChart(wrapper, parsed.value, branding));
    } else {
      renderChartError(wrapper, parsed.error.message);
    }
  }

  for (const el of container.querySelectorAll<HTMLElement>('[data-chart-key]')) {
    const spec = sectionsToSpec(el.dataset.chartKey ?? '', sections);
    if (!spec) continue;
    el.classList.add('chart-block');
    el.style.maxWidth = chartMaxWidth(spec);
    charts.push(renderChart(el, spec, branding));
  }

  return charts;
};
