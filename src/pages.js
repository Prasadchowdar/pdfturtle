// Static site pages (/page/<slug>). Original wording that describes what PDFturtle actually does.
// The legal pages are a factual starting point; have them reviewed before running a public service.
import { TOOLS, CATS, color } from './tools.js';

const CONTACT = import.meta.env?.VITE_CONTACT_EMAIL || '';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

const BROWSER = 'Most tools run entirely in your browser: the file is read, changed and saved on your own device and never uploaded.';
const SERVER = 'A few conversions need desktop-grade engines and run on the PDFturtle server: Word, Excel and PowerPoint to PDF, PDF to PowerPoint, PDF/A, compression that keeps text selectable, and web pages to PDF. Those files are processed in a temporary folder that is deleted as soon as the result is sent back.';

const PAGES = {
  features: ['Features', `
    <p class="lead">Every tool you need for PDFs, in one place and free to use.</p>
    <div class="feat-grid">
      <div><h2>Private by design</h2><p>${BROWSER}</p></div>
      <div><h2>Every script</h2><p>Text you add (watermarks, page numbers, edits, form answers, OCR) works in Hindi, Tamil, Telugu, Bengali, Arabic, Hebrew, Chinese, Japanese, Korean, Thai, Cyrillic, Greek and more, and copies out in the right order.</p></div>
      <div><h2>Workflows</h2><p>Chain tools you use together, save the chain, and run it on any PDF in one step.</p></div>
      <div><h2>Office conversions</h2><p>Word, Excel and PowerPoint convert to PDF with layout intact, and PDFs convert back to Word, Excel, PowerPoint and Markdown.</p></div>
      <div><h2>Archiving</h2><p>PDF/A-1b, 2b and 3b output, checked against veraPDF.</p></div>
      <div><h2>Scans</h2><p>OCR in over thirty languages makes scanned PDFs searchable and selectable.</p></div>
    </div>`],
  pricing: ['Pricing', `
    <p class="lead">PDFturtle is free. Every tool, with no watermark, no sign-up and no daily limit.</p>
    <div class="price-cards"><div class="price"><h2>Free</h2><p class="amount">₹0</p><ul><li>All ${TOOLS.filter((t) => !t.unavailable && !t.variant).length} tools</li><li>Workflows</li><li>Files processed on your device</li><li>Optional account to sync workflows</li></ul><a class="bigbtn" href="/">Start now</a></div></div>`],
  tools: ['All tools', null], // built from the tool list
  faq: ['Frequently asked questions', `
    <details open><summary>Are my files uploaded?</summary><p>${BROWSER} ${SERVER}</p></details>
    <details><summary>Do I need an account?</summary><p>No. An account only keeps your saved workflows in sync across devices.</p></details>
    <details><summary>Is there a file size limit?</summary><p>Tools that run in your browser are limited only by your device's memory. Server conversions accept files up to 100 MB.</p></details>
    <details><summary>Which languages are supported?</summary><p>Text tools support Latin, Cyrillic, Greek, Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam, Sinhala, Arabic, Hebrew, Thai, Chinese, Japanese and Korean. OCR supports over thirty languages.</p></details>
    <details><summary>How do the AI tools work?</summary><p>When the server has an AI key configured, the Summarizer and Translate tools send the document's text to Claude (Anthropic) and return the result. Without it, the Summarizer picks key sentences on your device and Translate uses the translator built into Chrome.</p></details>
    <details><summary>Can I run PDFturtle myself?</summary><p>Yes. See <a href="/page/developers">Developers & self-hosting</a>.</p></details>`],
  developers: ['Developers & self-hosting', `
    <p class="lead">PDFturtle is a static web app plus a small Node server.</p>
    <pre><code>npm install
npm start          # builds the site and serves it with the API on port 5179</code></pre>
    <p>Optional engines: LibreOffice (Office conversions), Ghostscript (falls back to a bundled WebAssembly build), Chrome or Edge (web pages to PDF). Set <code>ANTHROPIC_API_KEY</code> to enable the AI tools. <code>GET /api/health</code> reports what the server found.</p>`],
  business: ['PDFturtle for business', `<p class="lead">Give your team every PDF tool without sending documents to a third party: host PDFturtle on your own server and files stay inside your network.</p><p>Shared workflows let a team standardise routine jobs such as "merge, number and stamp CONFIDENTIAL".</p>`],
  education: ['PDFturtle for education', '<p class="lead">Free PDF tools for students and teachers: combine assignments, fill forms, scan notes with a phone camera, and read scanned material with OCR, in the languages your classroom uses.</p>'],
  security: ['Security', `
    <p>${BROWSER}</p><p>${SERVER}</p>
    <ul><li>Server uploads are capped at 100 MB and conversions time out after three minutes.</li>
    <li>Web-page conversion refuses private and local network addresses and re-checks every redirect.</li>
    <li>Uploaded HTML cannot load files from the server.</li>
    <li>Passwords are stored as salted scrypt hashes; sessions are random tokens in HttpOnly cookies, and login attempts are rate-limited.</li></ul>`],
  privacy: ['Privacy policy', `
    <p><b>Files.</b> ${BROWSER} ${SERVER} We do not keep copies.</p>
    <p><b>AI tools.</b> If the server has AI enabled and you use the Summarizer or Translate, the text of that document is sent to Anthropic to produce the result, under Anthropic's commercial terms.</p>
    <p><b>Accounts.</b> If you create an account we store your name, email address, a hash of your password, your login sessions and your saved workflows. Delete requests go to the contact address below.</p>
    <p><b>Analytics.</b> PDFturtle uses no analytics, advertising or tracking.</p>`],
  terms: ['Terms & conditions', `
    <p>PDFturtle is provided free of charge and "as is", without warranties. You are responsible for the documents you process and for having the right to process them.</p>
    <p>Don't use the service to break the law, to attack the service or other systems, or to process content you are not allowed to handle.</p>
    <p>We may change or stop the service at any time.</p>`],
  cookies: ['Cookies', '<p>PDFturtle sets one cookie, <code>pdfturtle_session</code>, and only when you log in. It keeps you signed in and is never used for tracking. Your saved workflows and settings are kept in your browser\'s local storage.</p>'],
  about: ['About us', '<p class="lead">PDFturtle makes everyday PDF work fast and private: one place for every PDF tool, built to keep documents on your own device whenever possible and to handle every language properly.</p>'],
  contact: ['Contact us', CONTACT ? `<p class="lead">Write to us at <a href="mailto:${esc(CONTACT)}">${esc(CONTACT)}</a>.</p>` : '<p class="lead">Contact details will be published here soon.</p>'],
};

export const PAGE_TITLES = Object.fromEntries(Object.entries(PAGES).map(([k, [title]]) => [k, title]));

// The page's <main> as HTML (also prerendered by the server), or null for an unknown slug.
export function pageHTML(slug) {
  const page = PAGES[slug];
  if (!page) return null;
  const [title, body] = page;
  const inner = slug === 'tools'
    ? `<div class="tool-index">${Object.entries(CATS).map(([k, c]) => `<div><h2>${c.label}</h2>${TOOLS.filter((t) => t.cat === k && !t.variant).map((t) =>
      `<a href="/${t.id}"><span class="mini" style="--c:${color(t)}">${t.glyph}</span>${esc(t.name)}</a>`).join('')}</div>`).join('')}</div>`
    : body;
  return `<main class="pick page"><h1>${esc(title)}</h1><div class="page-body">${inner}</div></main>`;
}

export function pageView(frame, slug) {
  const html = pageHTML(slug);
  if (!html) return false;
  frame(h(html));
  return true;
}
