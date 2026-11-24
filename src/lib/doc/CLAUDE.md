# Docs, export pages, PDF and markdown export — `src/lib/doc/`

The components here (`DocTitle`, `DocBar`, `DocBodyCard`, `BodyView`, `PrintView`, `MarkdownExportPanel`…) are listed in `src/lib/CLAUDE.md`. This is how a doc, wiki page or project is exported.

## Export

A doc's "Export" opens `/app/docs/<id>/print`, a wiki page's `/app/wiki/<id>/print`; both render `PrintView`. Its toolbar's first select is the format (`?format=`, `EXPORT_FORMATS` in `print-options.ts`): **PDF** (the default, below), **Markdown** or **Remry markdown** (§ Markdown export). For a PDF, the toolbar picks the branding (the default, another, or none; locked without Pro) and turns the branded header on (off by default); the choices live in the URL (`print-options.ts`).

- **Download PDF** builds the file in the browser with pdfmake (loaded only then), from the markdown, so the text is real and pages break between lines and table rows, a table repeats its header, a heading stays with what follows, and every page is numbered. `pdf-markdown.ts` (`markdownToPdf`) turns markdown into pdfmake content and `pdf-document.ts` lays out pages, letterhead and footer, both pure; `export-pdf.ts` draws images, charts, mermaid diagrams and drawings as PNGs and saves through a plain download link (pdfmake's own save opens a window, which the desktop app drops).
- **Type** follows the screen (`_base.scss`, in points): the app's font from `src/lib/ui/app-font.ts` at its doc size × 0.75, the same line spacing, a bold h1 then lighter, smaller headings (`HEADINGS`). Code uses the same font, so characters it lacks (emoji, CJK) don't print; raw HTML keeps only its text and `<br>`s.
- **Print…** is the browser's dialog, the fallback (`print.ts`; in the desktop app, see `desktop/CLAUDE.md`).

## Page breaks and tables

- A horizontal rule (`---`, `***`) starts a new page in both and isn't drawn; on screen it's a faint grey line, never in brand colours. One at the start or end, or right after another break, adds no blank page. A line of just `<!-- pagebreak -->` outside code does the same (`pdf-pages.ts`, which also reads the escaped form older editors saved).
- A table's column widths, dragged in the editor, are saved as a `<!-- table-cols: 30, 20, 50 -->` line before it (percents, `table-widths.ts`): the preview, print page and PDF size the table from it, and nothing ever shows the comment.
- The editor keeps `<br>` line breaks and typed page breaks (`src/lib/shared/components/line-breaks.ts`), and a line of only `<br>`s gets blank lines around it when rendered, so the markdown after it isn't read as raw HTML.
- A spreadsheet prints as a markdown table and a drawing as a PNG (`printable-body.svelte.ts`).

## Markdown export

For the two markdown formats `PrintView` shows `MarkdownExportPanel` above the preview; a project's "Export" (beside its status) opens `/app/projects/<id>/export`, the same panel with markdown only (a project has no one body to print). The panel loads `entity.exportTree` (app-only: a page with its sub-pages, a project with its docs, sync doc first, then sub-projects, at any depth; archived children left out), lists everything below the root with a checkbox (all ticked; leaving one out leaves out what's under it), and Download.

- `markdown-export.ts` (`planMarkdownExport`, pure) lays out the files: `<Title>.md` beside a `<Title>/` folder for what's under it, names made safe and kept apart (`safeFileName`), one `images/` folder at the top, every link relative (`relativePath`). Pictures stand in the text as tokens until drawn; `finishMarkdown` links each one drawn and puts back its fallback otherwise.
  - **Markdown**: portable. Charts, mermaid diagrams and drawings become PNGs (the PDF's own drawing, `drawChart` and `drawDiagrams` in `export-pdf.ts`, and `renderDrawing`), a spreadsheet a table, links to exported items relative links and other app links plain text; `<!-- table-cols -->` and page-break lines are dropped. Each file starts with its title as a heading unless it has one; a page or project lists what's exported under it.
  - **Remry markdown**: the body as stored (chart and mermaid blocks, table widths, app links), under front matter (`remry: 1`, `type`, `id`, `title`, `bodyType`, `parent`, a project's `status`, a sync `prompt`); a spreadsheet or drawing is its JSON in a `remry-sheet` / `remry-drawing` fence. It's meant to be read back into Remry.
  - In both, an image stored in the notebook (`storage://…`, `/files/…`) is copied into `images/` once and linked relatively; one that can't be read keeps its `storage://` link (Remry) or becomes "*Image missing*" (Markdown). An outside image stays a link and is never fetched.
- `export-markdown.ts` (`downloadMarkdown`, loaded only on Download) makes the pictures and saves one `.md` (a single item with no pictures) or a `.zip` (`zip.ts`, `buildZip`: stored, no compression, no dependency) through `saveBlob`.
- **Reading it back:** a Remry markdown export imports with `entity.import` (`src/api/CLAUDE.md` § Importing markdown; the app's `common/ImportForm`), which stores the `images/` files on their items and points the links at the new ids. A Markdown export imports as plain pages, its charts and diagrams as images.
