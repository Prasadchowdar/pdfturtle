// Every tool, driven through the real UI: open the tool, add files, set options, run, download, check output.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from '@cantoo/pdf-lib';

const F = (n) => path.join(import.meta.dirname, '.files', n);
const SERVER = ['word-to-pdf', 'powerpoint-to-pdf', 'excel-to-pdf', 'html-to-pdf', 'pdf-to-pdfa'];

// id -> [input files, optional setup(page)]
const CASES = {
  'merge-pdf': [['a.pdf', 'b.pdf']],
  'split-pdf': [['a.pdf']],
  'remove-pages': [['a.pdf']],
  'extract-pages': [['a.pdf']],
  'organize-pdf': [['a.pdf']],
  'scan-to-pdf': [['image.png']],
  'compress-pdf': [['a.pdf']],
  'compress-pdf-to-size': [['a.pdf']],
  'repair-pdf': [['a.pdf']],
  'ocr-pdf': [['a.pdf']],
  'jpg-to-pdf': [['image.png']],
  'word-to-pdf': [['doc.docx']],
  'powerpoint-to-pdf': [['slides.pptx']],
  'excel-to-pdf': [['sheet.xlsx']],
  'html-to-pdf': [['page.html']],
  'pdf-to-jpg': [['a.pdf']],
  'pdf-to-word': [['a.pdf']],
  'pdf-to-powerpoint': [['a.pdf']],
  'pdf-to-excel': [['a.pdf']],
  'pdf-to-markdown': [['a.pdf']],
  'pdf-to-pdfa': [['a.pdf']],
  'rotate-pdf': [['a.pdf']],
  'add-page-numbers': [['a.pdf']],
  'add-watermark': [['a.pdf'], async (page) => { await page.locator('.side input[type=text]').first().fill('DRAFT'); }],
  'crop-pdf': [['a.pdf'], drag],
  'edit-pdf': [['a.pdf'], async (page) => { await page.locator('.modes [data-m=rect]').click(); await drag(page); }],
  'pdf-forms': [['a.pdf'], async (page) => { await page.locator('.side input[type=text]').first().fill('Ravi Kumar'); }],
  'unlock-pdf': [['a.pdf']],
  'protect-pdf': [['a.pdf'], async (page) => { const p = page.locator('.side input[type=password]'); await p.nth(0).fill('s3cret-pass'); await p.nth(1).fill('s3cret-pass'); }],
  'sign-pdf': [['a.pdf'], async (page) => { await page.locator('.modes [data-m=name]').click(); await page.locator('.side label.opt', { hasText: 'Name' }).locator('input').fill('Ravi Kumar'); await drag(page); }],
  'redact-pdf': [['a.pdf'], async (page) => { await page.locator('.side textarea').fill('salary'); }],
  'compare-pdf': [['a.pdf', 'b.pdf']],
  'summarize-pdf': [['a.pdf']],
};

// Drag a box on the first page preview (tools that place marks).
async function drag(page) {
  // The page preview is taller than the window: centre it and drag near its middle (clear of the sticky header).
  const pg = page.locator('.pg').first();
  await pg.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b = await pg.boundingBox();
  const cy = b.y + b.height / 2;
  await page.mouse.move(b.x + b.width * 0.2, cy - 60);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.5, cy + 20, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.marks-info')).toContainText('1 item placed');
}

async function checkOutput(file, name) {
  const bytes = fs.readFileSync(file);
  expect(bytes.length, name).toBeGreaterThan(100);
  if (name.endsWith('.pdf')) {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    expect(doc.getPageCount()).toBeGreaterThan(0);
  } else if (/\.(zip|docx|pptx|xlsx)$/.test(name)) {
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
  }
}

for (const [id, [files, setup]] of Object.entries(CASES)) {
  test(id, async ({ page }, info) => {
    const mobile = info.project.name.startsWith('mobile');
    // Marks need a real mouse drag; touch projects cover the rest. Server conversions are browser-independent.
    test.skip(mobile && ['crop-pdf', 'edit-pdf', 'sign-pdf'].includes(id), 'mouse-drag tools are covered on desktop');
    test.skip(info.project.name !== 'chromium' && SERVER.includes(id), 'server conversions: one browser is enough');
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/${id}`);
    await page.locator('input[type=file]').first().setInputFiles(files.map(F));
    await expect(page.locator('.go')).toBeEnabled();
    if (setup) await setup(page);
    await page.locator('.go').click();
    await expect(page.locator('main.done, .side .err:not([hidden])').first()).toBeVisible({ timeout: 100_000 });
    const err = page.locator('.side .err:not([hidden])');
    expect(await err.count() ? await err.textContent() : null, 'tool error').toBeNull();
    const dl = page.locator('main.done .bigbtn');
    if (await dl.count()) {
      const [d] = await Promise.all([page.waitForEvent('download'), dl.click()]);
      const out = path.join(info.outputDir, d.suggestedFilename());
      await d.saveAs(out);
      await checkOutput(out, d.suggestedFilename());
      if (id === 'pdf-forms') expect((await PDFDocument.load(fs.readFileSync(out))).getForm().getTextField('fullname').getText()).toBe('Ravi Kumar');
    }
    expect(errors, 'uncaught page errors').toEqual([]);
  });
}

test('compress to 100 KB: a heavy scan comes out under 100,000 bytes', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium' && info.project.name !== 'firefox', 'heavy: two engines are enough');
  const input = fs.statSync(F('scan.pdf')).size;
  await page.goto('/compress-pdf-to-100kb');
  await expect(page.locator('h1')).toHaveText('Compress PDF to 100KB');
  await page.locator('input[type=file]').first().setInputFiles(F('scan.pdf'));
  const t0 = Date.now();
  await page.locator('.go').click();
  await expect(page.locator('main.done')).toBeVisible({ timeout: 110_000 });
  const secs = (Date.now() - t0) / 1000;
  await expect(page.locator('main.done .textout')).toContainText('KB');
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('main.done .bigbtn').click()]);
  const out = path.join(info.outputDir, d.suggestedFilename());
  await d.saveAs(out);
  const bytes = fs.readFileSync(out);
  expect(bytes.length).toBeLessThanOrEqual(100_000);
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  console.log(`[${info.project.name}] compress-to-100kb: ${Math.round(input / 1000)} KB -> ${(bytes.length / 1000).toFixed(1)} KB in ${secs.toFixed(1)} s`);
});

test('damaged PDF gets a helpful message, not a library error', async ({ page }) => {
  await page.goto('/rotate-pdf');
  await page.locator('input[type=file]').first().setInputFiles(F('damaged.pdf'));
  await page.locator('.go').click();
  await expect(page.locator('.side .err')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.side .err')).not.toContainText(/instance of|is not a function|undefined/);
  await expect(page.locator('.side .err')).toContainText(/Repair|damaged|read/i);
});

test('home lists every tool and routes to it', async ({ page }) => {
  await page.goto('/');
  for (const id of Object.keys(CASES)) await expect(page.locator(`a[href="/${id}"]`).first()).toBeAttached();
});
