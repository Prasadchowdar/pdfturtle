// Text engine: a font per script, Unicode bidi (UAX #9 via bidi-js), shaping (fontkit) and content-stream
// output that copies out correctly:
//  - pdf.js / Firefox read text in content-stream order and ignore ActualText, so runs are emitted in
//    logical order at their visual positions, and Indic glyphs that shaping reorders (ि, reph र्, split
//    Tamil vowels) are emitted glyph by glyph in logical order;
//  - PDFium (Chrome/Edge), Acrobat, Poppler and MuPDF read /ActualText spans: per run for left-to-right
//    lines, and for lines with right-to-left text one span for the whole line, pre-shaped for PDFium's
//    word-based bidi (see pdfiumPreimage).
import {
  StandardFonts, PDFOperator, PDFOperatorNames, PDFName, PDFHexString, beginText, endText, setFontAndSize,
  setTextMatrix, showText, endMarkedContent, pushGraphicsState, popGraphicsState, setGraphicsState, setFillingColor, rgb,
  setTextRenderingMode, TextRenderingMode,
} from '@cantoo/pdf-lib';
import * as fontkit from '@cantoo/fontkit'; // the fontkit build @cantoo/pdf-lib expects (subset.encode())
import bidiFactory from 'bidi-js';

const bidi = bidiFactory();

// ---------- fonts ----------
const SCRIPTS = [
  [/[ऀ-ॿ]/, 'devanagari'], [/[ঀ-৿]/, 'bengali'], [/[਀-੿]/, 'gurmukhi'], [/[઀-૿]/, 'gujarati'],
  [/[଀-୿]/, 'oriya'], [/[஀-௿]/, 'tamil'], [/[ఀ-౿]/, 'telugu'], [/[ಀ-೿]/, 'kannada'],
  [/[ഀ-ൿ]/, 'malayalam'], [/[඀-෿]/, 'sinhala'], [/[֐-׿יִ-ﭏ]/, 'hebrew'],
  [/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/, 'arabic'], [/[฀-๿]/, 'thai'],
  [/[가-힯ᄀ-ᇿ㄰-㆏]/, 'kr'], [/[぀-ヿ]/, 'jp'], [/[　-〿㐀-鿿豈-﫿＀-￯]/, 'sc'],
];
const WIN_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
export const isWinAnsi = (s) => [...s].every((c) => c === '\n' || (c >= ' ' && c <= '~') || (c >= '\xa0' && c <= '\xff') || WIN_EXTRA.includes(c));
const isRtlKey = (k) => /^(arabic|hebrew)/.test(k);
const helv = (bold) => (bold ? 'helvetica-bold' : 'helvetica');
const withWeight = (base, bold) => (base === 'helvetica' ? helv(bold) : bold ? `${base}-bold` : base);
const isHelvetica = (font) => font.name?.startsWith('Helvetica');

export function fontKey(text, bold = false) {
  if (isWinAnsi(text)) return helv(bold);
  for (const [re, key] of SCRIPTS) if (re.test(text)) return withWeight(key, bold);
  return withWeight('latin', bold); // Cyrillic, Greek, Vietnamese, other Latin
}

// Loader for Noto font bytes by key: browser uses fonts.js (lazy assets), Node passes a file reader.
let loadFont = null;
export const setFontLoader = (fn) => { loadFont = fn; };

const docFonts = new WeakMap();
// One font for a whole string (fine for single words).
export const fontFor = (doc, text, bold = false) => fontByKey(doc, fontKey(text, bold));

export async function fontByKey(doc, key) {
  if (!key.startsWith('helvetica') && !loadFont) key = key.endsWith('-bold') ? 'helvetica-bold' : 'helvetica'; // no loader: degrade
  if (!docFonts.has(doc)) docFonts.set(doc, new Map());
  const cache = docFonts.get(doc);
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      if (key === 'helvetica') return doc.embedFont(StandardFonts.Helvetica);
      if (key === 'helvetica-bold') return doc.embedFont(StandardFonts.HelveticaBold);
      doc.registerFontkit(fontkit);
      return doc.embedFont(await loadFont(key), { subset: true });
    })());
  }
  return cache.get(key);
}

// Standard 14 fonts only encode WinAnsi; swap anything else for '?'. Only used when drawing with Helvetica.
export function winAnsi(s) {
  return String(s).replace(/[^\n\x20-\x7e\xa0-\xff]/g, (c) => (WIN_EXTRA.includes(c) ? c : c === '\t' ? '    ' : '?'));
}
const clean = (s) => String(s).replace(/\t/g, '    ').replace(/[\x00-\x08\x0a-\x1f\x7f]/g, '');
export const drawable = (font, s) => (isHelvetica(font) ? winAnsi(clean(s)) : clean(s));

// ---------- runs ----------
// 'mark' = combining mark / ZWJ / ZWNJ (stays with the previous character); null = neutral (spaces,
// digits, Latin-1 punctuation); 'basic' = Latin-1 letter; otherwise the base font key the character needs.
function charClass(c) {
  if (/\p{M}|[‌‍]/u.test(c)) return 'mark';
  if (/[​‎‏‪-‮⁦-⁩]/.test(c) || (isWinAnsi(c) && !/\p{L}/u.test(c))) return null;
  if (isWinAnsi(c)) return 'basic';
  for (const [re, key] of SCRIPTS) if (re.test(c)) return key;
  return 'latin';
}

// The string's main left-to-right font. Latin letters ride along in it (every Noto font has Latin),
// so "Page ४" or "नमस्ते Hello" don't flip between typefaces.
function primaryKey(text, bold) {
  for (const c of text) {
    const k = charClass(c);
    if (k && k !== 'basic' && k !== 'mark' && !isRtlKey(k)) return withWeight(k, bold);
  }
  return helv(bold);
}

// Bidi + font runs for one line. Returns runs in visual order: { key, level, source (logical text),
// shape (string handed to the font), first (logical index) }.
export function lineRuns(line, bold = false, primary = primaryKey(line, bold)) {
  const chars = [...line];
  const starts = [];
  let u = 0;
  for (const c of chars) { starts.push(u); u += c.length; }
  const emb = bidi.getEmbeddingLevels(line); // paragraph direction from the first strong character
  const level = starts.map((i) => emb.levels[i]);
  const mirrored = bidi.getMirroredCharactersMap(line, emb.levels);

  // Font key per character: strong characters pick their script; marks follow the previous character;
  // neutrals join a neighbour at the same bidi level, else the primary font.
  const cls = chars.map(charClass);
  const key = cls.map((c) => (c === 'basic' ? primary : c && c !== 'mark' ? withWeight(c, bold) : undefined));
  for (let i = 0; i < chars.length; i++) {
    if (key[i]) continue;
    if (cls[i] === 'mark' && i > 0) { key[i] = key[i - 1]; continue; }
    const odd = level[i] % 2;
    const prev = i > 0 && level[i - 1] % 2 === odd ? key[i - 1] : undefined;
    let next;
    for (let j = i + 1; j < chars.length && !next; j++) if (key[j] && level[j] % 2 === odd) next = key[j];
    key[i] = (odd ? [prev, next].find((k) => k && isRtlKey(k)) : prev ?? next) ?? prev ?? next ?? primary;
  }

  // Visual order (code-unit reversal segments mapped back to code points).
  const order = [...line].length ? [...Array(line.length).keys()] : [];
  for (const [a, b] of bidi.getReorderSegments(line, emb)) order.splice(a, b - a + 1, ...order.slice(a, b + 1).reverse());
  const cpOfUnit = [];
  starts.forEach((st, i) => { cpOfUnit[st] = i; if (chars[i].length === 2) cpOfUnit[st + 1] = i; });
  const visual = [];
  for (const unit of order) { const ci = cpOfUnit[unit]; if (ci !== undefined && visual[visual.length - 1] !== ci) visual.push(ci); }

  const runs = [];
  for (const ci of visual) {
    const last = runs[runs.length - 1];
    if (last && last.key === key[ci] && last.level === level[ci]) last.cis.push(ci);
    else runs.push({ key: key[ci], level: level[ci], cis: [ci] });
  }
  return runs.map((r) => {
    const display = r.cis.map((ci) => mirrored.get(starts[ci]) ?? chars[ci]); // visual order, brackets mirrored
    const logical = r.level % 2 ? [...r.cis].reverse() : r.cis;
    const source = logical.map((ci) => chars[ci]).join('');
    // RTL letters are shaped by fontkit, which reverses them itself: hand it logical order.
    const shapedRtl = r.level % 2 && isRtlKey(r.key) && /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(source);
    return { key: r.key, level: r.level, source, shape: shapedRtl ? [...display].reverse().join('') : display.join(''), first: Math.min(...r.cis) };
  });
}

// Back-compat helper used by tests: logical runs with their font keys.
export function splitRuns(text, bold = false) {
  return lineRuns(text, bold).sort((a, b) => a.first - b.first).map((r) => ({ key: r.key, text: r.source, neutral: !/[\p{L}]/u.test(r.source) }));
}

// ---------- copy-paste support ----------
const actualTextOp = (doc, text) => PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence,
  [PDFName.of('Span'), doc.context.obj({ ActualText: PDFHexString.fromText(text) })]);

// PDFium treats ActualText like glyphs in drawing order and runs a word-based bidi over each line: it picks
// the line direction by letter count, then (RTL lines) reverses word order and flips RTL words, or
// (LTR lines) flips RTL words in place. Both are involutions, so applying the same transform to the
// logical line gives the text PDFium turns back into it. Verified against PDFium in check.mjs.
const RTL_LETTER = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
function pdfiumPreimage(line) {
  // PDFium (CFX_BidiString) counts direction *segments* (runs of R or L characters; spaces and digits are
  // neutral and split them) and picks right-to-left when R segments >= L segments.
  let r = 0, l = 0, prev = null;
  for (const c of line) {
    const d = RTL_LETTER.test(c) ? 'r' : /\p{L}/u.test(c) ? 'l' : null;
    if (d && d !== prev) d === 'r' ? r++ : l++;
    prev = d;
  }
  if (r && r >= l) l = 0; // tie goes to right-to-left
  // PDFium also mirrors brackets when it flips an RTL word, so the pre-image carries them mirrored.
  const flipWord = (w) => [...w].reverse().map((c) => bidi.getMirroredCharacter(c) ?? c).join('');
  const words = line.split(' ').map((w) => (RTL_LETTER.test(w) ? flipWord(w) : w));
  return (r > l ? words.reverse() : words).join(' ');
}

// --- Alias codes: logical text for stream-order readers without moving any glyph ---
// Shaping draws नि as [ि][न]. Readers that ignore ActualText (pdf.js/Firefox, Ghostscript) concatenate
// each glyph's ToUnicode in drawing order, giving "िन". Re-emitting glyphs out of order makes pdf.js insert
// fake spaces, so instead each glyph in a reordered cluster gets its own code (CID) that points at the same
// glyph (CIDToGIDMap) but maps to the right slice of the logical text: ि-shape -> "न", न-shape -> "ि".
// The codes are added by wrapping this font's pdf-lib embedder (it writes the font once, at save).
const ALIAS_BASE = 0xC000; // above any subset glyph id
function aliasesOf(font) {
  const emb = font.embedder;
  if (emb.pdfturtleAliases) return emb.pdfturtleAliases;
  const aliases = (emb.pdfturtleAliases = new Map()); // `${gid}|${text}` -> { cid, gid, width, text }
  // gid -> the text its own code stands for. pdf-lib would map each glyph to whichever character used it
  // last, but fonts share glyphs between characters (Noto Arabic's ب ت ث ن share one skeleton).
  const canon = (emb.pdfturtleCanon = new Map());
  const embedCid = emb.embedCIDFontDict.bind(emb);
  emb.embedCIDFontDict = async (context) => {
    const ref = await embedCid(context);
    if (!aliases.size) return ref;
    const dict = context.lookup(ref);
    const max = ALIAS_BASE + aliases.size - 1;
    const map = new Uint8Array((max + 1) * 2);
    for (let c = 0; c <= max; c++) { map[2 * c] = c >> 8; map[2 * c + 1] = c & 255; } // identity...
    for (const a of aliases.values()) { map[2 * a.cid] = a.gid >> 8; map[2 * a.cid + 1] = a.gid & 255; } // ...plus aliases
    dict.set(PDFName.of('CIDToGIDMap'), context.register(context.flateStream(map)));
    const W = dict.lookup(PDFName.of('W'));
    for (const a of aliases.values()) { W.push(context.obj(a.cid)); W.push(context.obj([a.width])); } // push() takes one item
    return ref;
  };
  const embedCmap = emb.embedUnicodeCmap.bind(emb);
  emb.embedUnicodeCmap = (context) => {
    if (!aliases.size && !canon.size) return embedCmap(context);
    const hex = (n) => n.toString(16).padStart(4, '0');
    const utf16 = (s) => [...s].map((c) => { const cp = c.codePointAt(0); return cp > 0xffff ? hex(0xd800 + ((cp - 0x10000) >> 10)) + hex(0xdc00 + ((cp - 0x10000) & 0x3ff)) : hex(cp); }).join('');
    const entries = [
      ...emb.glyphCache.access().filter(Boolean).map((g) => [emb.glyphId(g), canon.get(emb.glyphId(g)) ?? String.fromCodePoint(...g.codePoints)]),
      ...[...aliases.values()].map((a) => [a.cid, a.text]),
    ].filter(([, t]) => t);
    const blocks = [];
    for (let i = 0; i < entries.length; i += 100) { // spec limit: 100 entries per bfchar block
      const chunk = entries.slice(i, i + 100);
      blocks.push(`${chunk.length} beginbfchar\n${chunk.map(([c, t]) => `<${hex(c)}> <${utf16(t)}>`).join('\n')}\nendbfchar`);
    }
    const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000><ffff>\nendcodespacerange\n${blocks.join('\n')}\nendcmap\nCMapName currentdict /CIDResource defineresource pop\nend\nend`;
    return context.register(context.flateStream(cmap));
  };
  return aliases;
}
// Code for glyph `gid` standing for `text`: the glyph's own code if that's what it stands for, else an alias.
function codeFor(font, gid, text, width) {
  const canon = (aliasesOf(font), font.embedder.pdfturtleCanon);
  if (!canon.has(gid)) canon.set(gid, text);
  return canon.get(gid) === text ? gid.toString(16).padStart(4, '0') : aliasCode(font, gid, text, width);
}
function aliasCode(font, gid, text, width) {
  const aliases = aliasesOf(font);
  const k = `${gid}|${text}`;
  if (!aliases.has(k)) aliases.set(k, { cid: ALIAS_BASE + aliases.size, gid, width, text });
  return aliases.get(k).cid.toString(16).padStart(4, '0');
}

// Shape `text` once: subset codes (pdf-lib), glyphs and GPOS positions (fontkit) for the same glyph run.
function shape(font, text) {
  const emb = font.embedder;
  const codes = font.encodeText(text).asString().match(/.{4}/g) ?? [];
  const { glyphs, positions } = emb.font.layout(text, emb.fontFeatures);
  return { emb, codes, glyphs, positions, ok: glyphs.length === codes.length };
}

// Draw shaped glyphs at `dx` along the baseline. pdf-lib places glyphs by advance width only, which drops
// OpenType mark positioning (Arabic dots under final ي, stacked Vietnamese accents); when a run has offsets
// or kerning, each glyph is placed at the shaper's position instead.
function glyphOps(fontName, L, codes, size, { x, y, cos, sin }, dx, invisible = false) {
  const k = size / L.emb.font.unitsPerEm;
  const tm = (u, v) => setTextMatrix(cos, sin, -sin, cos, x + u * cos - v * sin, y + u * sin + v * cos);
  const plain = !L.ok || L.positions.every((p, j) => !p.xOffset && !p.yOffset && Math.abs(p.xAdvance - L.glyphs[j].advanceWidth) < 1);
  const ops = [beginText(), setFontAndSize(fontName, size)];
  if (invisible) ops.push(setTextRenderingMode(TextRenderingMode.Invisible));
  if (plain) ops.push(tm(dx, 0), showText(PDFHexString.of(codes.join(''))));
  else {
    let pen = dx;
    L.positions.forEach((p, j) => { ops.push(tm(pen + p.xOffset * k, p.yOffset * k), showText(PDFHexString.of(codes[j]))); pen += p.xAdvance * k; });
  }
  if (invisible) ops.push(setTextRenderingMode(TextRenderingMode.Fill));
  ops.push(endText());
  return ops;
}

// Hex codes for a left-to-right run, with alias codes where shaping reordered or merged characters.
// Each glyph is matched back to the (NFD) source by its code points. The run is split into the smallest
// glyph groups that cover a contiguous stretch of the source; a group whose code points, read in drawing
// order, differ from that stretch (pre-base ि, reph, Tamil split vowels, Sinhala ශ්‍රී) gets aliases.
function encodeLogical(font, run, L) {
  const { emb, codes, glyphs } = L;
  if (!L.ok) return codes;
  const nfd = (cps) => cps.flatMap((cp) => [...String.fromCodePoint(cp).normalize('NFD')]);
  const src = [...run.source.normalize('NFD')];
  const used = new Array(src.length).fill(false);
  const lo = [], hi = [];
  let last = 0;
  glyphs.forEach((g, i) => {
    let mn = Infinity, mx = -Infinity;
    for (const c of nfd(g.codePoints)) {
      const k = src.findIndex((ch, j) => !used[j] && ch === c);
      if (k >= 0) { used[k] = true; mn = Math.min(mn, k); mx = Math.max(mx, k); }
    }
    if (mn === Infinity) mn = mx = last; // glyph with no characters stays with the previous one
    lo[i] = mn; hi[i] = last = mx;
  });
  const texts = glyphs.map((g) => (g.codePoints.length ? nfd(g.codePoints).join('') : FILLER));
  const sufMin = [];
  for (let i = glyphs.length - 1; i >= 0; i--) sufMin[i] = Math.min(lo[i], sufMin[i + 1] ?? Infinity);
  for (let a = 0, b = 0, segLo = Infinity, segHi = -1; b < glyphs.length; b++) {
    segLo = Math.min(segLo, lo[b]); segHi = Math.max(segHi, hi[b]);
    if (b + 1 < glyphs.length && sufMin[b + 1] <= segHi) continue;
    const span = src.slice(segLo, segHi + 1), k = b - a + 1;
    const drawn = glyphs.slice(a, b + 1).flatMap((g) => nfd(g.codePoints)).join('');
    if (drawn !== span.join('') && span.length >= k) {
      // First glyph gets the leading characters, every later glyph one each: read in drawing order they
      // spell the stretch in typed order.
      const parts = [span.slice(0, span.length - k + 1).join(''), ...span.slice(span.length - k + 1)];
      for (let j = a; j <= b; j++) {
        texts[j] = parts[j - a];
      }
    }
    a = b + 1; segLo = Infinity; segHi = -1;
  }
  return codes.map((c, j) => codeFor(font, parseInt(c, 16), texts[j], glyphs[j].advanceWidth * emb.scale));
}

// Right-to-left runs: readers reverse the drawn glyphs themselves, so only glyphs that stand for no
// character (Noto Arabic's joining pieces) need a mapping, or readers fall back to the raw code ().
// ZWJ: readers drop it (pdf.js tested), and it means "joined" if one keeps it.
const FILLER = '‍';
function encodeRtl(font, run, L) {
  const { emb, codes, glyphs } = L;
  if (!L.ok) return codes;
  // The shaper's own labels are unreliable here (Noto Arabic's ن reports the shared skeleton as ب; dots
  // report nothing), so pair the glyphs that carry characters with the typed text: drawn right to left,
  // the last such glyph is the first character. A ligature (لا) takes as many characters as it reports.
  const src = [...run.source];
  const texts = glyphs.map((g) => (g.codePoints.length ? String.fromCodePoint(...g.codePoints) : FILLER));
  let k = 0;
  const assigned = [];
  for (let j = glyphs.length - 1; j >= 0 && k <= src.length; j--) {
    const n = glyphs[j].codePoints.length;
    if (n) { assigned[j] = src.slice(k, k + n).join(''); k += n; }
  }
  if (k === src.length) assigned.forEach((t, j) => { texts[j] = t; });
  return codes.map((c, j) => codeFor(font, parseInt(c, 16), texts[j], glyphs[j].advanceWidth * emb.scale));
}

// Codes for a run whose glyphs readers should ignore: each maps to ZWSP, which pdf.js skips entirely
// (no text, no position check). Used for the visible layer of mixed right-to-left lines.
function encodeHidden(font, L) {
  return L.codes.map((c, j) => aliasCode(font, parseInt(c, 16), '​', (L.glyphs[j]?.advanceWidth ?? 0) * L.emb.scale));
}

// Operators that draw one run at text-space x offset `dx` along the baseline.
function runOps(run, { x, y, size, cos, sin, fontName }) {
  const { font } = run;
  if (isHelvetica(font) || !font.embedder?.font) {
    return [beginText(), setFontAndSize(fontName, size), setTextMatrix(cos, sin, -sin, cos, x + run.dx * cos, y + run.dx * sin), showText(font.encodeText(run.text)), endText()];
  }
  const L = shape(font, run.text);
  return glyphOps(fontName, L, run.level % 2 ? encodeRtl(font, run, L) : encodeLogical(font, run, L), size, { x, y, cos, sin }, run.dx);
}

// Fonts, measuring and drawing for one piece of (possibly mixed-script) text and any line of it.
export async function textKit(doc, text, bold = false) {
  text = String(text);
  const primary = primaryKey(text, bold);
  const fonts = new Map();
  for (const k of new Set([helv(bold), primary, ...lineRuns(text, bold, primary).map((r) => r.key)])) fonts.set(k, await fontByKey(doc, k));
  const fontOf = (k) => fonts.get(k) || fonts.get(helv(bold));
  const latin = withWeight('latin', bold);
  if (RTL_LETTER.test(text)) fonts.set(latin, await fontByKey(doc, latin)); // for two-layer lines, below
  // A line mixing right-to-left text with other runs is drawn in two layers (see ops); its Latin uses
  // Noto Sans instead of Helvetica because only embedded fonts can carry remapped codes.
  const runsOf = (s, size = 0) => {
    const raw = lineRuns(clean(s), bold, primary);
    const twoLayer = raw.length > 1 && raw.some((r) => r.level % 2);
    let dx = 0;
    return raw.map((r) => {
      let font = fontOf(r.key);
      if (twoLayer && isHelvetica(font) && fonts.has(latin)) font = fonts.get(latin);
      const run = { ...r, font, twoLayer, text: drawable(font, r.shape), dx };
      dx += font.widthOfTextAtSize(run.text, size);
      return run;
    });
  };
  const width = (s, size) => runsOf(s, size).reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, size), 0);

  // Content operators for one line; `nameOf(font)` gives the resource name to use for each font.
  // pdf.js (Firefox) makes one text item per font run, applies bidi per item and keeps stream order, and it
  // drops space glyphs, rebuilding spaces only from gaps. So a line mixing right-to-left text with other
  // runs gets two layers: the visible glyphs in place, mapped to ZWSP (ignored), and an invisible (Tr 3)
  // copy laid out in logical order with real gaps for spaces, which is what pdf.js reads. PDFium reads the
  // line-wide ActualText. Other lines are one layer: runs in visual order, per-run ActualText.
  const ops = (s, { x, y, size, rotate = 0 }, nameOf) => {
    const line = clean(s);
    const rad = (rotate * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const at = { x, y, size, cos, sin };
    const runs = runsOf(line, size).filter((r) => r.text);
    const hasRtl = runs.some((r) => r.level % 2);
    const out = [];
    if (hasRtl) out.push(actualTextOp(doc, pdfiumPreimage(line))); // one line-wide span for PDFium
    if (runs[0]?.twoLayer) {
      for (const r of runs) { const L = shape(r.font, r.text); out.push(...glyphOps(nameOf(r.font), L, encodeHidden(r.font, L), size, at, r.dx)); }
      let cursor = 0, gap = false;
      for (const r of [...runs].sort((a, b) => a.first - b.first)) {
        const word = r.source.trim();
        if (/^\s/.test(r.source) && cursor) gap = true;
        if (word) {
          const shaped = drawable(r.font, r.level % 2 ? word : r.shape.trim());
          if (gap) cursor += r.font.widthOfTextAtSize(' ', size);
          const piece = { ...r, text: shaped, source: word };
          const L = shape(r.font, shaped);
          out.push(...glyphOps(nameOf(r.font), L, r.level % 2 ? encodeRtl(r.font, piece, L) : encodeLogical(r.font, piece, L), size, at, cursor, true));
          cursor += r.font.widthOfTextAtSize(shaped, size);
        }
        gap = /\s$/.test(r.source);
      }
    } else {
      for (const r of runs) {
        const tag = !hasRtl && !isHelvetica(r.font);
        if (tag) out.push(actualTextOp(doc, r.source));
        out.push(...runOps(r, { ...at, fontName: nameOf(r.font) }));
        if (tag) out.push(endMarkedContent());
      }
    }
    if (hasRtl) out.push(endMarkedContent());
    return out;
  };

  return {
    width,
    ops,
    rtl: bidi.getEmbeddingLevels(text).paragraphs[0]?.level === 1,
    tall: [...fonts.values()].some((f) => !isHelvetica(f)), // Indic/CJK marks need more line height
    height: (size) => Math.max(...[...fonts.values()].map((f) => f.heightAtSize(size, { descender: false }))),
    draw(page, s, { x, y, size, rotate = 0, color = rgb(0, 0, 0), opacity }) {
      const gs = page.maybeEmbedGraphicsState({ opacity });
      const nameOf = (font) => { page.setFont(font); return page.fontKey; };
      page.pushOperators(pushGraphicsState(), ...(gs ? [setGraphicsState(gs)] : []), setFillingColor(color),
        ...ops(s, { x, y, size, rotate }, nameOf), popGraphicsState());
    },
  };
}

// ---------- repairing other PDFs' extracted text ----------
// Visual -> logical repair for text extracted from shaped Indic PDFs (pdf.js returns glyphs in drawing
// order). Pre-base vowel signs move back after their consonant cluster; Devanagari reph (र्) drawn after
// its syllable moves back before it. Mid-word, visual order is ambiguous ("राजिकशोर" is valid text), so a
// page is only repaired when it shows a sign where logical text can't have one.
const PREBASE = [
  ['िॎ', 'क-हक़-य़ॸ-ॿ', '़', '्'], // Devanagari
  ['িেৈ', 'ক-হড়-য়ৰৱ', '়', '্'], // Bengali
  ['ਿ', 'ਕ-ਹਖ਼-ਫ਼', '਼', '੍'], // Gurmukhi
  ['િ', 'ક-હ', '઼', '્'], // Gujarati
  ['େୈ', 'କ-ହଡ଼-ୟୱ', '଼', '୍'], // Odia
  ['ெ-ை', 'க-ஹ', '', '்'], // Tamil
  ['െ-ൈ', 'ക-ഺ', '', '്'], // Malayalam
  ['ෙ-ෛ', 'ක-ෆ', '', '්'], // Sinhala
].map(([sign, cons, nukta, virama]) => {
  const c = `[${cons}]${nukta ? `[${nukta}]?` : ''}`;
  return {
    move: new RegExp(`([${sign}])((?:${c}[${virama}])*${c})`, 'gu'),
    misplaced: new RegExp(`(?<![${cons}${nukta}])[${sign}](?=[${cons}])`, 'u'),
  };
});
// Reph: "र्" written after its syllable (consonants + vowel signs/marks) and not followed by a consonant.
const DEVA_SYLLABLE = '(?:[\\u0915-\\u0939\\u0958-\\u095F][\\u093C]?\\u094D)*[\\u0915-\\u0939\\u0958-\\u095F][\\u093C]?[\\u093E-\\u094C\\u0901-\\u0903]*';
const REPH = { move: new RegExp(`(${DEVA_SYLLABLE})(\\u0930\\u094D)(?![\\u0915-\\u0939\\u0958-\\u095F\\u200D])`, 'gu'), misplaced: new RegExp(`\\u0930\\u094D(?![\\u0915-\\u0939\\u0958-\\u095F\\u200D])`, 'u') };

// lines: one page's extracted lines. Returns them in logical order (the same array if nothing to repair).
// `evidence` lets callers decide on the whole page and repair parts of it (e.g. table cells).
export function visualToLogical(lines, evidence = lines) {
  const page = evidence.join('\n');
  const fixes = PREBASE.filter(({ misplaced }) => misplaced.test(page)).map(({ move }) => (t) => t.replace(move, '$2$1'));
  if (REPH.misplaced.test(page)) fixes.unshift((t) => t.replace(REPH.move, '$2$1'));
  if (!fixes.length) return lines;
  // NFC rejoins two-part vowels that extraction splits around the consonant: Tamil ெ + ா -> ொ
  return lines.map((l) => fixes.reduce((t, f) => f(t), l).normalize('NFC'));
}
