// Browser-only helpers: pdf.js rendering/text, OCR, Office/HTML conversion.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from '@cantoo/pdf-lib';
import { load, compressLossless, layoutText, tablesToPdf, textKit, setFontLoader, visualToLogical } from './ops.js';
import { loadFont } from './fonts.js';

setFontLoader(loadFont);

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Call the conversion server. Returns null when the server or the engine it needs isn't there,
// so callers can fall back to the in-browser version.
export async function api(op, body, params = {}) {
  let res;
  try { res = await fetch(`/api/${op}?${new URLSearchParams(params)}`, { method: 'POST', body }); }
  catch { return null; } // offline / no server
  if (res.ok) return new Uint8Array(await res.arrayBuffer());
  let msg = null;
  try { msg = (await res.json()).error; } catch { /* not our server (e.g. dev proxy with server down) */ }
  if (!msg || res.status === 503 || res.status === 404) return null;
  throw new Error(msg);
}

// Server AI (Claude). Returns null when the server has no AI configured (or isn't running), so callers
// fall back to the on-device versions.
export async function aiApi(task, payload) {
  let res;
  try { res = await fetch(`/api/ai/${task}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
  catch { return null; }
  let body = null;
  try { body = await res.json(); } catch { /* not our server */ }
  if (res.ok) return body;
  if (!body?.error || res.status === 503 || res.status === 404) return null;
  throw new Error(body.error);
}

// pdf.js detaches the buffer it is given, so always hand it a copy.
export const openPdf = (bytes, password) => pdfjs.getDocument({ data: bytes.slice(), password }).promise;

// intent 'print' renders without requestAnimationFrame, so conversions keep going in background tabs.
export async function renderPage(pdf, n, scale = 1, intent = 'print') {
  const page = await pdf.getPage(n);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport, intent }).promise;
  return canvas;
}

export async function renderToWidth(pdf, n, width) {
  const vp = (await pdf.getPage(n)).getViewport({ scale: 1 });
  return renderPage(pdf, n, (width * (window.devicePixelRatio || 1)) / vp.width, 'display');
}

export async function canvasBytes(canvas, type = 'image/jpeg', quality = 0.9) {
  const blob = await new Promise((res) => canvas.toBlob(res, type, quality));
  return new Uint8Array(await blob.arrayBuffer());
}

// Any browser-decodable image -> PNG/JPEG bytes pdf-lib can embed.
export async function normalizeImage(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type === 'image/png' || file.type === 'image/jpeg') return { bytes, type: file.type };
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  return { bytes: await canvasBytes(c, 'image/png'), type: 'image/png' };
}

// Re-draw pages as JPEG images. `only` limits which pages are rasterized; `paint` draws on top first.
async function rasterize(bytes, { dpi, quality, only, paint }) {
  const pdf = await openPdf(bytes);
  const src = only ? await load(bytes) : null;
  const out = await PDFDocument.create();
  for (let i = 0; i < pdf.numPages; i++) {
    if (only && !only.has(i)) { const [p] = await out.copyPages(src, [i]); out.addPage(p); continue; }
    const vp = (await pdf.getPage(i + 1)).getViewport({ scale: 1 });
    const canvas = await renderPage(pdf, i + 1, dpi / 72);
    paint?.(canvas.getContext('2d'), i, canvas);
    const img = await out.embedJpg(await canvasBytes(canvas, 'image/jpeg', quality));
    out.addPage([vp.width, vp.height]).drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
  }
  return out.save();
}

// ponytail: "recommended"/"extreme" rasterize pages (text stops being selectable). A Ghostscript
// server pass that only downsamples embedded images keeps text; add it with the server phase.
export async function compress(bytes, level) {
  const candidates = [bytes, await compressLossless(bytes)];
  if (level !== 'low') candidates.push(await rasterize(bytes, level === 'extreme' ? { dpi: 72, quality: 0.45 } : { dpi: 110, quality: 0.65 }));
  return candidates.reduce((a, b) => (b.length < a.length ? b : a));
}

// Page-image settings from best to smallest: [dpi, JPEG quality, grayscale].
const SIZE_LADDER = [[150, 0.8], [130, 0.72], [110, 0.65], [96, 0.58], [84, 0.5], [72, 0.45], [64, 0.4], [56, 0.35], [48, 0.3], [48, 0.3, true], [40, 0.25, true], [32, 0.2, true]];

// Compress to at most `target` bytes, changing as little as possible. In order: the file as is, lossless
// restructuring, the server's Ghostscript levels (keep text selectable), then whole pages as images at the
// best ladder step that fits (binary search; text is then no longer selectable). Returns the best fit, or
// the smallest result with fits: false when even the last step is too big.
export async function compressTo(bytes, target, progress = () => {}) {
  if (bytes.length <= target) return { bytes, fits: true, method: 'unchanged' };
  const lossless = await compressLossless(bytes);
  if (lossless.length <= target) return { bytes: lossless, fits: true, method: 'lossless' };
  for (const level of ['low', 'recommended', 'extreme']) {
    progress('Compressing, keeping text…');
    let out = null;
    try { out = await api('compress', bytes, { level }); } catch { break; } // server refused this file: go to images
    if (!out) break; // no server
    if (out.length <= target) return { bytes: out, fits: true, method: 'text' };
  }
  // Short files: render every page once at 150 DPI and only rescale + re-encode per attempt (much faster).
  // Long files: render each page per attempt instead, so memory stays at one page (~9 MB per A4 page).
  progress('Reading pages…');
  const pdf = await openPdf(bytes);
  const top = 150, cache = pdf.numPages <= 15;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) pages.push({ n, vp: (await pdf.getPage(n)).getViewport({ scale: 1 }), canvas: cache ? await renderPage(pdf, n, top / 72) : null });
  const build = async (dpi, quality, gray) => {
    const out = await PDFDocument.create();
    for (const { n, vp, canvas: cached } of pages) {
      const canvas = cached || (await renderPage(pdf, n, Math.min(dpi, top) / 72));
      const s = Math.min(1, dpi / (cached ? top : Math.min(dpi, top))), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(canvas.width * s)); c.height = Math.max(1, Math.round(canvas.height * s));
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, c.width, c.height);
      if (gray) toGray(c);
      const img = await out.embedJpg(await canvasBytes(c, 'image/jpeg', quality));
      out.addPage([vp.width, vp.height]).drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
    }
    return out.save();
  };
  const tried = new Map();
  const at = async (i) => {
    if (!tried.has(i)) {
      progress(`Finding the best quality that fits (try ${tried.size + 1})…`);
      tried.set(i, await build(...SIZE_LADDER[i]));
    }
    return tried.get(i);
  };
  let lo = 0, hi = SIZE_LADDER.length - 1;
  if ((await at(hi)).length > target) {
    const smallest = [lossless, ...tried.values()].reduce((a, b) => (b.length < a.length ? b : a));
    return { bytes: smallest, fits: false, method: 'images' };
  }
  while (lo < hi) { // smallest index (best quality) whose output fits
    const mid = (lo + hi) >> 1;
    if ((await at(mid)).length <= target) hi = mid; else lo = mid + 1;
  }
  while ((await at(lo)).length > target) lo++; // sizes aren't strictly monotonic; the last step is known to fit
  // Ladder steps are coarse: raise JPEG quality at this resolution to use the room left under the limit.
  const [dpi, q0, gray] = SIZE_LADDER[lo];
  let best = await at(lo), qLo = q0, qHi = 0.92;
  for (let k = 0; k < 4 && qHi - qLo > 0.02; k++) {
    progress('Using the room left under the limit…');
    const q = (qLo + qHi) / 2, out = await build(dpi, q, gray);
    if (out.length <= target) { best = out; qLo = q; } else qHi = q;
  }
  return { bytes: best, fits: true, method: gray ? 'images-gray' : 'images', dpi };
}

function toGray(canvas) {
  const ctx = canvas.getContext('2d'), d = ctx.getImageData(0, 0, canvas.width, canvas.height), p = d.data;
  for (let k = 0; k < p.length; k += 4) p[k] = p[k + 1] = p[k + 2] = (p[k] * 77 + p[k + 1] * 150 + p[k + 2] * 29) >> 8;
  ctx.putImageData(d, 0, 0);
}

// marks are normalized to the rendered (pdf.js) page, so they match what the user drew.
export function redact(bytes, marks) {
  const byPage = new Map();
  marks.forEach((m) => byPage.set(m.page, [...(byPage.get(m.page) || []), m]));
  return rasterize(bytes, {
    dpi: 150, quality: 0.85, only: new Set(byPage.keys()),
    paint: (ctx, i, c) => { ctx.fillStyle = '#000'; for (const m of byPage.get(i)) ctx.fillRect(m.x * c.width, m.y * c.height, m.w * c.width, m.h * c.height); },
  });
}

export async function rasterRepair(bytes) {
  return rasterize(bytes, { dpi: 150, quality: 0.85 });
}

// "Extract images": every image drawn on each page, at its own resolution (not page snapshots).
export async function extractImages(bytes, { format = 'jpg' } = {}) {
  const pdf = await openPdf(bytes);
  const out = [];
  const seen = new Set();
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const list = await page.getOperatorList();
    for (let i = 0; i < list.fnArray.length; i++) {
      if (list.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
      const name = list.argsArray[i][0];
      if (seen.has(`${n}/${name}`)) continue;
      seen.add(`${n}/${name}`);
      const objs = name.startsWith('g_') ? page.commonObjs : page.objs;
      const img = await new Promise((res) => objs.get(name, res));
      if (!img?.width) continue;
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      if (img.bitmap) ctx.drawImage(img.bitmap, 0, 0);
      else {
        const rgba = new Uint8ClampedArray(img.width * img.height * 4), d = img.data;
        const ch = d.length / (img.width * img.height);
        for (let p = 0, q = 0; p < rgba.length; p += 4, q += ch) {
          rgba[p] = d[q]; rgba[p + 1] = ch >= 3 ? d[q + 1] : d[q]; rgba[p + 2] = ch >= 3 ? d[q + 2] : d[q]; rgba[p + 3] = ch === 4 ? d[q + 3] : 255;
        }
        ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
      }
      out.push({ label: `page-${n}-image-${out.length + 1}`, ext: format, bytes: await canvasBytes(c, format === 'png' ? 'image/png' : 'image/jpeg', 0.92) });
    }
  }
  if (!out.length) throw new Error('No images found in this PDF');
  return out;
}

// Boxes (normalized to each rendered page, like drawn marks) around every case-insensitive match of
// the given terms, for "search and redact". Matches inside a text item are placed proportionally.
export async function findTextBoxes(bytes, terms) {
  const pdf = await openPdf(bytes);
  const words = terms.map((t) => t.trim().toLowerCase()).filter(Boolean);
  const marks = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const { items } = await page.getTextContent();
    for (const it of items) {
      const str = (it.str || '').toLowerCase();
      if (!str) continue;
      for (const w of words) {
        for (let i = str.indexOf(w); i >= 0; i = str.indexOf(w, i + w.length)) {
          const [e, f] = [it.transform[4], it.transform[5]], m = vp.transform; // PDF point -> view pixels
          const x = m[0] * e + m[2] * f + m[4], y = m[1] * e + m[3] * f + m[5];
          const h = Math.hypot(it.transform[2], it.transform[3]) || it.height;
          const x0 = x + (it.width * i) / str.length, ww = (it.width * w.length) / str.length;
          marks.push({ page: n - 1, kind: 'redact', x: (x0 - 1) / vp.width, y: (y - h) / vp.height, w: (ww + 2) / vp.width, h: (h * 1.25) / vp.height });
        }
      }
    }
  }
  return marks;
}

export async function pdfToImages(bytes, { dpi = 150, format = 'jpg' }) {
  const pdf = await openPdf(bytes);
  const out = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const c = await renderPage(pdf, n, dpi / 72);
    out.push({ label: `page-${n}`, ext: format, bytes: await canvasBytes(c, format === 'png' ? 'image/png' : 'image/jpeg', 0.9) });
  }
  return out;
}

// ---------- text extraction ----------

function joinItems(items) {
  let s = '', end = null;
  for (const it of items) {
    if (end !== null && it.x - end > it.size * 0.15 && !s.endsWith(' ') && !it.str.startsWith(' ')) s += ' ';
    s += it.str;
    end = it.x + it.w;
  }
  return s.replace(/\s+/g, ' ').trim();
}

// Cells of one line, split at large horizontal gaps; also returns each cell's left x.
function toCells(items) {
  const cells = [], xs = [];
  let cur = [], end = null;
  for (const it of items) {
    if (end !== null && it.x - end > it.size * 1.2) { cells.push(joinItems(cur)); xs.push(cur[0].x); cur = []; }
    cur.push(it);
    end = it.x + it.w;
  }
  if (cur.length) { cells.push(joinItems(cur)); xs.push(cur[0].x); }
  return { cells, xs };
}

// Table structure for one page: cluster the left edges of every cell into column positions, then place
// each line's cells in the column whose position is nearest (so a missing cell leaves an empty slot).
export function alignColumns(lines, tolerance = 12) {
  const starts = lines.flatMap((l) => l.cellX ?? []).sort((a, b) => a - b);
  const cols = [];
  for (const x of starts) {
    const c = cols[cols.length - 1];
    if (c && x - c.max <= tolerance) { c.max = x; c.sum += x; c.n++; } else cols.push({ min: x, max: x, sum: x, n: 1 });
  }
  const centers = cols.filter((c) => c.n > 1 || cols.length < 3).map((c) => c.sum / c.n);
  if (!centers.length) return lines.map((l) => l.cells);
  return lines.map((l) => {
    const row = new Array(centers.length).fill('');
    l.cells.forEach((text, i) => {
      const x = l.cellX[i];
      let k = 0;
      for (let j = 1; j < centers.length; j++) if (Math.abs(centers[j] - x) < Math.abs(centers[k] - x)) k = j;
      while (row[k] && k < centers.length - 1) k++; // two cells near one column: keep both
      row[k] = row[k] ? `${row[k]} ${text}` : text;
    });
    return row;
  });
}

// pages -> lines [{ y, size, text, cells }], top to bottom.
export async function pageLines(bytes) {
  const pdf = await openPdf(bytes);
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const { items } = await (await pdf.getPage(n)).getTextContent();
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const [a, b, , , x, y] = it.transform;
      const size = Math.hypot(a, b) || it.height || 10;
      let row = rows.find((r) => Math.abs(r.y - y) < size * 0.5);
      if (!row) rows.push((row = { y, size, items: [] }));
      row.size = Math.max(row.size, size);
      row.items.push({ x, w: it.width, str: it.str, size });
    }
    rows.sort((p, q) => q.y - p.y);
    const lines = rows.map((r) => {
      r.items.sort((p, q) => p.x - q.x);
      const { cells, xs } = toCells(r.items);
      return { y: r.y, size: r.size, text: joinItems(r.items), cells, cellX: xs };
    });
    // Shaped Indic PDFs extract in visual order (िकताब); repair to logical order, deciding per page.
    const texts = lines.map((l) => l.text), fixed = visualToLogical(texts);
    if (fixed !== texts) lines.forEach((l, i) => { l.text = fixed[i]; l.cells = visualToLogical(l.cells, texts); });
    pages.push(lines);
  }
  return pages;
}

// Lines -> paragraphs/headings/bullets using font size relative to the body (median) size.
export function blocksOf(pages) {
  const sizes = pages.flat().map((l) => l.size).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] || 11;
  const out = [];
  pages.forEach((lines, page) => {
    let cur = null;
    for (const l of lines) {
      const t = l.text.trim();
      if (!t) continue;
      const level = l.size > body * 1.8 ? 1 : l.size > body * 1.4 ? 2 : l.size > body * 1.15 ? 3 : 0;
      const bullet = /^[•\-–*▪●◦]\s+/.test(t);
      if (cur && !level && !cur.level && !bullet && cur.lastY - l.y <= l.size * 1.7 && Math.abs(cur.size - l.size) < 1) {
        cur.text = cur.text.endsWith('-') ? cur.text.slice(0, -1) + t : `${cur.text} ${t}`;
        cur.lastY = l.y;
        continue;
      }
      cur = { text: bullet ? t.replace(/^[•\-–*▪●◦]\s+/, '') : t, level, bullet, size: l.size, lastY: l.y, page };
      out.push(cur);
    }
  });
  return out;
}

export async function pdfToMarkdown(bytes) {
  return blocksOf(await pageLines(bytes))
    .map((b) => (b.level ? `${'#'.repeat(b.level)} ${b.text}` : b.bullet ? `- ${b.text}` : b.text))
    .join('\n\n') + '\n';
}

// A table is a run of 2+ consecutive lines that each have 2+ cells; everything else is running text.
function segments(lines) {
  const out = [];
  for (let i = 0; i < lines.length;) {
    let j = i;
    while (j < lines.length && lines[j].cells.length >= 2) j++;
    if (j - i >= 2) { out.push({ table: lines.slice(i, j) }); i = j; continue; }
    const last = out[out.length - 1];
    if (last?.text) last.text.push(lines[i]); else out.push({ text: [lines[i]] });
    i++;
  }
  return out;
}

export async function pdfToWord(bytes) {
  const { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, WidthType, PageBreak } = await import('docx');
  const H = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
  const pages = await pageLines(bytes);
  const children = [];
  pages.forEach((lines, page) => {
    if (page) children.push(new Paragraph({ children: [new PageBreak()] }));
    for (const seg of segments(lines)) {
      if (seg.table) {
        const rows = alignColumns(seg.table);
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: rows.map((r) => new TableRow({ children: r.map((c) => new TableCell({ children: [new Paragraph(c)] })) })),
        }));
      } else {
        for (const b of blocksOf([seg.text])) children.push(new Paragraph({ text: b.text, heading: H[b.level] || undefined, bullet: b.bullet ? { level: 0 } : undefined }));
      }
    }
  });
  return new Uint8Array(await (await Packer.toBlob(new Document({ sections: [{ children }] }))).arrayBuffer());
}

// One sheet per page; columns aligned across rows (see alignColumns).
export async function pdfToExcel(bytes) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  (await pageLines(bytes)).forEach((lines, i) => {
    const rows = alignColumns(lines).map((r) => r.map((c) => (/^-?[\d,]*\.?\d+$/.test(c.trim()) ? Number(c.replace(/,/g, '')) : c)));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), `Page ${i + 1}`);
  });
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

// ponytail: one picture per slide, not editable text boxes.
export async function pdfToPptx(bytes) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pdf = await openPdf(bytes);
  const vp = (await pdf.getPage(1)).getViewport({ scale: 1 });
  const pptx = new PptxGenJS();
  const w = vp.width / 72, h = vp.height / 72;
  pptx.defineLayout({ name: 'PDF', width: w, height: h });
  pptx.layout = 'PDF';
  for (let n = 1; n <= pdf.numPages; n++) {
    const c = await renderPage(pdf, n, 2);
    pptx.addSlide().addImage({ data: c.toDataURL('image/jpeg', 0.85), x: 0, y: 0, w, h });
  }
  return new Uint8Array(await pptx.write({ outputType: 'arraybuffer' }));
}

// ---------- to PDF ----------

const BLOCK = 'p,div,h1,h2,h3,h4,h5,h6,li,ul,ol,table,tr,section,article,header,footer,main,nav,aside,pre,blockquote,dl,dt,dd,figure,form';
const HEAD = { H1: 22, H2: 18, H3: 15, H4: 13, H5: 12, H6: 11 };

export function htmlBlocks(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript,template,svg').forEach((e) => e.remove());
  const out = [];
  const text = (n) => (n.tagName === 'PRE' ? n.textContent : n.textContent.replace(/\s+/g, ' ')).trim();
  const walk = (el) => {
    for (const n of el.children) {
      if (n.tagName === 'TR') { out.push({ text: [...n.cells].map(text).join('   |   ') }); continue; }
      if (n.querySelector(BLOCK)) { walk(n); continue; }
      const t = text(n);
      if (!t) continue;
      if (HEAD[n.tagName]) out.push({ text: t, size: HEAD[n.tagName], bold: true });
      else out.push({ text: n.tagName === 'LI' ? `• ${t}` : t });
    }
  };
  walk(doc.body);
  return out;
}

// ponytail: text-only layout (no images/styles). LibreOffice on a server gives full fidelity.
export async function wordToPdf(bytes) {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  return layoutText(htmlBlocks(value));
}

export async function htmlToPdf(html) {
  return layoutText(htmlBlocks(html));
}

export async function excelToPdf(bytes) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(bytes, { type: 'array' });
  return tablesToPdf(wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' }) })));
}

// ponytail: slide text only, slides ordered by file number (not presentation.xml rels).
export async function pptToPdf(bytes) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(bytes);
  const xml = async (p) => new DOMParser().parseFromString(await zip.file(p).async('string'), 'application/xml');
  const sz = (await xml('ppt/presentation.xml')).getElementsByTagName('p:sldSz')[0];
  const pageSize = sz ? [+sz.getAttribute('cx') / 12700, +sz.getAttribute('cy') / 12700] : [720, 540];
  const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => a.match(/\d+/)[0] - b.match(/\d+/)[0]);
  const blocks = [];
  for (const s of slides) {
    const paras = [...(await xml(s)).getElementsByTagName('a:p')].map((p) => [...p.getElementsByTagName('a:t')].map((t) => t.textContent).join('').trim()).filter(Boolean);
    blocks.push({ text: paras[0] || ' ', size: 28, bold: true, pageBreak: true }, ...paras.slice(1).map((text) => ({ text, size: 16 })));
  }
  return layoutText(blocks, { pageSize, margin: 40 });
}

// ---------- OCR ----------

export async function ocr(bytes, lang = 'eng', onProgress) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(lang);
  try {
    const pdf = await openPdf(bytes);
    const doc = await load(bytes);
    for (let i = 0; i < pdf.numPages; i++) {
      onProgress?.(`Reading page ${i + 1} of ${pdf.numPages}…`);
      const canvas = await renderPage(pdf, i + 1, 2);
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      const words = data.blocks?.flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words))) ?? data.words ?? [];
      const page = doc.getPage(i), b = page.getCropBox();
      const sx = b.width / canvas.width, sy = b.height / canvas.height;
      for (const w of words) {
        const t = w.text.trim();
        if (!t) continue;
        const kit = await textKit(doc, t); // per-script fonts + ActualText, so copied OCR text is in logical order
        const { x0, y0, x1, y1 } = w.bbox;
        const h = (y1 - y0) * sy;
        // Invisible text layer, sized to the word box so selection lines up with the scan.
        const size = Math.max(2, Math.min(h, ((x1 - x0) * sx * h) / Math.max(1, kit.width(t, h))));
        kit.draw(page, t, { x: b.x + x0 * sx, y: b.y + b.height - y1 * sy + h * 0.2, size, opacity: 0 });
      }
    }
    return await doc.save();
  } finally {
    await worker.terminate();
  }
}

// ---------- intelligence ----------

const STOP = new Set('a an and are as at be but by for from has have he her his i in is it its of on or our she that the their them they this to was we were which will with you your not can also more than been into'.split(' '));

// Extractive summary: score sentences by frequency of their content words.
export function summarize(text, count = 5) {
  // Split per paragraph first so headings (no full stop) don't glue onto the next sentence; skip fragments.
  const sentences = text.split(/\n{2,}/)
    .flatMap((p) => p.replace(/\s+/g, ' ').match(/[^.!?]+([.!?]+|$)/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.split(' ').length >= 5);
  const freq = new Map();
  const words = (s) => s.toLowerCase().match(/[a-zÀ-￿]{3,}/g)?.filter((w) => !STOP.has(w)) ?? [];
  sentences.forEach((s) => words(s).forEach((w) => freq.set(w, (freq.get(w) || 0) + 1)));
  const score = (s) => { const ws = words(s); return ws.length ? ws.reduce((a, w) => a + freq.get(w), 0) / Math.sqrt(ws.length) : 0; };
  const top = new Set([...sentences].sort((a, b) => score(b) - score(a)).slice(0, count));
  return sentences.filter((s) => top.has(s));
}

export async function pdfText(bytes) {
  return blocksOf(await pageLines(bytes)).map((b) => b.text).join('\n\n');
}

// Uses Chrome's on-device Translator API (Chrome 138+); no server, no key.
export async function translateBlocks(blocks, target, onProgress) {
  if (!('Translator' in self)) throw new Error('This browser has no built-in translator. Use Chrome 138 or newer on desktop.');
  const sample = blocks.slice(0, 5).map((b) => b.text).join(' ');
  let source = 'en';
  if ('LanguageDetector' in self) {
    const det = await self.LanguageDetector.create();
    source = (await det.detect(sample))[0]?.detectedLanguage || 'en';
  }
  if (source === target) throw new Error('The document is already in that language');
  let tr;
  try { tr = await self.Translator.create({ sourceLanguage: source, targetLanguage: target }); }
  catch (e) { throw new Error(`Chrome can't translate ${source} → ${target} on this device yet (${e.message}). Try another language or update Chrome.`); }
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    onProgress?.(`Translating ${i + 1} of ${blocks.length}…`);
    out.push({ ...blocks[i], text: await tr.translate(blocks[i].text) });
  }
  return out;
}

export async function blocksToDocx(blocks) {
  const { Document, Packer, Paragraph, HeadingLevel } = await import('docx');
  const H = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
  const children = blocks.map((b) => new Paragraph({ text: b.text, heading: H[b.level] || undefined, bullet: b.bullet ? { level: 0 } : undefined }));
  return new Uint8Array(await (await Packer.toBlob(new Document({ sections: [{ children }] }))).arrayBuffer());
}

// Visual comparison: both versions rendered page by page; on the overlay, pixels that differ are red
// (only in the original) or green (only in the new version), unchanged ink is grey.
export async function compareVisual(bytesA, bytesB) {
  const [pa, pb] = await Promise.all([openPdf(bytesA), openPdf(bytesB)]);
  const pages = [];
  for (let n = 1; n <= Math.max(pa.numPages, pb.numPages); n++) {
    const ca = n <= pa.numPages ? await renderPage(pa, n, 1.2) : null, cb = n <= pb.numPages ? await renderPage(pb, n, 1.2) : null;
    const w = Math.max(ca?.width ?? 0, cb?.width ?? 0), h = Math.max(ca?.height ?? 0, cb?.height ?? 0);
    const px = (c) => { const k = document.createElement('canvas'); k.width = w; k.height = h; const g = k.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); if (c) g.drawImage(c, 0, 0); return g.getImageData(0, 0, w, h).data; };
    const A = px(ca), B = px(cb);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const g = out.getContext('2d'), img = g.createImageData(w, h);
    let changed = 0;
    for (let i = 0; i < A.length; i += 4) {
      const la = (A[i] + A[i + 1] + A[i + 2]) / 3, lb = (B[i] + B[i + 1] + B[i + 2]) / 3;
      const inkA = la < 200, inkB = lb < 200, differ = Math.abs(la - lb) > 60;
      const [r, gg, b] = differ ? (inkA && !inkB ? [229, 50, 45] : [46, 160, 67]) : inkA || inkB ? [170, 170, 178] : [255, 255, 255];
      if (differ) changed++;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const url = (c) => (c ? c.toDataURL('image/jpeg', 0.8) : null);
    pages.push({ n, a: url(ca), b: url(cb), diff: out.toDataURL('image/png'), changed: changed / (w * h) });
  }
  return pages;
}

// Line diff via LCS. ponytail: O(n·m) memory; fine to a few thousand lines per file.
export function diffLines(a, b) {
  const n = a.length, m = b.length, w = m + 1;
  const L = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * w + j] = a[i] === b[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: 'same', a: a[i++], b: b[j++] }); }
    else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) out.push({ t: 'del', a: a[i++] });
    else out.push({ t: 'add', b: b[j++] });
  }
  while (i < n) out.push({ t: 'del', a: a[i++] });
  while (j < m) out.push({ t: 'add', b: b[j++] });
  return out;
}
