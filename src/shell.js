// Page markup as HTML strings, shared by the browser (main.js builds the live page from these) and the server
// (prerendered into index.html so crawlers that don't run JavaScript still see real content). No DOM here.
import { TOOLS, CATS, color, SIZE_PAGES } from './tools.js';
import { TOOL_CONTENT } from './content.js';
import { pageHTML } from './pages.js';
import { workflowCard } from './workflows.js';
import { SIZE_RESULTS } from './size-results.js';

// AGPL-3.0 section 13: users of the public site must be offered the source of the version they are using.
export const SOURCE_URL = 'https://github.com/Prasadchowdar/pdfturtle';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const byId = (id) => TOOLS.find((t) => t.id === id);

const CONVERT_TO = ['jpg-to-pdf', 'word-to-pdf', 'powerpoint-to-pdf', 'excel-to-pdf', 'html-to-pdf'];
const CONVERT_FROM = ['pdf-to-jpg', 'pdf-to-word', 'pdf-to-powerpoint', 'pdf-to-excel', 'pdf-to-pdfa', 'pdf-to-markdown'];
export const link = (id) => { const t = byId(id); return `<a href="/${t.id}"><span class="mini" style="--c:${color(t)}">${t.glyph}</span>${esc(t.name)}</a>`; };

export const headerHTML = () => `<header class="top">
  <a class="logo" href="/"><picture><source media="(max-width: 520px)" srcset="/logo-mark.svg" width="58" height="36"><img src="/logo.svg" alt="PDFturtle" width="179" height="36"></picture></a>
  <nav>
    <a class="hide-sm" href="/merge-pdf">Merge PDF</a>
    <a class="hide-sm" href="/split-pdf">Split PDF</a>
    <a class="hide-sm" href="/compress-pdf">Compress PDF</a>
    <div class="menu hide-sm"><button>Convert PDF ▾</button><div class="drop cols">
      <div><span class="dh">Convert to PDF</span>${CONVERT_TO.map(link).join('')}</div>
      <div><span class="dh">Convert from PDF</span>${CONVERT_FROM.map(link).join('')}</div></div></div>
    <div class="menu"><button>All PDF tools ▾</button><div class="drop cols mega">
      ${Object.entries(CATS).map(([k, c]) => `<div><span class="dh">${c.label}</span>${TOOLS.filter((t) => t.cat === k && !t.variant).map((t) => link(t.id)).join('')}</div>`).join('')}
    </div></div>
  </nav>
</header>`;

export const footerHTML = () => `<footer class="site-foot"><div class="foot-cols">
  <div><h2>Product</h2><a href="/">Home</a><a href="/page/features">Features</a><a href="/page/pricing">Pricing</a><a href="/page/tools">Tools</a><a href="/page/faq">FAQ</a></div>
  <div><h2>Resources</h2><a href="/workflows">Workflows</a><a href="/page/developers">Developers & self-hosting</a></div>
  <div><h2>Solutions</h2><a href="/page/business">Business</a><a href="/page/education">Education</a></div>
  <div><h2>Legal</h2><a href="/page/security">Security</a><a href="/page/privacy">Privacy policy</a><a href="/page/terms">Terms & conditions</a><a href="/page/cookies">Cookies</a></div>
  <div><h2>Company</h2><a href="/page/about">About us</a><a href="/page/contact">Contact us</a></div>
</div><div class="foot-line"><span>© PDFturtle ${new Date().getFullYear()} · Your PDF editor · <a href="${SOURCE_URL}" rel="noopener">Source code (AGPL)</a></span></div></footer>`;

const card = (t) => `<a class="card" href="/${t.id}" data-cat="${t.cat}">
  <span class="ico" style="--c:${color(t)}">${t.glyph}</span>
  <h2>${esc(t.name)}</h2><p>${esc(t.desc)}</p></a>`;

// Homepage order: the most-used tools first; tools listed only in menus go last.
const HOME_ORDER = ['merge-pdf', 'split-pdf', 'compress-pdf', 'compress-pdf-to-size', 'pdf-to-word', 'pdf-to-powerpoint', 'pdf-to-excel', 'word-to-pdf', 'powerpoint-to-pdf', 'excel-to-pdf',
  'edit-pdf', 'pdf-to-jpg', 'jpg-to-pdf', 'sign-pdf', 'add-watermark', 'rotate-pdf', 'html-to-pdf', 'unlock-pdf', 'protect-pdf', 'organize-pdf', 'pdf-to-pdfa',
  'repair-pdf', 'add-page-numbers', 'scan-to-pdf', 'ocr-pdf', 'compare-pdf', 'redact-pdf', 'crop-pdf', 'pdf-forms', 'summarize-pdf', 'translate-pdf', 'pdf-to-markdown'];

export const homeMainHTML = () => `<main class="home">
  <h1>Every tool you need to work with PDFs in one place</h1>
  <p class="lead">Every tool you need to use PDFs, at your fingertips. All are 100% free and run in your browser — merge, split, compress, convert, rotate, unlock and watermark PDFs with just a few clicks.</p>
  <div class="pills"><button class="on" data-f="all">All</button><button data-f="workflows">Workflows</button>${Object.entries(CATS).map(([k, c]) => `<button data-f="${k}">${c.label}</button>`).join('')}</div>
  <div class="grid">${HOME_ORDER.map(byId).concat(TOOLS.filter((t) => !HOME_ORDER.includes(t.id) && !t.variant)).map(card).join('')}${workflowCard()}</div>
</main>`;

// "How to merge PDF", "How to convert PDF to Word", "How to use AI Summarizer".
const howTo = (t) => (/^(AI |PDF Forms)/.test(t.name) ? `How to use ${t.name}`
  : t.cat === 'convert' ? `How to convert ${t.name.replace(/^(\w+) to/, '$1 to')}`
    : `How to ${t.name[0].toLowerCase()}${t.name.slice(1)}`);

// "Tested" section of a size page: measured results from seo-audit/size-tests/measure.mjs.
const kb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${Math.round(n / 1000)} KB`);
const DID = { unchanged: () => 'Already under the limit: returned unchanged', lossless: () => 'Rebuilt without any quality loss',
  text: (r) => `Compressed with Ghostscript${r.dpi ? `, images kept at up to ${r.dpi} DPI` : ''}; any text stays selectable`,
  images: (r) => `Last resort: pages redrawn as images at ${r.dpi} DPI`,
  'images-gray': (r) => `Last resort: pages redrawn as grayscale images at ${r.dpi} DPI` };
function testedHTML(t, c) {
  const slug = t.id.replace('compress-pdf-to-', ''), rows = SIZE_RESULTS[slug];
  if (!rows || !c.tested) return '';
  const label = t.name.replace('Compress PDF to ', '');
  return `<h2>Tested: what fits in ${esc(label)}</h2><p>${esc(c.tested)}</p>
  <div class="results-wrap"><table class="results"><thead><tr><th>Sample document</th><th>Original</th><th>Result</th><th>What PDFturtle did</th></tr></thead><tbody>
  ${rows.map((r) => `<tr><td>${esc(r.sample)}</td><td>${kb(r.original)}</td><td>${r.fits ? '' : 'Too big: '}${kb(r.size)}</td><td>${esc((DID[r.method] || DID.text)(r))}</td></tr>`).join('')}
  </tbody></table></div>
  <figure class="results-fig"><img src="/results/${slug}.jpg" width="1240" height="393" loading="lazy" alt="A scanned mark sheet before and after compressing to ${esc(label)}: the original on the left, PDFturtle's result on the right">
  <figcaption>Part of page 1 of the three-page mark sheet sample: original on the left, after compressing to ${esc(label)} on the right.</figcaption></figure>
  <p class="results-note">How we tested: four fictional sample documents (two flatbed scans, phone photos of a form and a typed report) were run through this exact tool on 23 November 2026. A kilobyte here is 1,000 bytes. The samples and the test script are part of our <a href="${SOURCE_URL}/tree/main/seo-audit/size-tests" rel="noopener">open-source code</a>, so anyone can repeat the test.</p>`;
}

// How-to steps, explanation and related tools under the tool's file picker.
export function toolInfoHTML(t) {
  const c = TOOL_CONTENT[t.id];
  if (!c) return '';
  const related = TOOLS.filter((x) => x.cat === t.cat && x.id !== t.id && !x.unavailable && !x.variant).slice(0, 6);
  // Compress pages link every size page (and each size page its siblings).
  const sizes = t.id.startsWith('compress-pdf') ? SIZE_PAGES.map(([, slug]) => `compress-pdf-to-${slug}`).filter((id) => id !== t.id) : [];
  return `<section class="tool-info">
  <h2>${esc(howTo(t))}</h2><ol>${c.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
  <h2>About ${esc(t.name)}</h2>${c.about.map((p) => `<p>${esc(p)}</p>`).join('')}
  ${testedHTML(t, c)}
  ${c.tips ? `<h2>${esc(c.tipsTitle || 'Tips')}</h2><ul>${c.tips.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
  ${sizes.length ? `<h2>Compress a PDF to a specific size</h2><div class="chips">${sizes.map(link).join('')}</div>` : ''}
  ${related.length ? `<h2>Related tools</h2><div class="chips">${related.map((x) => link(x.id)).join('')}</div>` : ''}
</section>`;
}

const pickLabel = (t) => {
  const kind = t.accept.includes('pdf') ? 'PDF' : t.accept.includes('image') ? 'images' : 'files';
  return t.pick || `Select ${kind === 'PDF' ? (t.multi ? 'PDF files' : 'PDF file') : kind}`;
};
export const toolHeadHTML = (t) => `<h1>${esc(t.name)}</h1><p class="lead">${esc(t.desc)}</p>`;
export { pickLabel };

// Static <main> for a path, for the server to prerender (the browser replaces it on load).
export function mainHTML(pathname) {
  let id;
  try { id = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, ''); } catch { return null; }
  if (!id) return homeMainHTML();
  const t = byId(id);
  if (t) return `<main class="pick">${toolHeadHTML(t)}<span class="bigbtn">${esc(pickLabel(t))}</span>${toolInfoHTML(t)}</main>`;
  if (id.startsWith('page/')) return pageHTML(id.slice(5));
  if (id === 'workflows') return '<main class="pick"><h1>Workflows</h1><p class="lead">Chain your favourite PDF tools into a workflow, save it, and run it on any files in one click.</p></main>';
  if (id === 'login' || id === 'signup') return `<main class="pick"><h1>${id === 'login' ? 'Log in' : 'Create an account'}</h1></main>`;
  return null;
}
