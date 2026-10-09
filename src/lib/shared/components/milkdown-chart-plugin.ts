// Live chart previews in the Milkdown editor:
// - ```chart code blocks render a chart (or an inline error) below the code
// - legacy `[chart:key]` paragraphs render survey charts from chartSectionsCtx

import { $ctx, $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { Chart } from 'chart.js';
import type { ChartBranding } from '$shared/types/branding';
import { parseChartSpec, sectionsToSpec, type AggregatedSection, type ChartSpec } from '$shared/types/charts';
import { chartMaxWidth, renderChart, renderChartError } from '$lib/report/chart-render';

export const chartSectionsCtx = $ctx<readonly AggregatedSection[], 'chartSections'>([], 'chartSections');
export const chartBrandingCtx = $ctx<ChartBranding | null, 'chartBranding'>(null, 'chartBranding');

const CHART_TAG = /^\[chart:([^\]]+)\]$/;

const hash = (s: string): string => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

export const chartWidgetPlugin = $prose((ctx) => {
  const key = new PluginKey('chart-widget');
  const charts = new WeakMap<Node, Chart>();

  const destroy = (node: Node): void => {
    charts.get(node)?.destroy();
    charts.delete(node);
  };

  const widget = (build: (el: HTMLElement) => Chart | null) => (): HTMLElement => {
    const wrapper = document.createElement('div');
    wrapper.contentEditable = 'false';
    wrapper.style.margin = '0.5rem 0';
    const chart = build(wrapper);
    if (chart) charts.set(wrapper, chart);
    return wrapper;
  };

  const chartWidget = (spec: ChartSpec, branding: ChartBranding | null) =>
    widget((el) => {
      el.style.maxWidth = chartMaxWidth(spec);
      return renderChart(el, spec, branding);
    });

  return new Plugin({
    key,
    props: {
      decorations(state) {
        let sections: readonly AggregatedSection[] = [];
        let branding: ChartBranding | null = null;
        try {
          sections = ctx.get(chartSectionsCtx.key);
        } catch {
          // sections context not set - legacy tags render nothing
        }
        try {
          branding = ctx.get(chartBrandingCtx.key);
        } catch {
          // branding context not set - use defaults
        }
        const brandKey = hash(JSON.stringify(branding ?? {}));
        const decorations: Decoration[] = [];

        state.doc.descendants((node, pos) => {
          if (node.type.name === 'code_block' && node.attrs['language'] === 'chart') {
            const source = node.textContent;
            const parsed = parseChartSpec(source);
            const render = parsed.ok
              ? chartWidget(parsed.value, branding)
              : widget((el) => {
                  renderChartError(el, parsed.error.message);
                  return null;
                });
            decorations.push(Decoration.widget(pos + node.nodeSize, render, {
              side: 1,
              key: `chart-${hash(source)}-${brandKey}`,
              destroy
            }));
            return false;
          }

          if (!node.isTextblock || node.childCount !== 1 || !node.firstChild?.isText) return true;
          const text = node.firstChild.text ?? '';
          const match = CHART_TAG.exec(text);
          if (!match) return true;
          const spec = sectionsToSpec(match[1]!, sections);
          if (!spec) return true;

          decorations.push(Decoration.inline(pos + 1, pos + 1 + text.length, {
            style: 'font-size:0;line-height:0;overflow:hidden;height:0;display:block;'
          }));
          decorations.push(Decoration.widget(pos + 1 + text.length, chartWidget(spec, branding), {
            side: 1,
            key: `tag-${hash(JSON.stringify(spec))}-${brandKey}`,
            destroy
          }));
          return true;
        });

        return DecorationSet.create(state.doc, decorations);
      }
    }
  });
});
