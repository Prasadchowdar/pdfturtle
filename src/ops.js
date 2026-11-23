// Pure pdf-lib operations: bytes in, bytes out. No DOM, so check.mjs runs them in Node.
import {
  PDFDocument, rgb, degrees, pushGraphicsState, popGraphicsState, beginMarkedContent, endMarkedContent,
  setFillingRgbColor, setStrokingRgbColor, setLineWidth, rectangle, fill, stroke, clip, endPath,
  PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup,
} from '@cantoo/pdf-lib';

// Field type by class, not constructor.name: the production build minifies class names.
const FIELD_TYPES = [[PDFTextField, 'TextField'], [PDFCheckBox, 'CheckBox'], [PDFDropdown, 'Dropdown'], [PDFOptionList, 'OptionList'], [PDFRadioGroup, 'RadioGroup']];
const fieldType = (f) => FIELD_TYPES.find(([C]) => f instanceof C)?.[1] || 'Other';

// Fonts, bidi, shaping and copy-paste-safe text output live in text.js.
import { textKit, fontFor, isWinAnsi } from './text.js';
export * from './text.js';

export async function load(bytes, password) {
  try {
    return await PDFDocument.load(bytes, password === undefined ? {} : { password });
  } catch (e) {
    if (/encrypted/i.test(e.message)) throw new Error('This PDF is password-protected. Unlock it first with "Unlock PDF".');
    throw new Error(`Could not read this PDF (${e.message}). Try "Repair PDF".`);
  }
}

async function pick(src, indices) {
  const doc = await PDFDocument.create();
  (await doc.copyPages(src, indices)).forEach((p) => doc.addPage(p));
  return doc;
}

export function hexToRgb(hex = '#000000') {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// "1-3, 5, 8-" -> [[0,1,2],[4],[7..count-1]]
export function parseRanges(str, count) {
  const out = [];
  for (const part of String(str).split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/);
    let a, b;
    if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : count; }
    else if (/^\d+$/.test(part)) a = b = +part;
    else throw new Error(`"${part}" is not a page range`);
    a = Math.max(1, a); b = Math.min(count, b);
    if (a > b) throw new Error(`Range "${part}" is outside pages 1-${count}`);
    const r = [];
    for (let i = a; i <= b; i++) r.push(i - 1);
    out.push(r);
  }
  if (!out.length) throw new Error('Enter at least one page range');
  return out;
}

export async function merge(list) {
  const out = await PDFDocument.create();
  for (const bytes of list) {
    const src = await load(bytes);
    (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
  }
  return out.save();
}

// mode: 'ranges' (one file per range) | 'fixed' (every N pages) | 'all' (one file per page)
export async function split(bytes, { mode = 'ranges', ranges = '1', every = 1, mergeRanges = false }) {
  const src = await load(bytes);
  const n = src.getPageCount();
  let groups;
  if (mode === 'all') groups = src.getPageIndices().map((i) => [i]);
  else if (mode === 'fixed') {
    const k = Math.max(1, +every || 1);
    groups = [];
    for (let i = 0; i < n; i += k) groups.push(src.getPageIndices().slice(i, i + k));
  } else groups = parseRanges(ranges, n);
  if (mergeRanges) groups = [groups.flat()];
  const out = [];
  for (const g of groups) {
    const label = g.length === 1 ? `${g[0] + 1}` : `${g[0] + 1}-${g[g.length - 1] + 1}`;
    out.push({ label, bytes: await (await pick(src, g)).save() });
  }
  return out;
}

export async function extractPages(bytes, ranges) {
  const src = await load(bytes);
  return (await pick(src, parseRanges(ranges, src.getPageCount()).flat())).save();
}

export async function removePages(bytes, ranges) {
  const src = await load(bytes);
  const drop = new Set(parseRanges(ranges, src.getPageCount()).flat());
  const keep = src.getPageIndices().filter((i) => !drop.has(i));
  if (!keep.length) throw new Error('You cannot remove every page');
  return (await pick(src, keep)).save();
}

export async function rotate(bytes, deg) {
  const doc = await load(bytes);
  for (const p of doc.getPages()) p.setRotation(degrees((p.getRotation().angle + deg + 360) % 360));
  return doc.save();
}

// items: [{ i: srcPageIndex, rot: 0|90|180|270 } | { blank: true }]
export async function organize(bytes, items) {
  const src = await load(bytes);
  const out = await PDFDocument.create();
  for (const it of items) {
    if (it.blank) {
      const prev = out.getPageCount() ? out.getPage(out.getPageCount() - 1) : src.getPage(0);
      const { width, height } = prev.getSize();
      out.addPage([width, height]);
      continue;
    }
    const [p] = await out.copyPages(src, [it.i]);
    p.setRotation(degrees((p.getRotation().angle + (it.rot || 0)) % 360));
    out.addPage(p);
  }
  if (!out.getPageCount()) throw new Error('No pages left');
  return out.save();
}

const ANCHORS = { tl: [0, 1], tc: [0.5, 1], tr: [1, 1], ml: [0, 0.5], mc: [0.5, 0.5], mr: [1, 0.5], bl: [0, 0], bc: [0.5, 0], br: [1, 0] };

// Center point of a w×h box anchored at `pos` inside the page box, with margin.
function anchorCenter(box, pos, w, h, margin) {
  const [ax, ay] = ANCHORS[pos] || ANCHORS.mc;
  return {
    x: box.x + margin + w / 2 + ax * (box.width - 2 * margin - w),
    y: box.y + margin + h / 2 + ay * (box.height - 2 * margin - h),
  };
}

// Origin for drawing a w×h item rotated by `deg` so its centre lands on c.
function originFor(c, w, h, deg) {
  const r = (deg * Math.PI) / 180;
  return { x: c.x - (w / 2) * Math.cos(r) + (h / 2) * Math.sin(r), y: c.y - (w / 2) * Math.sin(r) - (h / 2) * Math.cos(r) };
}

export async function watermark(bytes, o) {
  const doc = await load(bytes);
  const raw = o.text || 'CONFIDENTIAL';
  let img, kit;
  if (o.mode === 'image') {
    if (!o.image) throw new Error('Choose a watermark image');
    img = o.image.type === 'image/png' ? await doc.embedPng(o.image.bytes) : await doc.embedJpg(o.image.bytes);
  } else kit = await textKit(doc, raw, o.bold);
  const size = +o.size || 48, rot = +o.rotation || 0, opacity = o.opacity === undefined ? 0.5 : +o.opacity;
  const pages = doc.getPages();
  const only = String(o.pages ?? '').trim() ? new Set(parseRanges(o.pages, pages.length).flat()) : null;
  for (const [i, page] of pages.entries()) {
    if (only && !only.has(i)) continue;
    const box = page.getCropBox();
    let w, h;
    if (img) { const s = (Math.min(box.width, box.height) * (+o.scale || 40)) / 100 / img.width; w = img.width * s; h = img.height * s; }
    else { w = kit.width(raw, size); h = kit.height(size); }
    const centers = o.mosaic
      ? ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'].map((p) => anchorCenter(box, p, w, h, 30))
      : [anchorCenter(box, o.position, w, h, 30)];
    for (const c of centers) {
      const at = originFor(c, w, h, rot);
      if (img) page.drawImage(img, { ...at, width: w, height: h, rotate: degrees(rot), opacity });
      else kit.draw(page, raw, { ...at, size, color: hexToRgb(o.color), rotate: rot, opacity });
    }
    if (o.layer === 'under') sendLastContentToBack(page);
  }
  return doc.save();
}

// "Below content": pdf-lib appends what we draw as the page's last content stream; moving it to the front
// paints it first, so the page's own content covers it (opaque backgrounds hide it, as in other tools).
function sendLastContentToBack(page) {
  const contents = page.node.Contents();
  if (!contents || typeof contents.size !== 'function' || contents.size() < 2) return;
  const last = contents.get(contents.size() - 1);
  contents.remove(contents.size() - 1);
  contents.insert(0, last);
}

export async function pageNumbers(bytes, o) {
  const doc = await load(bytes);
  const kit = await textKit(doc, (o.format || '{n}').replace(/\{[np]\}/g, '0'));
  const pages = doc.getPages();
  const from = Math.max(1, +o.from || 1), to = Math.min(pages.length, +o.to || pages.length);
  const size = +o.size || 12, start = +o.start || 1, margin = +o.margin || 30;
  const total = to - from + start;
  for (let i = from - 1; i < to; i++) {
    const page = pages[i];
    const label = (o.format || '{n}').replaceAll('{n}', String(i - from + 1 + start)).replaceAll('{p}', String(total));
    const w = kit.width(label, size), h = kit.height(size);
    // Facing pages: mirror left/right on even pages.
    let pos = o.position || 'bc';
    if (o.facing && (i - from) % 2 === 1) pos = pos.replace('l', 'X').replace('r', 'l').replace('X', 'r');
    const c = anchorCenter(page.getCropBox(), pos, w, h, margin);
    kit.draw(page, label, { x: c.x - w / 2, y: c.y - h / 2, size, color: hexToRgb(o.color) });
  }
  return doc.save();
}

export async function protect(bytes, password) {
  if (!password) throw new Error('Type a password');
  const doc = await load(bytes);
  doc.encrypt({ userPassword: password, ownerPassword: password });
  return doc.save();
}

export async function unlock(bytes, password = '') {
  let src;
  try { src = await PDFDocument.load(bytes, { password }); }
  catch (e) { throw new Error(/password/i.test(e.message) || password ? 'Wrong password' : `Could not open: ${e.message}`); }
  return (await pick(src, src.getPageIndices())).save();
}

// The page as the user sees it (pdf.js applies /Rotate clockwise): normalized view point (u, v), origin
// top-left, -> PDF user space. Marks, typed text and images go through this so they land where they were
// placed on rotated pages too.
const pageRotation = (page) => ((page.getRotation().angle % 360) + 360) % 360;
export function viewToPdf(page, u, v) {
  const b = page.getCropBox(), r = pageRotation(page);
  if (r === 90) return { x: b.x + v * b.width, y: b.y + u * b.height };
  if (r === 180) return { x: b.x + (1 - u) * b.width, y: b.y + v * b.height };
  if (r === 270) return { x: b.x + (1 - v) * b.width, y: b.y + (1 - u) * b.height };
  return { x: b.x + u * b.width, y: b.y + (1 - v) * b.height };
}
// View size in points (width/height swap on 90/270).
const viewSize = (page) => { const b = page.getCropBox(); return pageRotation(page) % 180 ? [b.height, b.width] : [b.width, b.height]; };

// Normalized mark {x,y,w,h} in the view -> axis-aligned PDF rectangle.
export function markRect(page, m) {
  const p = viewToPdf(page, m.x, m.y), q = viewToPdf(page, m.x + m.w, m.y + m.h);
  return { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), width: Math.abs(q.x - p.x), height: Math.abs(q.y - p.y) };
}

export async function crop(bytes, rect, pageIdx = null) {
  const doc = await load(bytes);
  doc.getPages().forEach((page, i) => {
    if (pageIdx !== null && i !== pageIdx) return;
    const r = markRect(page, rect);
    page.setMediaBox(r.x, r.y, r.width, r.height);
    page.setCropBox(r.x, r.y, r.width, r.height);
  });
  return doc.save();
}

const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] };

// images: [{ bytes, type: 'image/png'|'image/jpeg' }]
export async function imagesToPdf(images, { size = 'a4', orientation = 'portrait', margin = 0 } = {}) {
  const doc = await PDFDocument.create();
  for (const im of images) {
    const img = im.type === 'image/png' ? await doc.embedPng(im.bytes) : await doc.embedJpg(im.bytes);
    const m = +margin || 0;
    let [pw, ph] = size === 'fit' ? [img.width + 2 * m, img.height + 2 * m] : PAGE_SIZES[size];
    if (size !== 'fit' && (orientation === 'landscape' || (orientation === 'auto' && img.width > img.height))) [pw, ph] = [ph, pw];
    const s = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height);
    const w = img.width * s, h = img.height * s;
    doc.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  return doc.save();
}

// marks: [{ page, x,y,w,h, kind: 'text'|'rect'|'highlight'|'whiteout'|'image', text, size, color, image:{bytes,type} }]
export async function annotate(bytes, marks) {
  const doc = await load(bytes);
  const pages = doc.getPages();
  const cache = new Map();
  for (const m of marks) {
    const page = pages[m.page];
    const r = markRect(page, m);
    const color = hexToRgb(m.color);
    const rot = pageRotation(page), [vw, vh] = viewSize(page);
    if (m.kind === 'text') {
      // Lay out in view space (points from the view's top-left), then map each baseline start onto the page.
      const size = +m.size || 14, raw = m.text || '', kit = await textKit(doc, raw);
      const boxW = m.w * vw;
      wrap(raw, (t) => kit.width(t, size), boxW).forEach((line, i) => {
        const bx = m.x * vw + (kit.rtl ? boxW - kit.width(line, size) : 0);
        const by = m.y * vh + size + i * size * (kit.tall ? 1.5 : 1.25);
        kit.draw(page, line, { ...viewToPdf(page, bx / vw, by / vh), size, color, rotate: rot });
      });
    } else if (m.kind === 'rect') page.drawRectangle({ ...r, borderColor: color, borderWidth: +m.stroke || 2 });
    else if (m.kind === 'ellipse') page.drawEllipse({ x: r.x + r.width / 2, y: r.y + r.height / 2, xScale: r.width / 2, yScale: r.height / 2, borderColor: color, borderWidth: +m.stroke || 2 });
    else if (m.kind === 'line' || m.kind === 'ink') {
      // Points are relative to the mark's box (0..1, top-left origin) and mapped through the page rotation.
      const pts = m.kind === 'line' ? [[m.flipX ? 1 : 0, m.flipY ? 1 : 0], [m.flipX ? 0 : 1, m.flipY ? 0 : 1]] : m.points;
      const at = ([px, py]) => viewToPdf(page, m.x + px * m.w, m.y + py * m.h);
      for (let i = 1; i < pts.length; i++) page.drawLine({ start: at(pts[i - 1]), end: at(pts[i]), thickness: +m.stroke || 2, color, lineCap: 1 });
    }
    else if (m.kind === 'highlight') page.drawRectangle({ ...r, color: rgb(1, 0.92, 0.2), opacity: 0.4 });
    else if (m.kind === 'whiteout') page.drawRectangle({ ...r, color: rgb(1, 1, 1) });
    else if (m.kind === 'image') {
      if (!cache.has(m.image)) cache.set(m.image, m.image.type === 'image/png' ? await doc.embedPng(m.image.bytes) : await doc.embedJpg(m.image.bytes));
      page.drawImage(cache.get(m.image), { ...viewToPdf(page, m.x, m.y + m.h), width: m.w * vw, height: m.h * vh, rotate: degrees(rot) });
    }
  }
  return doc.save();
}

export async function listFields(bytes) {
  const doc = await load(bytes);
  return doc.getForm().getFields().map((f) => {
    const type = fieldType(f);
    let value = '', options;
    try {
      if (type === 'TextField') value = f.getText() || '';
      else if (type === 'CheckBox') value = f.isChecked();
      else if (type === 'Dropdown' || type === 'OptionList') { options = f.getOptions(); value = f.getSelected()[0] || ''; }
      else if (type === 'RadioGroup') { options = f.getOptions(); value = f.getSelected() || ''; }
    } catch { /* unreadable field value: leave blank */ }
    return { name: f.getName(), type, value, options };
  });
}

// newFields: marks with kind 'field-text' | 'field-check'; values: { name: value }
export async function fillForm(bytes, { values = {}, newFields = [], flatten = false }) {
  const doc = await load(bytes);
  const form = doc.getForm();
  const pages = doc.getPages();
  newFields.forEach((m, i) => {
    const r = markRect(pages[m.page], m);
    const name = m.text || `field_${i + 1}`;
    const field = m.kind === 'field-check' ? form.createCheckBox(name) : form.createTextField(name);
    field.addToPage(pages[m.page], r);
    // Upright as seen on a rotated page. (pdf-lib's own `rotate` option swings the rectangle off the page.)
    const rot = pageRotation(pages[m.page]);
    if (rot) for (const w of field.acroField.getWidgets()) w.getOrCreateAppearanceCharacteristics().setRotation(rot);
  });
  for (const [name, v] of Object.entries(values)) {
    const f = form.getFieldMaybe(name);
    if (!f) continue;
    const type = fieldType(f);
    if (type === 'TextField') f.setText(String(v));
    else if (type === 'CheckBox') (v ? f.check() : f.uncheck());
    else if (v !== '' && (type === 'Dropdown' || type === 'OptionList' || type === 'RadioGroup')) f.select(String(v));
    // Helvetica can't draw नमस्ते: build the appearance ourselves, one font per script run.
    if (typeof v === 'string' && !isWinAnsi(v) && ['TextField', 'Dropdown', 'OptionList'].includes(type)) {
      await setFieldAppearance(doc, f, v);
      form.markFieldAsClean(f.ref); // stop pdf-lib redrawing it with Helvetica on save/flatten
    }
  }
  if (flatten) form.flatten();
  return doc.save();
}

const colorOf = (c, fallback) => (c?.length === 3 ? c : c?.length === 1 ? [c[0], c[0], c[0]] : fallback);

// Normal appearance for a text/choice field showing `text`, which may mix scripts. pdf-lib's own
// appearances register a single font, so we emit the form XObject with one font resource per run.
// Keeps the field's /DA size and colour, background, border, alignment, comb cells and widget rotation
// (/MK /R); RTL text defaults to right.
async function setFieldAppearance(doc, field, text) {
  const kit = await textKit(doc, text);
  const da = field.acroField.getDefaultAppearance() ?? '';
  const daSize = +(da.match(/([\d.]+)\s+Tf/)?.[1] ?? 0);
  const daRgb = da.match(/([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/)?.slice(1).map(Number)
    ?? (da.match(/([\d.]+)\s+g\b/) ? Array(3).fill(+da.match(/([\d.]+)\s+g\b/)[1]) : [0, 0, 0]);
  const multiline = field.isMultiline?.() ?? false;
  const fieldAlign = field.getAlignment?.() ?? 0;
  const align = kit.rtl && fieldAlign === 0 ? 2 : fieldAlign; // 0 left, 1 center, 2 right
  for (const widget of field.acroField.getWidgets()) {
    const rect = widget.getRectangle();
    const mk = widget.getAppearanceCharacteristics();
    const wr = (((mk?.getRotation() ?? 0) % 360) + 360) % 360;
    // Lay out in the widget's own (rotated) frame; the XObject's Matrix turns it into the rectangle.
    const [width, height] = wr % 180 ? [rect.height, rect.width] : [rect.width, rect.height];
    const combCells = field.isCombed?.() && field.getMaxLength?.() ? field.getMaxLength() : 0;
    const bw = widget.getBorderStyle()?.getWidth() ?? 0, pad = bw + 2;
    const innerW = width - 2 * pad, innerH = height - 2 * pad;

    // Size: the field's own (like pdf-lib does for Latin text) or a sensible start, shrunk until the answer fits.
    let size = daSize || (multiline ? 12 : innerH * 0.75), lines;
    if (!multiline && kit.tall) size = Math.min(size, innerH * 0.8); // Indic marks stand taller than Latin at the same size
    const cellW = combCells ? width / combCells : 0;
    for (;;) {
      lines = multiline ? wrap(text, (t) => kit.width(t, size), innerW) : [text];
      const fits = combCells ? [...text].every((c) => kit.width(c, size) <= cellW) && innerH >= size * 0.8
        : multiline ? lines.length * size * 1.25 <= innerH : kit.width(text, size) <= innerW;
      if (fits || size <= 4) break;
      size -= 0.5;
    }

    const names = new Map();
    const nameOf = (font) => { if (!names.has(font)) names.set(font, `F${names.size}`); return names.get(font); };
    const ops = [pushGraphicsState()];
    const bg = colorOf(mk?.getBackgroundColor()), border = colorOf(mk?.getBorderColor());
    if (bg) ops.push(setFillingRgbColor(...bg), rectangle(0, 0, width, height), fill());
    if (border && bw) ops.push(setStrokingRgbColor(...border), setLineWidth(bw), rectangle(bw / 2, bw / 2, width - bw, height - bw), stroke());
    ops.push(beginMarkedContent('Tx'), pushGraphicsState(), rectangle(bw, bw, width - 2 * bw, height - 2 * bw), clip(), endPath(), setFillingRgbColor(...daRgb));
    if (combCells) {
      // One character per cell, centred (Unicode-aware: one code point per cell, like viewers do).
      [...text].slice(0, combCells).forEach((c, i) => {
        ops.push(...kit.ops(c, { x: cellW * i + (cellW - kit.width(c, size)) / 2, y: (height - size) / 2 + size * 0.22, size }, nameOf));
      });
      lines = [];
    }
    lines.forEach((line, i) => {
      const lw = kit.width(line, size);
      const x = pad + (align === 1 ? (innerW - lw) / 2 : align === 2 ? innerW - lw : 0);
      const y = multiline ? height - pad - size - i * size * 1.25 : (height - size) / 2 + size * (kit.tall ? 0.15 : 0.22); // baseline above descenders
      ops.push(...kit.ops(line, { x, y, size }, nameOf));
    });
    ops.push(popGraphicsState(), endMarkedContent(), popGraphicsState());
    const Font = Object.fromEntries([...names].map(([font, name]) => [name, font.ref]));
    const Matrix = { 0: [1, 0, 0, 1, 0, 0], 90: [0, 1, -1, 0, rect.width, 0], 180: [-1, 0, 0, -1, rect.width, rect.height], 270: [0, -1, 1, 0, 0, rect.height] }[wr] ?? [1, 0, 0, 1, 0, 0];
    const stream = doc.context.formXObject(ops, { Resources: { Font }, BBox: doc.context.obj([0, 0, width, height]), Matrix: doc.context.obj(Matrix) });
    widget.setNormalAppearance(doc.context.register(stream));
  }
}

export async function repair(bytes) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
  return (await pick(src, src.getPageIndices())).save();
}

export async function compressLossless(bytes) {
  return (await load(bytes)).save({ useObjectStreams: true });
}

// blocks: [{ text, size, bold, pageBreak }] -> flowing A4 (or custom) text PDF.
export async function layoutText(blocks, { pageSize = PAGE_SIZES.a4, margin = 56 } = {}) {
  const doc = await PDFDocument.create();
  const [pw, ph] = pageSize;
  let page = null, y = 0;
  const newPage = () => { page = doc.addPage([pw, ph]); y = ph - margin; };
  for (const bl of blocks) {
    if (!page || (bl.pageBreak && y < ph - margin)) newPage();
    const size = bl.size || 11, kit = await textKit(doc, bl.text, bl.bold);
    const lh = size * (kit.tall ? 1.6 : 1.35); // Indic/CJK marks need more room
    for (const line of wrap(bl.text, (t) => kit.width(t, size), pw - 2 * margin)) {
      if (y - lh < margin) newPage();
      y -= lh;
      kit.draw(page, line, { x: kit.rtl ? pw - margin - kit.width(line, size) : margin, y, size });
    }
    y -= size * 0.6;
  }
  if (!page) newPage();
  return doc.save();
}

// Greedy word wrap; `width(s)` measures a candidate line. Words longer than a line break between code points.
function wrap(text, width, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let cur = '';
    for (const word of para.split(/ +/)) {
      const next = cur ? `${cur} ${word}` : word;
      if (width(next) <= maxW) { cur = next; continue; }
      if (cur) lines.push(cur);
      let rest = [...word];
      while (rest.length > 1 && width(rest.join('')) > maxW) {
        let k = rest.length - 1;
        while (k > 1 && width(rest.slice(0, k).join('')) > maxW) k--;
        lines.push(rest.slice(0, k).join(''));
        rest = rest.slice(k);
      }
      cur = rest.join('');
    }
    lines.push(cur);
  }
  return lines;
}

// sheets: [{ name, rows: string[][] }] -> landscape grid tables.
export async function tablesToPdf(sheets) {
  const doc = await PDFDocument.create();
  const [pw, ph] = [PAGE_SIZES.a4[1], PAGE_SIZES.a4[0]], m = 36, size = 9, rh = 16;
  for (const sh of sheets) {
    const rows = sh.rows.filter((r) => r.some((c) => String(c ?? '').trim()));
    const cols = Math.max(1, ...rows.map((r) => r.length));
    const want = Array.from({ length: cols }, (_, c) => Math.min(40, Math.max(4, ...rows.map((r) => String(r[c] ?? '').length))));
    const scale = (pw - 2 * m) / want.reduce((a, b) => a + b, 0);
    const widths = want.map((w) => w * scale);
    let page, y;
    const title = await textKit(doc, sh.name, true);
    const start = () => { page = doc.addPage([pw, ph]); y = ph - m; title.draw(page, sh.name, { x: m, y: y - 14, size: 14 }); y -= 28; };
    start();
    for (const r of rows) {
      if (y - rh < m) start();
      let x = m;
      for (const [c, w] of widths.entries()) {
        page.drawRectangle({ x, y: y - rh, width: w, height: rh, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.5 });
        const raw = String(r[c] ?? ''), kit = await textKit(doc, raw);
        const t = [...raw];
        while (t.length && kit.width(t.join(''), size) > w - 6) t.pop();
        if (t.length) kit.draw(page, t.join(''), { x: kit.rtl ? x + w - 3 - kit.width(t.join(''), size) : x + 3, y: y - rh + 4.5, size });
        x += w;
      }
      y -= rh;
    }
  }
  if (!doc.getPageCount()) doc.addPage([pw, ph]);
  return doc.save();
}
