// Serves Excalidraw's fonts from the app itself. Excalidraw loads them from a CDN
// unless window.EXCALIDRAW_ASSET_PATH says otherwise, and the app makes no
// outside requests (its CSP allows fonts only from itself), so this plugin
// serves `node_modules/@excalidraw/excalidraw/dist/prod/fonts` at
// `/excalidraw/fonts/` in development and copies it into the client build,
// which the release binary embeds with the rest of the UI's static files.
//
// Xiaolai, the CJK font, is left out: it's 13 MB of the 14. Chinese, Japanese
// and Korean text in a drawing falls back to a system font.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

export const EXCALIDRAW_FONTS_URL = '/excalidraw/fonts/';
const SKIPPED = new Set(['Xiaolai']);

const fontsDir = (root: string): string => join(root, 'node_modules', '@excalidraw', 'excalidraw', 'dist', 'prod', 'fonts');

const listFonts = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return SKIPPED.has(entry.name) ? [] : listFonts(join(dir, entry.name));
    return entry.name.endsWith('.woff2') ? [join(dir, entry.name)] : [];
  });

export const excalidrawFonts = (): Plugin => {
  let root = process.cwd();
  let ssr = false;
  return {
    name: 'remry-excalidraw-fonts',
    configResolved(config) {
      root = config.root;
      ssr = Boolean(config.build.ssr);
    },
    configureServer(server) {
      const dir = fontsDir(root);
      server.middlewares.use(EXCALIDRAW_FONTS_URL, (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '').split('?')[0] ?? '').replace(/^\/+/, '');
        const path = join(dir, name);
        const top = name.split('/')[0] ?? '';
        if (!name.endsWith('.woff2') || relative(dir, path).startsWith('..') || SKIPPED.has(top)) return next();
        try {
          if (!statSync(path).isFile()) return next();
        } catch {
          return next();
        }
        res.setHeader('content-type', 'font/woff2');
        res.setHeader('cache-control', 'public, max-age=31536000, immutable');
        res.end(readFileSync(path));
      });
    },
    generateBundle() {
      if (ssr) return;
      const dir = fontsDir(root);
      for (const file of listFonts(dir)) {
        const name = relative(dir, file).split(sep).join('/');
        this.emitFile({ type: 'asset', fileName: `${EXCALIDRAW_FONTS_URL.slice(1)}${name}`, source: readFileSync(file) });
      }
    }
  };
};
