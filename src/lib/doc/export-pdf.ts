// Builds a doc's PDF in the browser with pdfmake, from its markdown: real text, laid out and
// paged by pdfmake (`pdf-document.ts`, `pdf-markdown.ts`). This file draws what the PDF shows
// as pictures (images, charts, mermaid diagrams, the logo) and saves the file. pdfmake and its
// fonts load only when the user exports. Nothing leaves the page.

import type { TDocumentDefinitions, TFontContainer } from 'pdfmake/interfaces';
import { fileUrl } from '$shared/utils/files';
import { parseChartSpec } from '$shared/types/charts';
import type { ChartBranding } from '$shared/types/branding';
import { renderChart } from '$lib/report/chart-render';
import { buildPdfDocument, type PdfBranding } from './pdf-document';
import { collectPdfAssets, type PdfAssets, type PdfImage } from './pdf-markdown';
import { pdfFileName } from './pdf-pages';

export interface PdfExportInput {
  readonly title: string;
  /** The body, without a leading title the letterhead shows. */
  readonly markdown: string;
  readonly branding: (PdfBranding & ChartBranding & { readonly logoUrl: string | null; readonly iconUrl: string | null }) | null;
  readonly letterhead: boolean;
  readonly showTitle: boolean;
}

/** How much sharper than its on-screen size a chart or diagram is drawn. */
const DRAW_SCALE = 3;

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image'));
    reader.readAsDataURL(blob);
  });

const loadImage = (src: string, crossOrigin: boolean): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });

/** Draws an image onto a canvas as a PNG: for formats a PDF can't hold (SVG, WebP, GIF). */
const toPng = (img: HTMLImageElement, width: number, height: number, scale = 1): string => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
};

/** An image in the doc, as the PDF can hold it; null when it can't be loaded (it prints as a note). */
const drawImage = async (href: string): Promise<PdfImage | null> => {
  const src = href.startsWith('storage://') ? fileUrl(href.slice('storage://'.length)) : href;
  try {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const local = URL.createObjectURL(blob);
    try {
      const img = await loadImage(local, false);
      const size = { width: img.naturalWidth || 300, height: img.naturalHeight || 150 };
      // PNG and JPEG go in as they are; anything else is redrawn as a PNG.
      const dataUrl = /^image\/(png|jpe?g)$/.test(blob.type) ? await blobToDataUrl(blob) : toPng(img, size.width, size.height);
      return { dataUrl, ...size };
    } finally {
      URL.revokeObjectURL(local);
    }
  } catch {
    // Another site's image that its server won't hand to a script: a canvas can still take it if it allows CORS.
    try {
      const img = await loadImage(src, true);
      return { dataUrl: toPng(img, img.naturalWidth, img.naturalHeight), width: img.naturalWidth, height: img.naturalHeight };
    } catch {
      return null;
    }
  }
};

/** A chart block drawn off screen at the width the page shows it, in the branding's colours. */
const drawChart = (source: string, branding: ChartBranding | null): PdfImage | null => {
  const parsed = parseChartSpec(source);
  if (!parsed.ok) return null;
  const host = document.createElement('div');
  const width = parsed.value.type === 'radar' ? 400 : 600;
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;`;
  document.body.append(host);
  const chart = renderChart(host, parsed.value, branding);
  try {
    chart.options.devicePixelRatio = DRAW_SCALE;
    chart.resize();
    return { dataUrl: chart.toBase64Image('image/png', 1), width: chart.width, height: chart.height };
  } finally {
    chart.destroy();
    host.remove();
  }
};

interface Mermaid {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, source: string) => Promise<{ svg: string }>;
}

/** A mermaid diagram as a PNG. Labels are drawn as SVG text, since HTML labels don't survive as an image. */
const drawDiagram = async (mermaid: Mermaid, source: string): Promise<PdfImage | null> => {
  try {
    const { svg } = await mermaid.render(`pdf-mermaid-${Math.random().toString(36).slice(2, 9)}`, source);
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = doc.documentElement;
    const box = root.getAttribute('viewBox')?.split(/[\s,]+/).map(Number) ?? [];
    const width = box[2] && box[2] > 0 ? box[2] : 600;
    const height = box[3] && box[3] > 0 ? box[3] : 400;
    root.setAttribute('width', String(width));
    root.setAttribute('height', String(height));
    root.removeAttribute('style');
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' }));
    try {
      const img = await loadImage(url, false);
      return { dataUrl: toPng(img, width, height, DRAW_SCALE / 1.5), width, height };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
};

const drawDiagrams = async (sources: readonly string[]): Promise<Map<string, PdfImage>> => {
  const drawn = new Map<string, PdfImage>();
  if (sources.length === 0) return drawn;
  const mermaid = (await import('mermaid')).default as unknown as Mermaid;
  mermaid.initialize({ startOnLoad: false, theme: 'default', htmlLabels: false, flowchart: { htmlLabels: false } });
  try {
    for (const source of sources) {
      const image = await drawDiagram(mermaid, source);
      if (image) drawn.set(source, image);
    }
  } finally {
    // The page's own diagrams keep HTML labels, which wrap long text.
    mermaid.initialize({ startOnLoad: false, theme: 'default', htmlLabels: true, flowchart: { htmlLabels: true } });
  }
  return drawn;
};

const drawAll = async <T>(keys: readonly string[], draw: (key: string) => Promise<T | null> | T | null): Promise<Map<string, T>> => {
  const entries = await Promise.all(keys.map(async (key) => [key, await draw(key)] as const));
  return new Map(entries.flatMap(([key, value]) => (value ? [[key, value] as const] : [])));
};

/** What this file uses of pdfmake's browser bundle. */
interface PdfMake {
  addFontContainer: (container: TFontContainer) => void;
  createPdf: (definition: TDocumentDefinitions) => { getBlob: () => Promise<Blob> };
}

/** The CommonJS default of a dynamically imported bundle, or the module itself. */
const defaultOf = <T>(mod: unknown): T => ((mod as { default?: T }).default ?? mod) as T;

/**
 * Saves the file through a plain download link to a blob: address the page made, which the desktop
 * app's window accepts (`on_download`). pdfmake's own `download` spots that window's WebKit and opens
 * the PDF in a new window instead, which the window refuses.
 */
const saveBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Long enough for the download to start reading it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

/** Saves the doc as `<title>.pdf`. */
export const downloadPdf = async (input: PdfExportInput): Promise<void> => {
  const [pdfMakeModule, robotoModule, courierModule] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/fonts/Roboto'),
    import('pdfmake/build/standard-fonts/Courier')
  ]);
  const pdfMake = defaultOf<PdfMake>(pdfMakeModule);
  pdfMake.addFontContainer(defaultOf<TFontContainer>(robotoModule));
  pdfMake.addFontContainer(defaultOf<TFontContainer>(courierModule));

  const needed = collectPdfAssets(input.markdown);
  const logoHref = input.letterhead ? (input.branding?.logoUrl ?? input.branding?.iconUrl ?? null) : null;
  const [images, charts, diagrams, logo] = await Promise.all([
    drawAll(needed.images, drawImage),
    drawAll(needed.charts, (source) => drawChart(source, input.branding)),
    drawDiagrams(needed.diagrams),
    logoHref ? drawImage(logoHref) : Promise.resolve(null)
  ]);
  const assets: PdfAssets = { images, charts, diagrams };

  const definition = buildPdfDocument({
    title: input.title,
    markdown: input.markdown,
    assets,
    branding: input.branding,
    letterhead: input.letterhead,
    logo,
    showTitle: input.showTitle
  });
  saveBlob(await pdfMake.createPdf(definition).getBlob(), pdfFileName(input.title));
};
