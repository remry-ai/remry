// Plans a markdown import (pure): which pages, projects and docs the files make, in what
// tree, and how their text's images and links are rewritten once they exist.
//
// - A file with Remry front matter (`remry: 1`, from Remry markdown export) says its type,
//   id, title, body type, parent and a project's status; a `remry-sheet` / `remry-drawing`
//   fence holds a spreadsheet's or drawing's JSON.
// - Any other markdown file is a page titled by its front matter's `title` or its file name
//   (a first `# Title` line that repeats it is dropped). Its parent is the file beside its
//   folder: `A/B.md` goes under `A.md`; a folder with no such file is passed through.
// - Images are linked relatively (`images/x.png`, `../images/x.png`); each is stored on the
//   item that shows it. One missing from the import becomes an "Image lost" note.
// - Links to items in the import, as app paths (`/app/wiki/<id>`, `?doc=<id>`) or as relative
//   `.md` links, are pointed at the new items.

import type { BodyType } from '$shared/types/body-types';
import type { ImportedKind } from '$shared/types/import';
import { parseEntityPath } from '$shared/utils/entity';

export interface ImportFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface PlannedItem {
  /** The Remry id it was exported with, or `file:<path>`. */
  readonly key: string;
  /** The id from its front matter, when it came from Remry. */
  readonly remryId: string | null;
  readonly kind: ImportedKind;
  readonly title: string;
  readonly bodyType: BodyType;
  /** A project's status, as exported. */
  readonly status: string | null;
  /** Markdown, or a sheet's or drawing's JSON; a project's brief. */
  readonly body: string;
  readonly file: string;
  /** The planned item it goes under, if any. */
  readonly parentKey: string | null;
}

export interface ImportPlan {
  /** Parents before their children. */
  readonly items: readonly PlannedItem[];
  /** Image files by path. */
  readonly images: ReadonlyMap<string, Uint8Array>;
  /** Files that aren't markdown or an image, left out. */
  readonly ignored: readonly string[];
}

const MARKDOWN = /\.(md|markdown)$/i;
const IMAGE_FILE = /\.(png|jpe?g|gif|webp)$/i;
const FENCE = /^\s*(`{3,}|~{3,})\s*([^\s`]*)/;
const IMAGE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)/g;
const LINK = /(?<!!)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?((?:\s+"[^"]*")?)\s*\)/g;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** A path inside the import: forward slashes, no `.`, no leading slash; null when it climbs out or is hidden. */
export const normalizeImportPath = (path: string): string | null => {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  if (parts.length === 0) return null;
  // Finder's and the system's own files.
  if (parts[0] === '__MACOSX' || parts.some((p) => p.startsWith('.'))) return null;
  return parts.join('/');
};

const dirOf = (path: string): string => path.split('/').slice(0, -1).join('/');

/** A relative link from a file, as a path inside the import; null for an address, an anchor or one that climbs out. */
export const resolveImportLink = (fromFile: string, href: string): string | null => {
  if (SCHEME.test(href) || href.startsWith('/') || href.startsWith('#')) return null;
  const bare = href.replace(/[?#].*$/, '');
  if (!bare) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    decoded = bare;
  }
  const dir = dirOf(fromFile);
  return normalizeImportPath(dir ? `${dir}/${decoded}` : decoded);
};

// ----- Front matter -----

export interface FrontMatter {
  readonly fields: Readonly<Record<string, string>>;
  readonly body: string;
}

/** `key: value` lines between `---` lines at the top; a quoted value is read as JSON. */
export const readFrontMatter = (text: string): FrontMatter => {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return { fields: {}, body: text.replace(/^\uFEFF/, '') };
  const fields: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const pair = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(line);
    if (!pair) continue;
    const raw = pair[2]!.trim();
    let value = raw;
    if (raw.startsWith('"')) {
      try {
        value = String(JSON.parse(raw));
      } catch {
        value = raw.slice(1, raw.endsWith('"') ? -1 : undefined);
      }
    } else if (raw.startsWith("'") && raw.endsWith("'") && raw.length > 1) {
      value = raw.slice(1, -1).replace(/''/g, "'");
    }
    fields[pair[1]!] = value;
  }
  return { fields, body: text.slice(match[0].length) };
};

/** The JSON in a `remry-sheet` or `remry-drawing` fence, or the body as it is. */
const fencedBody = (body: string, bodyType: BodyType): string => {
  const match = new RegExp(`^\\s*(~{3,}|\`{3,})remry-${bodyType}[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n\\1[ \\t]*\\s*$`).exec(body);
  return match ? match[2]! : body.trim();
};

const asBody = (value: string | undefined): BodyType => (value === 'sheet' || value === 'drawing' ? value : 'doc');

const KINDS: Readonly<Record<string, ImportedKind>> = { page: 'PAGE', doc: 'DOC', project: 'PROJECT' };

const stem = (path: string): string => (path.split('/').pop() ?? path).replace(MARKDOWN, '');

/** Drops a first-line `# Title` that repeats the title. */
const withoutTitleLine = (body: string, title: string): string => {
  const match = /^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n|$)/.exec(body);
  return match && match[1]!.trim().toLowerCase() === title.trim().toLowerCase() ? body.slice(match[0].length).replace(/^\s*\n/, '') : body;
};

interface Parsed {
  readonly key: string;
  readonly remryId: string | null;
  readonly kind: ImportedKind;
  readonly title: string;
  readonly bodyType: BodyType;
  readonly status: string | null;
  readonly body: string;
  readonly file: string;
  readonly parentId: string | null;
}

const parseFile = (path: string, text: string): Parsed => {
  const { fields, body } = readFrontMatter(text);
  const kind = fields['remry'] ? KINDS[fields['type'] ?? ''] : undefined;
  if (kind) {
    const bodyType = kind === 'PROJECT' ? 'doc' : asBody(fields['bodyType']);
    const remryId = fields['id']?.trim() || null;
    return {
      key: remryId ?? `file:${path}`,
      remryId,
      kind,
      title: fields['title']?.trim() || stem(path),
      bodyType,
      status: fields['status']?.trim() || null,
      body: bodyType === 'doc' ? body.replace(/\s+$/, '') : fencedBody(body, bodyType),
      file: path,
      parentId: fields['parent']?.trim() || null
    };
  }
  const title = fields['title']?.trim() || stem(path);
  return { key: `file:${path}`, remryId: null, kind: 'PAGE', title, bodyType: 'doc', status: null, body: withoutTitleLine(body, title).replace(/\s+$/, ''), file: path, parentId: null };
};

/** The pages, projects and docs the files make, parents first, and the images they can show. */
export const planImport = (files: readonly ImportFile[]): ImportPlan => {
  const decoder = new TextDecoder();
  const images = new Map<string, Uint8Array>();
  const parsed: Parsed[] = [];
  const ignored: string[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const path = normalizeImportPath(file.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    if (MARKDOWN.test(path)) parsed.push(parseFile(path, decoder.decode(file.bytes)));
    else if (IMAGE_FILE.test(path)) images.set(path, file.bytes);
    else ignored.push(path);
  }

  // The same id twice (two exports of one item): the first wins, the others become pages of their own.
  const keys = new Set<string>();
  const unique = parsed.map((p) => {
    if (!keys.has(p.key)) {
      keys.add(p.key);
      return p;
    }
    const key = `file:${p.file}`;
    keys.add(key);
    return { ...p, key, remryId: null };
  });

  const byFile = new Map(unique.map((p) => [p.file, p]));
  const byId = new Map(unique.flatMap((p) => (p.remryId ? [[p.remryId, p] as const] : [])));

  const parentOf = (p: Parsed): string | null => {
    if (p.parentId) {
      const parent = byId.get(p.parentId);
      if (parent && parent.key !== p.key) return parent.key;
    }
    // The file beside the nearest folder above it: A/B/c.md → A/B.md, then A.md.
    let dir = dirOf(p.file);
    while (dir) {
      const beside = byFile.get(`${dir}.md`) ?? byFile.get(`${dir}.markdown`);
      if (beside && beside.key !== p.key) return beside.key;
      dir = dirOf(dir);
    }
    return null;
  };

  const parents = new Map(unique.map((p) => [p.key, parentOf(p)]));
  // A loop (two files naming each other as parent) is broken at the first one met.
  const ordered: PlannedItem[] = [];
  const placed = new Set<string>();
  const visiting = new Set<string>();
  const byKey = new Map(unique.map((p) => [p.key, p]));
  const place = (p: Parsed): void => {
    if (placed.has(p.key)) return;
    visiting.add(p.key);
    let parentKey = parents.get(p.key) ?? null;
    if (parentKey && visiting.has(parentKey)) parentKey = null;
    if (parentKey) place(byKey.get(parentKey)!);
    visiting.delete(p.key);
    placed.add(p.key);
    ordered.push({ key: p.key, remryId: p.remryId, kind: p.kind, title: p.title, bodyType: p.bodyType, status: p.status, body: p.body, file: p.file, parentKey });
  };
  for (const p of [...unique].sort((a, b) => a.file.localeCompare(b.file))) place(p);

  return { items: ordered, images, ignored };
};

// ----- Rewriting the text -----

/** Runs `rewrite` on each line outside fenced code. */
const outsideFences = (text: string, rewrite: (line: string) => string): string => {
  let fence: string | null = null;
  return text
    .split('\n')
    .map((line) => {
      const open = FENCE.exec(line)?.[1];
      if (fence) {
        if (open && open[0] === fence[0] && open.length >= fence.length && line.trim() === open) fence = null;
        return line;
      }
      if (open) {
        fence = open;
        return line;
      }
      return rewrite(line);
    })
    .join('\n');
};

/** The images a body shows from inside the import, by path, each once. */
export const importImagesIn = (body: string, file: string, images: ReadonlyMap<string, Uint8Array>): readonly string[] => {
  const found = new Set<string>();
  outsideFences(body, (line) => {
    for (const match of line.matchAll(IMAGE)) {
      const path = resolveImportLink(file, match[2]!);
      if (path && images.has(path)) found.add(path);
    }
    return line;
  });
  return [...found];
};

export interface RewriteContext {
  /** The app path of a planned item, by its key. */
  readonly pathOf: (key: string) => string | null;
  /** The planned item a Remry id (a page's, project's or doc's) names. */
  readonly keyForId: (id: string) => string | null;
  /** The planned item a markdown file in the import is. */
  readonly keyForFile: (path: string) => string | null;
  /** The storage key an imported image was stored at. */
  readonly storedImage: (path: string) => string | null;
}

const plain = (text: string): string => text.replace(/[*_`[\]]/g, '');

/**
 * A body with its images pointed at their stored copies (or an "Image lost" note) and its
 * links to imported items at their new app paths. Returns the images it couldn't find.
 */
export const rewriteImportedText = (
  body: string,
  file: string,
  ctx: RewriteContext
): { readonly text: string; readonly missing: readonly string[] } => {
  const missing: string[] = [];
  const text = outsideFences(body, (line) =>
    line
      .replace(IMAGE, (whole, alt: string, href: string, title: string | undefined) => {
        const path = resolveImportLink(file, href);
        if (!path) return whole;
        const key = ctx.storedImage(path);
        if (key) return `![${alt}](storage://${key}${title ? ` "${title}"` : ''})`;
        missing.push(path);
        const name = plain(alt.trim() || (path.split('/').pop() ?? ''));
        return `*Image lost: ${name}. Paste it again.*`;
      })
      .replace(LINK, (whole, label: string, href: string, title: string) => {
        const ref = parseEntityPath(href);
        if (ref) {
          const docId = /[?&]doc=([^&#]+)/.exec(href)?.[1];
          const key = (docId && ctx.keyForId(decodeURIComponent(docId))) || ctx.keyForId(ref.entityId);
          const path = key ? ctx.pathOf(key) : null;
          return path ? `[${label}](${path}${title})` : whole;
        }
        const target = resolveImportLink(file, href);
        const key = target && MARKDOWN.test(target) ? ctx.keyForFile(target) : null;
        const path = key ? ctx.pathOf(key) : null;
        return path ? `[${label}](${path}${title})` : whole;
      })
  );
  return { text, missing };
};
