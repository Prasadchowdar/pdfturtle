# SEO audit: PDFturtle (2026-11-19)

This audit follows the method of the [claude-seo](https://github.com/AgriciDaniel/claude-seo) skill (v2.6.2): `seo-audit`, plus the `seo-technical`, `seo-page`, `seo-schema`, `seo-geo` and `seo-sitemap` checklists, its quality gates and its scoring weights. I read the skill from a scratch copy and did not install it. Its checkers are Python scripts and this PC has no Python, so the same checks run in [`crawl.mjs`](crawl.mjs) (Node + Playwright). Re-run:

```bash
node seo-audit/crawl.mjs http://localhost:5180     # a running production server
```

The crawl covers all 48 sitemap URLs. Each URL is checked twice: as raw HTML (what crawlers that don't run JavaScript see, including most AI crawlers) and as the rendered page (what Googlebot sees). Lighthouse was run separately. It is a local production build, so there is no field data (CrUX, Search Console) and no backlink data yet.

## Score

| Category (weight) | Before | After | Notes |
|---|---|---|---|
| Technical SEO (22%) | 55 | 95 | HSTS is sent only behind HTTPS, so it is verified with a forwarded-proto test. |
| Content quality (23%) | 25 | 60 | Tool pages are now 110–190 words; several site pages are still thin. |
| On-page SEO (20%) | 45 | 95 | |
| Schema (10%) | 0 | 85 | No logo or social profiles yet, because there is no brand. |
| Performance (10%) | 88 | 90 | Lighthouse mobile: Performance 93, layout shift 0, blocking time 0 ms. |
| AI search readiness (10%) | 15 | 75 | Content is now in the raw HTML. |
| Images (5%) | 60 | 90 | |
| **SEO health score** | **≈ 40** | **≈ 83** | |

Lighthouse on `/merge-pdf`: SEO **100**, Best Practices 100, Accessibility 92 (only the documented brand-red contrast waiver fails), Performance 93.

## What was wrong and what changed

| Severity | Finding (before) | Fix |
|---|---|---|
| Critical | **Every page's raw HTML was empty** (3–8 words, no `h1`): the app drew everything with JavaScript. Most AI crawlers (GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot) don't run JavaScript, so they saw nothing. | The server now prerenders each page's header, main content and footer into the HTML (`src/shell.js`). The browser uses the same markup and takes over without a layout shift. |
| High | **Thin tool pages**: 18–36 words each. | Each of the 33 tools has hand-written, tool-specific content (`src/content.js`): a "How to …" list, an "About" section saying what the tool keeps, where it runs (browser or server) and its limits, and related-tool links. Every claim was checked against the code. |
| High | **No structured data.** | JSON-LD on every indexable page: `WebSite`, plus `WebApplication` (free `Offer`) and `BreadcrumbList` on tool pages, `Organization` on the home page. No ratings or reviews, because there are none to show. |
| High | **No social preview**: no `og:image`, no Twitter card. | A 1200×630 share image (`public/og.png`), plus `og:url`, `og:image` and a `summary_large_image` Twitter card on every page. |
| Medium | **39 meta descriptions too short** (39–117 chars), and the site pages shared one description. | Every description is unique and 120–160 characters. |
| Medium | **12 short titles** ("Pricing · PDFturtle", 17 chars). | Every title is 30–60 characters and keyword-led. |
| Medium | **Canonical only with `PDFTURTLE_SITE_URL` set.** | Always present. Without the setting it uses the request host and those pages are not cached, so a forged Host header can't poison the cache. |
| Medium | **Heading levels skipped** on every page (`h1` → menu/footer `h4`). | Menu labels are no longer headings; footer and section headings are `h2`. |
| Low | **No HSTS.** | `Strict-Transport-Security` on HTTPS requests. |

Already fine before: real per-tool URLs, `sitemap.xml`, `robots.txt` (allows all crawlers and points to the sitemap), 404 + `noindex` for unknown paths, `noindex` on login and sign-up, `lang`, viewport, CSP and other security headers, mobile layout.

## Long-tail pages: compress to an exact size (added after the audit)

There is a new tool, **Compress PDF to size** (`/compress-pdf-to-size`), plus six landing pages for common upload limits: `/compress-pdf-to-50kb`, `-100kb`, `-200kb`, `-300kb`, `-500kb` and `-1mb`. These target searches with steady demand from people filling in application forms and portals.

How it hits the limit (`compressTo` in `src/render.js`): it tries the gentlest method first.
1. Return the file unchanged if it already fits.
2. Lossless restructuring.
3. Server compression that keeps text selectable.
4. Pages as images: a binary search over resolution and quality, then raising JPEG quality to use the room left under the limit, with grayscale as a last resort.

It counts 1 KB as 1,000 bytes, so files pass portals that use either 1,000 or 1,024. If nothing fits, it says so and suggests removing or splitting pages, rather than handing back a file that will be rejected. Tested result: a 3.2 MB worst-case noisy scan comes out at 95–99 KB in 8–12 s (Chromium and Firefox, e2e).

To avoid the doorway-page pattern the skill warns about (pages that differ only by a number), each size page has its own guidance for that size: what fits, tips to get under it, what to do if it won't. The pages link to each other and from both compress tools. They are in the sitemap but not in menus.

## Action plan (what's left)

**Before launch (needs you)**
1. Set `PDFTURTLE_SITE_URL=https://yourdomain` so canonical links, Open Graph and the sitemap use the real domain, then submit `/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
2. Decide your AI-crawler policy. `robots.txt` currently allows everyone, which is usually right for a free tool that wants to be cited in ChatGPT, Perplexity and Google AI answers. Blocking training crawlers (`GPTBot`, `ClaudeBot`, `Google-Extended`) does not stop search citation, which uses `OAI-SearchBot`, `Claude-SearchBot` and `Googlebot`.
3. When the brand is final: add a logo and social profile links to the `Organization` JSON-LD (`src/seo.js`), and redo `public/og.png` with the real name.

**Content (weeks 2–4)**
4. Expand the thin site pages with real facts only you can supply: About (who runs it, why; 32 words now), Business (43), Education (32), Pricing (34), Contact (9). The skill's minimum is 400 words for an About page.
5. Tool pages are 110–190 words. The skill's quality gate says 800 words for a "feature page". That is a heuristic, and leading competitors' tool pages are similar in length to these now. Grow them with genuinely useful material (supported formats and limits, common problems, privacy details), not filler. The skill warns that templated padding counts against you.
6. Add trust signals (E-E-A-T): a named operator or company on About, a contact address, and a "last updated" date on the policy pages.

**After launch (ongoing)**
7. Watch Search Console for indexing and queries. Run `crawl.mjs` after each release.
8. Real-user Core Web Vitals come from field data once there is traffic.
9. Optional: `llms.txt`. The skill records that no major AI provider has confirmed using it, so it carries no weight. Skip unless you want it.

## Files

- `src/content.js`: per-tool copy, page titles and descriptions.
- `src/shell.js`: page markup shared by browser and server.
- `src/seo.js`: titles, descriptions, robots, JSON-LD, sitemap paths.
- `server.mjs`: prerendering, head tags, `sitemap.xml`, `robots.txt`, HSTS.
- `public/og.png`: the share image.
- `e2e/seo.spec.mjs`: regression tests (raw HTML content, JSON-LD, canonical, `og:image`, HSTS, sitemap, 404s, navigation).
- `seo-audit/crawl.mjs`, `seo-audit/crawl.json`: this crawl and its data.
