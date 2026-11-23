// Plans a markdown export of a page, project or doc and the parts of its tree the user picked
// (`ExportNode`, from `entity.exportTree`): which files the archive holds, their text, and the
// pictures to put in `images/`. Pure; `export-markdown.ts` draws the pictures and saves.
//
// Two formats:
// - `markdown`: portable markdown to read anywhere (GitHub, Obsidian, an editor). Charts,
//   mermaid diagrams and drawings become PNGs, a spreadsheet a table, links between exported
//   items relative links, other app links plain text, and Remry's hidden comments (table widths,
//   page breaks) are dropped. Each item starts with its title as a heading, and a page or
//   project ends with links to what's exported under it.
// - `remry`: the text as Remry stores it, to read back into Remry: front matter naming the
//   item (type, id, title, body type, parent, a project's status, a sync prompt), the body
//   untouched (chart and mermaid blocks, table widths, app links), a spreadsheet or drawing as
//   its JSON in a `remry-sheet` / `remry-drawing` fence.
//
// In both, an image stored in the notebook (`storage://…` or `/files/…`) is copied into
// `images/` and linked relatively, so the archive holds everything it shows; an outside image
// (`https://…`) stays a link. Layout: `<Title>.md` beside a `<Title>/` folder for what's under
// it, at any depth, and one `images/` folder at the top.

import { drawingBlockPageId } from '$shared/types/drawing-blocks';
import { flattenExportTree, type ExportNode } from '$shared/types/export-tree';
import { bodyMarkdown } from '$shared/utils/body';
import { parseEntityPath } from '$shared/utils/entity';

export const MARKDOWN_FORMATS = ['markdown', 'remry'] as const;
export type MarkdownFormat = (typeof MARKDOWN_FORMATS)[number];

/** Where a picture in the archive comes from. */
export type AssetSource =
  | { readonly kind: 'stored'; readonly key: string }
  | { readonly kind: 'chart'; readonly source: string }
  | { readonly kind: 'diagram'; readonly source: string }
  | { readonly kind: 'drawing'; readonly content: string };

export interface PlannedAsset {
  /** Stands in the files' text until the picture is drawn (`finishMarkdown`). */
  readonly token: string;
  /** From the archive's top, `images/…`. */
  readonly path: string;
  readonly source: AssetSource;
  readonly alt: string;
  /** An image's title as written (`"w=320"`), kept in a `remry` export. */
  readonly title: string | null;
  /** What the text says if it can't be drawn or copied: the block or link as written. */
  readonly fallback: string;
}

export interface PlannedFile {
  readonly path: string;
  /** With asset tokens; `finishMarkdown` gives the final text. */
  readonly markdown: string;
}

export interface MarkdownExportPlan {
  readonly files: readonly PlannedFile[];
  readonly assets: readonly PlannedAsset[];
  /** The download's name: `<Title>.md` for one file and no pictures, else `<Title>.zip`. */
  readonly fileName: string;
}

const IMAGES = 'images';
const FENCE = /^\s*(`{3,}|~{3,})\s*([^\s`]*)/;
const MERMAID_START = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline|journey)\b/;
const HIDDEN_LINE = /^\s*\\?<!--\s*(page-?break|table-cols:[^>]*)\s*-->\s*$/i;
const IMAGE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)/g;
const LINK = /(?<!!)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const STORED = /^(?:storage:\/\/|\/files\/)(.+)$/;

/** A file or folder name from a title: no characters file systems refuse, never empty or hidden. */
export const safeFileName = (title: string): string => {
  // eslint-disable-next-line no-control-regex -- control characters are what it removes
  const cleaned = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').replace(/[. ]+$/, '').slice(0, 100);
  return cleaned || 'Untitled';
};

/** A link from one archive file to another path in it, each segment URL-encoded. */
export const relativePath = (fromFile: string, to: string): string => {
  const from = fromFile.split('/').slice(0, -1);
  const target = to.split('/');
  let common = 0;
  while (common < from.length && common < target.length - 1 && from[common] === target[common]) common++;
  return [...from.slice(common).map(() => '..'), ...target.slice(common)].map((s) => (s === '..' ? s : encodeURIComponent(s))).join('/');
};

/** Picks names unique (ignoring case) within each folder. */
const namer = (): ((dir: string, name: string) => string) => {
  const used = new Map<string, Set<string>>([['', new Set([IMAGES])]]);
  return (dir, name) => {
    const names = used.get(dir) ?? new Set<string>();
    used.set(dir, names);
    let candidate = name;
    for (let n = 2; names.has(candidate.toLowerCase()); n++) candidate = `${name} (${n})`;
    names.add(candidate.toLowerCase());
    return candidate;
  };
};

interface Placed {
  readonly node: ExportNode;
  readonly file: string;
  readonly parent: Placed | null;
  readonly children: Placed[];
}

/** The exported nodes, each at its path: a node goes in when it and every node above it are selected. */
const place = (root: ExportNode, selected: ReadonlySet<string>): Placed => {
  const name = namer();
  const visit = (node: ExportNode, dir: string, parent: Placed | null): Placed => {
    const stem = name(dir, safeFileName(node.title));
    const placed: Placed = { node, file: `${dir}${stem}.md`, parent, children: [] };
    for (const child of node.children) {
      if (selected.has(child.id)) placed.children.push(visit(child, `${dir}${stem}/`, placed));
    }
    return placed;
  };
  return visit(root, '', null);
};

const allPlaced = (root: Placed): readonly Placed[] => [root, ...root.children.flatMap(allPlaced)];

/** The longest run of `char` in the text, to fence it with a longer one. */
const fenceFor = (text: string, char: '`' | '~'): string => {
  const runs = text.match(char === '`' ? /`+/g : /~+/g) ?? [];
  return char.repeat(Math.max(3, ...runs.map((r) => r.length + 1)));
};

const yamlString = (value: string): string => JSON.stringify(value);

interface Assets {
  readonly list: PlannedAsset[];
  readonly stored: Map<string, string>;
  readonly name: (dir: string, name: string) => string;
}

const addAsset = (assets: Assets, path: string, source: AssetSource, alt: string, title: string | null, fallback: string): string => {
  const token = `@@remry-asset-${assets.list.length}@@`;
  assets.list.push({ token, path, source, alt, title, fallback });
  return token;
};

/** The name a stored image keeps in `images/`, once per key. */
const storedPath = (assets: Assets, key: string): string => {
  const known = assets.stored.get(key);
  if (known) return known;
  const base = key.split('/').pop() || 'image.png';
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  const named = assets.name(`${IMAGES}/`, stem);
  const path = `${IMAGES}/${named}${ext}`;
  assets.stored.set(key, path);
  return path;
};

/** A picture this file makes (a chart, a diagram, a drawing): `<stem>-chart-2.png`. */
const madePath = (assets: Assets, file: string, what: string): string => {
  const stem = file.split('/').pop()!.replace(/\.md$/, '');
  return `${IMAGES}/${assets.name(`${IMAGES}/`, `${stem}-${what}`)}.png`;
};

interface Context {
  readonly format: MarkdownFormat;
  readonly file: string;
  readonly assets: Assets;
  /** Exported items by id, to their files. */
  readonly files: ReadonlyMap<string, string>;
}

/** Points images stored in the notebook at their copies; in `markdown`, app links at exported files. */
const rewriteLine = (line: string, ctx: Context): string => {
  const withImages = line.replace(IMAGE, (whole, alt: string, href: string, title: string | undefined) => {
    const stored = STORED.exec(href);
    if (!stored) return whole;
    const fallback = ctx.format === 'markdown' ? `*Image missing: ${alt || 'image'}*` : whole;
    return addAsset(ctx.assets, storedPath(ctx.assets, stored[1]!.replace(/[?#].*$/, '')), { kind: 'stored', key: stored[1]!.replace(/[?#].*$/, '') }, alt, title ?? null, fallback);
  });
  if (ctx.format === 'remry') return withImages;
  return withImages.replace(LINK, (whole, text: string, href: string) => {
    const ref = parseEntityPath(href);
    if (!ref) return whole;
    const docId = /[?&]doc=([^&#]+)/.exec(href)?.[1];
    const target = ctx.files.get(docId ? decodeURIComponent(docId) : ref.entityId);
    return target ? `[${text}](${relativePath(ctx.file, target)})` : text;
  });
};

/** A doc body in the chosen format, line by line, minding fenced code. */
const transformMarkdown = (content: string, ctx: Context): string => {
  const out: string[] = [];
  let fence: { readonly marker: string; readonly lang: string; readonly lines: string[]; readonly open: string } | null = null;
  let charts = 0;
  let diagrams = 0;

  for (const line of content.split('\n')) {
    const open = FENCE.exec(line);
    if (fence) {
      const marker = open?.[1];
      if (marker && marker[0] === fence.marker[0] && marker.length >= fence.marker.length && line.trim() === marker) {
        const body = fence.lines.join('\n');
        const written = [fence.open, ...fence.lines, line].join('\n');
        const isChart = fence.lang === 'chart';
        const isDiagram = fence.lang === 'mermaid' || (fence.lang === '' && MERMAID_START.test(body.trim()));
        const drawingPage = fence.lang === 'drawing' ? drawingBlockPageId(body) : null;
        if (ctx.format === 'markdown' && isChart) {
          out.push(addAsset(ctx.assets, madePath(ctx.assets, ctx.file, `chart-${++charts}`), { kind: 'chart', source: body }, 'Chart', null, written));
        } else if (ctx.format === 'markdown' && isDiagram) {
          out.push(addAsset(ctx.assets, madePath(ctx.assets, ctx.file, `diagram-${++diagrams}`), { kind: 'diagram', source: body.trim() }, 'Diagram', null, written));
        } else if (ctx.format === 'markdown' && drawingPage) {
          out.push(rewriteLine(`[Drawing](/app/wiki/${drawingPage})`, ctx));
        } else {
          out.push(written);
        }
        fence = null;
      } else {
        fence.lines.push(line);
      }
      continue;
    }
    if (open) {
      fence = { marker: open[1]!, lang: open[2]!.trim(), lines: [], open: line };
      continue;
    }
    if (ctx.format === 'markdown' && HIDDEN_LINE.test(line)) continue;
    out.push(rewriteLine(line, ctx));
  }
  // An unclosed fence runs to the end, as markdown reads it.
  if (fence) out.push(fence.open, ...fence.lines);
  return out.join('\n');
};

const startsWithTitle = (text: string): boolean => /^\s*#[ \t]/.test(text);

/** Links to what's exported under a page or project, for `markdown`. */
const childList = (placed: Placed, heading: string, kinds: readonly string[]): string => {
  const items = placed.children.filter((c) => kinds.includes(c.node.kind));
  if (items.length === 0) return '';
  return `\n\n## ${heading}\n\n${items.map((c) => `- [${c.node.title.replace(/[[\]]/g, '')}](${relativePath(placed.file, c.file)})`).join('\n')}`;
};

const frontMatter = (placed: Placed): string => {
  const { node } = placed;
  const lines = [
    '---',
    'remry: 1',
    `type: ${node.kind.toLowerCase()}`,
    `id: ${yamlString(node.id)}`,
    `title: ${yamlString(node.title)}`,
    ...(node.kind === 'PROJECT' ? [] : [`bodyType: ${node.bodyType}`]),
    ...(placed.parent ? [`parent: ${yamlString(placed.parent.node.id)}`] : []),
    ...(node.status ? [`status: ${yamlString(node.status)}`] : []),
    ...(node.prompt ? [`prompt: ${yamlString(node.prompt)}`] : []),
    '---',
    ''
  ];
  return lines.join('\n');
};

const fileText = (placed: Placed, ctx: Context): string => {
  const { node } = placed;
  if (ctx.format === 'remry') {
    const body = node.bodyType === 'doc' ? transformMarkdown(node.content, ctx) : (() => {
      const fence = fenceFor(node.content, '~');
      return `${fence}remry-${node.bodyType}\n${node.content}\n${fence}`;
    })();
    return `${frontMatter(placed)}${body}\n`;
  }

  const heading = `# ${node.title}\n\n`;
  if (node.kind === 'PROJECT') {
    const status = node.status ? `**Status:** ${node.status}\n\n` : '';
    const brief = node.content.trim() ? `${transformMarkdown(node.content, ctx).trim()}` : '';
    const lists = childList(placed, 'Docs', ['DOC']) + childList(placed, 'Projects', ['PROJECT']);
    return `${heading}${status}${brief}${lists}`.trim() + '\n';
  }
  let body: string;
  if (node.bodyType === 'drawing') {
    body = addAsset(ctx.assets, madePath(ctx.assets, ctx.file, 'drawing'), { kind: 'drawing', content: node.content }, node.title.replace(/[[\]]/g, ''), null, `*${bodyMarkdown('drawing', node.content).trim() || 'Nothing drawn yet.'}*`);
  } else {
    body = transformMarkdown(bodyMarkdown(node.bodyType, node.content), ctx).trim();
  }
  const titled = startsWithTitle(body) ? body : `${heading}${body}`;
  return `${titled}${childList(placed, 'Pages', ['PAGE'])}`.trim() + '\n';
};

/**
 * The files of an export. `selected` holds the ids to include below the root (the root
 * always goes in); a node whose parent is left out is left out with it.
 */
export const planMarkdownExport = (root: ExportNode, selected: ReadonlySet<string>, format: MarkdownFormat): MarkdownExportPlan => {
  const top = place(root, selected);
  const placed = allPlaced(top);
  const files = new Map(placed.map((p) => [p.node.id, p.file]));
  const assets: Assets = { list: [], stored: new Map(), name: namer() };
  const planned = placed.map((p) => ({ path: p.file, markdown: fileText(p, { format, file: p.file, assets, files }) }));
  const single = planned.length === 1 && assets.list.length === 0;
  const stem = safeFileName(root.title);
  return { files: planned, assets: assets.list, fileName: single ? `${stem}.md` : `${stem}.zip` };
};

/** A file's text once its pictures are in: each drawn one linked relatively, the others as their fallback. */
export const finishMarkdown = (file: PlannedFile, assets: readonly PlannedAsset[], drawn: ReadonlySet<string>, format: MarkdownFormat): string =>
  assets.reduce((text, asset) => {
    if (!text.includes(asset.token)) return text;
    const link = drawn.has(asset.token)
      ? `![${asset.alt}](${relativePath(file.path, asset.path)}${format === 'remry' && asset.title ? ` "${asset.title}"` : ''})`
      : asset.fallback;
    return text.split(asset.token).join(link);
  }, file.markdown);

/** Every id below the root, for "select all". */
export const allDescendantIds = (root: ExportNode): readonly string[] => flattenExportTree(root).slice(1).map((n) => n.id);
