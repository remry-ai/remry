# Drawings

A drawing is a wiki page with `bodyType: drawing`, or a doc with it (`doc.add --bodyType drawing --content-file`, on a person, group, project or goal): a diagram the user edits by hand in the app (Excalidraw: shapes, arrows, text, a hand-drawn look). You write it as a **skeleton**, a short list of shapes, labels and arrows; the app lays it out, draws it, and keeps it editable. Its text is searchable. The page or doc shows the drawing as a picture; clicking it opens the editor full screen. A drawing is only ever its own page or doc: it isn't shown inside the text of docs, notes or other pages.

Each notebook has 3 free drawings; more are Remry Pro (the skill's **Remry Pro**). Making a fourth without a license returns an error saying so: tell the user, and offer a mermaid diagram in a doc instead. Editing an existing drawing is never limited.

```bash
remry page.create --title "Request flow" --bodyType drawing --content-file /tmp/flow.json
```

```json
{
  "skeleton": [
    { "type": "rectangle", "id": "req", "label": { "text": "User request" } },
    { "type": "diamond", "id": "auth", "label": { "text": "Signed in?" } },
    { "type": "rectangle", "id": "api", "label": { "text": "API" }, "backgroundColor": "#a5d8ff", "fillStyle": "solid" },
    { "type": "ellipse", "id": "login", "label": { "text": "Login page" } },
    { "type": "arrow", "start": { "id": "req" }, "end": { "id": "auth" } },
    { "type": "arrow", "start": { "id": "auth" }, "end": { "id": "api" }, "label": { "text": "yes" } },
    { "type": "arrow", "start": { "id": "auth" }, "end": { "id": "login" }, "label": { "text": "no" } }
  ]
}
```

## Drawing, mermaid or a chart?

- **A drawing** when the user will want to move things around, sketch on it, or keep it as its own page: architecture, a whiteboard, a floor plan, a flow they'll refine.
- **A mermaid block** in a doc's text for a quick diagram that lives inside the write-up and that you'll regenerate rather than hand-edit (sequence diagrams, Gantt charts, state machines).
- **A chart block** for numbers (references/charts.md).

## The skeleton

| Key | For | Rules |
|---|---|---|
| `type` | all | `rectangle`, `ellipse`, `diamond`, `text`, `arrow` or `line` |
| `id` | shapes | Any string, unique in the drawing. Needed for arrows to point at the shape |
| `label` | shapes, arrows | `{ "text": "…" }` (optional `fontSize`, `strokeColor`). `\n` breaks a line |
| `text` | `text` only | The words of a free-standing text element (required) |
| `start`, `end` | arrows, lines | `{ "id": "<shape id>" }`: the arrow is bound to that shape and follows it when the user drags it |
| `x`, `y`, `width`, `height` | any | Optional. Leave them out and the app places it |
| `strokeColor`, `backgroundColor` | any | A colour like `"#1e1e1e"`; a background shows only with `"fillStyle": "solid"` (or `hachure`, `cross-hatch`) |
| `strokeStyle` | any | `solid`, `dashed` or `dotted` |
| `strokeWidth`, `fontSize` | any | Numbers |

At the top level, beside `skeleton`, `"layout": "right"` lays the shapes out left to right instead of top to bottom.

**Layout.** Leave out `x` and `y` and the app puts shapes in ranks along the arrows: a shape no arrow points at is on top (or at the left), and each other shape sits one rank past the furthest shape pointing at it. Shapes in one rank sit side by side, and shapes no arrow touches go last. Each shape grows to fit its label. Write shapes in the order you want them across a rank. Give `x` and `y` (pixels, y going down) only to place something exactly; positioned shapes keep their place and the rest go after them.

**Colours.** Shapes and arrows you give no colour are drawn in the notebook's default branding's colours (outlines and arrows in its chart colour, shapes filled with a pale tint of it), the same as mermaid diagrams and charts; without a branding, Excalidraw's plain black on white. So leave colours out unless one means something.

**Good drawings.** Keep labels short (1–4 words; put detail in the page's notes). Use a diamond for a decision and label its arrows ("yes", "no"). Use colour only to mean something (one colour per system, say), and the same colours throughout; otherwise leave it to the branding. About 25 shapes is as many as reads well; split a bigger picture into several drawings.

## After the user edits it

Once the user changes a drawing in the app, it's saved as Excalidraw's own scene: `{"version":1,"elements":[…]}`, with every shape's coordinates, styles and ids. `page.get` returns that. Read its text from the `text` elements (`originalText`). To change one, prefer telling the user what to change in the app; if they ask you to redo it, write a new skeleton with `page.update --content` (it replaces their layout, so say so first).

## Excalidraw files and share links

- **An `.excalidraw` file** (the user attaches one, or it's on disk): its JSON is a drawing's content as it is. `page.create --title … --bodyType drawing --content-file <file>.excalidraw`. Pictures in it are left out (a drawing keeps no image files); say so if it had any. In the app, the drawing's menu has **Open** (load a file into it) and **Save to…** (download one).
- **An excalidraw.com share link** (`https://excalidraw.com/#json=<id>,<key>`) the user pastes: `drawing.importLink --url <link> --title "<what it shows>"` (add `--parentId` to put it under a page, or `--entityType --entityId` to make it a drawing doc on that entity), or `--pageId <empty drawing page>` (`--docId` for a drawing doc) to fill one (`--replace true` only when the user asked to overwrite it). The app fetches it from excalidraw.com and decrypts it with the key in the link. Pass on `imagesLeftOut` when it isn't 0. A `#room=` link is a live session Excalidraw doesn't store: ask the user for a share link instead (in Excalidraw: Share → Export to link). Don't fetch the link yourself; `drawing.importLink` does it.
- **Making a share link**, only when the user asks to share a drawing outside Remry: `drawing.shareLink --pageId <id>` (or `--docId <id>` for a drawing doc) uploads an encrypted copy to excalidraw.com and returns the link. Tell the user, with the link, that anyone who has it can open the drawing, that it's a snapshot (later edits need a new link), and that it can't be taken down from Remry. A drawing you wrote that nobody has opened yet is refused: it has no layout until the app lays it out, so ask the user to open it once (or share it from the app's "Share link"). Never share on your own initiative; inside Remry, link the page instead.

## Pointing at a drawing from elsewhere

A drawing isn't shown inside other text. To refer to one from a doc, note or page, link its page: `[Checkout architecture](/app/wiki/<drawing page id>)` (a "Mentioned in" backlink on the drawing). In a write-up about a system, link the architecture drawing where it's discussed; the reader opens it to see it. A ```` ```drawing ```` block from before (0.16.82–0.16.83) now shows as a "Drawing ↗" link; don't write new ones.

## When a save is rejected

| Error | Fix |
|---|---|
| `drawing content: skeleton.3.start.id "db" isn't the id of any element` | Give the shape that `id`, or fix the arrow's `start`/`end` |
| `skeleton.2.text is required for a text element` | A `text` element needs `"text"`; a shape uses `"label": {"text": …}` |
| `skeleton.1.text is for text elements` | Use `"label": {"text": …}` on a shape |
| `"a" is used twice; ids must be unique` | Rename one |
| `Unrecognized key(s) in object` | Remove the key; only the keys above are allowed |
| `That isn't an Excalidraw share link` / `live-collaboration link (#room=)` | Ask the user for a `#json=` share link |
| `… hasn't been opened in the app yet, so it has no layout to share` | Ask the user to open the drawing in Remry once, then share again |
| `Couldn't reach excalidraw.com …` | The computer is offline, or excalidraw.com is down: say so and try later |

`bodyType` changes only while a page or doc is empty. A drawing page converts to a drawing doc and back (`entity.convert`), and into a project's drawing doc with its tree; it can't become a note.
