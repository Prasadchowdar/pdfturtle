// PDFturtle conversion server: LibreOffice (Office <-> PDF), Ghostscript (PDF/A, compression),
// headless Chrome/Edge (HTML -> PDF). Serves dist/ too, so `npm run build && npm run server` is the whole app.
import http from 'node:http';
import https from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import zlib from 'node:zlib';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as ai from './ai.mjs';
import * as acct from './accounts.mjs';
import { metaFor, indexablePaths, jsonLd } from './src/seo.js';
import { headerHTML, footerHTML, mainHTML, homeMainHTML } from './src/shell.js';

const exec = promisify(execFile);
const PORT = +process.env.PORT || 5179;
const MAX_BYTES = 100 * 1024 * 1024;
const TIMEOUT = 180_000;
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const OFFICE_EXT = new Set(['doc', 'docx', 'odt', 'rtf', 'txt', 'xls', 'xlsx', 'ods', 'csv', 'ppt', 'pptx', 'odp']);

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// Looked up per request so installing an engine doesn't need a server restart.
function bin(env, candidates) {
  if (process.env[env]) return process.env[env];
  return candidates.find((c) => c && existsSync(c)) || null;
}
function gsWindows() {
  try {
    const base = 'C:\\Program Files\\gs';
    return readdirSync(base).sort().reverse().map((d) => path.join(base, d, 'bin', 'gswin64c.exe')).find(existsSync);
  } catch { return null; }
}
const engines = () => ({
  soffice: bin('SOFFICE', ['C:\\Program Files\\LibreOffice\\program\\soffice.exe', '/usr/bin/soffice', '/usr/bin/libreoffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice']),
  gs: bin('GS', [gsWindows(), '/usr/bin/gs', '/usr/local/bin/gs', '/opt/homebrew/bin/gs']),
  chrome: bin('CHROME', ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']),
});
function need(name) {
  const p = engines()[name];
  if (!p) throw new HttpError(503, `${name} is not installed on the server`);
  return p;
}

// Native Ghostscript if installed, else the bundled WebAssembly build (gs-wasm.mjs) in a child process.
// Both take the same args; input and output paths are passed explicitly.
const GS_WASM = path.join(path.dirname(fileURLToPath(import.meta.url)), 'gs-wasm.mjs');
async function ghostscript(input, out, args) {
  const native = engines().gs;
  // Ghostscript runs files as it meets them, so every -flag (incl. the output path) must come first.
  const flags = args.filter((a) => a.startsWith('-')), files = args.filter((a) => !a.startsWith('-'));
  if (native) return runTool(native, [...flags, `-sOutputFile=${out}`, ...files, input]);
  return runTool(process.execPath, [GS_WASM, input, out, ...flags, ...files]);
}

// PDF/A needs an OutputIntent with an embedded ICC profile; use the sRGB profile compiled into Ghostscript.
const PDFA_DEF = `%!
/ICCProfile (%rom%iccprofiles/srgb.icc) def
[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark
[{icc_PDFA} << /N 3 >> /PUT pdfmark
[{icc_PDFA} ICCProfile (r) file /PUT pdfmark
[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark
[{OutputIntent_PDFA} << /Type /OutputIntent /S /GTS_PDFA1 /DestOutputProfile {icc_PDFA} /OutputConditionIdentifier (sRGB IEC61966-2.1) /Info (sRGB) >> /PUT pdfmark
[{Catalog} << /OutputIntents [ {OutputIntent_PDFA} ] >> /PUT pdfmark
`;

// At most MAX_JOBS engine processes per engine binary at once (LibreOffice and Chrome are heavy); others wait.
const MAX_JOBS = Math.max(1, +process.env.PDFTURTLE_MAX_JOBS || 2);
const running = new Map(); // binary -> { active, queue }
async function slot(key) {
  const s = running.get(key) ?? running.set(key, { active: 0, queue: [] }).get(key);
  if (s.active >= MAX_JOBS) await new Promise((resolve) => s.queue.push(resolve));
  s.active++;
  return () => { s.active--; s.queue.shift()?.(); };
}

async function runTool(file, args) {
  const release = await slot(path.basename(file) === path.basename(process.execPath) ? 'gs-wasm' : file);
  try { await exec(file, args, { timeout: TIMEOUT, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }); }
  catch (e) { throw new HttpError(422, `Conversion failed (is the file damaged?): ${(e.stderr || e.message || '').toString().trim().slice(0, 400)}`); }
  finally { release(); }
}

// Per-IP limit on server work: PDFTURTLE_RATE requests per 10 minutes (default 60) for conversions and AI.
const RATE = Math.max(1, +process.env.PDFTURTLE_RATE || 60);
const hits = new Map();
// Behind a reverse proxy every request arrives from the proxy's address. With PDFTURTLE_TRUST_PROXY=1 the
// client is the last X-Forwarded-For entry, which the proxy itself writes (Caddy replaces any client-sent value).
// Only set it when the app port is reachable solely through that proxy, or clients could pick their own address.
const TRUST_PROXY = process.env.PDFTURTLE_TRUST_PROXY === '1';
const clientIp = (req) => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',').pop().trim()) || req.socket.remoteAddress || '';
function rateLimit(ip) {
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h.since > 600_000) { hits.set(ip, { since: now, n: 1 }); return; }
  if (++h.n > RATE) throw new HttpError(429, 'Too many conversions from your network. Try again in a few minutes.');
}
setInterval(() => { const now = Date.now(); for (const [ip, h] of hits) if (now - h.since > 600_000) hits.delete(ip); }, 600_000).unref();

async function readOut(p) {
  try { return await fs.readFile(p); } catch { throw new HttpError(500, 'The converter produced no output (file may be damaged or password-protected)'); }
}

// Each LibreOffice run gets its own profile dir so parallel requests don't fight over a lock.
async function soffice(dir, input, args) {
  await runTool(need('soffice'), ['--headless', '--norestore', '--nolockcheck', `-env:UserInstallation=${pathToFileURL(path.join(dir, 'profile')).href}`, ...args, '--outdir', dir, input]);
}

const ops = {
  async office(dir, body, q) {
    const ext = String(q.get('ext') || '').toLowerCase();
    if (!OFFICE_EXT.has(ext)) throw new HttpError(400, 'Unsupported file type');
    const input = path.join(dir, `in.${ext}`);
    await fs.writeFile(input, body);
    await soffice(dir, input, ['--convert-to', 'pdf']);
    return readOut(path.join(dir, 'in.pdf'));
  },
  async pdf2pptx(dir, body) {
    const input = path.join(dir, 'in.pdf');
    await fs.writeFile(input, body);
    await soffice(dir, input, ['--infilter=impress_pdf_import', '--convert-to', 'pptx']);
    return readOut(path.join(dir, 'in.pptx'));
  },
  async pdfa(dir, body, q) {
    const level = ['1', '2', '3'].includes(q.get('level')) ? q.get('level') : '2';
    const input = path.join(dir, 'in.pdf'), out = path.join(dir, 'out.pdf');
    const def = path.join(dir, 'PDFA_def.ps');
    await fs.writeFile(input, body);
    await fs.writeFile(def, PDFA_DEF);
    try {
      await ghostscript(input, out, ['-dPDFA=' + level, '-dBATCH', '-dNOPAUSE', '-dQUIET', '-dPDFACompatibilityPolicy=1',
        '-sColorConversionStrategy=RGB', '-sDEVICE=pdfwrite', def]);
    } catch (e) {
      // Seen with the WASM build: PDF/A-1 conversion crashes on transparent content (opacity, alpha images),
      // which PDF/A-1 forbids. 2b/3b allow transparency and pass veraPDF on the same files.
      if (level === '1') throw new HttpError(422, 'This PDF uses transparency, which PDF/A-1b does not allow. Choose PDF/A-2b instead.');
      throw e;
    }
    return readOut(out);
  },
  async compress(dir, body, q) {
    const preset = { extreme: '/screen', recommended: '/ebook', low: '/printer' }[q.get('level')] || '/ebook';
    const input = path.join(dir, 'in.pdf'), out = path.join(dir, 'out.pdf');
    await fs.writeFile(input, body);
    await ghostscript(input, out, ['-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5', `-dPDFSETTINGS=${preset}`, '-dDetectDuplicateImages=true',
      '-dBATCH', '-dNOPAUSE', '-dQUIET', '-dSAFER']);
    const res = await readOut(out);
    return res.length < body.length ? res : body; // never hand back a bigger file
  },
  async html(dir, body, q) {
    // Page setup: size, orientation, margin, and the screen width the page is laid
    // out for (Chrome prints at that width, scaled to the paper).
    const size = { a4: 'A4', letter: 'letter', a3: 'A3', legal: 'legal' }[q.get('size')] || 'A4';
    const landscape = q.get('orientation') === 'landscape' ? ' landscape' : '';
    const margin = { none: '0', small: '10mm', big: '25mm' }[q.get('margin')] ?? '10mm';
    const screen = Math.min(3840, Math.max(320, +q.get('screen') || 1440));
    const pageCss = `<style>@page { size: ${size}${landscape}; margin: ${margin}; }</style>`;
    let html, csp = '';
    if (q.get('url')) {
      html = await fetchPublicHtml(q.get('url'));
    } else {
      html = body.toString('utf8');
      // Uploaded HTML: block every load except inline/data/https so the page can't read local files.
      csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' data: https:; img-src data: https:; font-src data: https:">`;
    }
    const out = path.join(dir, 'out.pdf');
    // Chrome sees the page at http://pdfturtle.page/ through our egress proxy, never as a file:// URL: an http
    // page can't navigate to local files, and every request it makes (redirects, subresources, meta refresh,
    // loopback included) is checked against private addresses with the resolved IP pinned.
    const proxy = await egressProxy(Buffer.from(csp + pageCss + html));
    try {
      // PDFTURTLE_CHROME_FLAGS: extra flags, e.g. "--no-sandbox" inside containers where Chrome's sandbox can't start.
      await runTool(need('chrome'), [...(process.env.PDFTURTLE_CHROME_FLAGS || '').split(/\s+/).filter(Boolean), '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
        `--proxy-server=http://127.0.0.1:${proxy.address().port}`, '--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--disable-quic',
        `--user-data-dir=${path.join(dir, 'chrome')}`, `--window-size=${screen},1080`, '--no-pdf-header-footer', '--virtual-time-budget=8000', `--print-to-pdf=${out}`, PAGE_URL]);
    } finally { proxy.close(); proxy.closeAllConnections(); }
    return readOut(out);
  },
};

// Fetch a public page ourselves (each redirect hop re-checked against private addresses), and add a <base>
// so its relative links, styles and images still resolve when Chrome prints our local copy.
async function fetchPublicHtml(raw) {
  let url = await publicUrl(raw);
  for (let hop = 0; hop < 5; hop++) {
    // Connect to the address publicAddress checked (pinned), so DNS rebinding can't point us inside.
    const a = await publicAddress(url.hostname);
    let res;
    try {
      res = await new Promise((resolve, reject) => {
        const r = (url.protocol === 'https:' ? https : http).get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (PDFturtle HTML to PDF)' },
          lookup: (h, o, cb) => (o.all ? cb(null, [a]) : cb(null, a.address, a.family)) }, resolve);
        r.on('timeout', () => r.destroy(new Error('timed out')));
        r.on('error', reject);
      });
    } catch (e) { throw new HttpError(400, `Could not load the page (${e.message})`); }
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); url = await publicUrl(new URL(res.headers.location, url).href); continue; }
    if (res.statusCode >= 400) { res.resume(); throw new HttpError(400, `The page answered ${res.statusCode}`); }
    if (!/html|xml/i.test(res.headers['content-type'] || '')) { res.resume(); throw new HttpError(400, 'That address is not a web page'); }
    const chunks = [];
    let size = 0;
    for await (const c of res) {
      if ((size += c.length) > 10 * 1024 * 1024) { res.destroy(); throw new HttpError(413, 'Page is larger than 10 MB'); }
      chunks.push(c);
    }
    return `<base href="${url.href.replace(/"/g, '%22')}">` + Buffer.concat(chunks).toString('utf8');
  }
  throw new HttpError(400, 'Too many redirects');
}

function privateIp(ip) {
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
}

// Resolve a host and refuse it if any address is private; returns the address to connect to (pinned, so a
// second DNS answer can't swap in an internal one).
async function publicAddress(host) {
  host = host.replace(/^\[|\]$/g, '');
  let addrs;
  try { addrs = await dns.lookup(host, { all: true }); } catch { throw new HttpError(400, `Could not find ${host}`); }
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new HttpError(400, 'Private or local addresses are not allowed');
  return addrs[0];
}

export async function publicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new HttpError(400, 'That is not a valid web address'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new HttpError(400, 'Only http and https addresses work');
  await publicAddress(url.hostname);
  return url;
}

// One-shot HTTP proxy for headless Chrome: serves the page itself at PAGE_URL and lets everything else out
// only to public addresses. Plain http is forwarded; https goes through CONNECT tunnels.
const PAGE_URL = 'http://pdfturtle.invalid/'; // .invalid: never HSTS-upgraded or resolvable
async function egressProxy(page) {
  const proxy = http.createServer(async (req, res) => {
    if (req.url === PAGE_URL) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(page); }
    try {
      const u = new URL(req.url);
      if (u.protocol !== 'http:') throw new HttpError(400, 'Only http');
      const a = await publicAddress(u.hostname);
      const up = http.request({ host: a.address, family: a.family, port: u.port || 80, path: u.pathname + u.search, method: req.method,
        headers: { ...req.headers, host: u.host }, timeout: 15000 }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
      up.on('error', () => res.destroy());
      req.pipe(up);
    } catch { res.writeHead(403); res.end(); }
  });
  proxy.on('connect', async (req, sock) => {
    sock.on('error', () => {});
    try {
      const [, host, port] = /^(.*):(\d+)$/.exec(req.url) || [];
      if (!host || !['443', '80'].includes(port)) throw new Error('port');
      const a = await publicAddress(host);
      const up = net.connect({ host: a.address, port: +port }, () => { sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); up.pipe(sock); sock.pipe(up); });
      up.on('error', () => sock.destroy());
    } catch { sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); }
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  return proxy;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BYTES) throw new HttpError(413, 'File is larger than 100 MB');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

const TYPES = { pdf: 'application/pdf', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm', '.map': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

// Content Security Policy for the app: its own code, the OCR engine's files (jsDelivr), Google Fonts.
// Everything else (frames, plugins, other origins for scripts) is refused.
const CSP = [
  "default-src 'self'", "script-src 'self' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net", "worker-src 'self' blob: https://cdn.jsdelivr.net",
  "connect-src 'self' blob: data: https://cdn.jsdelivr.net https://tessdata.projectnaptha.com", "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' data: https://fonts.gstatic.com",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');
const SECURITY_HEADERS = { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY', 'Cross-Origin-Opener-Policy': 'same-origin' };
const gzipCache = new Map();

async function serveStatic(req, res, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { throw new HttpError(400, 'Bad address'); }
  let file = path.resolve(DIST, '.' + decoded);
  if (file !== DIST && !file.startsWith(DIST + path.sep)) throw new HttpError(403, 'Forbidden');
  try { if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html'); } catch {
    if (pathname.startsWith('/assets/')) throw new HttpError(404, 'Not found'); // a missing build file, not an app route
    file = path.join(DIST, 'index.html');
  }
  let data;
  try { data = await fs.readFile(file); } catch { throw new HttpError(404, 'Not found (run npm run build first)'); }
  // The app page: write this path's head tags and a prerendered body (shell.js) into the HTML, so crawlers
  // that don't run JavaScript see the real page. Unknown paths get the app with a 404 status and noindex.
  let status = 200, cacheKey = file;
  if (file === path.join(DIST, 'index.html')) {
    const m = metaFor(pathname);
    if (!m) status = 404;
    // Without PDFTURTLE_SITE_URL the absolute links come from the Host header, so those pages aren't cached.
    cacheKey = SITE_URL ? (m ? m.path : '404') : null;
    const body = headerHTML() + (mainHTML(pathname) || homeMainHTML()) + footerHTML();
    data = Buffer.from(data.toString('utf8')
      .replace(/<title>[\s\S]*?<\/title>\s*<meta name="description"[^>]*>/, () => headTags(m, siteBase(req)))
      .replace('<div id="app"></div>', () => `<div id="app">${body}</div>`));
  }
  const ext = path.extname(file);
  const headers = { ...SECURITY_HEADERS, ...(req.headers['x-forwarded-proto'] === 'https' ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}), 'Content-Type': MIME[ext] || (ext === '.ttf' ? 'font/ttf' : 'application/octet-stream'),
    // Vite fingerprints everything under /assets, so those can be cached for a year; the page itself never.
    'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' };
  if (/\.(js|mjs|css|html|json|svg|map)$/.test(file) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    if (!cacheKey) data = zlib.gzipSync(data);
    else {
      if (!gzipCache.has(cacheKey)) gzipCache.set(cacheKey, zlib.gzipSync(data));
      data = gzipCache.get(cacheKey);
    }
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
  }
  res.writeHead(status, headers);
  res.end(data);
}

// PDFTURTLE_SITE_URL (e.g. https://pdfturtle.com) makes canonical links absolute; set it in production.
const SITE_URL = (process.env.PDFTURTLE_SITE_URL || '').replace(/\/+$/, '');
const escHtml = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function headTags(m, base) {
  if (!m) return '<title>Page not found · PDFturtle</title><meta name="description" content=""><meta name="robots" content="noindex">';
  const t = escHtml(m.title), d = escHtml(m.description), url = escHtml(base + m.path), img = escHtml(`${base}/og.png`);
  const ld = jsonLd(m, base);
  return `<title>${t}</title><meta name="description" content="${d}"><meta name="robots" content="${m.index ? 'index,follow' : 'noindex'}">` +
    `<link rel="canonical" href="${url}">` +
    `<meta property="og:type" content="website"><meta property="og:site_name" content="PDFturtle"><meta property="og:url" content="${url}">` +
    `<meta property="og:title" content="${t}"><meta property="og:description" content="${d}">` +
    `<meta property="og:image" content="${img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">` +
    `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${t}"><meta name="twitter:description" content="${d}"><meta name="twitter:image" content="${img}">` +
    (ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : '');
}

function siteBase(req) {
  if (SITE_URL) return SITE_URL;
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${String(req.headers.host || 'localhost').replace(/[^\w.:-]/g, '')}`;
}
function seoFile(req, res, pathname) {
  const base = siteBase(req);
  const body = pathname === '/robots.txt'
    ? `User-agent: *
Allow: /
Disallow: /api/
Sitemap: ${base}/sitemap.xml
`
    : `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexablePaths().map((p) => `  <url><loc>${escHtml(base + p)}</loc></url>`).join('\n')}
</urlset>
`;
  res.writeHead(200, { 'Content-Type': pathname === '/robots.txt' ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  res.end(body);
}

// Account routes. Mutating requests must be JSON: browsers can't send that cross-site without a CORS
// preflight (which we never allow), so together with SameSite=Lax cookies this blocks CSRF.
async function handleAccount(req, res, url) {
  const json = (status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };
  const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  const ip = clientIp(req);
  const body = async () => {
    if (!/^application\/json/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Send JSON');
    try { return JSON.parse((await readBody(req)).toString('utf8') || '{}'); } catch { throw new HttpError(400, 'Invalid JSON'); }
  };
  const token = acct.tokenFrom(req);
  try {
    if (url.pathname === '/api/auth/me' && req.method === 'GET') return json(200, { user: acct.userFor(token) });
    if (url.pathname === '/api/auth/signup' && req.method === 'POST') {
      const { user, token: t } = acct.signup(await body());
      return json(201, { user }, { 'Set-Cookie': acct.sessionCookie(t, secure) });
    }
    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      const { user, token: t } = acct.login(await body(), ip);
      return json(200, { user }, { 'Set-Cookie': acct.sessionCookie(t, secure) });
    }
    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      await body();
      acct.logout(token);
      return json(200, { ok: true }, { 'Set-Cookie': acct.sessionCookie(null, secure) });
    }
    if (url.pathname === '/api/user/workflows') {
      const user = acct.userFor(token);
      if (!user) throw new HttpError(401, 'Log in first');
      if (req.method === 'GET') return json(200, { workflows: acct.getWorkflows(user.id) });
      if (req.method === 'PUT') { acct.putWorkflows(user.id, (await body()).workflows); return json(200, { ok: true }); }
    }
    throw new HttpError(404, 'Unknown operation');
  } catch (e) {
    if (e instanceof acct.AuthError) throw new HttpError(e.status, e.message);
    throw e;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const t0 = Date.now();
    res.on('finish', () => console.log(`${new Date().toISOString()} ${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - t0}ms`));
  }
  let dir;
  try {
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const e = engines();
      return res.end(JSON.stringify({ soffice: !!e.soffice, gs: e.gs ? 'native' : 'wasm', chrome: !!e.chrome, ai: ai.aiEnabled() }));
    }
    if (url.pathname.startsWith('/api/auth/') || url.pathname === '/api/user/workflows') return await handleAccount(req, res, url);
    if (url.pathname.startsWith('/api/')) rateLimit(clientIp(req));
    if (url.pathname === '/api/ai/summarize' || url.pathname === '/api/ai/translate') {
      if (req.method !== 'POST') throw new HttpError(405, 'Use POST');
      let input;
      try { input = JSON.parse((await readBody(req)).toString('utf8')); } catch { throw new HttpError(400, 'Send JSON'); }
      const out = url.pathname.endsWith('summarize') ? await ai.summarize(input) : await ai.translate(input);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(out));
    }
    const op = url.pathname.startsWith('/api/') && Object.hasOwn(ops, url.pathname.slice(5)) && ops[url.pathname.slice(5)];
    if (!op) {
      if (url.pathname.startsWith('/api/')) throw new HttpError(404, 'Unknown operation');
      if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml') return seoFile(req, res, url.pathname);
      return await serveStatic(req, res, url.pathname);
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Use POST');
    const body = await readBody(req);
    if (!body.length && !url.searchParams.get('url')) throw new HttpError(400, 'Empty upload');
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdfturtle-'));
    const out = await op(dir, body, url.searchParams);
    const ext = url.pathname.endsWith('pdf2pptx') ? 'pptx' : 'pdf';
    res.writeHead(200, { 'Content-Type': TYPES[ext], 'Content-Length': out.length });
    res.end(out);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  } finally {
    if (dir) {
      try { await fs.rm(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* temp dir; OS cleans it eventually */ }
    }
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.env.NODE_ENV === 'production' && !existsSync(path.join(DIST, 'index.html'))) {
    console.error('dist/ is missing: run `npm run build` first.');
    process.exit(1);
  }
  server.requestTimeout = TIMEOUT + 60_000;
  server.listen(PORT, process.env.HOST || '0.0.0.0', () => console.log(`PDFturtle server on http://localhost:${PORT}`, { ...engines(), ai: ai.aiEnabled() }));
  // Finish requests in flight on shutdown (systemd, Docker, PaaS send SIGTERM).
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { console.log(`${sig}: shutting down`); server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 30_000).unref(); });
}
