# PDFturtle test report (Phase 1, 2026-11-19)

How to re-run everything:

```bash
npm run check                 # unit self-checks: PDF operations, copy-paste order (pdf.js + PDFium), accounts
npm run e2e                   # builds, starts a production server on :5181, runs all browser + API tests
node corpus/run.mjs           # real-world PDFs (clone first: see "Corpus" below)
node loadtest.mjs http://localhost:5180   # against a running production server with PDFTURTLE_RATE raised
```

## Summary

| Area | Result |
|---|---|
| Unit self-checks | All pass |
| Dependency audit (`npm audit`) | 0 vulnerabilities (was 2 high: `xlsx` 0.18.5 → 0.20.3, `image-size` → 2.0.4 override) |
| End-to-end, 5 browsers | 158 passed, 0 failed (82 skipped by design: server, API, SEO and a11y tests run in one browser) |
| Security probes | 1 critical + 3 minor issues found, all fixed and covered by tests |
| Accessibility (axe, WCAG 2.1 AA) | Pass on 7 screens, one documented waiver |
| Real-world corpus (1,103 PDFs) | 0 crashes, 0 corrupt outputs, 97–98% success per operation, 1 hang |
| Load | 0 errors; ~1,500 page req/s; LibreOffice ~0.3 conversions/s with 2 slots (see sizing) |

## Bugs found and fixed in this phase

| Severity | Bug | Fix |
|---|---|---|
| **Critical** | HTML to PDF: an uploaded page with `<meta http-equiv="refresh" content="0;url=file:///…">` printed **any file on the server** into the PDF (verified with `win.ini`). Fetched pages could do the same with script, and could reach internal addresses (`127.0.0.1`, cloud metadata `169.254.169.254`). | Chrome no longer opens a `file://` page. It loads `http://pdfturtle.invalid/` through a one-shot egress proxy in `server.mjs` that serves the page and lets every other request out only to public addresses (resolved once, IP pinned, so DNS rebinding can't swap in an internal one). WebRTC UDP and QUIC are off. The server's own fetch of `?url=` pages is pinned the same way. |
| High (production only) | PDF Forms: existing text fields showed as disabled and couldn't be filled. Field types were read from class names, which the production minifier renames. | Field types now come from `instanceof` checks (`src/ops.js`). E2E test fills a field and reads it back. |
| Medium | Sign PDF with nothing placed returned the original file as "signed". | Refuses with "Drag a box on the page to place your signature". |
| Low | `POST /api/constructor` (and other built-in object names) reached JavaScript's `Object` function instead of 404. | `Object.hasOwn` lookup. |
| Low | Damaged uploads were logged as server errors (500). | 422 "Conversion failed (is the file damaged?)". |
| Low | Damaged PDFs showed raw library errors ("Expected instance of PDFDict"). | Mapped to "This PDF is damaged… Try Repair PDF first" for every tool and workflow. |

## End-to-end tests (`e2e/`, Playwright 1.65)

Projects: Chromium, Firefox, WebKit (Safari), Pixel 7 (Android Chrome), iPhone 14 (Mobile Safari). Each test drives the real production build: open the tool, add files, set options, run, download, then check the output (PDFs reopen with page counts > 0; Office outputs are valid ZIPs; the filled form field reads back).

- `tools.spec.mjs`: 32 tools plus the home page. Server conversions (Word, PowerPoint, Excel, HTML, PDF/A) run in Chromium only because the server does the work; drag-to-place tools (crop, edit, sign) run on desktop browsers only.
- `security.spec.mjs`: local-file and internal-address probes through HTML to PDF, private addresses in URL mode, unknown operations, damaged uploads, security headers, CSRF (form posts rejected), cookie flags (`HttpOnly`, `SameSite=Lax`, `Secure` in production), forged sessions, login throttling (429 after 10 failures).
- `a11y.spec.mjs`: axe WCAG 2.1 A/AA on home, a tool, login, sign-up, workflows, pricing, and a tool with a file loaded.

Not covered by e2e: Translate PDF (needs `ANTHROPIC_API_KEY` or Chrome's on-device translator), OCR in languages other than English, very large files (> 50 MB) in the browser.

Also verified by hand: LibreOffice ignores `INCLUDETEXT`/`INCLUDEPICTURE` fields in RTF and does not load `file://` iframes from HTML disguised as `.doc`; uploads over 100 MB get 413; `..` paths can't leave `dist/`.

## Accessibility

No waivers: white text on the brand green `#2a7f1b` (Sign up, Download buttons) has about 5.1:1 contrast, which passes WCAG AA (4.5:1).

## Performance

The home page used to download 559 KB (gzipped) of JavaScript before showing anything, because the PDF engines were in the main bundle. They now load in the background after the first paint: the entry chunk is **23 KB gzipped**; pdf.js, pdf-lib and fontkit (557 KB) arrive within 1.5 s or when a tool first needs them. Script fonts (Noto CJK up to 10 MB each) download only when text in that script is drawn.

Lighthouse 12.8 (mobile, simulated slow 4G and CPU throttling, measured while another CPU-heavy job ran): Performance 92, Accessibility 87 → fixed heading order (tool cards are now `h2`), Best Practices 100, SEO 91 → added `robots.txt`. First and largest contentful paint 2.7 s, total blocking time 0 ms, layout shift 0. What still fails is the colour-contrast waiver above.

## Corpus

The input is the 1,103 PDFs from Mozilla pdf.js's test suite (152 MB). Most are bug reports: damaged, fuzzed, encrypted and oddly built files from real users. To fetch them:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/mozilla/pdf.js.git corpus/pdfjs
git -C corpus/pdfjs sparse-checkout set --no-cone '/test/pdfs/*.pdf'
```

`corpus/run.mjs` runs each file through rotate, watermark, page numbers, merge, split, protect → unlock, compress and repair. Each file runs in its own process with a 60 s limit, and every output is reopened with pdf.js.

- 1,088 files open in pdf.js. 15 are not PDFs at all, or are encrypted with an unknown password.
- **0 crashes, 0 corrupt outputs.** Every file that came out reopens.
- Success rate per operation: 97.3–98.4% (repair is highest). The failures:
  - 15 files are password-protected. The app correctly says "Unlock it first".
  - 7 PDF/A files refuse Protect, because PDF/A forbids encryption. The app explains why.
  - About 20 are damaged files that pdf-lib can't edit. These used to show library internals ("Expected instance of PDFDict"). They now show "This PDF is damaged… Try Repair PDF first". In the browser, Repair falls back to re-rendering through pdf.js, which reads all 1,088.
- 2 files (`issue22011.pdf`, `poppler-85140-0.pdf`) have page trees that pdf-lib and pdf.js count differently, so outputs differ by one or two pages. Both are known-broken test files.
- 1 hang: `bug1978317.pdf` (an infinite loop in pdf-lib). On the server this is bounded by the request limit. In the browser it would freeze that tab. Not fixed: it needs a Web Worker with a timeout around each operation (see below).

## Known limits after Phase 1

- Operations run on the page's main thread. A pathological file (1 in 1,103 here) can freeze the tab. Upgrade path: run operations in a Web Worker and terminate it after a timeout.
- Translate PDF is untested end to end (needs `ANTHROPIC_API_KEY`).
- SEO (added after Phase 1): real per-tool addresses, server-rendered titles and descriptions, sitemap. Covered by `e2e/seo.spec.mjs`.

## Load and sizing

Measured with `loadtest.mjs` (autocannon) on the development laptop: 12 logical CPUs, 16 GB RAM, Windows 11, `PDFTURTLE_MAX_JOBS=2`, Ghostscript as WebAssembly. No errors or timeouts in any run.

| Endpoint | Concurrency | Throughput | p50 | p99 |
|---|---|---|---|---|
| `GET /` (page, gzip) | 50 | 1,568 req/s | 29 ms | 60 ms |
| `GET /api/health` | 50 | 1,404 req/s | 28 ms | 146 ms |
| `POST /api/compress` (Ghostscript) | 4 | 4.6 req/s | 863 ms | 996 ms |
| `POST /api/html` (Chrome) | 4 | 0.9 req/s | 4.3 s | 5.2 s |
| `POST /api/office` docx (LibreOffice) | 4 | 0.3 req/s | 9.2 s | 17.8 s |

Most tools run in the browser and cost the server nothing. Only Office conversions, PDF/A, server compression, HTML to PDF and AI calls reach it. Sizing:

- **Launch (up to ~1,000 conversions/day):** one VM with 2 vCPU and 4 GB RAM (LibreOffice and Chrome use 300–500 MB each per run), `PDFTURTLE_MAX_JOBS=2`. Requests beyond the slots queue rather than fail.
- **LibreOffice is the bottleneck.** It starts fresh per request (4–5 s each). For more throughput, add vCPUs and raise `PDFTURTLE_MAX_JOBS` to about the vCPU count, or run several containers behind a load balancer. Accounts use SQLite, so scale up rather than out until accounts move to Postgres.
- Install native Ghostscript in production (the Docker image does). The WebAssembly fallback works but is slower.
- Put a CDN in front of `/assets/*`. Those files are fingerprinted and cached for a year, and the CJK fonts are 5–10 MB each.
