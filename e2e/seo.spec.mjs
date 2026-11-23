// Search-engine view: each tool is its own URL with its own title in the server HTML; sitemap; 404s.
import { test, expect } from '@playwright/test';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'chromium', 'one browser is enough'));

test('server HTML has per-page title, description and robots', async ({ request }) => {
  const merge = await (await request.get('/merge-pdf')).text();
  expect(merge).toContain('<title>Merge PDF online, free · PDFturtle</title>');
  expect(merge).toMatch(/<meta name="description" content="Merge PDF files into one document[^"]{60,}">/);
  expect(merge).toContain('content="index,follow"');
  // Prerendered content for crawlers that don't run JavaScript (most AI crawlers).
  expect(merge).toContain('<h1>Merge PDF</h1>');
  expect(merge).toContain('How to merge PDF');
  expect(merge).toContain('<link rel="canonical" href="http://localhost:5181/merge-pdf">');
  expect(merge).toContain('property="og:image" content="http://localhost:5181/og.png"');
  const ld = JSON.parse(merge.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  expect(ld['@graph'].map((x) => x['@type'])).toEqual(['WebSite', 'WebApplication', 'BreadcrumbList']);
  expect((await request.get('/og.png')).headers()['content-type']).toBe('image/png');
  expect((await request.get('/', { headers: { 'X-Forwarded-Proto': 'https' } })).headers()['strict-transport-security']).toContain('max-age=');
  expect(await (await request.get('/login')).text()).toContain('content="noindex"');
  const missing = await request.get('/no-such-tool');
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain('noindex');
  expect((await request.get('/%E0%A4%A')).status()).toBe(400);
});

test('sitemap and robots', async ({ request }) => {
  const sm = await (await request.get('/sitemap.xml')).text();
  expect(sm).toContain('<loc>http://localhost:5181/compress-pdf</loc>');
  expect(sm).toContain('/page/pricing</loc>');
  expect(sm).not.toContain('/login');
  expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap: http://localhost:5181/sitemap.xml');
});

test('links navigate without reloading; back works; old #/ links redirect', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.__noReload = true; });
  await page.locator('a.card[href="/split-pdf"]').click();
  await expect(page).toHaveURL(/\/split-pdf$/);
  await expect(page).toHaveTitle('Split PDF online, free · PDFturtle');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'http://localhost:5181/split-pdf');
  expect(await page.evaluate(() => window.__noReload)).toBe(true);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('a.card[href="/split-pdf"]')).toBeVisible();
  await page.goto('/#/rotate-pdf');
  await expect(page).toHaveURL(/\/rotate-pdf$/);
  await expect(page.locator('.side h2, main h1').first()).toContainText('Rotate PDF');
});
