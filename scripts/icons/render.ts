// Renders every app icon PNG (and favicon.ico) from the two SVG sources in static/icons.
// Run with `bun run icons` after editing icon.svg or icon-maskable.svg.
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const staticDir = join(import.meta.dir, '../../static');

interface Output {
  readonly path: string;
  readonly size: number;
  readonly source: string;
}

/** The Dock drawing without its margin, shadow or the text lines on its notes: tiny favicons can't spare the pixels. */
export const toFaviconSvg = (svg: string): string =>
  svg
    .replace('viewBox="0 0 512 512"', 'viewBox="50 50 412 412"')
    .replace(' filter="url(#shadow)"', '')
    .replace(/\s*<!--[^>]*-->\s*<g id="note-lines"[\s\S]*?<\/g>/, '');

export const renderPng = (svg: string, size: number): Buffer =>
  Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());

/** An ICO file that embeds PNGs directly (supported by every browser since Vista-era Windows). */
export const buildIco = (pngs: readonly { readonly size: number; readonly png: Buffer }[]): Buffer => {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.png)]);
};

const main = (): void => {
  const dock = readFileSync(join(staticDir, 'icons/icon.svg'), 'utf8');
  const maskable = readFileSync(join(staticDir, 'icons/icon-maskable.svg'), 'utf8');
  const favicon = toFaviconSvg(dock);

  const outputs: readonly Output[] = [
    { path: 'icons/icon-192.png', size: 192, source: dock },
    { path: 'icons/icon-512.png', size: 512, source: dock },
    { path: 'apple-touch-icon.png', size: 180, source: dock },
    { path: 'icons/icon-maskable-512.png', size: 512, source: maskable },
    { path: 'favicon-32x32.png', size: 32, source: favicon },
    { path: 'favicon-16x16.png', size: 16, source: favicon }
  ];
  for (const { path, size, source } of outputs) {
    writeFileSync(join(staticDir, path), renderPng(source, size));
    console.log(`wrote static/${path}`);
  }

  const ico = buildIco([16, 32, 48].map((size) => ({ size, png: renderPng(favicon, size) })));
  writeFileSync(join(staticDir, 'favicon.ico'), ico);
  console.log('wrote static/favicon.ico');
};

if (import.meta.main) main();
