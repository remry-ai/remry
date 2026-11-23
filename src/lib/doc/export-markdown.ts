// Saves a markdown export (`markdown-export.ts` plans it): copies the notebook's images,
// draws charts, mermaid diagrams and drawings as PNGs (the same drawing the PDF uses), and
// downloads one `.md` file or a `.zip` of the files with an `images/` folder. All in the
// browser; nothing leaves the page. A picture that can't be made keeps its fallback text.

import { fileUrl } from '$shared/utils/files';
import type { ChartBranding } from '$shared/types/branding';
import type { ExportNode } from '$shared/types/export-tree';
import { readDrawingContent, isSkeleton } from '$shared/utils/drawing';
import { fontsReady } from '$lib/ui/text-font';
import { renderDrawing } from '$lib/drawing/render-drawing';
import { drawChart, drawDiagrams, saveBlob } from './export-pdf';
import { finishMarkdown, planMarkdownExport, type MarkdownFormat, type PlannedAsset } from './markdown-export';
import { buildZip, type ZipEntry } from './zip';

export interface MarkdownExportInput {
  readonly root: ExportNode;
  /** Ids below the root to include. */
  readonly selected: ReadonlySet<string>;
  readonly format: MarkdownFormat;
  /** Colours charts and diagrams in `markdown`; null for none. */
  readonly branding: ChartBranding | null;
}

export interface MarkdownExportResult {
  readonly fileName: string;
  readonly files: number;
  /** Pictures that couldn't be copied or drawn, kept as text. */
  readonly missing: number;
}

const dataUrlBytes = (dataUrl: string): Uint8Array => {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const fetchStored = async (key: string): Promise<Uint8Array | null> => {
  try {
    const response = await fetch(fileUrl(key));
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
};

const drawPicture = async (asset: PlannedAsset, branding: ChartBranding | null, diagrams: ReadonlyMap<string, string>): Promise<Uint8Array | null> => {
  const { source } = asset;
  try {
    switch (source.kind) {
      case 'stored':
        return await fetchStored(source.key);
      case 'chart': {
        const chart = drawChart(source.source, branding);
        return chart ? dataUrlBytes(chart.dataUrl) : null;
      }
      case 'diagram': {
        const drawn = diagrams.get(source.source);
        return drawn ? dataUrlBytes(drawn) : null;
      }
      case 'drawing': {
        const scene = readDrawingContent(source.content);
        const rendered = await renderDrawing(scene, { scale: 2, background: !isSkeleton(scene) && scene.appState?.viewBackgroundColor !== undefined });
        return rendered ? new Uint8Array(await rendered.blob.arrayBuffer()) : null;
      }
    }
  } catch {
    return null;
  }
};

/** Builds and downloads the export. */
export const downloadMarkdown = async (input: MarkdownExportInput): Promise<MarkdownExportResult> => {
  const plan = planMarkdownExport(input.root, input.selected, input.format);
  const needsDrawing = plan.assets.some((a) => a.source.kind !== 'stored');
  if (needsDrawing) await fontsReady();

  const diagramSources = [...new Set(plan.assets.flatMap((a) => (a.source.kind === 'diagram' ? [a.source.source] : [])))];
  const diagrams = new Map([...(await drawDiagrams(diagramSources, input.branding))].map(([key, image]) => [key, image.dataUrl]));

  const pictures: ZipEntry[] = [];
  const drawn = new Set<string>();
  const written = new Map<string, boolean>();
  for (const asset of plan.assets) {
    // One stored image shown in several places is copied once.
    const done = written.get(asset.path);
    if (done !== undefined) {
      if (done) drawn.add(asset.token);
      continue;
    }
    const bytes = await drawPicture(asset, input.branding, diagrams);
    written.set(asset.path, bytes !== null);
    if (!bytes) continue;
    pictures.push({ path: asset.path, data: bytes });
    drawn.add(asset.token);
  }

  const encoder = new TextEncoder();
  const texts = plan.files.map((file) => ({ path: file.path, text: finishMarkdown(file, plan.assets, drawn, input.format) }));
  const missing = plan.assets.length - drawn.size;

  if (plan.fileName.endsWith('.md')) {
    saveBlob(new Blob([texts[0]!.text], { type: 'text/markdown;charset=utf-8' }), plan.fileName);
  } else {
    const zip = buildZip([...texts.map((t) => ({ path: t.path, data: encoder.encode(t.text) })), ...pictures]);
    saveBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), plan.fileName);
  }
  return { fileName: plan.fileName, files: texts.length, missing };
};
