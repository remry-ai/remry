import { describe, it, expect } from 'vitest';
import { collectPdfAssets, markdownToPdf, PLAIN_COLORS, type PdfAssets } from '../pdf-markdown';
import { buildPdfDocument } from '../pdf-document';

const none: PdfAssets = { images: new Map(), charts: new Map(), diagrams: new Map() };
const options = { width: 500, height: 700, colors: PLAIN_COLORS, branded: false };
const convert = (markdown: string, assets: PdfAssets = none): unknown[] => markdownToPdf(markdown, assets, options);
const json = (markdown: string, assets?: PdfAssets): string => JSON.stringify(convert(markdown, assets));

describe('markdownToPdf', () => {
  it('turns headings, paragraphs and inline styles into text runs', () => {
    const [heading, paragraph] = convert('## Plan\n\nSome **bold**, *italic*, ~~gone~~ and `code`.') as Record<string, unknown>[];
    expect(heading).toMatchObject({ bold: true, fontSize: 16, headlineLevel: 2 });
    expect(paragraph!.text).toEqual([
      { text: 'Some ' },
      { text: 'bold', bold: true },
      { text: ', ' },
      { text: 'italic', italics: true },
      { text: ', ' },
      { text: 'gone', decoration: 'lineThrough' },
      { text: ' and ' },
      expect.objectContaining({ text: 'code', font: 'Courier' }),
      { text: '.' }
    ]);
  });

  it('keeps links a PDF reader can open, and drops the app’s own', () => {
    expect(json('[site](https://example.com)')).toContain('"link":"https://example.com"');
    expect(json('[page](/app/wiki/1)')).not.toContain('"link"');
  });

  it('starts a new page at a page break line, outside code blocks only', () => {
    const content = convert('One\n\n<!-- pagebreak -->\n\nTwo\n\n```\n<!-- pagebreak -->\n```');
    expect(content.filter((c) => (c as { pageBreak?: string }).pageBreak === 'after')).toHaveLength(1);
    expect(json('One\n\n\\<!-- pagebreak -->\n\nTwo')).toContain('"pageBreak":"after"');
    expect(json('One\n\n<!-- page-break -->')).not.toContain('pageBreak');
  });

  it('starts a new page at a horizontal rule, drawing no line', () => {
    const content = convert('One\n\n---\n\nTwo\n\n***\n\nThree');
    expect(content.filter((c) => (c as { pageBreak?: string }).pageBreak === 'after')).toHaveLength(2);
    expect(json('One\n\n---\n\nTwo')).not.toContain('canvas');
  });

  it('leaves no blank page for a rule at the start or end, or two breaks in a row', () => {
    const breaks = (md: string): number =>
      convert(md).filter((c) => (c as { pageBreak?: string }).pageBreak === 'after').length;
    expect(breaks('---\n\nOne\n\n---')).toBe(0);
    expect(breaks('One\n\n---\n\n<!-- pagebreak -->\n\n---\n\nTwo')).toBe(1);
  });

  it('makes a table with a repeated header row that never splits a row', () => {
    const [table] = convert('| Date | Note |\n|---|---|\n| 2027-03-01 | a note much longer than twenty-four characters |') as { table: Record<string, unknown> }[];
    expect(table!.table).toMatchObject({ headerRows: 1, dontBreakRows: true, widths: ['auto', '*'] });
    expect(convert('| A | B |\n|---|---|\n| 1 | 2 |')[0]).toMatchObject({ table: { widths: ['*', '*'] } });
  });

  it('turns lists, nested lists and tasks into ul and ol', () => {
    const [ul, ol] = convert('- one\n  - inner\n- [x] done\n\n3. three\n4. four') as Record<string, unknown>[];
    expect(JSON.stringify(ul)).toContain('"ul":[');
    expect(JSON.stringify(ul)).toContain('inner');
    expect(JSON.stringify(ul)).toContain('[x] ');
    // The box sits on the task's own line.
    expect(JSON.stringify(ul)).toMatch(/"text":\[\{"text":"\[x\] ","font":"Courier","fontSize":9\},\{"text":"done"\}\]/);
    expect(ol).toMatchObject({ start: 3 });
  });

  it('places drawn images, charts and diagrams, and names an image it could not load', () => {
    const image = { dataUrl: 'data:image/png;base64,AA', width: 2000, height: 1000 };
    const assets: PdfAssets = {
      images: new Map([['storage://a.png', image]]),
      charts: new Map([['type: bar\nlabels: [a]\nvalues: [1]', image]]),
      diagrams: new Map([['graph TD; A-->B', image]])
    };
    const content = convert('Text ![a](storage://a.png "w=200") more\n\n![lost](storage://b.png)\n\n```chart\ntype: bar\nlabels: [a]\nvalues: [1]\n```\n\n```mermaid\ngraph TD; A-->B\n```', assets);
    const out = JSON.stringify(content);
    // Split around the image, which is the width its title asks for, in points.
    expect(content.slice(0, 3)).toMatchObject([{ text: [{ text: 'Text ' }] }, { width: 150 }, { text: [{ text: ' more' }] }]);
    expect(out).toContain('[Image: lost]');
    // The chart and diagram are drawn, no wider than the page.
    expect(content.filter((c) => (c as { image?: string }).image === image.dataUrl)).toHaveLength(3);
    expect(Math.max(...content.map((c) => (c as { width?: number }).width ?? 0))).toBeLessThanOrEqual(500);
    // A tall picture is narrowed until it fits down a page.
    const tall = { dataUrl: 'data:image/png;base64,AA', width: 400, height: 4000 };
    expect(convert('![t](t.png)', { ...none, images: new Map([['t.png', tall]]) })[0]).toMatchObject({ width: 63 });
  });

  it('shows a code block in a monospace box, keeping its indentation', () => {
    expect(convert('```js\n  const a = 1;\n```')[0]).toMatchObject({
      table: { body: [[{ text: '  const a = 1;', font: 'Courier', preserveLeadingSpaces: true }]] }
    });
  });

  it('keeps line breaks and drops other raw HTML tags', () => {
    expect(json('one<br>two')).toContain('"text":"\\n"');
    expect(json('<div>Hello <b>there</b></div>')).toContain('Hello there');
  });
});

describe('collectPdfAssets', () => {
  it('lists each image, chart and diagram once, in lists and tables too', () => {
    expect(collectPdfAssets('![a](x.png)\n\n- ![b](y.png)\n\n| c |\n|---|\n| ![c](x.png) |\n\n```chart\nA\n```\n\n```\nflowchart LR\n```')).toEqual({
      images: ['x.png', 'y.png'],
      charts: ['A'],
      diagrams: ['flowchart LR']
    });
  });
});

describe('buildPdfDocument', () => {
  const base = { title: 'Q3 plan', markdown: 'Body', assets: none, logo: null };

  it('prints the title unless the body opens with its own, and numbers every page', () => {
    const doc = buildPdfDocument({ ...base, branding: null, letterhead: false, showTitle: true });
    expect(doc.pageSize).toBe('A4');
    expect(doc.content).toEqual(expect.arrayContaining([expect.objectContaining({ text: 'Q3 plan', fontSize: 22 })]));
    expect(JSON.stringify((doc.footer as (p: number, n: number) => unknown)(2, 5))).toContain('2 / 5');
    const own = buildPdfDocument({ ...base, branding: null, letterhead: false, showTitle: false });
    expect(JSON.stringify(own.content)).not.toContain('Q3 plan');
  });

  it('opens with the letterhead in the brand colour, and puts the logo atop later pages', () => {
    const logo = { dataUrl: 'data:image/png;base64,AA', width: 400, height: 100 };
    const branding = { name: 'Acme', primaryColor: '#123456', primaryFontColor: '#ffffff', accentColor: '#abcdef' };
    const doc = buildPdfDocument({ ...base, branding, letterhead: true, logo, showTitle: false });
    const content = doc.content as unknown as Record<string, unknown>[];
    expect(content[0]).toMatchObject({ image: logo.dataUrl, width: 104, height: 26 });
    expect(content[2]).toMatchObject({ text: 'Q3 plan', color: '#123456' });
    const header = doc.header as (page: number) => unknown;
    expect(header(1)).toBeNull();
    expect(header(2)).toMatchObject({ image: logo.dataUrl });
  });

  it('keeps a heading off the bottom of a page', () => {
    const doc = buildPdfDocument({ ...base, branding: null, letterhead: false, showTitle: true });
    const breakBefore = doc.pageBreakBefore as (node: unknown, queries: unknown) => boolean;
    const queries = (following: number) => ({ getFollowingNodesOnPage: () => Array(following), getNodesOnNextPage: () => [], getPreviousNodesOnPage: () => [] });
    expect(breakBefore({ headlineLevel: 2 }, queries(0))).toBe(true);
    expect(breakBefore({ headlineLevel: 2 }, queries(3))).toBe(false);
    expect(breakBefore({}, queries(0))).toBe(false);
  });
});
