// A doc's markdown as pdfmake content: the PDF is laid out from the text itself, not a
// picture of the print page, so its text is real and pdfmake breaks pages between lines,
// rows and blocks. Pure: images, charts and diagrams come in already drawn (`PdfAssets`),
// and `collectPdfAssets` says which to draw. `export-pdf.ts` does the drawing and saving.

import { Lexer, type Token, type Tokens } from 'marked';
import type { Content, ContentImage, ContentText, TableCell } from 'pdfmake/interfaces';
import { normalizePageBreaks, separateBreakLines } from './pdf-pages';
import { nowrapColumns } from './table-columns';

/** An image ready for the PDF: a PNG or JPEG data URL and its size in CSS pixels. */
export interface PdfImage {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

export interface PdfAssets {
  /** By the image's address as written (`storage://…`, `/files/…`, `https://…`). */
  readonly images: ReadonlyMap<string, PdfImage>;
  /** By the chart block's text. */
  readonly charts: ReadonlyMap<string, PdfImage>;
  /** By the diagram's mermaid source. */
  readonly diagrams: ReadonlyMap<string, PdfImage>;
}

export interface PdfColors {
  /** Headings 1–2, links and the table header's fill. */
  readonly primary: string;
  /** Text on the primary colour (the table header). */
  readonly primaryText: string;
  /** Rules: under a heading 2, beside a quote, a horizontal rule. */
  readonly accent: string;
}

export const PLAIN_COLORS: PdfColors = { primary: '#1a1a1a', primaryText: '#1a1a1a', accent: '#d0d0d0' };

export interface PdfMarkdownOptions {
  /** Points the content can use across the page. */
  readonly width: number;
  /** Points the content can use down the page: no image is taller. */
  readonly height: number;
  readonly colors: PdfColors;
  /** False for a plain document: headers in grey on white, as the screen shows them. */
  readonly branded: boolean;
}

const MERMAID_START = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline|journey)\b/;
const PAGE_BREAK = /^<!--\s*page-?break\s*-->$/i;
const PX_TO_PT = 0.75;
const MUTED = '#666666';
const RULE = '#d0d0d0';
const CODE_FILL = '#f4f4f4';

const isChart = (token: Tokens.Code): boolean => token.lang?.trim() === 'chart';
const isDiagram = (token: Tokens.Code): boolean => token.lang?.trim() === 'mermaid' || MERMAID_START.test(token.text.trim());

/** The markdown the PDF is laid out from: page breaks and `<br>` lines as the screen reads them. */
const lex = (markdown: string): Token[] => new Lexer({ gfm: true }).lex(normalizePageBreaks(separateBreakLines(markdown)));

/** What the PDF needs drawn: each image's address, each chart's text and each diagram's source. */
export const collectPdfAssets = (markdown: string): { readonly images: readonly string[]; readonly charts: readonly string[]; readonly diagrams: readonly string[] } => {
  const images = new Set<string>();
  const charts = new Set<string>();
  const diagrams = new Set<string>();
  const walk = (tokens: readonly Token[]): void => {
    for (const token of tokens) {
      if (token.type === 'image') images.add((token as Tokens.Image).href);
      if (token.type === 'code') {
        const code = token as Tokens.Code;
        if (isChart(code)) charts.add(code.text);
        else if (isDiagram(code)) diagrams.add(code.text.trim());
      }
      for (const child of childTokens(token)) walk(child);
    }
  };
  walk(lex(markdown));
  return { images: [...images], charts: [...charts], diagrams: [...diagrams] };
};

/** Every list of tokens inside one: inline text, list items, table cells. */
const childTokens = (token: Token): readonly (readonly Token[])[] => {
  const lists: (readonly Token[])[] = [];
  if ('tokens' in token && Array.isArray(token.tokens)) lists.push(token.tokens);
  if (token.type === 'list') for (const item of (token as Tokens.List).items) lists.push(item.tokens);
  if (token.type === 'table') {
    const table = token as Tokens.Table;
    for (const cell of table.header) lists.push(cell.tokens);
    for (const row of table.rows) for (const cell of row) lists.push(cell.tokens);
  }
  return lists;
};

// ----- Inline text -----

interface RunStyle {
  readonly bold?: boolean;
  readonly italics?: boolean;
  readonly strike?: boolean;
  readonly code?: boolean;
  readonly link?: string;
}

/** A run of text, or an image that breaks the paragraph it's in. */
type Inline = { readonly kind: 'text'; readonly run: ContentText } | { readonly kind: 'image'; readonly token: Tokens.Image };

const decodeEntities = (text: string): string =>
  text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');

/** Only addresses a PDF reader can open: the app's own `/app/…` links mean nothing outside it. */
const externalLink = (href: string): string | undefined => (/^(https?:|mailto:)/i.test(href) ? href : undefined);

const run = (text: string, style: RunStyle, colors: PdfColors): ContentText => ({
  text,
  ...(style.bold && { bold: true }),
  ...(style.italics && { italics: true }),
  ...(style.strike && { decoration: 'lineThrough' as const }),
  ...(style.code && { font: 'Courier', fontSize: 9, background: CODE_FILL }),
  ...(style.link && { link: style.link, color: colors.primary, decoration: 'underline' as const })
});

/** Raw inline HTML: a `<br>` is a line break, other tags are dropped and their text kept. */
const inlineHtml = (html: string): string => (/^<br\s*\/?>$/i.test(html.trim()) ? '\n' : '');

const inlines = (tokens: readonly Token[], style: RunStyle, colors: PdfColors): Inline[] =>
  tokens.flatMap((token): Inline[] => {
    switch (token.type) {
      case 'strong':
        return inlines((token as Tokens.Strong).tokens, { ...style, bold: true }, colors);
      case 'em':
        return inlines((token as Tokens.Em).tokens, { ...style, italics: true }, colors);
      case 'del':
        return inlines((token as Tokens.Del).tokens, { ...style, strike: true }, colors);
      case 'link': {
        const link = token as Tokens.Link;
        const href = externalLink(link.href);
        return inlines(link.tokens, href ? { ...style, link: href } : style, colors);
      }
      case 'codespan':
        return [{ kind: 'text', run: run(decodeEntities((token as Tokens.Codespan).text), { ...style, code: true }, colors) }];
      case 'br':
        return [{ kind: 'text', run: run('\n', style, colors) }];
      case 'image':
        return [{ kind: 'image', token: token as Tokens.Image }];
      case 'html': {
        const text = inlineHtml((token as Tokens.HTML).text);
        return text ? [{ kind: 'text', run: run(text, style, colors) }] : [];
      }
      case 'text':
      case 'escape': {
        const text = token as Tokens.Text;
        if (text.tokens?.length) return inlines(text.tokens, style, colors);
        return [{ kind: 'text', run: run(decodeEntities(text.text), style, colors) }];
      }
      default:
        return 'text' in token && typeof token.text === 'string' ? [{ kind: 'text', run: run(decodeEntities(token.text), style, colors) }] : [];
    }
  });

// ----- Blocks -----

interface Context {
  readonly assets: PdfAssets;
  readonly options: PdfMarkdownOptions;
  /** Points available here: less inside a list or a quote. */
  readonly width: number;
}

/**
 * An image at its own size, but never wider than the space it's in or taller than a page.
 * A `w=…` in its title sets the width in pixels.
 */
const imageBlock = (image: PdfImage, ctx: Context, requestedPx?: number): ContentImage => {
  const natural = (requestedPx ?? image.width) * PX_TO_PT;
  const aspect = image.height > 0 && image.width > 0 ? image.height / image.width : 1;
  const maxHeight = ctx.options.height * 0.9;
  const width = Math.min(natural, ctx.width, maxHeight / aspect);
  return { image: image.dataUrl, width, margin: [0, 4, 0, 8] };
};

const imageToken = (token: Tokens.Image, ctx: Context): Content => {
  const image = ctx.assets.images.get(token.href);
  if (!image) return { text: token.text ? `[Image: ${token.text}]` : '[Image]', italics: true, color: MUTED, margin: [0, 0, 0, 8] };
  const requested = /w=(\d+)/.exec(token.title ?? '')?.[1];
  return imageBlock(image, ctx, requested ? Number(requested) : undefined);
};

/** Text with its images split out, each on its own line, as the screen shows a lone image. */
const paragraph = (tokens: readonly Token[], ctx: Context, extra: Partial<ContentText> = {}): Content[] => {
  const parts = inlines(tokens, {}, ctx.options.colors);
  const blocks: Content[] = [];
  let runs: ContentText[] = [];
  const flush = (): void => {
    // Leading and trailing line breaks around a split-out image are spacing, not text.
    while (runs.length && runs[0]!.text === '\n') runs.shift();
    while (runs.length && runs.at(-1)!.text === '\n') runs.pop();
    if (runs.length) blocks.push({ text: runs, margin: [0, 0, 0, 8], ...extra });
    runs = [];
  };
  for (const part of parts) {
    if (part.kind === 'text') runs.push(part.run);
    else {
      flush();
      blocks.push(imageToken(part.token, ctx));
    }
  }
  flush();
  return blocks;
};

const HEADING_SIZES = [20, 16, 13.5, 12, 11, 10.5] as const;

const heading = (token: Tokens.Heading, ctx: Context): Content[] => {
  const { colors, branded } = ctx.options;
  const size = HEADING_SIZES[token.depth - 1] ?? 10.5;
  const color = token.depth <= 2 && branded ? colors.primary : undefined;
  const text: Content = {
    text: inlines(token.tokens, { bold: true }, colors).flatMap((part) => (part.kind === 'text' ? [part.run] : [])),
    fontSize: size,
    bold: true,
    ...(color && { color }),
    margin: [0, token.depth <= 2 ? 12 : 8, 0, token.depth === 2 && branded ? 2 : 4],
    // So pageBreakBefore can keep a heading with what follows it.
    headlineLevel: token.depth
  };
  if (token.depth !== 2 || !branded) return [text];
  return [text, { canvas: [{ type: 'line', x1: 0, y1: 0, x2: ctx.width, y2: 0, lineWidth: 0.75, lineColor: colors.accent }], margin: [0, 0, 0, 6] }];
};

const list = (token: Tokens.List, ctx: Context): Content => {
  const inner = { ...ctx, width: ctx.width - 18 };
  const items = token.items.map((item): Content => {
    const blocks = item.tokens.flatMap((child) =>
      child.type === 'text' ? paragraph((child as Tokens.Text).tokens ?? [child], inner, { margin: [0, 0, 0, 2] }) : block(child, inner)
    );
    if (item.task) {
      const box: ContentText = { text: item.checked ? '[x] ' : '[ ] ', font: 'Courier', fontSize: 9 };
      const first = blocks[0];
      const runs = first && typeof first === 'object' && 'text' in first && Array.isArray(first.text) ? (first.text as Content[]) : null;
      if (runs) blocks[0] = { ...(first as ContentText), text: [box, ...runs] };
      else blocks.unshift(box);
    }
    return blocks.length === 1 ? blocks[0]! : { stack: blocks };
  });
  const margin: [number, number, number, number] = [0, 0, 0, 8];
  return token.ordered ? { ol: items, start: typeof token.start === 'number' ? token.start : 1, margin } : { ul: items, margin };
};

const quote = (token: Tokens.Blockquote, ctx: Context): Content => ({
  table: { widths: ['*'], body: [[{ stack: blocks(token.tokens, { ...ctx, width: ctx.width - 14 }), color: '#444444' }]] },
  layout: {
    hLineWidth: () => 0,
    vLineWidth: (i: number) => (i === 0 ? 2.5 : 0),
    vLineColor: () => (ctx.options.branded ? ctx.options.colors.accent : RULE),
    paddingLeft: () => 10,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0
  },
  margin: [0, 0, 0, 8]
});

const codeBlock = (token: Tokens.Code, ctx: Context): Content => {
  if (isChart(token)) {
    const chart = ctx.assets.charts.get(token.text);
    if (chart) return { ...imageBlock(chart, { ...ctx, width: Math.min(ctx.width, 450) }), unbreakable: true };
    return { text: 'Chart error: this chart block is not valid.', color: '#c0392b', margin: [0, 0, 0, 8] };
  }
  if (isDiagram(token)) {
    const diagram = ctx.assets.diagrams.get(token.text.trim());
    if (diagram) return imageBlock(diagram, ctx);
  }
  return {
    table: { widths: ['*'], body: [[{ text: token.text, font: 'Courier', fontSize: 8.5, preserveLeadingSpaces: true, lineHeight: 1.2 }]] },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: () => CODE_FILL,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 6,
      paddingBottom: () => 6
    },
    margin: [0, 0, 0, 8]
  };
};

const cellText = (cell: Tokens.TableCell): string => cell.text;

const table = (token: Tokens.Table, ctx: Context): Content => {
  const { colors, branded } = ctx.options;
  const keep = nowrapColumns([token.header.map(cellText), ...token.rows.map((row) => row.map(cellText))]);
  const widths = keep.map((short) => (short ? 'auto' : '*'));
  const cell = (c: Tokens.TableCell, header: boolean): TableCell => {
    const runs = inlines(c.tokens, header ? { bold: true } : {}, colors).flatMap((part) => (part.kind === 'text' ? [part.run] : []));
    return {
      text: runs.length ? runs : '',
      ...(c.align && { alignment: c.align }),
      ...(header && branded && { color: colors.primaryText }),
      ...(header && !branded && { color: '#555555' })
    };
  };
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      keepWithHeaderRows: 1,
      widths,
      body: [token.header.map((c) => cell(c, true)), ...token.rows.map((row) => row.map((c) => cell(c, false)))]
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => RULE,
      vLineColor: () => RULE,
      fillColor: (row: number) => (row === 0 ? (branded ? colors.primary : '#f4f4f4') : null),
      paddingLeft: () => 5,
      paddingRight: () => 5,
      paddingTop: () => 3,
      paddingBottom: () => 3
    },
    fontSize: 9.5,
    margin: [0, 2, 0, 10]
  };
};

/** Raw HTML on its own lines: a page break, or its text with the tags dropped. */
const htmlBlock = (token: Tokens.HTML): Content[] => {
  const html = token.text.trim();
  if (PAGE_BREAK.test(html)) return [pageBreak()];
  const text = decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '')).trim();
  return text ? [{ text, margin: [0, 0, 0, 8] }] : [];
};

/** A page break: what a horizontal rule (`---`) or a `<!-- pagebreak -->` line becomes. Nothing is drawn. */
const pageBreak = (): Content => ({ text: '', pageBreak: 'after' });

const isPageBreak = (c: Content | undefined): boolean =>
  !!c && typeof c === 'object' && 'pageBreak' in c && 'text' in c && c.text === '';

const block = (token: Token, ctx: Context): Content[] => {
  switch (token.type) {
    case 'heading':
      return heading(token as Tokens.Heading, ctx);
    case 'paragraph':
      return paragraph((token as Tokens.Paragraph).tokens, ctx);
    case 'text':
      return paragraph((token as Tokens.Text).tokens ?? [token], ctx);
    case 'list':
      return [list(token as Tokens.List, ctx)];
    case 'blockquote':
      return [quote(token as Tokens.Blockquote, ctx)];
    case 'code':
      return [codeBlock(token as Tokens.Code, ctx)];
    case 'table':
      return [table(token as Tokens.Table, ctx)];
    case 'hr':
      return [pageBreak()];
    case 'html':
      return htmlBlock(token as Tokens.HTML);
    default:
      return [];
  }
};

const blocks = (tokens: readonly Token[], ctx: Context): Content[] => tokens.flatMap((token) => block(token, ctx));

/**
 * The markdown as pdfmake content. A page break with nothing before it, right after another one,
 * or as the last block adds nothing, so a stray rule never leaves a blank page.
 */
export const markdownToPdf = (markdown: string, assets: PdfAssets, options: PdfMarkdownOptions): Content[] => {
  const content = blocks(lex(markdown), { assets, options, width: options.width });
  const kept = content.filter((c, i) => !isPageBreak(c) || (i > 0 && !isPageBreak(content[i - 1])));
  while (isPageBreak(kept.at(-1))) kept.pop();
  return kept;
};
