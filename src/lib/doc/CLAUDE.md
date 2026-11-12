# Docs, print pages and PDF export — `src/lib/doc/`

The components here (`DocTitle`, `DocBar`, `DocBodyCard`, `BodyView`, `PrintView`…) are listed in `src/lib/CLAUDE.md`. This is how a doc or wiki page becomes a PDF.

## Export

A doc's "Export PDF" opens `/app/docs/<id>/print`, a wiki page's `/app/wiki/<id>/print`; both render `PrintView`. Its toolbar picks the branding (the default, another, or none; locked without Pro) and turns the branded header on (off by default); the choices live in the URL (`print-options.ts`).

- **Download PDF** builds the file in the browser with pdfmake (loaded only then), from the markdown, so the text is real and pages break between lines and table rows, a table repeats its header, a heading stays with what follows, and every page is numbered. `pdf-markdown.ts` (`markdownToPdf`) turns markdown into pdfmake content and `pdf-document.ts` lays out pages, letterhead and footer, both pure; `export-pdf.ts` draws images, charts, mermaid diagrams and drawings as PNGs and saves through a plain download link (pdfmake's own save opens a window, which the desktop app drops).
- **Type** follows the screen (`_base.scss`, in points): the app's font from `src/lib/ui/app-font.ts` at its doc size × 0.75, the same line spacing, a bold h1 then lighter, smaller headings (`HEADINGS`). Code uses the same font, so characters it lacks (emoji, CJK) don't print; raw HTML keeps only its text and `<br>`s.
- **Print…** is the browser's dialog, the fallback (`print.ts`; in the desktop app, see `desktop/CLAUDE.md`).

## Page breaks and tables

- A horizontal rule (`---`, `***`) starts a new page in both and isn't drawn; on screen it's a faint grey line, never in brand colours. One at the start or end, or right after another break, adds no blank page. A line of just `<!-- pagebreak -->` outside code does the same (`pdf-pages.ts`, which also reads the escaped form older editors saved).
- A table's column widths, dragged in the editor, are saved as a `<!-- table-cols: 30, 20, 50 -->` line before it (percents, `table-widths.ts`): the preview, print page and PDF size the table from it, and nothing ever shows the comment.
- The editor keeps `<br>` line breaks and typed page breaks (`src/lib/shared/components/line-breaks.ts`), and a line of only `<br>`s gets blank lines around it when rendered, so the markdown after it isn't read as raw HTML.
- A spreadsheet prints as a markdown table and a drawing as a PNG (`printable-body.svelte.ts`).
