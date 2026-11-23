// Self-check for the pdf-lib operations. Run: npm run check
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, degrees } from '@cantoo/pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as ops from './src/ops.js';

async function makePdf(n, label = 'P') {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) d.addPage([600, 800]).drawText(`${label}${i}`, { x: 50, y: 700, size: 20, font });
  return d.save();
}
const pages = async (b) => (await PDFDocument.load(b)).getPageCount();
async function text(bytes, password) {
  const pdf = await getDocument({ data: bytes.slice(), password, verbosity: 0 }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) out.push((await (await pdf.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ').trim());
  return out;
}

const a = await makePdf(3, 'A'), b = await makePdf(2, 'B');

assert.deepEqual(ops.parseRanges('1-2, 4, 6-', 7), [[0, 1], [3], [5, 6]]);
assert.throws(() => ops.parseRanges('9', 3), /outside/);
assert.throws(() => ops.parseRanges('x', 3), /not a page range/);

assert.deepEqual(await text(await ops.merge([a, b])), ['A1', 'A2', 'A3', 'B1', 'B2']);

const parts = await ops.split(a, { mode: 'ranges', ranges: '1, 2-3' });
assert.deepEqual(parts.map((p) => p.label), ['1', '2-3']);
assert.deepEqual(await text(parts[1].bytes), ['A2', 'A3']);
assert.equal((await ops.split(a, { mode: 'fixed', every: 2 })).length, 2);
assert.equal((await ops.split(a, { mode: 'all' })).length, 3);
assert.equal((await ops.split(a, { mode: 'ranges', ranges: '1,3', mergeRanges: true })).length, 1);

assert.deepEqual(await text(await ops.extractPages(a, '3,1')), ['A3', 'A1']);
assert.deepEqual(await text(await ops.removePages(a, '2')), ['A1', 'A3']);
await assert.rejects(ops.removePages(a, '1-3'), /every page/);

const rot = await PDFDocument.load(await ops.rotate(a, 90));
assert.equal(rot.getPage(0).getRotation().angle, 90);

const org = await ops.organize(a, [{ i: 2, rot: 180 }, { blank: true }, { i: 0, rot: 0 }]);
assert.deepEqual(await text(org), ['A3', '', 'A1']);
assert.equal((await PDFDocument.load(org)).getPage(0).getRotation().angle, 180);

assert.ok((await text(await ops.pageNumbers(a, { format: 'Page {n} of {p}', position: 'bc' })))[1].includes('Page 2 of 3'));
assert.ok((await text(await ops.watermark(a, { mode: 'text', text: 'DRAFT', position: 'mc', rotation: 45 })))[0].includes('DRAFT'));
assert.ok((await text(await ops.watermark(a, { mode: 'text', text: 'X', mosaic: true })))[0].split('X').length - 1 === 9);

const locked = await ops.protect(a, 'pw123');
await assert.rejects(ops.load(locked), /password-protected/);
await assert.rejects(ops.unlock(locked, 'nope'), /Wrong password/);
const unlocked = await ops.unlock(locked, 'pw123');
assert.deepEqual(await text(unlocked), ['A1', 'A2', 'A3']);

const cropped = await PDFDocument.load(await ops.crop(a, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }));
const cb = cropped.getPage(0).getCropBox();
assert.deepEqual([cb.x, cb.y, cb.width, cb.height], [150, 200, 300, 400]);

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwH4QZYAwAR8oH+Tq6RJQAAAAASUVORK5CYII=', 'base64');
const imgPdf = await PDFDocument.load(await ops.imagesToPdf([{ bytes: png, type: 'image/png' }], { size: 'a4', orientation: 'landscape' }));
assert.ok(imgPdf.getPage(0).getWidth() > imgPdf.getPage(0).getHeight());

const ann = await ops.annotate(a, [
  { page: 0, x: 0.1, y: 0.1, w: 0.5, h: 0.1, kind: 'text', text: 'Hello edit', size: 14, color: '#ff0000' },
  { page: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'image', image: { bytes: png, type: 'image/png' } },
  { page: 2, x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'highlight' },
]);
assert.ok((await text(ann))[0].includes('Hello edit'));

const form = await ops.fillForm(a, { newFields: [{ page: 0, x: 0.1, y: 0.5, w: 0.4, h: 0.05, kind: 'field-text', text: 'name' }, { page: 0, x: 0.1, y: 0.6, w: 0.03, h: 0.02, kind: 'field-check', text: 'agree' }] });
const fields = await ops.listFields(form);
assert.deepEqual(fields.map((f) => [f.name, f.type]), [['name', 'TextField'], ['agree', 'CheckBox']]);
const filled = await ops.fillForm(form, { values: { name: 'Asha', agree: true } });
assert.deepEqual((await ops.listFields(filled)).map((f) => f.value), ['Asha', true]);
assert.equal((await ops.listFields(await ops.fillForm(filled, { flatten: true }))).length, 0);

assert.equal(await pages(await ops.repair(a)), 3);
assert.equal(ops.winAnsi('aकb“c”'), 'a?b“c”');

const doc = await ops.layoutText([{ text: 'Title', size: 22, bold: true }, { text: 'word '.repeat(2000) }]);
assert.ok((await pages(doc)) > 1);
const tbl = await ops.tablesToPdf([{ name: 'Sheet1', rows: [['a', 'b'], ['1', '2']] }]);
assert.ok((await text(tbl))[0].includes('Sheet1'));

// ---------- Unicode text (Noto fonts via fontkit) ----------
import fs from 'node:fs';
const { FONT_FILES } = await import('./src/font-files.js');
ops.setFontLoader(async (key) => fs.readFileSync(`node_modules/${FONT_FILES[key]}`));

assert.equal(ops.fontKey('Hello'), 'helvetica');
assert.equal(ops.fontKey('Page ४'), 'devanagari');
assert.equal(ops.fontKey('Привет'), 'latin');
assert.equal(ops.fontKey('你好'), 'sc');
assert.equal(ops.fontKey('こんにちは'), 'jp');
assert.equal(ops.fontKey('नमस्ते', true), 'devanagari-bold');
assert.equal(ops.fontKey('සිංහල'), 'sinhala');
assert.equal(ops.fontKey('ଓଡ଼ିଆ'), 'oriya');

// Extraction returns Indic pre-base vowel signs (ि, ெ) in visual order, so compare the characters, not their order.
const chars = (s) => [...s.normalize('NFD').replace(/\s+/g, '')]; // NFD: Tamil ொ comes back as ெ + ா
const has = async (bytes, want, page = 0) => {
  const got = chars((await text(bytes))[page]);
  for (const c of chars(want)) {
    const i = got.indexOf(c);
    assert.ok(i >= 0, `"${c}" of "${want}" missing from page ${page + 1}`);
    got.splice(i, 1);
  }
};
const uni = await ops.layoutText([{ text: 'नमस्ते दुनिया', size: 20, bold: true }, { text: 'తెలుగు వచనం' }, { text: 'மொழி' }, { text: 'مرحبا بالعالم' }, { text: '你好世界' }, { text: 'Привет мир' }]);
for (const s of ['नमस्ते दुनिया', 'తెలుగు వచనం', 'மொழி', '你好世界', 'Привет мир']) await has(uni, s);
assert.ok(uni.length < 400_000, `fonts must be subset, got ${uni.length} bytes`); // full SC font alone is 10 MB
await has(await ops.watermark(a, { mode: 'text', text: 'गोपनीय', position: 'mc' }), 'गोपनीय');
await has(await ops.pageNumbers(a, { format: 'पृष्ठ {n}', position: 'bc' }), 'पृष्ठ 2', 1);
await has(await ops.annotate(a, [{ page: 0, x: 0.1, y: 0.1, w: 0.6, h: 0.1, kind: 'text', text: 'నమస్కారం', size: 14 }]), 'నమస్కారం');
await has(await ops.tablesToPdf([{ name: 'தமிழ்', rows: [['பெயர்', 'Qty'], ['வணக்கம்', '5']] }]), 'வணக்கம்');
const uniForm = await ops.fillForm(form, { values: { name: 'प्रसाद' }, flatten: true });
await has(uniForm, 'प्रसाद');

// ---------- mixed scripts in one string ----------
const keys = (s) => ops.splitRuns(s).filter((r) => !r.neutral).map((r) => r.key);
assert.deepEqual(keys('Page ४'), ['devanagari']); // Latin letters ride along in the script font
assert.deepEqual(keys('नमस्ते दुनिया'), ['devanagari']);
assert.deepEqual(keys('नमस्ते مرحبا 你好 Привет'), ['devanagari', 'arabic', 'sc', 'latin']);
assert.deepEqual(keys('Hello world'), ['helvetica']);

// Visual order from the Unicode bidi algorithm (bidi-js): runs left to right, trimmed.
const vis = (s) => ops.lineRuns(s).map((r) => r.source.trim()).filter(Boolean);
assert.deepEqual(vis('Hello مرحبا world'), ['Hello', 'مرحبا', 'world']);
assert.deepEqual(vis('مرحبا world'), ['world', 'مرحبا']); // right-to-left line
assert.deepEqual(vis('مرحبا 2026 بالعالم'), ['بالعالم', '2026', 'مرحبا']); // numbers stay left-to-right
assert.deepEqual(vis('مرحبا Hello World 2026 שלום'), ['שלום', 'Hello World 2026', 'مرحبا']);
assert.deepEqual(vis('x שלום مرحبا y'), ['x', 'مرحبا', 'שלום', 'y']); // two RTL scripts in an LTR line
assert.ok(ops.lineRuns('قال (مرحبا) لي').some((r) => r.shape.includes(')') && r.shape.indexOf(')') < (r.shape.indexOf('(') + 1 || Infinity)), 'brackets mirrored in RTL text');

const mixedLine = 'नमस्ते مرحبا 你好 Привет తెలుగు 2026';
await has(await ops.layoutText([{ text: mixedLine }]), mixedLine);
await has(await ops.watermark(a, { mode: 'text', text: 'गोपनीय · سري · 机密', position: 'mc' }), 'गोपनीय · سري · 机密');
await has(await ops.pageNumbers(a, { format: 'पृष्ठ {n} · صفحة', position: 'bc' }), 'पृष्ठ 1 · صفحة');
await has(await ops.annotate(a, [{ page: 0, x: 0.1, y: 0.1, w: 0.8, h: 0.2, kind: 'text', text: mixedLine, size: 12 }]), mixedLine);
await has(await ops.tablesToPdf([{ name: 'Mix', rows: [['తెలుగు 你好', 'مرحبا ok']] }]), 'తెలుగు 你好');
const twoFields = await ops.fillForm(form, { values: { name: 'प्रसाद' }, newFields: [{ page: 0, x: 0.5, y: 0.5, w: 0.3, h: 0.05, kind: 'field-text', text: 'city' }] });
await has(await ops.fillForm(twoFields, { values: { city: 'القاهرة' }, flatten: true }), 'القاهرة');

// One answer mixing scripts: hand-built multi-font appearance (live field and flattened).
const mixedAnswer = 'प्रसाद (القاهرة) 你好 Ivan Иван';
const liveMixed = await ops.fillForm(form, { values: { name: mixedAnswer } });
assert.equal((await ops.listFields(liveMixed)).find((f) => f.name === 'name').value, mixedAnswer); // value kept
await has(await ops.fillForm(form, { values: { name: mixedAnswer }, flatten: true }), mixedAnswer);
{
  const d = await PDFDocument.load(a), p = d.getPage(0), f = d.getForm();
  const ml = f.createTextField('notes'); ml.enableMultiline(); ml.addToPage(p, { x: 50, y: 300, width: 220, height: 90 });
  const dd = f.createDropdown('lang'); dd.addOptions(['English', 'हिन्दी · العربية · 中文']); dd.addToPage(p, { x: 300, y: 300, width: 200, height: 24 });
  const longMixed = 'पहली पंक्ति first line, مرحبا بالعالم, 你好世界, తెలుగు వచనం and more words to force wrapping';
  const out = await ops.fillForm(await d.save(), { values: { notes: longMixed, lang: 'हिन्दी · العربية · 中文' }, flatten: true });
  await has(out, longMixed);
  await has(out, 'हिन्दी · العربية · 中文');
}

// ---------- copy-paste order ----------
// visualToLogical: repairs pdf.js output for shaped Indic text, leaves logical text alone.
assert.deepEqual(ops.visualToLogical(['िकताब', 'दुिनया', 'पंिक्त']), ['किताब', 'दुनिया', 'पंक्ति']);
assert.deepEqual(ops.visualToLogical(['ெமாழி', 'ைகயில்']), ['மொழி', 'கையில்']); // Tamil two-part and pre-base vowels
assert.deepEqual(ops.visualToLogical(['েদশ েকাথায়']), ['দেশ কোথায়']); // Bengali, incl. two-part ো
const logical = ['किताब', 'राजकिशोर'];
assert.equal(ops.visualToLogical(logical), logical); // already logical: untouched (same array)
assert.deepEqual(ops.visualToLogical(['िकताब राजिकशोर']), ['किताब राजकिशोर']); // page evidence fixes the ambiguous word too

// Firefox (pdf.js) reads content-stream order and ignores ActualText: we emit logical order, so its text
// must equal what was typed with no repair step.
const hindiLine = 'नमस्ते दुनिया — क्षत्रिय श्रीमान किताब धर्म स्थिति';
// Like Firefox's text layer: items joined as-is (pdf.js adds its own space items for real gaps), EOL -> newline.
const firefox = async (bytes, page = 0) => {
  const pdf = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const { items } = await (await pdf.getPage(page + 1)).getTextContent();
  return items.map((i) => i.str + (i.hasEOL ? '\n' : '')).join('').replace(/\s+/g, ' ').trim();
};
assert.equal(await firefox(await ops.layoutText([{ text: hindiLine }])), hindiLine);
assert.equal((await firefox(await ops.layoutText([{ text: 'தமிழ் மொழி கையில்' }]))).normalize('NFC'), 'தமிழ் மொழி கையில்');
for (const t of ['দেশ কোথায়', 'ශ්‍රී ලංකාව සිංහල', 'ଓଡ଼ିଆ ଭାଷା କେଉଁଠି']) assert.equal((await firefox(await ops.layoutText([{ text: t }]))).normalize('NFC'), t.normalize('NFC'), `Firefox copy of "${t}"`);

// PDFium (Chrome/Edge's engine) honours ActualText: copied text must equal what was typed, in order.
const { init: initPdfium } = await import('@embedpdf/pdfium');
const pdfium = await initPdfium({ wasmBinary: fs.readFileSync('node_modules/@embedpdf/pdfium/dist/pdfium.wasm') });
pdfium.PDFiumExt_Init();
function pdfiumText(bytes) {
  const m = pdfium.pdfium, ptr = m.wasmExports.malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  const doc = pdfium.FPDF_LoadMemDocument(ptr, bytes.length, '');
  const out = [];
  for (let i = 0; i < pdfium.FPDF_GetPageCount(doc); i++) {
    const page = pdfium.FPDF_LoadPage(doc, i), tp = pdfium.FPDFText_LoadPage(page), n = pdfium.FPDFText_CountChars(tp);
    const buf = m.wasmExports.malloc((n + 1) * 2);
    pdfium.FPDFText_GetText(tp, 0, n, buf);
    out.push(m.UTF16ToString(buf).replace(/\s+/g, ' ').trim());
    m.wasmExports.free(buf); pdfium.FPDFText_ClosePage(tp); pdfium.FPDF_ClosePage(page);
  }
  pdfium.FPDF_CloseDocument(doc); m.wasmExports.free(ptr);
  return out;
}
const copied = (bytes, page = 0) => pdfiumText(bytes)[page];
assert.equal(copied(await ops.layoutText([{ text: hindiLine }])), hindiLine);
assert.equal(copied(await ops.layoutText([{ text: 'தமிழ் மொழி கையில்' }])), 'தமிழ் மொழி கையில்');
assert.equal(copied(await ops.layoutText([{ text: 'مرحبا بالعالم' }])), 'مرحبا بالعالم');
assert.ok(copied(await ops.watermark(a, { mode: 'text', text: 'गोपनीय दस्तावेज़', position: 'mc' })).includes('गोपनीय दस्तावेज़'));
assert.ok(copied(await ops.annotate(a, [{ page: 0, x: 0.1, y: 0.1, w: 0.8, h: 0.1, kind: 'text', text: 'किताब पढ़िए', size: 14 }])).includes('किताब पढ़िए'));
assert.ok(copied(await ops.fillForm(form, { values: { name: 'प्रसाद किताब' }, flatten: true })).includes('प्रसाद किताब'));
const MIXED = ['English with Arabic مرحبا بالعالم inside, then more English.', 'Hello مرحبا بالعالم world', 'مرحبا Hello World 2026 שלום',
  'نص عربي طويل مع كلمة English واحدة', 'नमस्ते مرحبا 你好 Привет తెలుగు 2026', 'العدد 42 هنا', 'مرحبا بالعالم', 'قال (مرحبا) لي'];
for (const line of MIXED) assert.equal(copied(await ops.layoutText([{ text: line }])), line, `Chrome copy of "${line}"`);
for (const line of MIXED) assert.equal(await firefox(await ops.layoutText([{ text: line }])), line, `Firefox copy of "${line}"`);
{
  const filled = await ops.fillForm(form, { values: { name: 'مرحبا Hello World 2026' }, flatten: true });
  assert.ok(copied(filled).includes('مرحبا Hello World 2026'), 'Chrome copy of mixed form answer');
  assert.ok((await firefox(filled)).includes('مرحبا Hello World 2026'), 'Firefox copy of mixed form answer');
}

// ---------- rotated pages, combed and rotated fields ----------
{
  const d = await PDFDocument.create(); const pg = d.addPage([600, 800]); pg.setRotation(degrees(90));
  assert.deepEqual(ops.markRect(pg, { x: 0, y: 0, w: 0.5, h: 0.5 }), { x: 0, y: 0, width: 300, height: 400 });
  const rotated = await ops.annotate(await d.save(), [{ page: 0, x: 0.1, y: 0.1, w: 0.8, h: 0.2, kind: 'text', text: 'Rotated नमस्ते', size: 20 }]);
  assert.ok((await firefox(rotated)).includes('Rotated नमस्ते'), 'text on a rotated page');
  const f = d.getForm();
  const comb = f.createTextField('comb'); comb.setMaxLength(6); comb.enableCombing(); comb.addToPage(pg, { x: 50, y: 50, width: 240, height: 30 });
  const turned = f.createTextField('turned'); turned.addToPage(pg, { x: 50, y: 200, width: 40, height: 300 });
  turned.acroField.getWidgets()[0].getOrCreateAppearanceCharacteristics().setRotation(90);
  const filled = await ops.fillForm(await d.save(), { values: { comb: 'АБВГДЕ', turned: 'Привет мир' }, flatten: true });
  const t = await firefox(filled);
  assert.ok(['А', 'Б', 'В', 'Г', 'Д', 'Е'].every((c) => t.includes(c)) && t.includes('Привет мир'), `combed/rotated fields: ${t}`);
  if (process.env.ROT_OUT) fs.writeFileSync(process.env.ROT_OUT, rotated); // debugging aid
}

// Watermark: page range and below-content layer.
{
  const wm = await ops.watermark(a, { mode: 'text', text: 'ONLYTWO', pages: '2', layer: 'under' });
  const pagesText = await text(wm);
  assert.ok(!pagesText[0].includes('ONLYTWO') && pagesText[1].includes('ONLYTWO') && !pagesText[2].includes('ONLYTWO'), 'watermark page range');
  const first = (await PDFDocument.load(wm)).getPage(1).node.Contents();
  assert.ok(first.size() > 1, 'watermark stream moved to the front');
}

console.log('check.mjs: all ops checks passed');
