# PDFturtle

Free, private PDF tools: merge, split, compress, convert, edit, sign, OCR and more, with proper support for Indian and other scripts. Most tools run in the browser, so files stay on the device; a small Node server adds full-fidelity Office conversion, PDF/A, text-preserving compression, web pages to PDF, AI tools and accounts.

Licensed under the [GNU AGPL v3.0 or later](LICENSE). If you run a modified copy as a public service, you must offer its source code to your users.

```bash
npm install
npm run dev      # UI on http://localhost:5173 (proxies /api to the server)
npm run server   # API server on http://localhost:5179
npm start        # production: build, then one server for site + API on :5179
npm run check    # self-checks: PDF operations, copy-paste order (pdf.js + PDFium), accounts
npm run e2e      # browser tests on 5 profiles against a production build (see TESTING.md)
```

## Running in production

```bash
docker build -t pdfturtle . && docker run -p 8080:8080 -v pdfturtle-data:/app/data -e ANTHROPIC_API_KEY=... pdfturtle
```

Or on a server with Node ≥ 22.13: install LibreOffice, Ghostscript and Chromium, then `NODE_ENV=production npm start` behind an HTTPS reverse proxy (it must pass `X-Forwarded-Proto`, which makes the session cookie `Secure`). Put `/app/data` (or `PDFTURTLE_DB`) on persistent storage.

| Setting | Default | What it does |
|---|---|---|
| `PORT`, `HOST` | `5179`, `0.0.0.0` | Where the server listens |
| `NODE_ENV=production` | | Refuses to start without `dist/`; `Secure` cookies |
| `PDFTURTLE_DB` | `./data/pdfturtle.db` | SQLite file for accounts and synced workflows |
| `ANTHROPIC_API_KEY` | unset | Turns on AI Summarizer / Translate with Claude (`claude-opus-5-5`, effort `low`, refusal fallback on). Unset: on-device fallbacks |
| `PDFTURTLE_AI_MODEL` | `claude-opus-5-5` | Model for the AI tools |
| `SOFFICE`, `GS`, `CHROME` | auto-detected | Engine paths; `GET /api/health` shows what was found |
| `PDFTURTLE_CHROME_FLAGS` | | Extra Chrome flags (`--no-sandbox` in containers) |
| `PDFTURTLE_MAX_JOBS` | `2` | Simultaneous runs per engine; others queue |
| `PDFTURTLE_RATE` | `60` | Server requests per IP per 10 minutes |
| `VITE_CONTACT_EMAIL` | unset | Build-time; shown on the Contact page |
| `PDFTURTLE_SITE_URL` | unset | Your public address (`https://…`), used for canonical links and `sitemap.xml` |

The server sends a strict Content-Security-Policy (only the app, jsDelivr for the OCR engine, Google Fonts), `nosniff`, no framing, gzip for text assets and one-year caching for fingerprinted assets. API requests are logged one line each. SIGTERM finishes requests in flight.

If the server or an engine is missing, each tool falls back to its in-browser version (Office conversions keep text only; compression rasterizes pages). PDF/A, web addresses and accounts need the server.

## Code map

- `src/text.js`: fonts per script, Unicode bidi, shaping, copy-paste-safe text output.
- `src/ops.js`: pdf-lib operations (merge, split, rotate, watermark, forms…). Runs in the browser and in Node.
- `src/render.js`: browser-only code: pdf.js rendering, OCR, converters, image extraction, visual compare.
- `src/tools.js`: the tool registry, with each tool's options, view and `run()`.
- `src/main.js`, `workflows.js`, `account.js`, `pages.js`: the UI.
- `server.mjs` (+ `ai.mjs`, `accounts.mjs`, `gs-wasm.mjs`): API server and static hosting.

## Unicode text

Text PDFturtle draws (watermarks, page numbers, Edit/Sign text, form answers, OCR layers, converter output) is split into runs, one font each: Latin-1 uses built-in Helvetica, everything else a subset of the matching Noto font (regular and bold) - Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam, Sinhala, Arabic, Hebrew, Thai, Chinese, Japanese, Korean, Cyrillic, Greek, Vietnamese. Lines are ordered with the full Unicode bidi algorithm (`bidi-js`, mirrored brackets included), and OpenType mark positioning is honoured (Arabic dots, stacked accents).

Copy-paste gives back exactly what was typed - checked in `check.mjs` against pdf.js (Firefox) and PDFium (Chrome/Edge):
- Every glyph carries the text it stands for: shaping draws नि as [ि][न], so those glyphs get their own font codes mapping to "न" then "ि" (and the same for reph, split Tamil vowels, Sinhala conjuncts, and Arabic letters that share a skeleton glyph).
- Lines mixing right-to-left text with other runs get an invisible copy in typed order for pdf.js, and a line-wide `ActualText` pre-shaped for PDFium's own word reordering.
- PDFturtle's own extraction also repairs visual-order Indic text from other producers' PDFs (`visualToLogical`).

## Design tokens

Colours, sizes, radii and shadows live in `:root` in `src/style.css`. The font stack is `Graphik, Inter, Arial`; Graphik is a paid font and is not bundled. Brand assets are built by `brand/build-logo.mjs` and `brand/build-og.mjs`.

## Deploying on AWS

`infra/aws/pdfturtle.yaml` (CloudFormation: one ARM server, fixed IP, budget alert) and `infra/aws/compose.yaml` (the app plus Caddy for automatic HTTPS). Behind the proxy set `PDFTURTLE_TRUST_PROXY=1` so rate limits see real client addresses; never publish the app port directly when it is set.

## Before going public

- **Licences.** This project is AGPL-3.0 (Ghostscript, used for compression and PDF/A, is AGPL too). The site footer links to this source code; keep that link pointing at the code actually deployed. MinerU (if added) has its own licence with extra conditions.
- **Legal pages** (`src/pages.js`) describe what the code does; have them reviewed.
- **`/api/html`** blocks private addresses on every redirect hop, but a page's own subresources load inside Chrome, so give the server outbound access to the internet only.
- **PDF/A** passes veraPDF 1.30.4 for 1b/2b/3b, except PDF/A-1b of files with transparency (PDF/A-1 bans it; the server tells the user to choose 2b).
- **LibreOffice** starts fresh per request (4–5 s). Uploads are capped at 100 MB, conversions at 180 s.

## Not built yet

| Area | Gap | What it needs |
|---|---|---|
| Premium plans, payments | Everything is free | A payment provider account |
| Signature requests by email, password reset, email verification | Not built | An email provider (SMTP or API key) |
| Google Drive / Dropbox upload | Not built | Google and Dropbox app keys |
| AI Summarizer / Translate | Claude path built; not yet tested against the live API | `ANTHROPIC_API_KEY` |
| Scan to PDF | Uses the phone's camera on the phone itself; no QR pairing from desktop | Public HTTPS deployment |
| Desktop and mobile apps, image tools, multi-language interface | Not built | Separate products |
