// Renders public/og.png (1200×630 social-share image) from the logo. Run after build-logo.mjs:
//   set PLAYWRIGHT_BROWSERS_PATH=0 && node brand/build-og.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const logo = fs.readFileSync(path.join(here, 'logo', 'pdfturtle-horizontal.svg'), 'utf8');
const html = `<!doctype html><html><body style="margin:0;width:1200px;height:630px;background:#f5f9f2;font-family:Arial,sans-serif;position:relative">
<div style="position:absolute;left:90px;top:120px;height:120px">${logo.replace('<svg ', '<svg style="height:120px;width:auto" ')}</div>
<div style="position:absolute;left:90px;top:282px;width:1020px;font-weight:700;font-size:60px;line-height:68px;color:#33333b">Every PDF tool you need, free and in your browser</div>
<div style="position:absolute;left:90px;top:446px;font-size:28px;color:#47474f">Merge · Split · Compress · Convert · Edit · Sign · Protect</div>
<div style="position:absolute;left:0;bottom:0;width:1200px;height:18px;background:#2a7f1b"></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: path.join(here, '..', 'public', 'og.png') });
await browser.close();
console.log('wrote public/og.png');
