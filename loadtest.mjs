// Load test against a running production server: node loadtest.mjs [baseUrl]
// Start the server with PDFTURTLE_RATE raised, or the per-IP limit answers 429 after 60 requests.
import autocannon from 'autocannon';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5180';
const F = (n) => fs.readFileSync(new URL(`./e2e/.files/${n}`, import.meta.url));
const pdf = F('a.pdf'), docx = F('doc.docx'), html = F('page.html');

const runs = [
  ['GET / (page, gzip)', { url: `${BASE}/`, connections: 50, duration: 15, headers: { 'accept-encoding': 'gzip' } }],
  ['GET /api/health', { url: `${BASE}/api/health`, connections: 50, duration: 10 }],
  ['POST /api/compress (Ghostscript)', { url: `${BASE}/api/compress`, method: 'POST', body: pdf, connections: 4, duration: 30, timeout: 120 }],
  ['POST /api/office docx (LibreOffice)', { url: `${BASE}/api/office?ext=docx`, method: 'POST', body: docx, connections: 4, duration: 40, timeout: 180 }],
  ['POST /api/html (Chrome)', { url: `${BASE}/api/html`, method: 'POST', body: html, connections: 4, duration: 30, timeout: 120 }],
];

for (const [name, opts] of runs) {
  const r = await autocannon(opts);
  const errs = r.errors + r.timeouts + r.non2xx;
  console.log(`${name.padEnd(36)} ${String(r.requests.total).padStart(6)} req  ${r.requests.average.toFixed(1).padStart(7)} req/s  p50 ${r.latency.p50} ms  p99 ${r.latency.p99} ms  errors ${errs}`);
}
