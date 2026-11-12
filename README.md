# Free PDF Editor

A browser-based PDF reader and editor with a familiar desktop-reader layout: File menu, mode tabs (View, Comment, Edit, Fill & Sign, Organize pages), a tool ribbon, side panels and a floating page bar. Files are processed locally in the browser and never uploaded.

**Live:** https://pdf-editor.prtiwari.workers.dev

Built on [pdf.js](https://github.com/mozilla/pdf.js) 3.11.174 (rendering, text layer, search), [pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1 (editing and saving) and [@pdf-lib/fontkit](https://github.com/Hopding/fontkit) 1.1.1 (embedding custom fonts). Page-organizing ideas come from [PdfCraft](https://github.com/storytold/pdfcraft). All libraries and fonts are vendored, so there is no build step and the app works offline.

## Features

| Mode | What you can do |
|---|---|
| View | Select and copy text, hand tool (or hold Space), fit width / fit page, zoom, rotate pages, clickable links |
| Comment | Sticky notes (saved as real PDF comments), highlight / underline / strikethrough selected text, area highlight, draw, rectangle, ellipse, line, arrow, text box |
| Edit | Add styled text, white-out, images, **Detect font**, **Match original** |
| Fill & Sign | Fill form fields (labels read from the form), type anywhere, check / cross / dot marks, today's date, signature, initials |
| Organize pages | Page grid: select, rotate, delete, drag to reorder, insert blank pages or other PDFs, extract, split |
| Panels | Page thumbnails, bookmarks (outline), find (match case, whole words), comments list, form fields |
| File | Open, combine, download, print, document properties (title, author, subject, keywords), close |

Undo and redo cover every change and name each step ("Undo Rotate page").

### Fonts

- **Standard PDF fonts:** Helvetica, Times, Courier, each in regular, bold, italic and bold italic.
- **Bundled fonts** (open licenses, all four styles): Inter, Figtree, Roboto, Open Sans, Lato, Montserrat, Poppins, Source Sans 3, Noto Sans, Merriweather, Lora, Playfair Display, EB Garamond, Noto Serif, Roboto Mono.
- **On this computer:** Verdana, Georgia, Tahoma, Trebuchet MS, Arial, Calibri and others are read from your system through the Local Font Access API (Chrome and Edge ask permission first). Microsoft fonts can't legally be bundled, so this is how they're offered.
- **Upload:** any .ttf or .otf file.

Custom fonts are subset-embedded in the saved PDF.

### Font detector

Drag the **Detect font** tool over text in the PDF. It reads the embedded font's real name (for example `NimbusRomNo9L-Medi`), its style, size and category, and shows a crop of the original next to the closest fonts you can use. Candidates are ranked by:

1. Exact name match.
2. Known substitutes, such as Times clones to Times, Calibri to Lato and Myriad to Source Sans 3.
3. How closely each candidate reproduces the original text's width.

Click **Use** to apply a result to the selected text, or to make it the default for new text. **Match original** in the options bar copies the font, size and baseline from the nearest original line in one step. Text you drag with the **Move** handle snaps to the original baselines and margins; hold Alt to place it freely.

### Shortcuts

`V` select · Space hand · `T` text · `N` note · `H` / `U` / `K` highlight, underline, strikethrough · `D` draw · `R` rectangle · `E` ellipse · `L` line · `A` arrow · `W` white-out · `F` detect font · `Ctrl/Cmd+F` find · `Ctrl/Cmd+Z` / `Shift+Z` undo / redo · `Ctrl/Cmd+S` / `P` / `O` download, print, open · `Ctrl/Cmd+B` / `I` bold, italic · `Delete` remove · arrows nudge (Shift = 10pt) · PageUp / PageDown · `+` / `-` zoom

## Run locally

```bash
python3 -m http.server 8765    # then open http://localhost:8765
```

The pdf.js worker can't load from `file://`, so the folder has to be served.

## Deploy (Cloudflare Workers static assets)

```bash
npm run deploy    # builds dist/ and runs wrangler deploy
```

`build.mjs` copies the site into `dist/` and writes `_headers`, which caches libraries and fonts for a year and revalidates the app on every load. `wrangler.jsonc` serves `dist/` with no Worker script.

## How it works

- Annotations are stored in PDF user space (points, y up). The SVG overlay applies the pdf.js viewport transform, so annotations follow zoom and rotation, and pdf-lib receives the same numbers on save.
- On download, pages are copied from their source PDFs into a new document, and annotations are drawn into the page content. Sticky notes are written as standard `/Text` annotations.
- Pages render only near the viewport, and pages far away are freed, so long documents stay responsive.

## Known limits

- It can't reflow or edit existing text in place, because PDFs don't store editable paragraphs. Cover the old text with white-out, then use **Match original** to type replacement text in a matching font.
- Form fields are flattened on download: values are baked in and the fields stop being editable.
- Password-protected PDFs are rejected. Remove the protection first.
- Search finds matches within a single text run, so a phrase split across runs (often at line breaks) can be missed.
- The original's links, bookmarks and attachments are not carried into the downloaded file.
