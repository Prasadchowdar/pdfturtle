// Runs PDFturtle's own compress-to-size code (src/render.js compressTo) on the sample documents for every
// size page, and writes:
//   src/size-results.js          - the measured table rows (imported by the size pages)
//   public/results/<slug>.jpg     - an original-vs-compressed crop of the mark sheet at that size
// Needs the dev site (vite, :5178) and the API server (:5179) running.
// Run: set PLAYWRIGHT_BROWSERS_PATH=0 && node seo-audit/size-tests/measure.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const SITE = process.env.SITE || 'http://localhost:5178/';
const SAMPLES = [
  ['certificate-scan.pdf', 'Scanned certificate, 1 page, colour, 200 DPI'],
  ['marksheet-scan-3p.pdf', 'Scanned mark sheets, 3 pages, colour, 200 DPI'],
  ['form-phone-photo-2p.pdf', 'Phone photos of a filled form, 2 pages'],
  ['typed-report.pdf', 'Typed report with selectable text, 7 pages'],
];
const TARGETS = [['50', '50kb'], ['100', '100kb'], ['200', '200kb'], ['300', '300kb'], ['500', '500kb'], ['1000', '1mb']];
const CROP = { x: 110, y: 560, w: 990, h: 560 }; // mark sheet page 1, in 200-DPI page pixels: subject table + note

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(SITE);
page.setDefaultTimeout(600_000);

const results = {}, imgDir = path.join(root, 'public', 'results');
fs.mkdirSync(imgDir, { recursive: true });
for (const [, slug] of TARGETS) results[slug] = [];

for (const [file, label] of SAMPLES) {
  const b64 = fs.readFileSync(path.join(here, 'samples', file)).toString('base64');
  const crop = file.startsWith('marksheet');
  const rows = await page.evaluate(async ({ b64, targets, crop, CROP }) => {
    // A refused server call (rate limit, crash) makes compressTo silently fall back to page images, which
    // would publish wrong numbers. Fail the whole run instead.
    // api() swallows fetch errors, so record failures here and check them after each run.
    if (!window.__apiFailures) {
      window.__apiFailures = [];
      const f = window.fetch;
      window.fetch = async (...a) => {
        try { const res = await f(...a); if (String(a[0]).startsWith('/api/') && !res.ok) window.__apiFailures.push(`${a[0]} -> ${res.status}`); return res; }
        catch (e) { window.__apiFailures.push(`${a[0]} -> ${e.message}`); throw e; }
      };
    }
    const r = await import('/src/render.js');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const scale = 1654 / 595.28; // 200 DPI
    const cut = async (pdfBytes) => {
      const c = await r.renderPage(await r.openPdf(pdfBytes), 1, scale);
      const o = document.createElement('canvas'); o.width = CROP.w; o.height = CROP.h;
      o.getContext('2d').drawImage(c, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CROP.w, CROP.h);
      return o;
    };
    const original = crop ? await cut(bytes) : null;
    const out = [];
    for (const [kb] of targets) {
      const t0 = performance.now();
      const res = await r.compressTo(bytes, +kb * 1000);
      if (window.__apiFailures.length) throw new Error(`server call failed, results would be wrong: ${window.__apiFailures.join('; ')}`);
      const row = { original: bytes.length, size: res.bytes.length, fits: res.fits, method: res.method, dpi: res.dpi ?? null, seconds: +((performance.now() - t0) / 1000).toFixed(1) };
      if (crop) { // side by side: original | result, with a caption strip
        const after = await cut(res.bytes), pad = 46, s = 0.62, w = Math.round(CROP.w * s), h = Math.round(CROP.h * s);
        const c = document.createElement('canvas'); c.width = w * 2 + 12; c.height = h + pad;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(original, 0, pad, w, h); g.drawImage(after, w + 12, pad, w, h);
        g.fillStyle = '#222'; g.font = '600 20px Arial';
        g.fillText(`Original (${Math.round(bytes.length / 1000)} KB)`, 6, 30);
        g.fillText(res.method === 'unchanged' ? `Unchanged (${Math.round(res.bytes.length / 1000)} KB, already fits)` : `Compressed to ${Math.round(res.bytes.length / 1000)} KB`, w + 18, 30);
        row.image = c.toDataURL('image/jpeg', 0.82);
      }
      out.push(row);
    }
    return out;
  }, { b64, targets: TARGETS, crop, CROP });
  rows.forEach((row, i) => {
    const slug = TARGETS[i][1];
    if (row.image) { fs.writeFileSync(path.join(imgDir, `${slug}.jpg`), Buffer.from(row.image.split(',')[1], 'base64')); delete row.image; }
    results[slug].push({ sample: label, ...row });
    console.log(slug.padEnd(6), label.padEnd(48), String(Math.round(row.original / 1000)).padStart(5), '->', String(Math.round(row.size / 1000)).padStart(5), 'KB', row.fits ? 'fits' : 'TOO BIG', row.method, row.dpi ?? '', `${row.seconds}s`);
  });
}
await browser.close();

fs.writeFileSync(path.join(root, 'src', 'size-results.js'),
  `// Generated by seo-audit/size-tests/measure.mjs on ${new Date().toISOString().slice(0, 10)} - do not edit by hand.\n` +
  `// PDFturtle's own compressTo() run on the fictional samples in seo-audit/size-tests/samples.\n` +
  `export const SIZE_RESULTS = ${JSON.stringify(results, null, 1)};\n`);
console.log('wrote src/size-results.js and public/results/*.jpg');
