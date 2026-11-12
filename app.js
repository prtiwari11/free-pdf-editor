'use strict';
/*
 * PDF Editor: pdf.js renders pages, pdf-lib writes the edited file.
 *
 * Coordinate model: every annotation is stored in PDF user space (points,
 * origin bottom-left, y up) of its source page. The overlay SVG applies the
 * pdf.js viewport transform, so annotations follow zoom and page rotation,
 * and the same numbers are handed to pdf-lib on save.
 * Box-like annotations use (x, y) = top-left corner, w/h extend right/down.
 */
(() => {
  const {
    PDFDocument, StandardFonts, rgb, degrees, BlendMode, LineCapStyle,
    PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup,
  } = PDFLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

  const ASC = 0.75;           // baseline offset from text top, as a fraction of font size
  const LH = 1.2;             // line height
  const ZOOM_MIN = 0.25, ZOOM_MAX = 4;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const ICONS = {
    open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    add: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
    blank: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    extract: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9.5 14.5 12 17l2.5-2.5"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    select: '<path d="M5 3l14 7-6 2-2 6z"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    highlight: '<path d="M4 20h7"/><path d="M14.5 4.5l5 5L11 18H6v-5z"/>',
    draw: '<path d="M3 17c2.5-2.5 4-6 6.5-6S12 15 14 15s3-4 7-7"/>',
    line: '<path d="M5 19L19 5"/>',
    rect: '<rect x="4" y="5" width="16" height="14" rx="1.5"/>',
    whiteout: '<path d="M7 20h13"/><path d="M4.5 15.5l9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H7z"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    sign: '<path d="M3 16c2-4 4-8 6-8 3 0-2 10 1 10 2 0 3-4 5-4 1 0 1 2 2 2s2-1 3-2"/><path d="M3 21h18"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    rotl: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    rotr: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    form: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
    align: '<path d="M4 4v16M8 8h12M8 16h8"/>',
    detect: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8M8 8.5h5M10.5 8.5V13"/>',
    print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.9-2.5L2.8 14.6a1.5 1.5 0 0 1 2.4-1.8L8 15"/>',
    fitw: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 12h10M7 12l2-2M7 12l2 2M17 12l-2-2M17 12l-2 2"/>',
    fitp: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    note: '<path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4M8 9h8M8 13h5"/>',
    hltext: '<path d="M3 21h18"/><rect x="5" y="6" width="14" height="10" rx="1" fill="#facc15" fill-opacity=".45" stroke="none"/><path d="M9 14l3-8 3 8M10 12h4"/>',
    underline: '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>',
    strike: '<path d="M16 6.5C15 5 13.6 4 12 4c-2.5 0-4 1.5-4 3.3 0 4.2 8 2.7 8 7.2 0 1.9-1.7 3.5-4.2 3.5-1.9 0-3.4-1-4.3-2.5M4 12h16"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="9" ry="6.5"/>',
    arrow: '<path d="M5 19L19 5M10 5h9v9"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    cross: '<path d="M6 6l12 12M18 6L6 18"/>',
    dot: '<circle cx="12" cy="12" r="5" fill="currentColor"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    initials: '<path d="M4 18V7M4 7h0M9 18V7l6 11V7M18 18h2"/>',
    selectall: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    split: '<path d="M6 3v18M18 3v18M6 12h4M14 12h4M10 9l3 3-3 3"/>',
    pages: '<rect x="4" y="3" width="11" height="15" rx="1.5"/><path d="M9 21h10a1 1 0 0 0 1-1V8"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    comment: '<path d="M4 5h16v11H9l-5 4z"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
  };
  const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] ?? ''}</svg>`;

  // Defaults for newly created annotations, per tool. Edited via the props bar.
  const TOOL_PROPS = {
    select: {},
    text: { color: '#111827', size: 16, opacity: 1, font: 'helvetica', bold: false, italic: false },
    highlight: { color: '#facc15', opacity: 0.45 },
    draw: { color: '#2563eb', size: 2.5, opacity: 1 },
    line: { color: '#e11d48', size: 2, opacity: 1 },
    rect: { color: '#e11d48', size: 2, opacity: 1 },
    whiteout: { color: '#ffffff' },
    ellipse: { color: '#e11d48', size: 2, opacity: 1 },
    arrow: { color: '#e11d48', size: 2, opacity: 1 },
    hltext: { color: '#facc15', opacity: 0.45 },
    underline: { color: '#16a34a', opacity: 1 },
    strike: { color: '#dc2626', opacity: 1 },
    note: { color: '#facc15' },
    check: { color: '#111827', opacity: 1 },
    cross: { color: '#111827', opacity: 1 },
    dot: { color: '#111827', opacity: 1 },
    date: {},
  };
  const PROP_FIELDS = {
    select: [], detect: [], text: ['font', 'bold', 'color', 'size', 'opacity'], highlight: ['color', 'opacity'],
    draw: ['color', 'size', 'opacity'], line: ['color', 'size', 'opacity'],
    rect: ['color', 'size', 'opacity'], whiteout: ['color'], image: ['opacity'],
    ellipse: ['color', 'size', 'opacity'], arrow: ['color', 'size', 'opacity'], hand: [],
    hltext: ['color', 'opacity'], underline: ['color', 'opacity'], strike: ['color', 'opacity'], markup: ['color', 'opacity'],
    note: ['color'], check: ['color', 'opacity'], cross: ['color', 'opacity'], dot: ['color', 'opacity'], stamp: ['color', 'opacity'],
    date: ['font', 'bold', 'color', 'size'],
  };
  const BOX_TYPES = new Set(['rect', 'highlight', 'whiteout', 'image', 'ellipse', 'stamp']);
  const MARKUP_TOOLS = new Set(['hltext', 'underline', 'strike']);
  const STAMP_TOOLS = new Set(['check', 'cross', 'dot']);
  const NOTE_SIZE = 20; // sticky-note icon size in points

  const state = {
    sources: new Map(),   // id -> { id, name, bytes, pdf, pp: [PDFPageProxy], fields, initial }
    images: new Map(),    // id -> { url, bytes, kind: 'png'|'jpg', w, h }
    pages: [],            // [{ id, src, index, rot, annots: [] }]  (undoable)
    formValues: {},       // srcId -> { fieldName: value }       (undoable)
    tool: 'select',
    zoom: 1.25,
    selected: null,       // { pageId, annotId }
    pageSel: new Set(),   // page ids selected in the sidebar
    pageAnchor: null,
    current: 0,
    fileName: 'document.pdf',
    detect: null,         // font-detector rectangle
    guides: null,         // snapping guide lines while dragging text
    mode: 'view',
    search: null,         // { q, hits: [{ pageId, x, y, w, h }], idx }
    meta: null,           // document-properties overrides
    author: 'You',
  };
  const hist = { undo: [], redo: [] };
  let savedAt = 0;        // undo depth at last download, for the unsaved marker
  const views = new Map();
  const thumbCache = new Map();
  let io = null, drag = null, editing = null, propBefore = null, uid = 0;
  const nid = (p) => `${p}${(++uid).toString(36)}`;

  /* ---------- small utils ---------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const norm = (r) => ((r % 360) + 360) % 360;
  const r2 = (n) => Math.round(n * 100) / 100;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pageById = (id) => state.pages.find((p) => p.id === id);
  const pageIndex = (id) => state.pages.findIndex((p) => p.id === id);
  const srcPage = (p) => state.sources.get(p.src).pp[p.index];
  const viewportFor = (p, scale) => {
    const pg = srcPage(p);
    return pg.getViewport({ scale, rotation: norm(pg.rotate + p.rot) });
  };
  const findAnnot = (sel) => sel && pageById(sel.pageId)?.annots.find((a) => a.id === sel.annotId);
  function hexRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }
  function toast(msg, kind = 'info') {
    const t = $('#toast');
    t.textContent = msg;
    t.dataset.kind = kind;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), kind === 'error' ? 6000 : 3000);
  }
  function busy(on, msg = 'Working…') {
    $('#busy').hidden = !on;
    $('#busyMsg').textContent = msg;
  }
  const measureCtx = document.createElement('canvas').getContext('2d');
  function textBox(an, text = an.text) {
    measureCtx.font = cssFont(an, an.size);
    const lines = (text || ' ').split('\n');
    const w = Math.max(an.size * 0.6, ...lines.map((l) => measureCtx.measureText(l).width));
    const h = (lines.length - 1) * LH * an.size + an.size * 1.05;
    return { x: an.x, y: an.y, w, h, lines };
  }
  // Arrow head: two short strokes back from the tip, in PDF space.
  function arrowHead(an) {
    const len = Math.max(8, an.size * 4), ang = Math.atan2(an.y2 - an.y1, an.x2 - an.x1);
    return [-0.45, 0.45].map((d) => [an.x2 - len * Math.cos(ang + d), an.y2 - len * Math.sin(ang + d)]);
  }
  // Stamp glyphs in a w x h box, local coordinates (y down).
  function stampPath(an) {
    const { w, h } = an;
    if (an.kind === 'check') return `M${0.12 * w} ${0.55 * h}L${0.4 * w} ${0.85 * h}L${0.9 * w} ${0.15 * h}`;
    if (an.kind === 'cross') return `M${0.15 * w} ${0.15 * h}L${0.85 * w} ${0.85 * h}M${0.85 * w} ${0.15 * h}L${0.15 * w} ${0.85 * h}`;
    return '';
  }
  function bbox(an) {
    if (an.type === 'text') return textBox(an);
    if (an.type === 'note') return { x: an.x, y: an.y, w: NOTE_SIZE, h: NOTE_SIZE };
    if (an.type === 'markup') {
      const x = Math.min(...an.rects.map((r) => r.x)), y = Math.max(...an.rects.map((r) => r.y));
      return { x, y, w: Math.max(...an.rects.map((r) => r.x + r.w)) - x, h: y - Math.min(...an.rects.map((r) => r.y - r.h)) };
    }
    if (an.type === 'draw' || an.type === 'line' || an.type === 'arrow') {
      const pts = an.type === 'draw' ? an.pts : [[an.x1, an.y1], [an.x2, an.y2], ...(an.type === 'arrow' ? arrowHead(an) : [])];
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const pad = an.size / 2;
      const x = Math.min(...xs) - pad, y = Math.max(...ys) + pad;
      return { x, y, w: Math.max(...xs) + pad - x, h: y - (Math.min(...ys) - pad) };
    }
    return { x: an.x, y: an.y, w: an.w, h: an.h };
  }

  /* ---------- fonts ---------- */
  // Standard PDF fonts need no embedding. Bundled fonts are open-licensed TTFs
  // in fonts/. System fonts (Verdana, Georgia, ...) are read from the user's
  // computer with the Local Font Access API; uploaded fonts come from a file.
  const GENERIC = { sans: 'sans-serif', serif: 'serif', mono: 'monospace' };
  const FONT_LIST = [
    { id: 'helvetica', name: 'Helvetica', cat: 'sans', group: 'Standard PDF fonts', css: 'Helvetica, Arial, sans-serif',
      std: { r: 'Helvetica', b: 'HelveticaBold', i: 'HelveticaOblique', bi: 'HelveticaBoldOblique' } },
    { id: 'times', name: 'Times', cat: 'serif', group: 'Standard PDF fonts', css: '"Times New Roman", Times, serif',
      std: { r: 'TimesRoman', b: 'TimesRomanBold', i: 'TimesRomanItalic', bi: 'TimesRomanBoldItalic' } },
    { id: 'courier', name: 'Courier', cat: 'mono', group: 'Standard PDF fonts', css: '"Courier New", Courier, monospace',
      std: { r: 'Courier', b: 'CourierBold', i: 'CourierOblique', bi: 'CourierBoldOblique' } },
    ...[
      ['inter', 'Inter', 'sans'], ['figtree', 'Figtree', 'sans'], ['roboto', 'Roboto', 'sans'], ['open-sans', 'Open Sans', 'sans'],
      ['lato', 'Lato', 'sans'], ['montserrat', 'Montserrat', 'sans'], ['poppins', 'Poppins', 'sans'],
      ['source-sans-3', 'Source Sans 3', 'sans'], ['noto-sans', 'Noto Sans', 'sans'],
      ['merriweather', 'Merriweather', 'serif'], ['lora', 'Lora', 'serif'], ['playfair-display', 'Playfair Display', 'serif'],
      ['eb-garamond', 'EB Garamond', 'serif'], ['noto-serif', 'Noto Serif', 'serif'], ['roboto-mono', 'Roboto Mono', 'mono'],
    ].map(([id, name, cat]) => ({
      id, name, cat, group: cat === 'serif' ? 'Serif' : cat === 'mono' ? 'Monospace' : 'Sans serif',
      files: Object.fromEntries(['r', 'b', 'i', 'bi'].map((k) => [k, `fonts/${id}-${k}.ttf`])),
    })),
    ...[
      ['verdana', 'Verdana', 'sans'], ['georgia', 'Georgia', 'serif'], ['tahoma', 'Tahoma', 'sans'],
      ['trebuchet', 'Trebuchet MS', 'sans'], ['arial', 'Arial', 'sans'], ['times-new-roman', 'Times New Roman', 'serif'],
      ['courier-new', 'Courier New', 'mono'], ['calibri', 'Calibri', 'sans'], ['cambria', 'Cambria', 'serif'],
      ['garamond', 'Garamond', 'serif'], ['segoe-ui', 'Segoe UI', 'sans'], ['helvetica-neue', 'Helvetica Neue', 'sans'],
    ].map(([id, name, cat]) => ({ id: `sys-${id}`, name, cat, group: 'On this computer', system: true })),
  ];
  const fonts = new Map();
  function registerFont(f) {
    f.bytes ??= {};
    f.faces ??= {};
    if (!f.std) f.css = `"pe-${f.id}", "${f.name}", ${GENERIC[f.cat]}`;
    fonts.set(f.id, f);
    return f;
  }
  FONT_LIST.forEach(registerFont);
  const fontOf = (an) => fonts.get(an.font) ?? fonts.get('helvetica');
  const hasVariant = (f, k) => !!(f.std || f.files?.[k] || f.bytes[k]);
  function variantKey(f, an) {
    const want = `${an.bold ? 'b' : ''}${an.italic ? 'i' : ''}` || 'r';
    if (hasVariant(f, want)) return want;
    if (want === 'bi') { if (hasVariant(f, 'b')) return 'b'; if (hasVariant(f, 'i')) return 'i'; }
    return 'r';
  }
  function cssFont(an, px) {
    const f = fontOf(an), k = variantKey(f, an);
    return `${k.includes('i') ? 'italic' : 'normal'} ${k.includes('b') ? 700 : 400} ${px}px ${f.css}`;
  }
  function svgFontAttrs(an) {
    const f = fontOf(an), k = variantKey(f, an);
    return `font-family="${esc(f.css)}" font-weight="${k.includes('b') ? 700 : 400}" font-style="${k.includes('i') ? 'italic' : 'normal'}"`;
  }
  // Make a font variant available to the browser for preview and measuring.
  function loadFace(f, k) {
    if (f.std) return Promise.resolve(false);
    if (f.faces[k]) return f.faces[k];
    const src = f.bytes[k] ?? (f.files?.[k] ? `url(${f.files[k]})` : null);
    if (!src) return Promise.resolve(false);
    const face = new FontFace(`pe-${f.id}`, src, { weight: k.includes('b') ? '700' : '400', style: k.includes('i') ? 'italic' : 'normal' });
    document.fonts.add(face);
    f.faces[k] = face.load().then(() => true, (e) => { console.warn('Font load failed', f.name, e); return false; });
    return f.faces[k];
  }
  const redrawAllAnnots = () => state.pages.forEach((p) => drawAnnots(p));
  function ensureFont(an) {
    const f = fontOf(an);
    return loadFace(f, variantKey(f, an)).then((fresh) => { if (fresh) { redrawAllAnnots(); editing?.place(); } });
  }
  async function fontBytes(f, k) {
    if (f.bytes[k]) return f.bytes[k];
    if (!f.files?.[k]) return null;
    const res = await fetch(f.files[k]);
    if (!res.ok) throw new Error(`Could not load font ${f.name}`);
    f.bytes[k] = new Uint8Array(await res.arrayBuffer());
    return f.bytes[k];
  }
  const styleKey = (s) => {
    s = s.toLowerCase();
    const b = /bold|black|heavy/.test(s), i = /italic|oblique/.test(s);
    if (b && i) return 'bi';
    if (b) return 'b';
    if (i) return 'i';
    return /^(regular|normal|roman|book|plain)$/.test(s.trim()) ? 'r' : null;
  };
  const isCollection = (buf) => String.fromCharCode(...buf.slice(0, 4)) === 'ttcf';
  // Read an installed font's files via the Local Font Access API (Chrome/Edge).
  async function loadSystemFont(f) {
    if (f.bytes.r) return true;
    if (!('queryLocalFonts' in window)) return false;
    let list;
    try { list = await window.queryLocalFonts(); } catch { return false; }
    for (const lf of list.filter((x) => x.family.toLowerCase() === f.name.toLowerCase())) {
      const k = styleKey(lf.style);
      if (!k || f.bytes[k]) continue;
      const buf = new Uint8Array(await (await lf.blob()).arrayBuffer());
      if (!isCollection(buf)) f.bytes[k] = buf;
    }
    return !!f.bytes.r;
  }
  async function addFontFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let fk;
    try { fk = fontkit.create(bytes); } catch { toast(`"${file.name}" is not a font file fontkit can read.`, 'error'); return null; }
    if (fk.fonts || isCollection(bytes)) { toast('Font collections (.ttc) are not supported. Use a .ttf or .otf file.', 'error'); return null; }
    const name = fk.familyName || file.name.replace(/\.[^.]+$/, '');
    const k = styleKey(fk.subfamilyName || 'regular') ?? 'r';
    const lower = name.toLowerCase();
    const cat = /mono|code|courier|consol/.test(lower) ? 'mono' : /serif|times|garamond|georgia|roman|book/.test(lower) && !/sans/.test(lower) ? 'serif' : 'sans';
    let f = [...fonts.values()].find((x) => (x.custom || x.system) && x.name.toLowerCase() === lower);
    if (!f) f = registerFont({ id: nid('font-'), name, cat, group: 'Your fonts', custom: true });
    f.bytes[k] = bytes;
    delete f.faces[k];
    if (!f.bytes.r) f.bytes.r = bytes; // use the first file as the base style
    buildFontSelect();
    return f;
  }
  function buildFontSelect() {
    const sel = $('#propFont');
    const groups = new Map();
    for (const f of fonts.values()) {
      if (!groups.has(f.group)) groups.set(f.group, []);
      groups.get(f.group).push(f);
    }
    sel.innerHTML = [...groups].map(([g, list]) => `<optgroup label="${esc(g)}">${
      list.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('')}</optgroup>`).join('')
      + '<optgroup label="More"><option value="__upload">Upload a font file (.ttf, .otf)…</option></optgroup>';
  }
  // Switch a text annotation (or the tool default) to a font, loading it first.
  async function chooseFont(id) {
    const f = fonts.get(id);
    if (!f) return false;
    if (f.system && !f.bytes.r) {
      busy(true, `Loading ${f.name} from this computer…`);
      const ok = await loadSystemFont(f).finally(() => busy(false));
      if (!ok) {
        toast(`${f.name} could not be read from this computer. Either it isn't installed, or this browser can't access installed fonts (Chrome and Edge can). Upload the .ttf file instead.`, 'error');
        return false;
      }
    }
    return true;
  }

  /* ---------- original-text snapping ---------- */
  // The PDF's own text runs (position, size, font), loaded lazily per page.
  const textItemsCache = new Map();
  function loadTextItems(p) {
    const key = `${p.src}:${p.index}`;
    if (!textItemsCache.has(key)) {
      const entry = { items: null };
      const pg = srcPage(p);
      entry.promise = (async () => {
        // The operator list makes pdf.js resolve each font object, which
        // carries the font's real (PostScript) name and style flags.
        try { await pg.getOperatorList(); } catch { /* fonts stay unknown */ }
        const tc = await pg.getTextContent();
        entry.items = tc.items.filter((i) => i.str && i.str.trim()).map((i) => {
          let font = null;
          try {
            const fo = pg.commonObjs.get(i.fontName);
            font = { name: fo.name || '', bold: !!fo.bold, italic: !!fo.italic, black: !!fo.black,
              serif: !!fo.isSerifFont, mono: !!fo.isMonospace, fallback: fo.fallbackName || '', missing: !!fo.missingFile };
          } catch { /* font not resolved */ }
          return { x: i.transform[4], y: i.transform[5], size: Math.hypot(i.transform[2], i.transform[3]),
            w: i.width, str: i.str, fontName: i.fontName, font };
        });
        return entry.items;
      })().catch(() => (entry.items = []));
      textItemsCache.set(key, entry);
    }
    return textItemsCache.get(key);
  }
  const textItems = (p) => loadTextItems(p).items || [];
  const textItemsAsync = (p) => loadTextItems(p).promise;

  // Snap a text annotation's top-left (x, y) so its baseline and left edge line
  // up with nearby original text. Returns the snapped point and guide lines.
  function snapText(p, an, x, y, off) {
    const out = { x, y, guides: null };
    if (off) return out;
    const tol = 6 / state.zoom;
    const base = y - ASC * an.size;
    let by = null, bdy = tol, bx = null, bdx = tol;
    for (const it of textItems(p)) {
      const dy = Math.abs(it.y - base);
      if (dy < bdy) { bdy = dy; by = it.y; }
      for (const cx of [it.x, it.x + it.w]) {
        const dx = Math.abs(cx - x);
        if (dx < bdx) { bdx = dx; bx = cx; }
      }
    }
    if (by !== null) out.y = by + ASC * an.size;
    if (bx !== null) out.x = bx;
    if (by !== null || bx !== null) out.guides = { pageId: p.id, y: by, x: bx };
    return out;
  }

  /* ---------- font detector ---------- */
  // Known families and their closest available stand-ins, most similar first.
  const FONT_ALIASES = [
    [/^(arial|helvetica(?!neue)|nimbussans|liberationsans|arimo)/, ['helvetica', 'sys-arial']],
    [/^helveticaneue/, ['sys-helvetica-neue', 'helvetica', 'inter']],
    [/^(timesnewroman|times|nimbusrom|liberationserif|tinos|texgyretermes|stix)/, ['times', 'sys-times-new-roman', 'noto-serif']],
    [/^(cmr|cmbx|cmti|cmsl|lmroman|lmr|computermodern|sfrm)/, ['noto-serif', 'times', 'eb-garamond']],
    [/^(cmss|lmsans|sfss)/, ['source-sans-3', 'open-sans']],
    [/^(cmtt|lmmono|sftt)/, ['courier', 'roboto-mono']],
    [/^(nimbussan|texgyreheros)/, ['helvetica', 'sys-arial']],
    [/^(charter|bitstreamcharter|utopia|century|newcentury|schoolbook)/, ['noto-serif', 'merriweather', 'lora']],
    [/^(couriernew|courier|nimbusmono|liberationmono|cousine)/, ['courier', 'sys-courier-new']],
    [/^(calibri|carlito)/, ['sys-calibri', 'lato', 'open-sans']],
    [/^(cambria|caladea)/, ['sys-cambria', 'noto-serif', 'merriweather']],
    [/^(verdana|dejavusans(?!mono)|bitstreamvera)/, ['sys-verdana', 'noto-sans', 'open-sans']],
    [/^tahoma/, ['sys-tahoma', 'noto-sans', 'open-sans']],
    [/^(georgia|gelasio)/, ['sys-georgia', 'merriweather', 'noto-serif']],
    [/^trebuchet/, ['sys-trebuchet', 'figtree', 'source-sans-3']],
    [/^segoe/, ['sys-segoe-ui', 'open-sans', 'noto-sans']],
    [/^(sfpro|sanfrancisco|systemui)/, ['inter', 'helvetica']],
    [/garamond|minion|sabon|caslon|janson/, ['eb-garamond', 'sys-garamond', 'lora']],
    [/palatino|bookantiqua|baskerville|bembo|goudy/, ['lora', 'eb-garamond', 'merriweather']],
    [/didot|bodoni/, ['playfair-display', 'noto-serif']],
    [/futura|avenir|proximanova|gotham|circular|gilroy|productsans|brandon/, ['montserrat', 'figtree', 'poppins']],
    [/myriad/, ['source-sans-3', 'open-sans']],
    [/gillsans|frutiger|syntax/, ['lato', 'source-sans-3']],
    [/^(univers|akzidenz)/, ['helvetica', 'inter']],
    [/consolas|menlo|monaco|sourcecode|sfmono|jetbrains|firacode|dejavusansmono|inconsolata|lucidaconsole/, ['roboto-mono', 'courier']],
  ];
  const normName = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(mt|ps|std|pro|lt|com)$/g, '');

  // Turn a PDF font name like "ABCDEF+MinionPro-BoldIt" into readable parts.
  function describeFont(items) {
    const it = items[0], fo = it.font ?? {};
    const ps = (fo.name || '').replace(/^[A-Z]{6}\+/, '');
    let fam = ps, style = '';
    const dash = ps.search(/[-,]/);
    if (dash > 0) { fam = ps.slice(0, dash); style = ps.slice(dash + 1); }
    else {
      const m = ps.match(/(Bold|Italic|Oblique|Regular|Medium|Light|Semibold|SemiBold|Black|Heavy|Book|Roman|It)+$/);
      if (m && m.index > 0) { fam = ps.slice(0, m.index); style = m[0]; }
    }
    const pretty = fam.replace(/(MT|PS|Std|LT)$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim();
    const all = `${ps} ${style}`;
    // URW fonts call their bold weight "Medi" (e.g. NimbusRomNo9L-Medi).
    const urw = /^(nimbus|urw|texgyre)/i.test(ps);
    const bold = fo.bold || fo.black || /bold|black|heavy|semi|demi|^bx/i.test(style || ps) || /cmbx/i.test(ps) || (urw && /medi/i.test(style));
    const italic = fo.italic || /italic|oblique|(^|[^a-z])it$/i.test(style) || /Italic|Oblique/.test(ps);
    const cat = fo.mono || /mono|courier|consol|menlo|code|^cmtt|^lmmono/i.test(all) ? 'mono'
      : fo.serif || fo.fallback === 'serif' || (/times|serif|garamond|georgia|minion|caslon|baskerville|palatino|cambria|roman|nimbusrom|book|charter|utopia|century|bodoni|didot|tinos|stix|^cm(r|bx|ti|sl)|lmroman|mincho|song|ming/i.test(all) && !/sans|cmss/i.test(all)) ? 'serif'
        : 'sans';
    const sizes = items.map((i) => i.size).sort((a, b) => a - b);
    const weightWord = bold && !/bold|black|heavy/i.test(style) ? 'Bold'
      : (style.match(/thin|extralight|light|medium|semibold|demibold|bold|extrabold|black|heavy/i) || [bold ? 'Bold' : 'Regular'])[0];
    return {
      ps: ps || 'Unnamed font', family: pretty || 'Unknown', style: `${weightWord}${italic ? ' Italic' : ''}`,
      bold, italic, cat, size: r2(sizes[Math.floor(sizes.length / 2)] || 12),
      embedded: !fo.missing, sample: items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim().slice(0, 80),
    };
  }

  // Rank available fonts by name match, then by how closely they reproduce
  // the original text's widths.
  async function rankFonts(info, items) {
    const key = normName(info.family);
    const picks = new Map();
    for (const f of fonts.values()) {
      if (normName(f.name) === key && key) picks.set(f.id, { f, why: 'Exact match', rank: 0 });
    }
    for (const [re, ids] of FONT_ALIASES) {
      if (!re.test(key)) continue;
      ids.forEach((id, n) => { if (fonts.has(id) && !picks.has(id)) picks.set(id, { f: fonts.get(id), why: 'Common substitute', rank: 1 + n * 0.01 }); });
    }
    const sample = items.filter((i) => i.w > 0 && i.str.trim().length > 1).slice(0, 12);
    const probe = { bold: info.bold, italic: info.italic };
    const pool = [...fonts.values()].filter((f) => !f.system && (f.cat === info.cat || picks.has(f.id)));
    await Promise.all(pool.map((f) => loadFace(f, variantKey(f, probe))));
    const scored = [];
    for (const f of pool) {
      let ratio = 1;
      if (sample.length) {
        let measured = 0, actual = 0;
        for (const it of sample) {
          measureCtx.font = cssFont({ ...probe, font: f.id }, it.size);
          measured += measureCtx.measureText(it.str).width;
          actual += it.w;
        }
        ratio = measured / actual;
      }
      const similarity = Math.max(0, 1 - Math.abs(1 - ratio));
      const pick = picks.get(f.id);
      scored.push({ f, why: pick?.why ?? 'Similar width', rank: pick ? pick.rank : 2, similarity, ratio });
    }
    // System fonts appear only when the PDF names them.
    for (const p of picks.values()) if (p.f.system) scored.push({ ...p, similarity: null });
    scored.sort((a, b) => a.rank - b.rank || (b.similarity ?? 0) - (a.similarity ?? 0));
    return scored.slice(0, 5);
  }

  // Find the PDF text under a rectangle (PDF space) and group it by font.
  async function textInRect(p, r) {
    const items = await textItemsAsync(p);
    const hits = items.filter((it) => it.x < r.x + r.w && it.x + it.w > r.x
      && it.y - it.size * 0.25 < r.y && it.y + it.size * 0.85 > r.y - r.h);
    const groups = new Map();
    for (const it of hits) {
      const g = groups.get(it.fontName) ?? { items: [], chars: 0 };
      g.items.push(it);
      g.chars += it.str.length;
      groups.set(it.fontName, g);
    }
    return [...groups.values()].sort((a, b) => b.chars - a.chars);
  }

  function cropOriginal(p, r) {
    const v = views.get(p.id);
    if (!v?.canvas.width) return '';
    const dpr = v.canvas.width / v.vp.width;
    const pad = 3;
    const pts = [[r.x, r.y], [r.x + r.w, r.y - r.h]].map(([x, y]) => v.vp.convertToViewportPoint(x, y));
    const x0 = Math.max(0, Math.min(pts[0][0], pts[1][0]) - pad) * dpr, y0 = Math.max(0, Math.min(pts[0][1], pts[1][1]) - pad) * dpr;
    const w = Math.min(v.canvas.width - x0, (Math.abs(pts[1][0] - pts[0][0]) + 2 * pad) * dpr);
    const h = Math.min(v.canvas.height - y0, (Math.abs(pts[1][1] - pts[0][1]) + 2 * pad) * dpr);
    if (w < 2 || h < 2) return '';
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(v.canvas, x0, y0, w, h, 0, 0, w, h);
    return c.toDataURL('image/png');
  }

  let lastDetect = null;
  async function detectFont(p, r) {
    const groups = await textInRect(p, r);
    const panel = $('#fontPanel'), body = $('#fontPanelBody');
    panel.hidden = false;
    if (!groups.length) {
      lastDetect = null;
      body.innerHTML = '<p class="muted small">No text found there. Drag a box over some text in the PDF. Scanned pages have no text layer to read.</p>';
      return;
    }
    body.innerHTML = '<p class="muted small">Analyzing…</p>';
    const results = [];
    for (const g of groups.slice(0, 3)) {
      const info = describeFont(g.items);
      results.push({ info, ranked: await rankFonts(info, g.items) });
    }
    const box = groups[0].items.reduce((b, it) => ({
      x: Math.min(b.x, it.x), y: Math.max(b.y, it.y + it.size * 0.85),
      x2: Math.max(b.x2, it.x + it.w), y2: Math.min(b.y2, it.y - it.size * 0.25),
    }), { x: Infinity, y: -Infinity, x2: -Infinity, y2: Infinity });
    const crop = cropOriginal(p, { x: box.x, y: box.y, w: box.x2 - box.x, h: box.y - box.y2 });
    lastDetect = results;
    body.innerHTML = (crop ? `<div class="fp-label">Original</div><div class="fp-orig"><img src="${crop}" alt="Selected text from the PDF"></div>` : '')
      + results.map((res, gi) => {
        const { info, ranked } = res;
        return `<div class="fp-font">
          <div class="fp-name">${esc(info.family)} <span class="muted">${esc(info.style)}</span></div>
          <div class="fp-meta">${esc(info.ps)} · ${info.size}pt · ${info.cat === 'sans' ? 'sans serif' : info.cat === 'mono' ? 'monospace' : 'serif'}${info.embedded ? ' · embedded' : ' · not embedded'}</div>
          <div class="fp-label">Closest fonts you can use</div>
          ${ranked.map((c, ci) => {
            const meta = c.similarity == null ? c.why : `${c.why} · width ${Math.round(c.similarity * 100)}%`;
            const style = `font-family:${esc(c.f.css)};font-weight:${info.bold ? 700 : 400};font-style:${info.italic ? 'italic' : 'normal'}`;
            return `<div class="fp-cand">
              <div class="fp-cand-text"><div class="fp-sample" style="${style}">${esc(info.sample || 'The quick brown fox')}</div>
              <div class="fp-cand-meta"><strong>${esc(c.f.name)}</strong> · ${esc(meta)}</div></div>
              <button class="btn sm" data-use="${gi}:${ci}">Use</button></div>`;
          }).join('')}
        </div>`;
      }).join('')
      + (groups.length > 3 ? `<p class="muted small">${groups.length - 3} more fonts in the selection.</p>` : '');
  }

  // Apply a detected font: to the selected text, or as the default for new text.
  async function useDetected(gi, ci) {
    const res = lastDetect?.[gi];
    const c = res?.ranked[ci];
    if (!c) return;
    if (!(await chooseFont(c.f.id))) return;
    const props = { font: c.f.id, bold: res.info.bold, italic: res.info.italic, size: res.info.size };
    const an = editing?.an ?? findAnnot(state.selected);
    if (an?.type === 'text') {
      const before = editing ? null : snapshot();
      Object.assign(an, props);
      if (before) pushHistory('Change font', before);
      await ensureFont(an);
      drawAnnots(pageById(editing ? editing.pageId : state.selected.pageId));
      editing?.place();
      toast(`Applied ${c.f.name} ${props.size}pt to the selected text`);
    } else {
      Object.assign(TOOL_PROPS.text, props);
      setTool('text');
      ensureFont({ ...TOOL_PROPS.text });
      toast(`New text will use ${c.f.name} ${props.size}pt. Click where you want to type.`);
    }
    syncProps();
  }

  // "Match original text": copy font, size and baseline from the nearest PDF text.
  async function matchOriginalText() {
    const an = editing?.an ?? findAnnot(state.selected);
    if (an?.type !== 'text') return;
    const p = pageById(editing ? editing.pageId : state.selected.pageId);
    const items = await textItemsAsync(p);
    if (!items.length) { toast('No original text found on this page to match.'); return; }
    const base = an.y - ASC * an.size;
    let best = null, bd = Infinity;
    for (const it of items) {
      const dx = it.x > an.x ? it.x - an.x : Math.max(0, an.x - (it.x + it.w));
      const d = Math.abs(it.y - base) * 3 + dx;
      if (d < bd) { bd = d; best = it; }
    }
    const sameFont = items.filter((i) => i.fontName === best.fontName);
    const info = describeFont([best, ...sameFont.slice(0, 20)]);
    const top = (await rankFonts(info, [best, ...sameFont.slice(0, 20)])).find((c) => !c.f.system || c.f.bytes.r);
    const before = editing ? null : snapshot();
    an.size = r2(clamp(best.size, 4, 200));
    an.y = r2(best.y + ASC * an.size);
    if (top) Object.assign(an, { font: top.f.id, bold: info.bold, italic: info.italic });
    Object.assign(TOOL_PROPS.text, { size: an.size, font: an.font, bold: an.bold, italic: an.italic });
    if (before) pushHistory('Match text', before);
    await ensureFont(an);
    editing?.place();
    drawAnnots(p);
    syncProps();
    toast(`Matched ${info.family} ${Math.round(best.size * 10) / 10}pt${top ? `, using ${top.f.name}` : ''}`);
  }

  /* ---------- history ---------- */
  const snapshot = () => JSON.stringify({ pages: state.pages, formValues: state.formValues, meta: state.meta });
  function pushHistory(label, snap = snapshot()) {
    hist.undo.push({ label, snap });
    if (hist.undo.length > 200) { hist.undo.shift(); savedAt--; }
    hist.redo.length = 0;
    updateChrome();
  }
  function restore(snap) {
    const o = JSON.parse(snap);
    state.pages = o.pages;
    state.formValues = o.formValues;
    state.meta = o.meta ?? null;
    state.selected = null;
    state.pageSel.clear();
    rebuildAll();
    renderForms();
  }
  function undo() {
    finishEditing();
    const e = hist.undo.pop();
    if (!e) return;
    hist.redo.push({ label: e.label, snap: snapshot() });
    restore(e.snap);
    toast(`Undid ${e.label}`);
  }
  function redo() {
    finishEditing();
    const e = hist.redo.pop();
    if (!e) return;
    hist.undo.push({ label: e.label, snap: snapshot() });
    restore(e.snap);
    toast(`Redid ${e.label}`);
  }

  /* ---------- loading ---------- */
  function readFields(lib) {
    const fields = [], values = {};
    let list = [];
    try { list = lib.getForm().getFields(); } catch { /* no AcroForm */ }
    for (const f of list) {
      let entry;
      try {
        const name = f.getName();
        if (f instanceof PDFTextField) entry = { name, type: 'text', multiline: f.isMultiline(), value: f.getText() ?? '' };
        else if (f instanceof PDFCheckBox) entry = { name, type: 'checkbox', value: f.isChecked() };
        else if (f instanceof PDFDropdown || f instanceof PDFOptionList) entry = { name, type: 'choice', options: f.getOptions(), value: f.getSelected()[0] ?? '' };
        else if (f instanceof PDFRadioGroup) entry = { name, type: 'choice', options: f.getOptions(), value: f.getSelected() ?? '' };
        else continue;
        entry.readOnly = f.isReadOnly();
        entry.label = fieldLabel(f, name);
        entry.tooltip = entry.label !== null && !entry.label.startsWith('\u0000') && hasTooltip(f);
        try {
          const w = f.acroField.getWidgets()[0];
          const r = w.getRectangle();
          const ref = w.P();
          const pi = ref ? lib.getPages().findIndex((pg) => pg.ref === ref) : -1;
          if (pi >= 0) { entry.page = pi; entry.rect = { x: r.x, y: r.y, w: r.width, h: r.height }; }
        } catch { /* widget without position */ }
      } catch { continue; }
      values[entry.name] = entry.value;
      delete entry.value;
      fields.push(entry);
    }
    return { fields, values };
  }

  // Human label for a form field: its tooltip (/TU) if present, else the
  // last part of its name without XFA indexes like "[0]".
  function fieldLabel(f, name) {
    try {
      const tu = f.acroField.dict.lookup(PDFLib.PDFName.of('TU'));
      const text = tu?.decodeText?.().trim();
      if (text) return text.length > 90 ? `${text.slice(0, 88)}…` : text;
    } catch { /* no tooltip */ }
    const last = name.split('.').pop().replace(/\[\d+\]/g, '').replace(/[_-]+/g, ' ').trim();
    return last || name;
  }

  function hasTooltip(f) {
    try { return !!f.acroField.dict.lookup(PDFLib.PDFName.of('TU'))?.decodeText?.().trim(); } catch { return false; }
  }

  // Forms without tooltips: use the printed text nearest a field as its label
  // (above it, or to its left on the same line).
  async function labelFromPageText(fields, pp) {
    const byPage = new Map();
    for (const f of fields) if (!f.tooltip && f.rect) (byPage.get(f.page) ?? byPage.set(f.page, []).get(f.page)).push(f);
    for (const [pi, list] of byPage) {
      const items = (await pp[pi].getTextContent().catch(() => ({ items: [] }))).items
        .filter((i) => i.str.trim().length > 1)
        .map((i) => ({ x: i.transform[4], y: i.transform[5], w: i.width, str: i.str.trim() }));
      for (const f of list) {
        const { x, y, w, h } = f.rect;
        let best = null, bd = Infinity;
        for (const it of items) {
          const above = it.y >= y + h - 2 && it.y <= y + h + 28 && it.x < x + w && it.x + it.w > x - 10;
          const left = Math.abs(it.y - (y + h / 2)) < Math.max(8, h) && it.x + it.w <= x + 4 && it.x + it.w > x - 220;
          const right = f.type === 'checkbox' && Math.abs(it.y - y) < Math.max(8, h) && it.x >= x + w - 2 && it.x < x + w + 40;
          if (!above && !left && !right) continue;
          const d = right ? Math.abs(it.x - (x + w)) : left ? (x - (it.x + it.w)) + 5 : (it.y - (y + h)) * 2 + Math.abs(it.x - x) * 0.1;
          if (d < bd) { bd = d; best = it; }
        }
        if (best && /^[a-z(]/.test(best.str)) {
          // A wrapped label: start from the line above it.
          const head = items.find((it) => it.y > best.y && it.y <= best.y + 14 && Math.abs(it.x - best.x) < 80);
          if (head) best = { ...best, str: `${head.str} ${best.str}` };
        }
        if (best) {
          const t = best.str.replace(/^\d+[a-z]?\s+/, '').replace(/\s+/g, ' ');
          f.label = t.length > 70 ? `${t.slice(0, 68)}…` : t;
        }
      }
    }
  }

  async function loadSource(bytes, name) {
    let lib;
    try { lib = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }); }
    catch { throw new Error(`"${name}" is not a readable PDF.`); }
    if (lib.isEncrypted) throw new Error(`"${name}" is encrypted. Remove its password protection first, then open it again.`);
    // pdf.js transfers the buffer to its worker, so give it a copy.
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice(), fontExtraProperties: true }).promise;
    const pp = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)));
    const { fields, values } = readFields(lib);
    const info = (await pdf.getMetadata().catch(() => null))?.info ?? {};
    if (fields.length) await labelFromPageText(fields, pp);
    const src = { id: nid('s'), name, bytes, pdf, pp, fields, initial: values, info };
    state.sources.set(src.id, src);
    state.formValues[src.id] = { ...values };
    return src;
  }

  // items: [{ name, bytes }]; append = merge into the current document
  async function openItems(items, append) {
    finishEditing();
    const before = snapshot();
    const replace = !append || !state.pages.length;
    busy(true, 'Opening…');
    try {
      const loaded = [];
      for (const it of items) loaded.push(await loadSource(it.bytes, it.name));
      const newPages = loaded.flatMap((s) => s.pp.map((_, i) => ({ id: nid('p'), src: s.id, index: i, rot: 0, annots: [] })));
      if (replace) {
        for (const [id, s] of state.sources) {
          if (!loaded.includes(s)) { s.pdf.destroy(); state.sources.delete(id); delete state.formValues[id]; }
        }
        thumbCache.clear();
        state.pages = newPages;
        state.selected = null;
        state.pageSel.clear();
        state.current = 0;
        state.fileName = items[0].name;
        hist.undo.length = 0;
        hist.redo.length = 0;
        savedAt = 0;
        rebuildAll();
        $('#viewer').scrollTop = 0;
        fitWidth();
      } else {
        pushHistory(`Add ${newPages.length} page${newPages.length > 1 ? 's' : ''}`, before);
        state.pages.push(...newPages);
        rebuildAll();
        scrollToPage(newPages[0].id);
        toast(`Added ${newPages.length} page${newPages.length > 1 ? 's' : ''} from ${items.map((i) => i.name).join(', ')}`);
      }
      renderForms();
    } catch (e) {
      console.error(e);
      toast(e.message || 'Could not open that file.', 'error');
    } finally {
      busy(false);
    }
  }

  async function openFiles(files, append) {
    files = [...files];
    const pdfs = files.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (pdfs.length) {
      const items = [];
      for (const f of pdfs) items.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
      await openItems(items, append);
    }
    if (imgs.length && state.pages.length) for (const f of imgs) await addImageFile(f);
    else if (!pdfs.length) toast('Choose a PDF file.', 'error');
  }

  async function makeSample() {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0.12, 0.12, 0.18);
    const p1 = doc.addPage([612, 792]);
    p1.drawText('Sample agreement', { x: 72, y: 700, size: 26, font: bold, color: ink });
    const body = [
      'This sample shows what the editor can do. Try the tools in the toolbar:',
      'add text, highlight this sentence, draw, cover text with white-out,',
      'or place an image or signature. Fill in the form fields below from',
      'the Form fields panel, then download the result.',
    ];
    body.forEach((l, i) => p1.drawText(l, { x: 72, y: 660 - i * 18, size: 12, font, color: ink }));
    p1.drawText('Full name', { x: 72, y: 560, size: 11, font: bold, color: ink });
    p1.drawText('I agree to the terms', { x: 96, y: 503, size: 11, font, color: ink });
    p1.drawText('Signature', { x: 72, y: 430, size: 11, font: bold, color: ink });
    p1.drawLine({ start: { x: 72, y: 380 }, end: { x: 300, y: 380 }, thickness: 0.8, color: ink });
    const form = doc.getForm();
    form.createTextField('full_name').addToPage(p1, { x: 72, y: 528, width: 260, height: 24 });
    form.createCheckBox('agree').addToPage(p1, { x: 72, y: 500, width: 16, height: 16 });
    const p2 = doc.addPage([612, 792]);
    p2.drawText('Page two', { x: 72, y: 700, size: 26, font: bold, color: ink });
    p2.drawText('Reorder, rotate or delete pages from the sidebar.', { x: 72, y: 660, size: 12, font, color: ink });
    return doc.save();
  }

  /* ---------- viewer ---------- */
  function rebuildAll() {
    buildViewer();
    buildThumbs();
    updateChrome();
  }

  function buildViewer() {
    const viewer = $('#viewer');
    const ratio = viewer.scrollHeight ? viewer.scrollTop / viewer.scrollHeight : 0;
    io?.disconnect();
    for (const v of views.values()) v.task?.cancel();
    views.clear();
    const wrap = $('#pages');
    wrap.innerHTML = '';
    $('#empty').hidden = state.pages.length > 0;
    // Render pages near the viewport and free the ones far away, so long
    // documents (hundreds of pages) don't exhaust memory.
    io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const v = views.get(en.target.dataset.id);
        if (en.isIntersecting) renderCanvas(v);
        else if (v) releasePage(v);
      }
    }, { root: viewer, rootMargin: '1200px 0px' });
    for (const p of state.pages) {
      const vp = viewportFor(p, state.zoom);
      const el = document.createElement('div');
      el.className = 'page';
      el.dataset.id = p.id;
      el.style.width = `${vp.width}px`;
      el.style.height = `${vp.height}px`;
      el.style.setProperty('--scale-factor', state.zoom);
      const canvas = document.createElement('canvas');
      const textEl = document.createElement('div');
      textEl.className = 'textLayer';
      const linkEl = document.createElement('div');
      linkEl.className = 'link-layer';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('overlay');
      el.append(canvas, textEl, linkEl, svg);
      wrap.append(el);
      const v = { id: p.id, el, canvas, textEl, linkEl, svg, vp, key: null, task: null };
      views.set(p.id, v);
      svg.addEventListener('pointerdown', (e) => onPointerDown(e, p.id));
      svg.addEventListener('dblclick', (e) => onDoubleClick(e, p.id));
      drawAnnots(p);
      io.observe(el);
    }
    viewer.scrollTop = ratio * viewer.scrollHeight;
  }

  async function renderCanvas(v) {
    const p = v && pageById(v.id);
    if (!p) return;
    const key = `${state.zoom}|${p.rot}`;
    if (v.key === key) return;
    v.key = key;
    const dpr = window.devicePixelRatio || 1;
    const vp = viewportFor(p, state.zoom * dpr);
    v.task?.cancel();
    // Render offscreen, then swap, so a cancelled render never leaves a blank page.
    const off = document.createElement('canvas');
    off.width = Math.floor(vp.width);
    off.height = Math.floor(vp.height);
    const task = srcPage(p).render({ canvasContext: off.getContext('2d'), viewport: vp });
    v.task = task;
    try {
      await task.promise;
      if (v.task !== task) return;
      v.canvas.width = off.width;
      v.canvas.height = off.height;
      v.canvas.getContext('2d').drawImage(off, 0, 0);
      off.width = 0;
      await renderPageLayers(v, p);
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') console.error(e);
    }
  }

  function releasePage(v) {
    v.task?.cancel();
    v.task = null;
    v.key = null;
    v.canvas.width = 0;
    v.canvas.height = 0;
    v.textEl.replaceChildren();
    v.linkEl.replaceChildren();
  }

  // Selectable text (pdf.js text layer) and clickable links for one page.
  async function renderPageLayers(v, p) {
    const vp = viewportFor(p, state.zoom);
    const pg = srcPage(p);
    v.textEl.replaceChildren();
    try {
      await pdfjsLib.renderTextLayer({ textContentSource: pg.streamTextContent(), container: v.textEl, viewport: vp, textDivs: [] }).promise;
      const end = document.createElement('div');
      end.className = 'endOfContent';
      v.textEl.append(end);
    } catch (e) { console.warn('Text layer failed', e); }
    v.linkEl.replaceChildren();
    try {
      const src = state.sources.get(p.src);
      for (const a of await pg.getAnnotations()) {
        if (a.subtype !== 'Link' || (!a.url && !a.dest)) continue;
        const [x1, y1, x2, y2] = vp.convertToViewportRectangle(a.rect);
        const link = document.createElement('a');
        Object.assign(link.style, { left: `${Math.min(x1, x2)}px`, top: `${Math.min(y1, y2)}px`, width: `${Math.abs(x2 - x1)}px`, height: `${Math.abs(y2 - y1)}px` });
        if (a.url) {
          link.href = a.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.title = a.url;
        } else {
          link.href = '#';
          link.title = 'Go to destination';
          link.addEventListener('click', (e) => { e.preventDefault(); goDest(src, a.dest); });
        }
        v.linkEl.append(link);
      }
    } catch (e) { console.warn('Links failed', e); }
  }

  function annotSvg(an) {
    const op = an.opacity ?? 1;
    const id = `data-id="${an.id}"`;
    switch (an.type) {
      case 'text': {
        if (editing?.an.id === an.id) return '';
        const b = textBox(an);
        const spans = b.lines.map((l, i) => `<tspan x="0" y="${ASC * an.size + i * LH * an.size}">${esc(l) || ' '}</tspan>`).join('');
        return `<g ${id} transform="translate(${an.x} ${an.y}) scale(1 -1)" opacity="${op}">`
          + `<rect width="${b.w}" height="${b.h}" fill="transparent"/>`
          + `<text ${svgFontAttrs(an)} font-size="${an.size}" fill="${an.color}" style="white-space:pre;font-synthesis:none">${spans}</text></g>`;
      }
      case 'rect':
        return `<g ${id} transform="translate(${an.x} ${an.y}) scale(1 -1)"><rect width="${an.w}" height="${an.h}" fill="transparent" stroke="${an.color}" stroke-width="${an.size}" stroke-opacity="${op}"/></g>`;
      case 'highlight':
        return `<g ${id} transform="translate(${an.x} ${an.y}) scale(1 -1)"><rect width="${an.w}" height="${an.h}" fill="${an.color}" fill-opacity="${op}" style="mix-blend-mode:multiply"/></g>`;
      case 'whiteout':
        return `<g ${id} transform="translate(${an.x} ${an.y}) scale(1 -1)"><rect width="${an.w}" height="${an.h}" fill="${an.color}"/></g>`;
      case 'image': {
        const im = state.images.get(an.img);
        return `<g ${id} transform="translate(${an.x} ${an.y}) scale(1 -1)" opacity="${op}"><image href="${im?.url ?? ''}" width="${an.w}" height="${an.h}" preserveAspectRatio="none"/></g>`;
      }
      case 'draw': {
        const d = an.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('');
        const hit = Math.max(an.size, 8 / state.zoom);
        return `<g ${id}><path d="${d}" fill="none" stroke="transparent" stroke-width="${hit}" stroke-linecap="round"/>`
          + `<path d="${d}" fill="none" stroke="${an.color}" stroke-opacity="${op}" stroke-width="${an.size}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
      }
      case 'line': {
        const hit = Math.max(an.size, 8 / state.zoom);
        const xy = `x1="${an.x1}" y1="${an.y1}" x2="${an.x2}" y2="${an.y2}"`;
        return `<g ${id}><line ${xy} stroke="transparent" stroke-width="${hit}"/>`
          + `<line ${xy} stroke="${an.color}" stroke-opacity="${op}" stroke-width="${an.size}" stroke-linecap="round"/></g>`;
      }
      case 'arrow': {
        const hit = Math.max(an.size, 8 / state.zoom);
        const [h1, h2] = arrowHead(an);
        const d = `M${an.x1} ${an.y1}L${an.x2} ${an.y2}M${h1[0]} ${h1[1]}L${an.x2} ${an.y2}L${h2[0]} ${h2[1]}`;
        return `<g ${id}><path d="${d}" fill="none" stroke="transparent" stroke-width="${hit}"/>`
          + `<path d="${d}" fill="none" stroke="${an.color}" stroke-opacity="${op}" stroke-width="${an.size}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
      }
      case 'ellipse':
        return `<g ${id} transform="translate(${an.x} ${an.y}) scale(1 -1)"><ellipse cx="${an.w / 2}" cy="${an.h / 2}" rx="${an.w / 2}" ry="${an.h / 2}" fill="transparent" stroke="${an.color}" stroke-width="${an.size}" stroke-opacity="${op}"/></g>`;
      case 'stamp': {
        const sw = Math.min(an.w, an.h) * 0.13;
        const glyph = an.kind === 'dot'
          ? `<circle cx="${an.w / 2}" cy="${an.h / 2}" r="${Math.min(an.w, an.h) * 0.3}" fill="${an.color}"/>`
          : `<path d="${stampPath(an)}" fill="none" stroke="${an.color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
        return `<g ${id} transform="translate(${an.x} ${an.y}) scale(1 -1)" opacity="${op}"><rect width="${an.w}" height="${an.h}" fill="transparent"/>${glyph}</g>`;
      }
      case 'markup': {
        const parts = an.rects.map((r) => {
          const hitRect = `<rect x="${r.x}" y="${r.y - r.h}" width="${r.w}" height="${r.h}" fill="transparent"/>`;
          if (an.style === 'highlight') return `<rect x="${r.x}" y="${r.y - r.h}" width="${r.w}" height="${r.h}" fill="${an.color}" fill-opacity="${op}" style="mix-blend-mode:multiply"/>`;
          const t = Math.max(0.8, r.h * 0.07);
          const ly = an.style === 'underline' ? r.y - r.h + t : r.y - r.h / 2;
          return `${hitRect}<line x1="${r.x}" y1="${ly}" x2="${r.x + r.w}" y2="${ly}" stroke="${an.color}" stroke-opacity="${op}" stroke-width="${t}"/>`;
        }).join('');
        return `<g ${id}>${parts}</g>`;
      }
      case 'note': {
        const s = NOTE_SIZE;
        return `<g ${id} transform="translate(${an.x} ${an.y}) scale(1 -1)">`
          + `<path d="M1 1h${s - 2}v${s * 0.65}l-${s * 0.3} ${s * 0.3}H1z" fill="${an.color}" stroke="#a16207" stroke-width="0.9" stroke-linejoin="round"/>`
          + `<path d="M${s * 0.22} ${s * 0.32}h${s * 0.56}M${s * 0.22} ${s * 0.5}h${s * 0.4}" stroke="#713f12" stroke-width="1.1" stroke-linecap="round"/></g>`;
      }
      default: return '';
    }
  }

  function drawAnnots(p) {
    const v = p && views.get(p.id);
    if (!v) return;
    v.vp = viewportFor(p, state.zoom);
    const { width, height, transform: t } = v.vp;
    v.svg.setAttribute('width', width);
    v.svg.setAttribute('height', height);
    v.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    let html = `<g transform="matrix(${t.join(' ')})">`;
    for (const an of p.annots) html += annotSvg(an);
    if (state.search) {
      state.search.hits.forEach((h, k) => {
        if (h.pageId === p.id) html += `<rect class="search-hit${k === state.search.idx ? ' cur' : ''}" x="${h.x}" y="${h.y - h.h}" width="${h.w}" height="${h.h}"/>`;
      });
    }
    const ff = state.fieldFocus;
    if (ff?.pageId === p.id) html += `<rect class="field-focus" x="${ff.x - 2}" y="${ff.y - 2}" width="${ff.w + 4}" height="${ff.h + 4}" vector-effect="non-scaling-stroke"/>`;
    const dr = state.detect;
    if (dr?.pageId === p.id && dr.w > 2) {
      html += `<g transform="translate(${dr.x} ${dr.y}) scale(1 -1)"><rect class="detect-rect" width="${dr.w}" height="${dr.h}" vector-effect="non-scaling-stroke"/></g>`;
    }
    const g = state.guides;
    if (g?.pageId === p.id) {
      const [x0, y0, x1, y1] = srcPage(p).view;
      const ln = (a, b, c, d) => `<line class="guide" x1="${a}" y1="${b}" x2="${c}" y2="${d}" vector-effect="non-scaling-stroke"/>`;
      if (g.y !== null) html += ln(x0, g.y, x1, g.y);
      if (g.x !== null) html += ln(g.x, y0, g.x, y1);
    }
    const sel =state.selected?.pageId === p.id && findAnnot(state.selected);
    if (sel && editing?.an !== sel) {
      const b = bbox(sel);
      const pad = 3 / state.zoom;
      html += `<g transform="translate(${b.x} ${b.y}) scale(1 -1)">`
        + `<rect class="sel" x="${-pad}" y="${-pad}" width="${b.w + 2 * pad}" height="${b.h + 2 * pad}" vector-effect="non-scaling-stroke" stroke-width="1.5" pointer-events="none"/>`;
      if (BOX_TYPES.has(sel.type) || sel.type === 'text') {
        html += `<circle class="handle" data-handle="se" cx="${b.w + pad}" cy="${b.h + pad}" r="${6 / state.zoom}" vector-effect="non-scaling-stroke" stroke-width="1.5"/>`;
      }
      html += '</g>';
    }
    v.svg.innerHTML = `${html}</g>`;
  }

  function toPdf(v, e) {
    const r = v.svg.getBoundingClientRect();
    const [x, y] = v.vp.convertToPdfPoint(e.clientX - r.left, e.clientY - r.top);
    return { x, y };
  }

  /* ---------- pointer interaction ---------- */
  function onPointerDown(e, pageId) {
    if (e.button !== 0) return;
    const p = pageById(pageId), v = views.get(pageId);
    if (!p || !v) return;
    if (editing) { editing.commit(); if (state.tool === 'text') return; }
    e.preventDefault();
    setCurrent(pageIndex(pageId));
    const pt = toPdf(v, e);
    const tool = state.tool;
    const target = e.target.closest('[data-id]');
    const targetAn = target && p.annots.find((a) => a.id === target.dataset.id);

    if (tool === 'select') {
      if (e.target.closest('[data-handle]') && state.selected) {
        startDrag('resize', p, findAnnot(state.selected), pt, snapshot());
      } else if (targetAn) {
        select(p.id, targetAn.id);
        startDrag('move', p, targetAn, pt, snapshot());
      } else {
        select(null);
      }
      return;
    }
    if (tool === 'detect') { startDetect(p, pt); return; }
    select(null);
    if (tool === 'note') {
      const an = { id: nid('a'), type: 'note', x: r2(pt.x - NOTE_SIZE / 2), y: r2(pt.y + NOTE_SIZE / 2), text: '',
        author: state.author, date: new Date().toISOString(), ...TOOL_PROPS.note };
      openNote(p, an, true);
      return;
    }
    if (STAMP_TOOLS.has(tool)) {
      const sz = 14;
      const an = { id: nid('a'), type: 'stamp', kind: tool, x: r2(pt.x - sz / 2), y: r2(pt.y + sz / 2), w: sz, h: sz, ...TOOL_PROPS[tool] };
      pushHistory(`Add ${tool === 'dot' ? 'dot' : `${tool} mark`}`);
      p.annots.push(an);
      select(p.id, an.id);
      return;
    }
    if (tool === 'date') {
      const t = TOOL_PROPS.text;
      const an = { id: nid('a'), type: 'text', x: r2(pt.x), y: r2(pt.y + t.size * 0.6), text: new Date().toLocaleDateString(), ...t };
      pushHistory('Add date');
      p.annots.push(an);
      ensureFont(an);
      select(p.id, an.id);
      return;
    }
    if (tool === 'text') {
      if (targetAn?.type === 'text') openTextEditor(p, targetAn, false);
      else openTextEditor(p, { id: nid('a'), type: 'text', x: r2(pt.x), y: r2(pt.y), text: '', ...TOOL_PROPS.text }, true);
      return;
    }
    const before = snapshot();
    const props = { ...TOOL_PROPS[tool] };
    let an;
    if (tool === 'draw') an = { id: nid('a'), type: 'draw', pts: [[r2(pt.x), r2(pt.y)]], ...props };
    else if (tool === 'line' || tool === 'arrow') an = { id: nid('a'), type: tool, x1: r2(pt.x), y1: r2(pt.y), x2: r2(pt.x), y2: r2(pt.y), ...props };
    else an = { id: nid('a'), type: tool, x: r2(pt.x), y: r2(pt.y), w: 0, h: 0, ...props };
    p.annots.push(an);
    startDrag('create', p, an, pt, before);
  }

  function onDoubleClick(e, pageId) {
    if (state.tool !== 'select') return;
    const p = pageById(pageId);
    const target = e.target.closest('[data-id]');
    const an = target && p?.annots.find((a) => a.id === target.dataset.id);
    if (an?.type === 'text') openTextEditor(p, an, false);
  }

  function startDetect(p, start) {
    const v = views.get(p.id);
    state.detect = null;
    const move = (e) => {
      const pt = toPdf(v, e);
      state.detect = { pageId: p.id, x: Math.min(start.x, pt.x), y: Math.max(start.y, pt.y), w: Math.abs(pt.x - start.x), h: Math.abs(pt.y - start.y) };
      drawAnnots(p);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // A plain click inspects the text under the pointer.
      if (!state.detect || state.detect.w * state.zoom < 3) state.detect = { pageId: p.id, x: start.x - 1, y: start.y + 1, w: 2, h: 2 };
      drawAnnots(p);
      detectFont(p, state.detect);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function startDrag(kind, p, an, pt, before) {
    if (!an) return;
    drag = { kind, pageId: p.id, an, start: pt, orig: structuredClone(an), before, moved: false };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function moveAnnot(an, o, dx, dy) {
    if (an.type === 'draw') an.pts = o.pts.map(([x, y]) => [r2(x + dx), r2(y + dy)]);
    else if (an.type === 'markup') an.rects = o.rects.map((r) => ({ ...r, x: r2(r.x + dx), y: r2(r.y + dy) }));
    else if (an.type === 'line' || an.type === 'arrow') Object.assign(an, { x1: r2(o.x1 + dx), y1: r2(o.y1 + dy), x2: r2(o.x2 + dx), y2: r2(o.y2 + dy) });
    else Object.assign(an, { x: r2(o.x + dx), y: r2(o.y + dy) });
  }

  function resizeAnnot(an, o, pt, free) {
    if (an.type === 'text') {
      const w0 = textBox(o).w;
      an.size = r2(clamp(o.size * Math.max(4, pt.x - o.x) / w0, 4, 200));
      return;
    }
    const w = Math.max(4, pt.x - o.x);
    let h = Math.max(4, o.y - pt.y);
    if (an.type === 'image' && !free) h = w * o.h / o.w;
    an.w = r2(w);
    an.h = r2(h);
  }

  function onPointerMove(e) {
    if (!drag) return;
    const v = views.get(drag.pageId);
    if (!v) return;
    const pt = toPdf(v, e);
    const { an, orig, start } = drag;
    const dx = pt.x - start.x, dy = pt.y - start.y;
    if (Math.hypot(dx, dy) * state.zoom > 2) drag.moved = true;
    if (drag.kind === 'move') {
      moveAnnot(an, orig, dx, dy);
      if (an.type === 'text') {
        const s = snapText(pageById(drag.pageId), an, an.x, an.y, e.altKey);
        an.x = r2(s.x);
        an.y = r2(s.y);
        state.guides = s.guides;
      }
    }
    else if (drag.kind === 'resize') resizeAnnot(an, orig, pt, e.shiftKey);
    else if (an.type === 'draw') {
      const last = an.pts[an.pts.length - 1];
      if (Math.hypot(pt.x - last[0], pt.y - last[1]) * state.zoom > 1.5) an.pts.push([r2(pt.x), r2(pt.y)]);
    } else if (an.type === 'line' || an.type === 'arrow') {
      let { x, y } = pt;
      if (e.shiftKey) {
        const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(dx, dy);
        x = start.x + Math.cos(ang) * len;
        y = start.y + Math.sin(ang) * len;
      }
      an.x2 = r2(x);
      an.y2 = r2(y);
    } else {
      Object.assign(an, { x: r2(Math.min(start.x, pt.x)), y: r2(Math.max(start.y, pt.y)), w: r2(Math.abs(dx)), h: r2(Math.abs(dy)) });
    }
    drawAnnots(pageById(drag.pageId));
  }

  const LABELS = { text: 'text', highlight: 'highlight', draw: 'drawing', line: 'line', rect: 'rectangle', whiteout: 'white-out', image: 'image',
    ellipse: 'ellipse', arrow: 'arrow', stamp: 'mark', markup: 'markup', note: 'note' };

  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    const d = drag;
    drag = null;
    state.guides = null;
    const p = d && pageById(d.pageId);
    if (!p) return;
    if (d.kind === 'create') {
      const b = bbox(d.an);
      const tooSmall = d.an.type === 'draw' ? d.an.pts.length < 2
        : d.an.type === 'line' || d.an.type === 'arrow' ? Math.hypot(d.an.x2 - d.an.x1, d.an.y2 - d.an.y1) * state.zoom < 4
          : Math.max(b.w, b.h) * state.zoom < 4;
      if (tooSmall) p.annots = p.annots.filter((a) => a !== d.an);
      else pushHistory(`Add ${LABELS[d.an.type]}`, d.before);
    } else if (d.moved) {
      pushHistory(`${d.kind === 'move' ? 'Move' : 'Resize'} ${LABELS[d.an.type]}`, d.before);
    } else if (d.kind === 'move' && d.an.type === 'note') {
      openNote(p, d.an, false); // a click (not a drag) on a note opens it
    }
    drawAnnots(p);
    syncProps();
  }

  function select(pageId, annotId) {
    const prev = state.selected;
    state.selected = pageId ? { pageId, annotId } : null;
    if (prev && prev.pageId !== pageId) drawAnnots(pageById(prev.pageId));
    if (pageId) drawAnnots(pageById(pageId));
    syncProps();
  }

  function deleteSelected() {
    const an = findAnnot(state.selected);
    if (!an) return;
    const p = pageById(state.selected.pageId);
    pushHistory(`Delete ${LABELS[an.type]}`);
    p.annots = p.annots.filter((a) => a !== an);
    select(null);
  }

  function nudgeSelected(dx, dy) {
    const an = findAnnot(state.selected);
    if (!an) return;
    pushHistory(`Move ${LABELS[an.type]}`);
    moveAnnot(an, structuredClone(an), dx, dy);
    drawAnnots(pageById(state.selected.pageId));
  }

  /* ---------- text editing ---------- */
  function openTextEditor(p, an, isNew) {
    finishEditing();
    const v = views.get(p.id);
    if (!v) return;
    const before = snapshot();
    const origJson = JSON.stringify(an);
    if (isNew) p.annots.push(an);
    const ta = document.createElement('textarea');
    ta.className = 'text-editor';
    ta.value = an.text;
    ta.setAttribute('aria-label', 'Text');
    textItems(p); // warm the snapping cache
    const grip = document.createElement('div');
    grip.className = 'text-grip';
    grip.title = 'Drag to move. Snaps to the original text; hold Alt to place freely.';
    grip.innerHTML = `${icon('move')}<span>Move</span>`;
    const place = () => {
      const [sx, sy] = v.vp.convertToViewportPoint(an.x, an.y);
      const fs = an.size * state.zoom;
      const b = textBox(an, ta.value || ' ');
      // Put the textarea's first baseline exactly where the SVG/PDF baseline will be,
      // so the text doesn't jump when editing ends.
      measureCtx.font = cssFont(an, fs);
      const m = measureCtx.measureText('Hg');
      const fa = m.fontBoundingBoxAscent ?? fs * 0.77, fd = m.fontBoundingBoxDescent ?? fs * 0.23;
      const baseInBox = (LH * fs - (fa + fd)) / 2 + fa;
      const left = sx - 1, top = sy + ASC * fs - baseInBox - 1; // -1 for the border
      Object.assign(ta.style, {
        left: `${left}px`, top: `${top}px`, font: cssFont(an, fs), lineHeight: String(LH),
        color: an.color, width: `${b.w * state.zoom + fs}px`, height: `${b.lines.length * LH * fs + 2}px`,
      });
      Object.assign(grip.style, { left: `${left}px`, top: `${top}px` });
    };
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); // keep focus in the textarea
      e.stopPropagation();
      grip.setPointerCapture(e.pointerId);
      const start = toPdf(v, e), ox = an.x, oy = an.y;
      const move = (ev) => {
        const pt = toPdf(v, ev);
        const s = snapText(p, an, ox + pt.x - start.x, oy + pt.y - start.y, ev.altKey);
        an.x = r2(s.x);
        an.y = r2(s.y);
        state.guides = s.guides;
        place();
        drawAnnots(p);
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        state.guides = null;
        drawAnnots(p);
        ta.focus({ preventScroll: true });
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
    const finish = (keep) => {
      if (editing?.ta !== ta) return;
      editing = null;
      ta.remove();
      grip.remove();
      const text = ta.value.replace(/\s+$/, '');
      if (!keep || !text) {
        p.annots = p.annots.filter((a) => a !== an);
        if (!isNew) pushHistory('Delete text', before);
      } else {
        an.text = text;
        if (isNew || JSON.stringify(an) !== origJson) pushHistory(isNew ? 'Add text' : 'Edit text', before);
      }
      drawAnnots(p);
      // Keep the text selected (any tool) so the options bar edits it.
      if (keep && text) select(p.id, an.id);
      else syncProps();
    };
    editing = { an, pageId: p.id, ta, place, commit: () => finish(true), discard: () => finish(false) };
    ta.addEventListener('input', place);
    ta.addEventListener('blur', () => finish(true));
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); finish(true); }
    });
    v.el.append(ta, grip);
    place();
    drawAnnots(p);
    syncProps();
    ta.focus({ preventScroll: true });
  }
  const finishEditing = () => { editing?.commit(); notePop?.close(); };

  /* ---------- sticky notes ---------- */
  let notePop = null;
  function openNote(p, an, isNew) {
    finishEditing();
    const v = views.get(p.id);
    if (!v) return;
    const before = snapshot();
    if (isNew) { p.annots.push(an); drawAnnots(p); }
    const el = document.createElement('div');
    el.className = 'note-pop';
    const when = new Date(an.date || Date.now()).toLocaleString();
    el.innerHTML = `<header><strong>${esc(an.author || state.author)}</strong><span>${esc(when)}</span></header>
      <textarea aria-label="Note text" placeholder="Write a comment…"></textarea>
      <div class="row"><button type="button" class="btn sm" data-act="del">Delete</button><button type="button" class="btn sm" data-act="ok">Done</button></div>`;
    const ta = $('textarea', el);
    ta.value = an.text || '';
    const [sx, sy] = v.vp.convertToViewportPoint(an.x + NOTE_SIZE, an.y);
    el.style.left = `${Math.min(sx + 6, v.vp.width - 250)}px`;
    el.style.top = `${Math.max(0, sy)}px`;
    let closed = false;
    const close = (remove = false) => {
      if (closed) return;
      closed = true;
      notePop = null;
      el.remove();
      const text = ta.value.trim();
      if (remove || (isNew && !text)) {
        p.annots = p.annots.filter((a) => a !== an);
        if (!isNew) pushHistory('Delete note', before);
        select(null);
      } else if (isNew || text !== an.text) {
        an.text = text;
        pushHistory(isNew ? 'Add note' : 'Edit note', before);
        select(p.id, an.id);
      }
      drawAnnots(p);
      renderComments();
    };
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'del') close(true);
      else if (act === 'ok') close();
    });
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); close(); }
    });
    notePop = { close: () => close() };
    v.el.append(el);
    ta.focus({ preventScroll: true });
  }

  /* ---------- text-selection markups ---------- */
  // Turn the browser's text selection (over the pdf.js text layer) into
  // highlight / underline / strikethrough annotations, one per page.
  function markupFromSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !MARKUP_TOOLS.has(state.tool)) return false;
    const rects = [];
    for (let i = 0; i < sel.rangeCount; i++) rects.push(...sel.getRangeAt(i).getClientRects());
    const perPage = new Map();
    for (const r of rects) {
      if (r.width < 1 || r.height < 1) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      for (const v of views.values()) {
        const b = v.el.getBoundingClientRect();
        if (cx < b.left || cx > b.right || cy < b.top || cy > b.bottom) continue;
        const corners = [[r.left, r.top], [r.right, r.bottom]].map(([x, y]) => v.vp.convertToPdfPoint(x - b.left, y - b.top));
        const x = Math.min(corners[0][0], corners[1][0]), x2 = Math.max(corners[0][0], corners[1][0]);
        const y = Math.max(corners[0][1], corners[1][1]), y2 = Math.min(corners[0][1], corners[1][1]);
        if (!perPage.has(v.id)) perPage.set(v.id, []);
        perPage.get(v.id).push({ x: r2(x), y: r2(y), w: r2(x2 - x), h: r2(y - y2) });
        break;
      }
    }
    sel.removeAllRanges();
    if (!perPage.size) return false;
    const style = { hltext: 'highlight', underline: 'underline', strike: 'strike' }[state.tool];
    pushHistory(`Add ${style === 'strike' ? 'strikethrough' : style}`);
    for (const [pageId, list] of perPage) {
      // Merge pieces that sit on the same line and touch.
      list.sort((a, b) => b.y - a.y || a.x - b.x);
      const merged = [];
      for (const r of list) {
        const m = merged.find((q) => Math.abs(q.y - r.y) < r.h * 0.5 && Math.abs(q.h - r.h) < r.h * 0.5 && r.x <= q.x + q.w + 2);
        if (m) { const x2 = Math.max(m.x + m.w, r.x + r.w); m.x = Math.min(m.x, r.x); m.w = r2(x2 - m.x); m.h = Math.max(m.h, r.h); m.y = Math.max(m.y, r.y); }
        else merged.push({ ...r });
      }
      const p = pageById(pageId);
      p.annots.push({ id: nid('a'), type: 'markup', style, rects: merged, ...TOOL_PROPS[state.tool] });
      drawAnnots(p);
    }
    renderComments();
    return true;
  }

  /* ---------- tools & props ---------- */
  function setTool(t) {
    finishEditing();
    state.tool = t;
    $$('.tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    $('#viewer').dataset.tool = t;
    if (t !== 'select') select(null);
    else syncProps();
    const hints = {
      hltext: 'Select text in the PDF to highlight it', underline: 'Select text in the PDF to underline it',
      strike: 'Select text in the PDF to strike it through', note: 'Click where you want to add a note',
      detect: 'Drag a box over text in the PDF to identify its font', hand: 'Drag to scroll the document',
      date: "Click to insert today's date", select: 'Select text to copy it, or click an item you added to change it',
    };
    $('#propsHint').textContent = hints[t] ?? '';
  }
  const propsKey = (t) => (t === 'date' ? 'text' : t);

  function syncProps() {
    const an = editing?.an ?? findAnnot(state.selected);
    const type = an ? an.type : state.tool;
    const vals = an ?? TOOL_PROPS[propsKey(state.tool)] ?? {};
    const fields = PROP_FIELDS[type] ?? [];
    $$('.prop').forEach((el) => { el.hidden = !fields.includes(el.dataset.prop); });
    if (vals.color) $('#propColor').value = vals.color;
    const size = $('#propSize');
    if (type === 'text') Object.assign(size, { min: 4, max: 200, step: 1 });
    else Object.assign(size, { min: 0.5, max: 30, step: 0.5 });
    const idle = (el) => document.activeElement !== el; // don't fight the user's typing
    if (vals.size != null && idle(size)) size.value = vals.size;
    if (vals.opacity != null && idle($('#propOpacity'))) $('#propOpacity').value = vals.opacity;
    if (vals.font) $('#propFont').value = fontOf(vals).id;
    $('#propBold').setAttribute('aria-pressed', String(!!vals.bold));
    $('#propItalic').setAttribute('aria-pressed', String(!!vals.italic));
    $('#sizeLabel').textContent = type === 'text' ? 'Size' : 'Stroke';
    size.setAttribute('list', type === 'text' ? 'sizeList' : 'strokeList');
    size.closest('.prop').title = type === 'text' ? 'Font size (pt)' : 'Stroke width (pt)';
    $('#btnDeleteAnnot').hidden = !an || !!editing;
    $('#propsHint').hidden = fields.length > 0 || !!an;
    $('#btnMatchText').hidden = an?.type !== 'text';
    const names = { text: 'Text', highlight: 'Highlight', draw: 'Draw', line: 'Line', rect: 'Shape', whiteout: 'White-out', image: 'Image' };
    $('#propsTitle').textContent = an ? `Selected ${(names[type] || 'item').toLowerCase()}` : names[type] ? `${names[type]} options` : 'Options';
  }

  const NUMERIC_PROPS = new Set(['size', 'opacity']);
  // Discrete props (font, bold, italic) are recorded in history immediately.
  function applyProp(name, raw, discrete = false) {
    const value = NUMERIC_PROPS.has(name) ? parseFloat(raw) : raw;
    if (NUMERIC_PROPS.has(name) && !(value > 0)) return;
    const an = editing?.an ?? findAnnot(state.selected);
    if (an) {
      if (!editing && !propBefore) propBefore = snapshot();
      an[name] = value;
      if (TOOL_PROPS[an.type]) TOOL_PROPS[an.type][name] = value;
      if (editing) editing.place();
      drawAnnots(pageById(editing ? editing.pageId : state.selected.pageId));
      if (an.type === 'text') ensureFont(an);
      if (discrete) commitProp();
    } else if (TOOL_PROPS[propsKey(state.tool)]) {
      TOOL_PROPS[propsKey(state.tool)][name] = value;
      if (propsKey(state.tool) === 'text') ensureFont(TOOL_PROPS.text);
    }
    syncProps();
  }
  function commitProp() {
    if (propBefore) {
      const an = findAnnot(state.selected);
      pushHistory(`Style ${an ? LABELS[an.type] : 'annotation'}`, propBefore);
      propBefore = null;
    }
  }

  /* ---------- zoom & navigation ---------- */
  function setZoom(z) {
    finishEditing();
    z = clamp(Math.round(z * 100) / 100, ZOOM_MIN, ZOOM_MAX);
    if (z === state.zoom) return;
    state.zoom = z;
    buildViewer();
    updateChrome();
  }
  const zoomBy = (f) => setZoom(state.zoom * f);
  function fitWidth() {
    const p = state.pages[state.current] ?? state.pages[0];
    if (!p) return;
    const avail = $('#viewer').clientWidth - 48;
    setZoom(clamp(avail / viewportFor(p, 1).width, ZOOM_MIN, 3));
  }

  function setCurrent(i) {
    if (i < 0 || i >= state.pages.length) return;
    const changed = i !== state.current;
    state.current = i;
    if (document.activeElement !== $('#pageInput')) $('#pageInput').value = String(i + 1);
    if (!changed) return;
    $$('#thumbList .thumb').forEach((t, k) => t.classList.toggle('current', k === i));
    $$('#thumbList .thumb')[i]?.scrollIntoView({ block: 'nearest' });
  }

  function updateCurrentFromScroll() {
    const viewer = $('#viewer');
    const mark = viewer.scrollTop + viewer.clientHeight / 3;
    let best = 0;
    state.pages.forEach((p, i) => {
      const el = views.get(p.id)?.el;
      if (el && el.offsetTop <= mark) best = i;
    });
    setCurrent(best);
  }

  function scrollToPage(id) {
    const v = views.get(id);
    if (v) $('#viewer').scrollTo({ top: v.el.offsetTop - 16, behavior: 'smooth' });
    setCurrent(pageIndex(id));
  }

  function updateChrome() {
    const has = state.pages.length > 0;
    $$('[data-needs-doc]').forEach((b) => { b.disabled = !has; });
    const u = hist.undo[hist.undo.length - 1], r = hist.redo[hist.redo.length - 1];
    $('#btnUndo').disabled = !u;
    $('#btnRedo').disabled = !r;
    $('#btnUndo').title = u ? `Undo ${u.label} (Ctrl/Cmd+Z)` : 'Undo (Ctrl/Cmd+Z)';
    $('#btnRedo').title = r ? `Redo ${r.label} (Ctrl/Cmd+Shift+Z)` : 'Redo (Ctrl/Cmd+Shift+Z)';
    const zs = $('#zoomSelect');
    const zv = String(state.zoom);
    if (![...zs.options].some((o) => o.value === zv)) {
      zs.querySelector('[data-custom]')?.remove();
      const opt = new Option(`${Math.round(state.zoom * 100)}%`, zv);
      opt.dataset.custom = '1';
      opt.hidden = true;
      zs.add(opt);
    }
    zs.value = zv;
    if (document.activeElement !== $('#pageInput')) $('#pageInput').value = has ? String(state.current + 1) : '';
    $('#pageCount').textContent = `/ ${state.pages.length}`;
    $('#pagebar').hidden = !has || state.mode === 'organize';
    $('#thumbHint').hidden = !has;
    const dirty = hist.undo.length !== savedAt;
    $('#docTab').hidden = !has;
    $('#docName').textContent = state.fileName;
    $('#docDot').hidden = !dirty;
    $('#docTab').title = dirty ? `${state.fileName} (unsaved changes)` : state.fileName;
    document.title = has ? `${dirty ? '• ' : ''}${state.fileName} · PDF Editor` : 'PDF Editor';
    updateBulk();
    renderComments();
  }

  /* ---------- pages sidebar ---------- */
  let thumbChain = Promise.resolve();
  function thumbImage(p) {
    const key = `${p.src}:${p.index}:${norm(p.rot)}`;
    if (thumbCache.has(key)) return thumbCache.get(key);
    const prom = thumbChain = thumbChain.then(async () => {
      if (!state.sources.has(p.src)) return '';
      const vp1 = viewportFor(p, 1);
      const vp = viewportFor(p, 260 / Math.max(vp1.width, vp1.height));
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      await srcPage(p).render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      return c.toDataURL('image/jpeg', 0.8);
    }).catch(() => '');
    thumbCache.set(key, prom);
    return prom;
  }

  let thumbIO = null;
  function buildThumbs() {
    for (const id of [...state.pageSel]) if (!pageById(id)) state.pageSel.delete(id);
    thumbIO?.disconnect();
    // Thumbnails render only when scrolled into view.
    thumbIO = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        thumbIO.unobserve(en.target);
        const p = pageById(en.target.dataset.id);
        if (p) thumbImage(p).then((url) => { if (url) en.target.querySelector('img').src = url; });
      }
    }, { rootMargin: '400px' });
    const lists = [$('#thumbList')];
    if (state.mode === 'organize') lists.push($('#organizeGrid'));
    $('#organizeGrid').hidden = state.mode !== 'organize' || !state.pages.length;
    for (const list of lists) fillThumbs(list);
    $('#pagesTitle').textContent = state.pages.length ? `Pages (${state.pages.length})` : 'Pages';
    updateBulk();
  }
  function fillThumbs(list) {
    list.innerHTML = '';
    state.pages.forEach((p, i) => {
      const t = document.createElement('div');
      t.className = 'thumb';
      t.classList.toggle('current', i === state.current);
      t.classList.toggle('selected', state.pageSel.has(p.id));
      t.draggable = true;
      t.dataset.id = p.id;
      t.innerHTML = `<div class="thumb-img"><img alt="Page ${i + 1}"></div>
        <div class="thumb-bar">
          <button class="icon-btn sm" data-act="rotl" title="Rotate left" aria-label="Rotate page ${i + 1} left">${icon('rotl')}</button>
          <span>${i + 1}</span>
          <button class="icon-btn sm" data-act="rotr" title="Rotate right" aria-label="Rotate page ${i + 1} right">${icon('rotr')}</button>
          <button class="icon-btn sm danger" data-act="del" title="Delete page" aria-label="Delete page ${i + 1}">${icon('trash')}</button>
        </div>`;
      list.append(t);
      thumbIO.observe(t);
    });
  }

  function updateBulk() {
    const n = state.pageSel.size;
    $('#bulkBar').hidden = n === 0;
    if (n) $('#pagesTitle').textContent = `${n} selected`;
    else $('#pagesTitle').textContent = state.pages.length ? `Pages (${state.pages.length})` : 'Pages';
    $$('.thumb').forEach((t) => t.classList.toggle('selected', state.pageSel.has(t.dataset.id)));
  }

  function rotatePages(ids, delta) {
    finishEditing();
    pushHistory(`Rotate ${ids.length > 1 ? `${ids.length} pages` : 'page'}`);
    for (const id of ids) { const p = pageById(id); if (p) p.rot = norm(p.rot + delta); }
    rebuildAll();
  }

  function deletePages(ids) {
    finishEditing();
    if (ids.length >= state.pages.length) { toast('A PDF needs at least one page.', 'error'); return; }
    pushHistory(`Delete ${ids.length > 1 ? `${ids.length} pages` : 'page'}`);
    const set = new Set(ids);
    state.pages = state.pages.filter((p) => !set.has(p.id));
    for (const id of ids) state.pageSel.delete(id);
    if (state.selected && set.has(state.selected.pageId)) state.selected = null;
    state.current = Math.min(state.current, state.pages.length - 1);
    rebuildAll();
    syncProps();
  }

  function movePages(ids, targetId, after) {
    const moving = state.pages.filter((p) => ids.includes(p.id));
    if (!moving.length || ids.includes(targetId)) return;
    pushHistory(`Move ${moving.length > 1 ? `${moving.length} pages` : 'page'}`);
    state.pages = state.pages.filter((p) => !ids.includes(p.id));
    const to = pageIndex(targetId) + (after ? 1 : 0);
    state.pages.splice(to, 0, ...moving);
    rebuildAll();
    setCurrent(pageIndex(moving[0].id));
  }

  function onThumbClick(e) {
    const t = e.target.closest('.thumb');
    if (!t) return;
    const id = t.dataset.id;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'rotl') return rotatePages([id], -90);
    if (act === 'rotr') return rotatePages([id], 90);
    if (act === 'del') return deletePages([id]);
    if (e.shiftKey && state.pageAnchor && pageById(state.pageAnchor)) {
      const a = pageIndex(state.pageAnchor), b = pageIndex(id);
      state.pageSel = new Set(state.pages.slice(Math.min(a, b), Math.max(a, b) + 1).map((p) => p.id));
    } else if (e.metaKey || e.ctrlKey) {
      state.pageSel.has(id) ? state.pageSel.delete(id) : state.pageSel.add(id);
      state.pageAnchor = id;
    } else {
      state.pageSel.clear();
      state.pageAnchor = id;
      if (state.mode === 'organize') state.pageSel.add(id);
      else scrollToPage(id);
    }
    updateBulk();
  }

  function setupThumbDnD(list) {
    let dragIds = null;
    const grid = list.classList.contains('grid');
    const clearMarks = () => $$('.drop-before, .drop-after', list).forEach((t) => t.classList.remove('drop-before', 'drop-after'));
    list.addEventListener('dragstart', (e) => {
      const t = e.target.closest('.thumb');
      if (!t) return;
      const id = t.dataset.id;
      dragIds = state.pageSel.has(id) ? state.pages.filter((p) => state.pageSel.has(p.id)).map((p) => p.id) : [id];
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-pdf-page', id);
      dragIds.forEach((d) => list.querySelector(`[data-id="${d}"]`)?.classList.add('dragging'));
    });
    list.addEventListener('dragend', () => {
      dragIds = null;
      clearMarks();
      $$('.dragging', list).forEach((t) => t.classList.remove('dragging'));
    });
    list.addEventListener('dragover', (e) => {
      if (!dragIds) return;
      e.preventDefault();
      e.stopPropagation();
      clearMarks();
      const t = e.target.closest('.thumb');
      if (!t || dragIds.includes(t.dataset.id)) return;
      const r = t.getBoundingClientRect();
      const before = grid ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
      t.classList.add(before ? 'drop-before' : 'drop-after');
    });
    list.addEventListener('drop', (e) => {
      if (!dragIds) return;
      e.preventDefault();
      e.stopPropagation();
      const t = $('.drop-before, .drop-after', list);
      if (t) movePages(dragIds, t.dataset.id, t.classList.contains('drop-after'));
      clearMarks();
    });
  }

  async function insertBlank() {
    finishEditing();
    const cur = state.pages[state.current];
    if (!cur) return;
    const pg = srcPage(cur);
    let w = pg.view[2] - pg.view[0], h = pg.view[3] - pg.view[1];
    if (norm(pg.rotate + cur.rot) % 180) [w, h] = [h, w];
    const before = snapshot();
    const doc = await PDFDocument.create();
    doc.addPage([w, h]);
    const src = await loadSource(await doc.save(), 'Blank page');
    pushHistory('Insert blank page', before);
    const page = { id: nid('p'), src: src.id, index: 0, rot: 0, annots: [] };
    state.pages.splice(state.current + 1, 0, page);
    rebuildAll();
    scrollToPage(page.id);
  }

  /* ---------- images & signatures ---------- */
  async function registerImage(blob, kind, w, h) {
    const id = nid('i');
    state.images.set(id, { url: URL.createObjectURL(blob), bytes: new Uint8Array(await blob.arrayBuffer()), kind, w, h });
    return id;
  }

  function placeImage(imgId, maxW, label) {
    finishEditing();
    const p = state.pages[state.current];
    if (!p) return;
    const [x0, y0, x1, y1] = srcPage(p).view;
    const im = state.images.get(imgId);
    let w = Math.min(maxW, (x1 - x0) * 0.6);
    let h = w * im.h / im.w;
    if (h > (y1 - y0) * 0.6) { h = (y1 - y0) * 0.6; w = h * im.w / im.h; }
    const an = { id: nid('a'), type: 'image', img: imgId, x: r2((x0 + x1 - w) / 2), y: r2((y0 + y1 + h) / 2), w: r2(w), h: r2(h), opacity: 1 };
    pushHistory(`Add ${label}`);
    p.annots.push(an);
    setTool('select');
    select(p.id, an.id);
    toast(`Drag the ${label} into place. Use the corner handle to resize.`);
  }

  async function addImageFile(file) {
    try {
      const bmp = await createImageBitmap(file);
      let blob = file;
      let kind = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : null;
      if (!kind) {
        const c = document.createElement('canvas');
        c.width = bmp.width;
        c.height = bmp.height;
        c.getContext('2d').drawImage(bmp, 0, 0);
        blob = await new Promise((res) => c.toBlob(res, 'image/png'));
        kind = 'png';
      }
      placeImage(await registerImage(blob, kind, bmp.width, bmp.height), 220, 'image');
    } catch (e) {
      console.error(e);
      toast(`Could not read the image "${file.name}".`, 'error');
    }
  }

  function setupSignature() {
    const dlg = $('#sigDialog');
    const c = $('#sigCanvas');
    const dpr = window.devicePixelRatio || 1;
    c.width = 560 * dpr;
    c.height = 200 * dpr;
    const ctx = c.getContext('2d');
    let drawing = false, inked = false, last = null;
    const ink = () => $('input[name="ink"]:checked', dlg).value;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height];
    };
    const clear = () => { ctx.clearRect(0, 0, c.width, c.height); inked = false; };
    c.addEventListener('pointerdown', (e) => {
      drawing = true;
      last = pos(e);
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = pos(e);
      ctx.strokeStyle = ink();
      ctx.lineWidth = 2.6 * dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(...last);
      ctx.lineTo(...p);
      ctx.stroke();
      last = p;
      inked = true;
    });
    c.addEventListener('pointerup', () => { drawing = false; });
    $('#sigClear').addEventListener('click', clear);
    let kind = 'signature';
    const open = (k) => {
      kind = k;
      $('#sigTitle').textContent = k === 'initials' ? 'Draw your initials' : 'Draw your signature';
      clear();
      dlg.showModal();
    };
    $('#btnSign').addEventListener('click', () => open('signature'));
    $('#btnInitials').addEventListener('click', () => open('initials'));
    $('#sigUse').addEventListener('click', async () => {
      if (!inked) { toast('Draw a signature first.', 'error'); return; }
      // Trim to the inked area so the image is tight around the signature.
      const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
      let minX = width, minY = height, maxX = 0, maxY = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] > 10) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      const pad = 6 * dpr;
      minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
      maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
      const out = document.createElement('canvas');
      out.width = maxX - minX + 1;
      out.height = maxY - minY + 1;
      out.getContext('2d').drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
      const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
      dlg.close();
      placeImage(await registerImage(blob, 'png', out.width, out.height), kind === 'initials' ? 70 : 170, kind);
    });
  }

  /* ---------- forms ---------- */
  function renderForms() {
    const used = new Set(state.pages.map((p) => p.src));
    const srcs = [...state.sources.values()].filter((s) => used.has(s.id) && s.fields.length);
    $('#btnForms').hidden = !srcs.length;
    $$('[data-action="showForms"]').forEach((b) => { b.hidden = !srcs.length; });
    if (!srcs.length) {
      if ($('#btnForms').getAttribute('aria-pressed') === 'true') showPanel('pages', false);
      return;
    }
    if (!renderForms.shownFor?.has([...used].join())) {
      (renderForms.shownFor ??= new Set()).add([...used].join());
      showPanel('forms', false);
      toast('This PDF has fillable form fields. Fill them in the Form fields panel.');
    }
    const body = $('#formBody');
    body.innerHTML = srcs.map((s) => {
      const vals = state.formValues[s.id] ?? {};
      const rows = s.fields.map((f) => {
        const attrs = `data-src="${s.id}" data-name="${esc(f.name)}" ${f.readOnly ? 'disabled' : ''}`;
        const v = vals[f.name];
        if (f.type === 'checkbox') {
          return `<label class="field check"><input type="checkbox" ${attrs} ${v ? 'checked' : ''}><span title="${esc(f.name)}">${esc(f.label ?? f.name)}</span></label>`;
        }
        if (f.type === 'choice') {
          const opts = ['', ...f.options].map((o) => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(o) || '(none)'}</option>`).join('');
          return `<label class="field"><span title="${esc(f.name)}">${esc(f.label ?? f.name)}</span><select ${attrs}>${opts}</select></label>`;
        }
        const input = f.multiline
          ? `<textarea ${attrs}>${esc(v ?? '')}</textarea>`
          : `<input type="text" ${attrs} value="${esc(v ?? '')}">`;
        return `<label class="field"><span title="${esc(f.name)}">${esc(f.label ?? f.name)}</span>${input}</label>`;
      }).join('');
      return (srcs.length > 1 ? `<div class="form-src">${esc(s.name)}</div>` : '') + rows;
    }).join('');
  }

  function onFormFocus(e) {
    const el = e.target.closest('[data-name]');
    if (!el) return;
    const src = state.sources.get(el.dataset.src);
    const f = src?.fields.find((x) => x.name === el.dataset.name);
    const p = f?.rect && state.pages.find((pg) => pg.src === src.id && pg.index === f.page);
    const prev = state.fieldFocus?.pageId;
    state.fieldFocus = p ? { pageId: p.id, ...f.rect } : null;
    if (prev) drawAnnots(pageById(prev));
    if (!p) return;
    drawAnnots(p);
    const v = views.get(p.id);
    if (v) {
      const [, sy] = v.vp.convertToViewportPoint(f.rect.x, f.rect.y + f.rect.h);
      $('#viewer').scrollTo({ top: v.el.offsetTop + sy - $('#viewer').clientHeight / 3, behavior: 'smooth' });
      setCurrent(pageIndex(p.id));
    }
  }

  function onFormChange(e) {
    const el = e.target.closest('[data-name]');
    if (!el) return;
    const vals = state.formValues[el.dataset.src];
    const v = el.type === 'checkbox' ? el.checked : el.value;
    if (vals[el.dataset.name] === v) return;
    pushHistory(`Fill "${el.dataset.name}"`);
    vals[el.dataset.name] = v;
  }

  function applyForm(doc, src, vals) {
    const form = doc.getForm();
    for (const f of src.fields) {
      const v = vals[f.name];
      if (v === src.initial[f.name]) continue;
      try {
        const field = form.getField(f.name);
        if (field instanceof PDFTextField) field.setText(v || undefined);
        else if (field instanceof PDFCheckBox) v ? field.check() : field.uncheck();
        else if (v) field.select(v);
        else field.clear();
      } catch (e) {
        console.warn(`Could not set field ${f.name}`, e);
      }
    }
    // Pages get copied into a new document, which drops the form dictionary,
    // so bake field values into the page content.
    try { form.flatten(); } catch (e) { console.warn('Form flatten failed', e); }
  }

  /* ---------- save ---------- */
  // Replace characters the chosen font can't draw, and count them.
  function safeText(text, entry, lost) {
    let out = '';
    for (const ch of text.replace(/\t/g, '    ')) {
      const ok = entry.chars.has(ch.codePointAt(0));
      if (!ok) lost.count++;
      out += ok ? ch : '?';
    }
    return out;
  }

  async function pdfFontFor(doc, an, cache) {
    const f = fontOf(an), k = variantKey(f, an), ck = `${f.id}:${k}`;
    if (cache.has(ck)) return cache.get(ck);
    let font;
    if (f.std) font = await doc.embedFont(StandardFonts[f.std[k]]);
    else {
      const bytes = await fontBytes(f, k);
      if (!bytes) return pdfFontFor(doc, { ...an, font: 'helvetica' }, cache);
      font = await doc.embedFont(bytes, { subset: true });
    }
    const entry = { font, chars: new Set(font.getCharacterSet()) };
    cache.set(ck, entry);
    return entry;
  }

  async function drawAnnotToPdf(doc, page, an, fontCache, embedded, lost) {
    const color = an.color ? hexRgb(an.color) : undefined;
    const opacity = an.opacity ?? 1;
    switch (an.type) {
      case 'text': {
        const entry = await pdfFontFor(doc, an, fontCache);
        an.text.split('\n').forEach((line, i) => {
          if (!line) return;
          page.drawText(safeText(line, entry, lost), {
            x: an.x, y: an.y - ASC * an.size - i * LH * an.size, size: an.size, font: entry.font, color, opacity,
          });
        });
        break;
      }
      case 'rect':
        page.drawRectangle({ x: an.x, y: an.y - an.h, width: an.w, height: an.h, borderColor: color, borderWidth: an.size, borderOpacity: opacity });
        break;
      case 'highlight':
        page.drawRectangle({ x: an.x, y: an.y - an.h, width: an.w, height: an.h, color, opacity, blendMode: BlendMode.Multiply });
        break;
      case 'whiteout':
        page.drawRectangle({ x: an.x, y: an.y - an.h, width: an.w, height: an.h, color });
        break;
      case 'line':
        page.drawLine({ start: { x: an.x1, y: an.y1 }, end: { x: an.x2, y: an.y2 }, thickness: an.size, color, opacity, lineCap: LineCapStyle.Round });
        break;
      case 'draw': {
        // drawSvgPath flips y, so feed it negated y to land in user space.
        const d = an.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${-y}`).join(' ');
        page.drawSvgPath(d, { x: 0, y: 0, borderColor: color, borderWidth: an.size, borderOpacity: opacity, borderLineCap: LineCapStyle.Round });
        break;
      }
      case 'ellipse':
        page.drawEllipse({ x: an.x + an.w / 2, y: an.y - an.h / 2, xScale: an.w / 2, yScale: an.h / 2, borderColor: color, borderWidth: an.size, borderOpacity: opacity });
        break;
      case 'arrow': {
        const [h1, h2] = arrowHead(an);
        const o = { thickness: an.size, color, opacity, lineCap: LineCapStyle.Round };
        page.drawLine({ start: { x: an.x1, y: an.y1 }, end: { x: an.x2, y: an.y2 }, ...o });
        page.drawLine({ start: { x: h1[0], y: h1[1] }, end: { x: an.x2, y: an.y2 }, ...o });
        page.drawLine({ start: { x: h2[0], y: h2[1] }, end: { x: an.x2, y: an.y2 }, ...o });
        break;
      }
      case 'stamp': {
        if (an.kind === 'dot') {
          page.drawCircle({ x: an.x + an.w / 2, y: an.y - an.h / 2, size: Math.min(an.w, an.h) * 0.3, color, opacity });
        } else {
          // Local box coords (y down) -> drawSvgPath coords (y negated user space).
          const d = stampPath(an).replace(/([ML])([\d.]+) ([\d.]+)/g, (_, c, x, y) => `${c}${an.x + +x} ${+y - an.y}`);
          page.drawSvgPath(d, { x: 0, y: 0, borderColor: color, borderWidth: Math.min(an.w, an.h) * 0.13, borderOpacity: opacity, borderLineCap: LineCapStyle.Round });
        }
        break;
      }
      case 'markup':
        for (const r of an.rects) {
          if (an.style === 'highlight') {
            page.drawRectangle({ x: r.x, y: r.y - r.h, width: r.w, height: r.h, color, opacity, blendMode: BlendMode.Multiply });
          } else {
            const t = Math.max(0.8, r.h * 0.07);
            const ly = an.style === 'underline' ? r.y - r.h + t : r.y - r.h / 2;
            page.drawLine({ start: { x: r.x, y: ly }, end: { x: r.x + r.w, y: ly }, thickness: t, color, opacity });
          }
        }
        break;
      case 'note': {
        // A real PDF "Text" annotation, so other viewers show it as a comment.
        const { PDFHexString, PDFString } = PDFLib;
        const c = hexRgb(an.color);
        const dict = doc.context.obj({
          Type: 'Annot', Subtype: 'Text', Name: 'Comment', F: 4, Open: false,
          Rect: [an.x, an.y - NOTE_SIZE, an.x + NOTE_SIZE, an.y],
          Contents: PDFHexString.fromText(an.text || ''), T: PDFHexString.fromText(an.author || 'Author'),
          M: PDFString.fromDate(new Date(an.date || Date.now())), C: [c.red, c.green, c.blue],
        });
        page.node.addAnnot(doc.context.register(dict));
        break;
      }
      case 'image': {
        let img = embedded.get(an.img);
        if (!img) {
          const im = state.images.get(an.img);
          img = im.kind === 'png' ? await doc.embedPng(im.bytes) : await doc.embedJpg(im.bytes);
          embedded.set(an.img, img);
        }
        page.drawImage(img, { x: an.x, y: an.y - an.h, width: an.w, height: an.h, opacity });
        break;
      }
    }
  }

  async function buildPdf(pages) {
    const out = await PDFDocument.create();
    out.registerFontkit(fontkit);
    const fontCache = new Map();
    const docs = new Map();
    for (const id of new Set(pages.map((p) => p.src))) {
      const s = state.sources.get(id);
      const doc = await PDFDocument.load(s.bytes, { ignoreEncryption: true, updateMetadata: false });
      if (s.fields.length) applyForm(doc, s, state.formValues[id] ?? {});
      docs.set(id, doc);
    }
    const embedded = new Map();
    const lost = { count: 0 };
    for (const p of pages) {
      const [page] = await out.copyPages(docs.get(p.src), [p.index]);
      out.addPage(page);
      if (p.rot) page.setRotation(degrees(norm(page.getRotation().angle + p.rot)));
      for (const an of p.annots) await drawAnnotToPdf(out, page, an, fontCache, embedded, lost);
    }
    const first = state.sources.get(pages[0]?.src)?.info ?? {};
    const m = state.meta ?? { title: first.Title, author: first.Author, subject: first.Subject, keywords: first.Keywords };
    if (m.title) out.setTitle(m.title);
    if (m.author) out.setAuthor(m.author);
    if (m.subject) out.setSubject(m.subject);
    if (m.keywords) out.setKeywords(String(m.keywords).split(/[,;]\s*/).filter(Boolean));
    out.setProducer('PDF Editor (pdf-lib)');
    out.setModificationDate(new Date());
    return { bytes: await out.save(), lost: lost.count };
  }

  function downloadBytes(bytes, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  const baseName = () => state.fileName.replace(/\.pdf$/i, '');

  async function exportPages(pages, name, isSave) {
    if (!pages.length) return;
    finishEditing();
    busy(true, 'Building PDF…');
    try {
      const { bytes, lost } = await buildPdf(pages);
      downloadBytes(bytes, name);
      if (isSave) { savedAt = hist.undo.length; updateChrome(); }
      toast(lost
        ? `Saved ${name}. ${lost} character${lost > 1 ? 's' : ''} aren't in the chosen font and became "?". Try Noto Sans for wider language support.`
        : `Saved ${name}`);
    } catch (e) {
      console.error(e);
      toast(`Could not build the PDF: ${e.message}`, 'error');
    } finally {
      busy(false);
    }
  }
  const save = () => exportPages(state.pages, `${baseName()}-edited.pdf`, true);
  const extractSelected = () => exportPages(state.pages.filter((p) => state.pageSel.has(p.id)), `${baseName()}-pages.pdf`, false);

  /* ---------- modes & panels ---------- */
  const MODE_DEFAULT_TOOL = { view: 'select', comment: 'select', edit: 'select', fill: 'select', organize: 'select' };
  function setMode(m) {
    finishEditing();
    state.mode = m;
    $$('.mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
    $$('.ribbon-tools').forEach((g) => { g.hidden = g.dataset.for !== m; });
    const organize = m === 'organize';
    $('#pages').hidden = organize;
    $('#organizeGrid').hidden = !organize || !state.pages.length;
    $('#pagebar').hidden = organize || !state.pages.length;
    $('#props').hidden = organize;
    if (organize) buildThumbs();
    const inMode = $$(`.ribbon-tools[data-for="${m}"] .tool`).some((b) => b.dataset.tool === state.tool);
    setTool(inMode ? state.tool : MODE_DEFAULT_TOOL[m]);
  }

  function showPanel(name, toggle = true) {
    const ws = $('.workspace');
    const btn = $(`.rail-btn[data-panel="${name}"]`);
    const already = btn.getAttribute('aria-pressed') === 'true' && !ws.classList.contains('side-hidden');
    if (toggle && already) {
      ws.classList.add('side-hidden');
      $('#side').hidden = true;
      btn.setAttribute('aria-pressed', 'false');
      return;
    }
    ws.classList.remove('side-hidden');
    $('#side').hidden = false;
    $$('.rail-btn').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    $$('#side .panel').forEach((pnl) => { pnl.hidden = pnl.dataset.panel !== name; });
    if (name === 'search') requestAnimationFrame(() => { $('#searchInput').focus(); $('#searchInput').select(); });
    if (name === 'comments') renderComments();
    if (name === 'outline') renderOutline();
  }

  /* ---------- page bar & hand tool ---------- */
  function goToPage(n) {
    const p = state.pages[clamp(n, 0, state.pages.length - 1)];
    if (p) scrollToPage(p.id);
  }
  function fitPage() {
    const p = state.pages[state.current] ?? state.pages[0];
    if (!p) return;
    const vw = $('#viewer');
    const vp = viewportFor(p, 1);
    setZoom(clamp(Math.min((vw.clientWidth - 48) / vp.width, (vw.clientHeight - 56) / vp.height), ZOOM_MIN, ZOOM_MAX));
    scrollToPage(p.id);
  }
  function setupHand() {
    const viewer = $('#viewer');
    let pan = null, spaceTool = null;
    viewer.addEventListener('pointerdown', (e) => {
      if (state.tool !== 'hand' || e.button !== 0 || e.target.closest('a')) return;
      pan = { x: e.clientX, y: e.clientY, l: viewer.scrollLeft, t: viewer.scrollTop };
      viewer.classList.add('panning');
      viewer.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    viewer.addEventListener('pointermove', (e) => {
      if (!pan) return;
      viewer.scrollLeft = pan.l - (e.clientX - pan.x);
      viewer.scrollTop = pan.t - (e.clientY - pan.y);
    });
    const end = () => { pan = null; viewer.classList.remove('panning'); };
    viewer.addEventListener('pointerup', end);
    viewer.addEventListener('pointercancel', end);
    // Hold Space for a temporary hand tool.
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || e.repeat || spaceTool || isTyping(e) || !state.pages.length || state.tool === 'hand') return;
      e.preventDefault();
      spaceTool = state.tool;
      setTool('hand');
    });
    document.addEventListener('keyup', (e) => {
      if (e.code !== 'Space' || !spaceTool) return;
      const t = spaceTool;
      spaceTool = null;
      setTool(t);
    });
  }
  const isTyping = (e) => !!e.target.closest?.('input, textarea, select, [contenteditable]');

  /* ---------- search ---------- */
  const searchCache = new Map();
  function pageText(p) {
    const key = `${p.src}:${p.index}`;
    if (!searchCache.has(key)) {
      searchCache.set(key, srcPage(p).getTextContent().then((tc) => tc.items.filter((i) => i.str).map((i) => ({
        x: i.transform[4], y: i.transform[5], size: Math.hypot(i.transform[2], i.transform[3]) || 10, w: i.width, str: i.str,
      }))).catch(() => []));
    }
    return searchCache.get(key);
  }
  let searchToken = 0;
  async function runSearch() {
    const q = $('#searchInput').value;
    const token = ++searchToken;
    const prevPages = new Set(state.search?.hits.map((h) => h.pageId));
    state.search = null;
    prevPages.forEach((id) => drawAnnots(pageById(id)));
    const results = $('#searchResults'), status = $('#searchStatus');
    results.innerHTML = '';
    if (!q.trim()) { status.textContent = ''; return; }
    const matchCase = $('#searchCase').checked, whole = $('#searchWhole').checked;
    const escRe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(whole ? `\\b${escRe}\\b` : escRe, matchCase ? 'g' : 'gi');
    const hits = [];
    status.textContent = 'Searching…';
    for (let i = 0; i < state.pages.length; i++) {
      const p = state.pages[i];
      for (const it of await pageText(p)) {
        if (token !== searchToken) return;
        const len = it.str.length;
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(it.str))) {
          const a = m.index / len, b = (m.index + m[0].length) / len;
          hits.push({ pageId: p.id, page: i, x: it.x + it.w * a, y: it.y + it.size * 0.85, w: it.w * (b - a), h: it.size * 1.1,
            before: it.str.slice(Math.max(0, m.index - 30), m.index), match: m[0], after: it.str.slice(m.index + m[0].length, m.index + m[0].length + 40) });
          if (!m[0].length) re.lastIndex++;
        }
      }
      if (hits.length > 2000) break;
    }
    if (token !== searchToken) return;
    state.search = { q, hits, idx: hits.length ? 0 : -1 };
    status.textContent = hits.length ? `${hits.length}${hits.length > 2000 ? '+' : ''} match${hits.length === 1 ? '' : 'es'}` : 'No matches. Scanned pages have no searchable text.';
    results.innerHTML = hits.slice(0, 500).map((h, k) => `<button class="result" data-hit="${k}"><span class="pg">Page ${h.page + 1}</span>…${esc(h.before)}<mark>${esc(h.match)}</mark>${esc(h.after)}…</button>`).join('');
    new Set(hits.map((h) => h.pageId)).forEach((id) => drawAnnots(pageById(id)));
    if (hits.length) gotoHit(0);
  }
  function gotoHit(k) {
    const s = state.search;
    if (!s?.hits.length) return;
    const prev = s.hits[s.idx];
    s.idx = (k + s.hits.length) % s.hits.length;
    const h = s.hits[s.idx];
    if (prev && prev.pageId !== h.pageId) drawAnnots(pageById(prev.pageId));
    drawAnnots(pageById(h.pageId));
    $$('#searchResults .result').forEach((b) => b.classList.toggle('cur', +b.dataset.hit === s.idx));
    $(`#searchResults [data-hit="${s.idx}"]`)?.scrollIntoView({ block: 'nearest' });
    $('#searchStatus').textContent = `${s.idx + 1} of ${s.hits.length} matches`;
    const v = views.get(h.pageId);
    if (v) {
      const [, sy] = v.vp.convertToViewportPoint(h.x, h.y);
      $('#viewer').scrollTo({ top: v.el.offsetTop + sy - $('#viewer').clientHeight / 3, behavior: 'smooth' });
      setCurrent(h.page);
    }
  }

  /* ---------- bookmarks ---------- */
  async function goDest(src, dest) {
    try {
      const d = typeof dest === 'string' ? await src.pdf.getDestination(dest) : dest;
      if (!d) return;
      const idx = typeof d[0] === 'object' ? await src.pdf.getPageIndex(d[0]) : d[0];
      const p = state.pages.find((pg) => pg.src === src.id && pg.index === idx);
      if (p) scrollToPage(p.id);
      else toast('That page was removed from this document.');
    } catch (e) { console.warn(e); }
  }
  async function renderOutline() {
    const body = $('#outlineBody');
    const used = [...new Set(state.pages.map((p) => p.src))].map((id) => state.sources.get(id));
    const parts = [];
    const outlineItems = new Map();
    let n = 0;
    const tree = (items, src) => `<ul class="outline">${items.map((it) => {
      const k = n++;
      outlineItems.set(k, { src, it });
      return `<li><button data-ol="${k}" title="${esc(it.title)}">${esc(it.title)}</button>${it.items?.length ? tree(it.items, src) : ''}</li>`;
    }).join('')}</ul>`;
    for (const s of used) {
      const ol = await s.pdf.getOutline().catch(() => null);
      if (ol?.length) parts.push((used.length > 1 ? `<div class="form-src">${esc(s.name)}</div>` : '') + tree(ol, s));
    }
    body.innerHTML = parts.join('') || '<p class="muted small">This document has no bookmarks.</p>';
    body.onclick = (e) => {
      const b = e.target.closest('[data-ol]');
      const entry = b && outlineItems.get(+b.dataset.ol);
      if (!entry) return;
      if (entry.it.url) window.open(entry.it.url, '_blank', 'noopener');
      else if (entry.it.dest) goDest(entry.src, entry.it.dest);
    };
  }

  /* ---------- comments list ---------- */
  const TYPE_NAMES = { text: 'Text', highlight: 'Area highlight', draw: 'Drawing', line: 'Line', rect: 'Rectangle', whiteout: 'White-out',
    image: 'Image', ellipse: 'Ellipse', arrow: 'Arrow', stamp: 'Mark', note: 'Note', markup: 'Markup' };
  function renderComments() {
    const body = $('#commentsBody');
    if (!body || $('#side').hidden || $('#side .panel[data-panel="comments"]').hidden) return;
    const rows = [];
    state.pages.forEach((p, i) => p.annots.forEach((an) => {
      const name = an.type === 'markup' ? { highlight: 'Highlight', underline: 'Underline', strike: 'Strikethrough' }[an.style] : TYPE_NAMES[an.type];
      const detail = an.text || (an.type === 'stamp' ? an.kind : an.type === 'image' ? 'Image or signature' : '');
      rows.push(`<button class="comment-item" data-pid="${p.id}" data-aid="${an.id}"><span class="sw" style="background:${an.color || '#999'}"></span>
        <span><span class="ct">${esc(name)}</span> <span class="muted small">· page ${i + 1}</span><br><span class="cx">${esc(detail).slice(0, 140)}</span></span></button>`);
    }));
    $('#commentsTitle').textContent = rows.length ? `Comments (${rows.length})` : 'Comments';
    body.innerHTML = rows.join('') || '<p class="muted small">No comments or markups yet. Use the Comment tab to add notes, highlights and drawings.</p>';
  }

  /* ---------- print, properties, split, close ---------- */
  async function printDoc() {
    if (!state.pages.length) return;
    finishEditing();
    busy(true, 'Preparing to print…');
    try {
      const { bytes } = await buildPdf(state.pages);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      $('#printFrame')?.remove();
      const frame = Object.assign(document.createElement('iframe'), { id: 'printFrame', src: url, title: 'Print preview' });
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
      frame.onload = () => {
        setTimeout(() => {
          try { frame.contentWindow.focus(); frame.contentWindow.print(); }
          catch { window.open(url, '_blank'); }
        }, 300);
      };
      document.body.append(frame);
    } catch (e) {
      toast(`Could not print: ${e.message}`, 'error');
    } finally { busy(false); }
  }

  async function showProperties() {
    const s = state.sources.get(state.pages[0]?.src);
    if (!s) return;
    const meta = await s.pdf.getMetadata().catch(() => ({ info: {} }));
    const info = meta.info || {};
    const cur = state.meta ?? { title: info.Title || '', author: info.Author || '', subject: info.Subject || '', keywords: info.Keywords || '' };
    $('#metaTitle').value = cur.title;
    $('#metaAuthor').value = cur.author;
    $('#metaSubject').value = cur.subject;
    $('#metaKeywords').value = cur.keywords;
    const pg = srcPage(state.pages[state.current] ?? state.pages[0]);
    const [x0, y0, x1, y1] = pg.view;
    const wIn = (x1 - x0) / 72, hIn = (y1 - y0) / 72;
    const date = (d) => { const m = /D:(\d{4})(\d{2})?(\d{2})?/.exec(d || ''); return m ? `${m[1]}-${m[2] || '01'}-${m[3] || '01'}` : '·'; };
    const facts = [
      ['File', state.fileName], ['File size', `${(s.bytes.length / 1024 / 1024).toFixed(2)} MB`], ['Pages', state.pages.length],
      ['Page size', `${wIn.toFixed(2)} × ${hIn.toFixed(2)} in (${Math.round(wIn * 25.4)} × ${Math.round(hIn * 25.4)} mm)`],
      ['PDF version', info.PDFFormatVersion || '·'], ['Created', date(info.CreationDate)], ['Modified', date(info.ModDate)],
      ['Application', info.Creator || '·'], ['PDF producer', info.Producer || '·'],
      ['Form fields', s.fields.length || 'None'], ['Sources', state.sources.size > 1 ? `${new Set(state.pages.map((p) => p.src)).size} files combined` : '1 file'],
    ];
    $('#docFacts').innerHTML = facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    const dlg = $('#propsDialog');
    dlg.returnValue = '';
    dlg.showModal();
    dlg.onclose = () => {
      if (dlg.returnValue !== 'ok') return;
      state.meta = { title: $('#metaTitle').value, author: $('#metaAuthor').value, subject: $('#metaSubject').value, keywords: $('#metaKeywords').value };
      pushHistory('Edit properties');
      toast('Properties will be saved into the PDF when you download it.');
    };
  }

  function showSplit() {
    const dlg = $('#splitDialog');
    const upd = () => {
      const n = Math.max(1, +$('#splitEvery').value || 1);
      $('#splitInfo').textContent = `Creates ${Math.ceil(state.pages.length / n)} file(s) from ${state.pages.length} pages.`;
    };
    $('#splitEvery').oninput = upd;
    upd();
    dlg.returnValue = '';
    dlg.showModal();
    dlg.onclose = async () => {
      if (dlg.returnValue !== 'ok') return;
      const n = Math.max(1, +$('#splitEvery').value || 1);
      const parts = Math.ceil(state.pages.length / n);
      if (parts > 50 && !confirm(`This downloads ${parts} files. Continue?`)) return;
      busy(true, 'Splitting…');
      try {
        for (let k = 0; k < parts; k++) {
          const { bytes } = await buildPdf(state.pages.slice(k * n, (k + 1) * n));
          downloadBytes(bytes, `${baseName()}-part${String(k + 1).padStart(String(parts).length, '0')}.pdf`);
          await new Promise((r) => setTimeout(r, 250)); // let the browser accept each download
        }
        toast(`Split into ${parts} files`);
      } catch (e) { toast(`Could not split: ${e.message}`, 'error'); } finally { busy(false); }
    };
  }

  function closeDoc() {
    if (hist.undo.length !== savedAt && !confirm('Close this document? Unsaved changes will be lost.')) return;
    finishEditing();
    for (const s of state.sources.values()) s.pdf.destroy();
    state.sources.clear();
    state.pages = [];
    state.formValues = {};
    state.selected = null;
    state.search = null;
    state.meta = null;
    state.pageSel.clear();
    hist.undo.length = 0;
    hist.redo.length = 0;
    savedAt = 0;
    thumbCache.clear();
    textItemsCache.clear();
    searchCache.clear();
    $('#fontPanel').hidden = true;
    rebuildAll();
    renderForms();
    setMode('view');
  }

  /* ---------- wiring ---------- */
  // Pick a tool, switching to the mode whose ribbon has it if needed.
  function activateTool(t) {
    const has = (m) => $$(`.ribbon-tools[data-for="${m}"] .tool`).some((b) => b.dataset.tool === t);
    if (!has(state.mode)) {
      const m = ['comment', 'edit', 'fill', 'view'].find(has);
      if (!m) return;
      setMode(m);
    }
    setTool(t);
  }

  const ACTIONS = {
    fitWidth: () => fitWidth(),
    fitPage: () => fitPage(),
    rotateCurrentLeft: () => state.pages[state.current] && rotatePages([state.pages[state.current].id], -90),
    rotateCurrentRight: () => state.pages[state.current] && rotatePages([state.pages[state.current].id], 90),
    showForms: () => showPanel('forms', false),
    selectAllPages: () => { state.pageSel = new Set(state.pages.map((p) => p.id)); updateBulk(); },
    rotateSelLeft: () => rotatePages(selectedOrCurrent(), -90),
    rotateSelRight: () => rotatePages(selectedOrCurrent(), 90),
    deleteSel: () => deletePages(selectedOrCurrent()),
    extractSel: () => exportPages(state.pages.filter((p) => selectedOrCurrent().includes(p.id)), `${baseName()}-pages.pdf`, false),
    addPdf: () => $('#fileAdd').click(),
    splitDoc: () => showSplit(),
  };
  const selectedOrCurrent = () => {
    const ids = state.pages.filter((p) => state.pageSel.has(p.id)).map((p) => p.id);
    return ids.length ? ids : state.pages[state.current] ? [state.pages[state.current].id] : [];
  };

  function wire() {
    $$('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
    // Ribbon buttons get a visible caption under the icon.
    $$('.ribbon .icon-btn').forEach((el) => {
      el.classList.add('labeled');
      el.insertAdjacentHTML('beforeend', `<span class="lbl">${esc(el.dataset.label || el.getAttribute('aria-label'))}</span>`);
    });
    $$('.ribbon .icon-btn:not([title])').forEach((el) => { el.title = el.getAttribute('aria-label'); });

    // File menu
    const menu = $('#fileMenu .menu-pop'), menuBtn = $('#btnFileMenu');
    const closeMenu = () => { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); };
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('#fileMenu')) closeMenu(); });
    menu.addEventListener('click', (e) => { if (e.target.closest('button')) closeMenu(); });

    const fileOpen = $('#fileOpen'), fileAdd = $('#fileAdd'), fileImage = $('#fileImage');
    $('#btnOpen').addEventListener('click', () => fileOpen.click());
    $('#btnOpen2').addEventListener('click', () => fileOpen.click());
    $('#btnAdd').addEventListener('click', () => fileAdd.click());
    $('#btnImage').addEventListener('click', () => fileImage.click());
    fileOpen.addEventListener('change', () => { if (fileOpen.files.length) openFiles(fileOpen.files, false); fileOpen.value = ''; });
    fileAdd.addEventListener('change', () => { if (fileAdd.files.length) openFiles(fileAdd.files, true); fileAdd.value = ''; });
    fileImage.addEventListener('change', () => { if (fileImage.files[0]) addImageFile(fileImage.files[0]); fileImage.value = ''; });
    $('#btnSample').addEventListener('click', async () => openItems([{ name: 'sample.pdf', bytes: await makeSample() }], false));
    $('#btnBlank').addEventListener('click', insertBlank);
    $('#btnSave').addEventListener('click', save);
    $('#btnSaveMenu').addEventListener('click', save);
    $('#btnPrint').addEventListener('click', printDoc);
    $('#btnPrintTop').addEventListener('click', printDoc);
    $('#btnProps').addEventListener('click', showProperties);
    $('#btnShortcuts').addEventListener('click', () => $('#keysDialog').showModal());
    $('#btnCloseDoc').addEventListener('click', closeDoc);
    $('#btnSearchTop').addEventListener('click', () => showPanel('search', false));
    $('#btnUndo').addEventListener('click', undo);
    $('#btnRedo').addEventListener('click', redo);
    $('#btnDeleteAnnot').addEventListener('click', deleteSelected);
    $('#btnMatchText').addEventListener('click', matchOriginalText);
    $('#formBody').addEventListener('change', onFormChange);
    $('#formBody').addEventListener('focusin', onFormFocus);
    $$('.tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
    $$('[data-action]').forEach((b) => b.addEventListener('click', () => ACTIONS[b.dataset.action]?.()));
    $$('.mode').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    $$('.rail-btn').forEach((b) => b.addEventListener('click', () => showPanel(b.dataset.panel)));

    // Page bar
    $('#btnZoomIn').addEventListener('click', () => zoomBy(1.2));
    $('#btnZoomOut').addEventListener('click', () => zoomBy(1 / 1.2));
    $('#zoomSelect').addEventListener('change', (e) => {
      const v = e.target.value;
      if (v === 'fitWidth') fitWidth();
      else if (v === 'fitPage') fitPage();
      else setZoom(parseFloat(v));
      updateChrome();
    });
    $('#btnPrevPage').addEventListener('click', () => goToPage(state.current - 1));
    $('#btnNextPage').addEventListener('click', () => goToPage(state.current + 1));
    $('#pageInput').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const n = parseInt(e.target.value, 10);
      if (n >= 1 && n <= state.pages.length) goToPage(n - 1);
      e.target.blur();
    });
    $('#pageInput').addEventListener('blur', () => { $('#pageInput').value = String(state.current + 1); });

    // Fonts
    buildFontSelect();
    const fontSel = $('#propFont'), fileFont = $('#fileFont');
    // Keep focus (and an open text box) when pressing the style toggles.
    ['#propBold', '#propItalic', '#btnMatchText'].forEach((s) => $(s).addEventListener('pointerdown', (e) => e.preventDefault()));
    $('#propBold').addEventListener('click', () => applyProp('bold', $('#propBold').getAttribute('aria-pressed') !== 'true', true));
    $('#propItalic').addEventListener('click', () => applyProp('italic', $('#propItalic').getAttribute('aria-pressed') !== 'true', true));
    fontSel.addEventListener('change', async () => {
      const id = fontSel.value;
      if (id === '__upload') { syncProps(); fileFont.click(); return; }
      if (await chooseFont(id)) applyProp('font', id, true);
      else syncProps();
    });
    fileFont.addEventListener('change', async () => {
      const file = fileFont.files[0];
      fileFont.value = '';
      if (!file) return;
      const f = await addFontFile(file);
      if (f) { applyProp('font', f.id, true); toast(`Added ${f.name}`); }
    });
    $('#btnCloseFontPanel').addEventListener('click', () => {
      $('#fontPanel').hidden = true;
      const pid = state.detect?.pageId;
      state.detect = null;
      if (pid) drawAnnots(pageById(pid));
    });
    $('#fontPanelBody').addEventListener('click', (e) => {
      const b = e.target.closest('[data-use]');
      if (!b) return;
      const [gi, ci] = b.dataset.use.split(':').map(Number);
      useDetected(gi, ci);
    });
    $('#fontPanelBody').addEventListener('pointerdown', (e) => { if (e.target.closest('[data-use]')) e.preventDefault(); });
    $('#propColor').addEventListener('input', (e) => applyProp('color', e.target.value));
    $('#propSize').addEventListener('input', (e) => applyProp('size', e.target.value));
    // Arrow keys step the size (it's a text box so browsers don't add spinners).
    $('#propSize').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const el = e.target, step = parseFloat(el.step) || 1;
      const cur = parseFloat(el.value) || 0;
      const next = Math.min(+el.max || 999, Math.max(+el.min || step, cur + (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1)));
      el.value = String(Math.round(next * 100) / 100);
      applyProp('size', el.value);
    });
    $('#propSize').addEventListener('keyup', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') commitProp(e); });
    $('#propOpacity').addEventListener('input', (e) => applyProp('opacity', e.target.value));
    ['#propColor', '#propSize', '#propOpacity'].forEach((s) => $(s).addEventListener('change', commitProp));

    // Pages
    for (const list of [$('#thumbList'), $('#organizeGrid')]) {
      list.addEventListener('click', onThumbClick);
      setupThumbDnD(list);
    }
    $('#organizeGrid').addEventListener('dblclick', (e) => {
      const t = e.target.closest('.thumb');
      if (!t) return;
      setMode('view');
      requestAnimationFrame(() => scrollToPage(t.dataset.id));
    });
    $('#bulkBar').addEventListener('click', (e) => {
      const act = e.target.closest('[data-bulk]')?.dataset.bulk;
      const ids = state.pages.filter((p) => state.pageSel.has(p.id)).map((p) => p.id);
      if (!act || !ids.length) return;
      if (act === 'rotl') rotatePages(ids, -90);
      else if (act === 'rotr') rotatePages(ids, 90);
      else if (act === 'del') deletePages(ids);
      else if (act === 'extract') extractSelected();
    });

    // Search
    let searchTimer = 0;
    $('#searchInput').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 250); });
    $('#searchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (state.search?.q === $('#searchInput').value) gotoHit(state.search.idx + 1); else runSearch();
    });
    $('#searchInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey && state.search) { e.preventDefault(); gotoHit(state.search.idx - 1); }
    });
    $('#searchNext').addEventListener('click', () => state.search && gotoHit(state.search.idx + 1));
    $('#searchPrev').addEventListener('click', () => state.search && gotoHit(state.search.idx - 1));
    $('#searchCase').addEventListener('change', runSearch);
    $('#searchWhole').addEventListener('change', runSearch);
    $('#searchResults').addEventListener('click', (e) => {
      const b = e.target.closest('[data-hit]');
      if (b) gotoHit(+b.dataset.hit);
    });
    $('#commentsBody').addEventListener('click', (e) => {
      const b = e.target.closest('[data-aid]');
      if (!b) return;
      if (state.mode === 'organize') setMode('view');
      scrollToPage(b.dataset.pid);
      if (!['select'].includes(state.tool)) setTool('select');
      select(b.dataset.pid, b.dataset.aid);
    });

    const viewer = $('#viewer');
    let scrollRaf = 0;
    viewer.addEventListener('scroll', () => {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(updateCurrentFromScroll);
    });
    // In Select mode the overlay lets clicks through to the text layer, so
    // clear the selection when clicking empty page area.
    viewer.addEventListener('pointerdown', (e) => {
      if (state.tool === 'select' && state.selected && !e.target.closest('.overlay [data-id], .overlay [data-handle], .text-editor, .text-grip, .note-pop')) select(null);
    });
    // While selecting text, stretch the text layer's end marker over the page
    // (as pdf.js's viewer does) so the selection doesn't jump across columns.
    viewer.addEventListener('pointerdown', (e) => {
      e.target.closest('.textLayer')?.querySelector('.endOfContent')?.classList.add('active');
    });
    document.addEventListener('pointerup', () => {
      $$('.textLayer .endOfContent.active').forEach((el) => el.classList.remove('active'));
      // Text-markup tools act when a text selection is finished.
      if (MARKUP_TOOLS.has(state.tool)) setTimeout(markupFromSelection, 0);
    });
    // Pinch / Ctrl+wheel zoom, debounced so the viewer rebuilds once per gesture.
    let wheelZoom = 1, wheelTimer = 0;
    viewer.addEventListener('wheel', (e) => {
      if (!e.ctrlKey || !state.pages.length) return;
      e.preventDefault();
      wheelZoom *= Math.exp(-e.deltaY * 0.01);
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { zoomBy(wheelZoom); wheelZoom = 1; }, 120);
    }, { passive: false });
    setupHand();

    // File drag and drop anywhere on the page.
    let dragDepth = 0;
    const isFileDrag = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    document.addEventListener('dragenter', (e) => {
      if (!isFileDrag(e)) return;
      dragDepth++;
      $('#dropText').textContent = state.pages.length ? 'Drop PDFs to add pages, or images to place them' : 'Drop a PDF to open it';
      $('#dropHint').hidden = false;
    });
    document.addEventListener('dragleave', (e) => {
      if (!isFileDrag(e)) return;
      if (--dragDepth <= 0) { dragDepth = 0; $('#dropHint').hidden = true; }
    });
    document.addEventListener('dragover', (e) => { if (isFileDrag(e)) e.preventDefault(); });
    document.addEventListener('drop', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragDepth = 0;
      $('#dropHint').hidden = true;
      openFiles(e.dataTransfer.files, state.pages.length > 0);
    });

    document.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 's') { e.preventDefault(); if (state.pages.length) save(); return; }
      if (mod && k === 'o') { e.preventDefault(); fileOpen.click(); return; }
      if (mod && k === 'p') { e.preventDefault(); printDoc(); return; }
      if (mod && k === 'f' && state.pages.length) { e.preventDefault(); showPanel('search', false); return; }
      const an = editing?.an ?? findAnnot(state.selected);
      if (mod && (k === 'b' || k === 'i') && an?.type === 'text') {
        e.preventDefault();
        applyProp(k === 'b' ? 'bold' : 'italic', !an[k === 'b' ? 'bold' : 'italic'], true);
        return;
      }
      if ($$('dialog').some((d) => d.open) || isTyping(e)) return;
      if (!state.pages.length) return;
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); redo(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) { e.preventDefault(); deleteSelected(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.mode === 'organize' && state.pageSel.size) { e.preventDefault(); ACTIONS.deleteSel(); return; }
      if (e.key === 'Escape') { select(null); state.pageSel.clear(); updateBulk(); return; }
      if (state.selected && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const s = e.shiftKey ? 10 : 1;
        const [dx, dy] = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] }[e.key];
        nudgeSelected(dx, dy);
        return;
      }
      if (e.key === 'PageDown' || (e.key === 'ArrowRight' && !state.selected)) { if (e.key === 'PageDown') e.preventDefault(); goToPage(state.current + 1); return; }
      if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && !state.selected)) { if (e.key === 'PageUp') e.preventDefault(); goToPage(state.current - 1); return; }
      if (e.key === 'Home') { goToPage(0); return; }
      if (e.key === 'End') { goToPage(state.pages.length - 1); return; }
      if (mod || e.altKey) return;
      const tools = { v: 'select', t: 'text', h: 'hltext', u: 'underline', k: 'strike', n: 'note', d: 'draw', l: 'line', a: 'arrow',
        r: 'rect', e: 'ellipse', w: 'whiteout', f: 'detect' };
      if (tools[k]) activateTool(tools[k]);
      else if (e.key === '+' || e.key === '=') zoomBy(1.2);
      else if (e.key === '-') zoomBy(1 / 1.2);
    });

    window.addEventListener('beforeunload', (e) => {
      if (state.pages.length && hist.undo.length !== savedAt) { e.preventDefault(); e.returnValue = ''; }
    });

    setupSignature();
    setMode('view');
    updateChrome();
  }

  wire();
  // Exposed for automated tests only.
  window.__pdfEditor = { state, buildPdf };
})();
