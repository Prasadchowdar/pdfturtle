// Real-world PDF stress run: every PDF in corpus/pdfjs/test/pdfs through the core operations.
// Each file runs in its own child process (60 s limit) so crashes and hangs are caught, not fatal.
// Usage: node corpus/run.mjs [limit]   ->  corpus/report.json + a summary on stdout.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ME = fileURLToPath(import.meta.url);
const SRC = path.join(path.dirname(ME), 'pdfjs', 'test', 'pdfs');

if (process.argv[2] === '--one') {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const ops = await import('../src/ops.js');
  const bytes = new Uint8Array(fs.readFileSync(process.argv[3]));
  const pagesOf = async (b) => { const task = getDocument({ data: b.slice(), verbosity: 0, password: '' }); try { return (await task.promise).numPages; } finally { await task.destroy(); } };
  const out = { input: null, ops: {} };
  try { out.input = await pagesOf(bytes); } catch (e) { out.input = `unreadable: ${e.name}`; }
  const n = typeof out.input === 'number' ? out.input : null;
  const tests = {
    rotate: [() => ops.rotate(bytes, 90), n],
    watermark: [() => ops.watermark(bytes, { mode: 'text', text: 'DRAFT', position: 'mc', rotation: 45, opacity: 0.5, size: 48 }), n],
    pageNumbers: [() => ops.pageNumbers(bytes, { format: '{n}', position: 'bc' }), n],
    merge: [() => ops.merge([bytes, bytes]), n && n * 2],
    split: [async () => (await ops.split(bytes, { mode: 'ranges', ranges: '1' }))[0].bytes, 1],
    protect: [async () => ops.unlock(await ops.protect(bytes, 'pw'), 'pw'), n],
    compress: [() => ops.compressLossless(bytes), n],
    repair: [() => ops.repair(bytes), null],
  };
  for (const [name, [fn, expect]] of Object.entries(tests)) {
    const t0 = Date.now();
    try {
      const res = await fn();
      let pages;
      try { pages = await pagesOf(res); } catch (e) { out.ops[name] = { status: 'invalid-output', error: e.message.slice(0, 120) }; continue; }
      out.ops[name] = expect && pages !== expect ? { status: 'wrong-pages', pages, expect } : { status: 'ok', ms: Date.now() - t0 };
    } catch (e) {
      out.ops[name] = { status: 'error', error: String(e.message || e).slice(0, 160) };
    }
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.pdf')).sort().slice(0, +process.argv[2] || Infinity);
const results = {};
let next = 0, done = 0;
async function worker() {
  while (next < files.length) {
    const f = files[next++];
    results[f] = await new Promise((resolve) => {
      const child = spawn(process.execPath, ['--max-old-space-size=1024', ME, '--one', path.join(SRC, f)], { stdio: ['ignore', 'pipe', 'pipe'] });
      let so = '', se = '';
      child.stdout.on('data', (d) => { so += d; });
      child.stderr.on('data', (d) => { se += d; });
      const timer = setTimeout(() => { child.kill(); resolve({ hang: true }); }, 60_000);
      child.on('close', (code) => {
        clearTimeout(timer);
        try { resolve(JSON.parse(so)); } catch { resolve({ crash: code, stderr: se.slice(-300) }); }
      });
    });
    if (++done % 50 === 0) console.log(`${done}/${files.length}`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
fs.writeFileSync(path.join(path.dirname(ME), 'report.json'), JSON.stringify(results, null, 1));

const all = Object.entries(results);
const readable = all.filter(([, r]) => typeof r.input === 'number');
console.log(`\n${all.length} files: ${readable.length} open in pdf.js, ${all.filter(([, r]) => r.hang).length} hangs, ${all.filter(([, r]) => 'crash' in r).length} crashes`);
for (const op of ['rotate', 'watermark', 'pageNumbers', 'merge', 'split', 'protect', 'compress', 'repair']) {
  const c = {};
  for (const [, r] of readable) { const s = r.ops?.[op]?.status || 'missing'; c[s] = (c[s] || 0) + 1; }
  console.log(op.padEnd(12), JSON.stringify(c));
}
for (const [f, r] of all) if (r.hang || 'crash' in r) console.log(r.hang ? 'HANG ' : 'CRASH', f, r.stderr?.split('\n').filter(Boolean).at(-1) || '');
for (const [f, r] of readable) for (const [op, o] of Object.entries(r.ops || {})) if (['invalid-output', 'wrong-pages'].includes(o.status)) console.log('BAD  ', op, f, JSON.stringify(o));
