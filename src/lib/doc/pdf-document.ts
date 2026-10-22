// The whole PDF as a pdfmake document: A4 pages, the letterhead or a plain title, the body
// from `pdf-markdown.ts`, a small logo atop later pages, and the title and page numbers in
// every footer. Pure: images arrive drawn (`PdfAssets`, and the logo as a `PdfImage`).

import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { markdownToPdf, PLAIN_COLORS, type PdfAssets, type PdfColors, type PdfImage } from './pdf-markdown';

/** A4 in points, and its margins. */
export const PDF_PAGE = { width: 595.28, height: 841.89, marginX: 48, marginTop: 52, marginBottom: 56 } as const;

export const PDF_CONTENT_WIDTH = PDF_PAGE.width - PDF_PAGE.marginX * 2;
export const PDF_CONTENT_HEIGHT = PDF_PAGE.height - PDF_PAGE.marginTop - PDF_PAGE.marginBottom;

export interface PdfBranding {
  readonly name: string;
  readonly primaryColor: string;
  readonly primaryFontColor: string;
  readonly accentColor: string;
}

export interface PdfDocumentInput {
  readonly title: string;
  /** The body, already without a leading title the letterhead shows. */
  readonly markdown: string;
  readonly assets: PdfAssets;
  /** Colours the headings, links, rules and table headers; null for a plain document. */
  readonly branding: PdfBranding | null;
  /** The branded letterhead: the logo over a rule in the primary colour, then the title. */
  readonly letterhead: boolean;
  /** The branding's logo (or icon), drawn. */
  readonly logo: PdfImage | null;
  /** Print the title as a heading: false when the body opens with its own. */
  readonly showTitle: boolean;
}

const MUTED = '#888888';

/** Fits an image in a box, keeping its shape. */
const fit = (image: PdfImage, maxWidth: number, maxHeight: number): { readonly width: number; readonly height: number } => {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  return { width: image.width * scale, height: image.height * scale };
};

const letterheadBlocks = (input: PdfDocumentInput, colors: PdfColors): Content[] => {
  const blocks: Content[] = [];
  if (input.logo) {
    // The print page's letterhead: at most 160 × 34 pixels.
    const size = fit(input.logo, 120, 26);
    blocks.push({ image: input.logo.dataUrl, ...size, margin: [0, 0, 0, 10] });
  }
  blocks.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: PDF_CONTENT_WIDTH, y2: 0, lineWidth: 0.75, lineColor: colors.primary }], margin: [0, 0, 0, 16] });
  blocks.push({ text: input.title, fontSize: 22, bold: true, color: colors.primary, margin: [0, 0, 0, 14] });
  return blocks;
};

/** pdfmake asks before placing each node: a heading with nothing after it on its page moves to the next. */
const keepHeadingsWithText: TDocumentDefinitions['pageBreakBefore'] = (node, queries) =>
  !!node.headlineLevel && queries.getFollowingNodesOnPage().length === 0;

export const buildPdfDocument = (input: PdfDocumentInput): TDocumentDefinitions => {
  const branded = !!input.branding;
  const colors: PdfColors = input.branding
    ? { primary: input.branding.primaryColor, primaryText: input.branding.primaryFontColor, accent: input.branding.accentColor }
    : PLAIN_COLORS;
  const head: Content[] = input.letterhead && input.branding
    ? letterheadBlocks(input, colors)
    : input.showTitle
      ? [{ text: input.title, fontSize: 22, bold: true, margin: [0, 0, 0, 14] }]
      : [];
  const body = markdownToPdf(input.markdown, input.assets, { width: PDF_CONTENT_WIDTH, height: PDF_CONTENT_HEIGHT, colors, branded });
  const logo = input.letterhead ? input.logo : null;

  return {
    pageSize: 'A4',
    pageMargins: [PDF_PAGE.marginX, PDF_PAGE.marginTop, PDF_PAGE.marginX, PDF_PAGE.marginBottom],
    info: { title: input.title, ...(input.branding && { author: input.branding.name }) },
    defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.3, color: '#1a1a1a' },
    content: [...head, ...body],
    pageBreakBefore: keepHeadingsWithText,
    // The letterhead opens page one; later pages carry the logo small, top right.
    header: (page: number): Content | null => {
      if (!logo || page === 1) return null;
      return { image: logo.dataUrl, ...fit(logo, 90, 16), alignment: 'right', margin: [0, 20, PDF_PAGE.marginX, 0] };
    },
    footer: (page: number, pages: number): Content => ({
      columns: [
        { text: input.title, fontSize: 8, color: MUTED, width: '*' },
        { text: `${page} / ${pages}`, fontSize: 8, color: MUTED, alignment: 'right', width: 'auto' }
      ],
      margin: [PDF_PAGE.marginX, 20, PDF_PAGE.marginX, 0]
    })
  };
};
