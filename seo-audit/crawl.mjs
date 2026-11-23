// SEO crawl following the claude-seo audit checklist (seo-page / seo-technical / seo-geo), in Node because
// the skill's Python checkers need Python. Checks every sitemap URL twice: raw HTML (what non-JS crawlers,
// including most AI crawlers, see) and rendered HTML (what Googlebot sees).
// Usage: node seo-audit/crawl.mjs [base]   (default http://localhost:5180)  -> seo-audit/crawl.json
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5180';
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[#\w]+;/g, ' ').replace(/\s+/g, ' ').trim();
const words = (t) => (t.match(/[\p{L}\p{N}]+/gu) || []).length;
const attr = (html, re) => (html.match(re) || [])[1];

const robots = await (await fetch(`${BASE}/robots.txt`)).text();
const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, BASE));
const homeRes = await fetch(BASE);
const headers = Object.fromEntries(homeRes.headers);

const browser = await chromium.launch();
const page = await browser.newPage();
const pages = [];
for (const url of urls) {
  const res = await fetch(url);
  const raw = await res.text();
  const r = {
    url: url.slice(BASE.length) || '/', status: res.status,
    raw: {
      title: attr(raw, /<title>([^<]*)<\/title>/), description: attr(raw, /<meta name="description" content="([^"]*)"/),
      canonical: attr(raw, /<link rel="canonical" href="([^"]*)"/), robots: attr(raw, /<meta name="robots" content="([^"]*)"/),
      ogImage: /property="og:image"/.test(raw), twitter: /name="twitter:card"/.test(raw), jsonld: (raw.match(/application\/ld\+json/g) || []).length,
      h1: (raw.match(/<h1[\s>]/g) || []).length, words: words(strip(raw)), lang: attr(raw, /<html lang="([^"]*)"/), bytes: raw.length,
    },
  };
  await page.goto(url, { waitUntil: 'networkidle' });
  r.rendered = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => +h.tagName[1]);
    const skips = hs.filter((l, i) => i && l > hs[i - 1] + 1).length;
    const imgs = [...document.querySelectorAll('img')];
    const links = [...document.querySelectorAll('a[href]')];
    return {
      title: document.title, h1: document.querySelectorAll('h1').length, h1Text: document.querySelector('h1')?.textContent.trim(), headingSkips: skips,
      mainWords: (main.innerText.match(/[\p{L}\p{N}]+/gu) || []).length,
      imgsNoAlt: imgs.filter((i) => !i.hasAttribute('alt')).length,
      linksNoText: links.filter((a) => !a.textContent.trim() && !a.getAttribute('aria-label')).length,
      internalLinks: new Set(links.map((a) => a.getAttribute('href')).filter((h) => h.startsWith('/'))).size,
    };
  });
  pages.push(r);
}
await browser.close();

const titles = pages.map((p) => p.raw.title), descs = pages.map((p) => p.raw.description);
const dup = (arr) => arr.filter((v, i) => arr.indexOf(v) !== i);
const out = { base: BASE, robots, headers, count: pages.length, duplicateTitles: [...new Set(dup(titles))], duplicateDescriptions: [...new Set(dup(descs))], pages };
fs.writeFileSync(new URL('./crawl.json', import.meta.url), JSON.stringify(out, null, 1));

const flag = (p) => [
  p.status !== 200 && `status ${p.status}`,
  !p.raw.title && 'no title', p.raw.title && (p.raw.title.length < 30 || p.raw.title.length > 60) && `title ${p.raw.title.length} chars`,
  !p.raw.description && 'no description', p.raw.description && (p.raw.description.length < 120 || p.raw.description.length > 160) && `desc ${p.raw.description.length} chars`,
  !p.raw.canonical && 'no canonical (raw)', !p.raw.ogImage && 'no og:image', !p.raw.twitter && 'no twitter card', !p.raw.jsonld && 'no JSON-LD',
  p.raw.h1 !== 1 && `raw h1=${p.raw.h1}`, p.raw.words < 100 && `raw words ${p.raw.words}`,
  p.rendered.h1 !== 1 && `rendered h1=${p.rendered.h1}`, p.rendered.headingSkips && `heading skips ${p.rendered.headingSkips}`,
  p.rendered.mainWords < 300 && `rendered words ${p.rendered.mainWords}`, p.rendered.imgsNoAlt && `${p.rendered.imgsNoAlt} img no alt`, p.rendered.linksNoText && `${p.rendered.linksNoText} empty links`,
].filter(Boolean);
for (const p of pages) console.log(p.url.padEnd(26), flag(p).join(' | '));
console.log('duplicate titles:', out.duplicateTitles.length, 'duplicate descriptions:', out.duplicateDescriptions.length);
console.log('headers:', ['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy'].map((h) => `${h}=${headers[h] ? 'yes' : 'NO'}`).join(' '));
