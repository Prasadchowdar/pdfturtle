// Accessibility (axe, WCAG 2.1 A/AA) on the main screens. Chromium only.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'chromium', 'one browser is enough'));

const scan = async (page) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.map((v) => `${v.impact} ${v.id}: ${v.help} ${v.nodes.map((n) => `${n.target} ${n.any[0]?.data?.contrastRatio ?? ''}`).join(', ')}`);
};

for (const route of ['/', '/merge-pdf', '/login', '/signup', '/workflows', '/page/pricing']) {
  test(`a11y ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    expect(await scan(page)).toEqual([]);
  });
}

test('a11y tool with a file loaded', async ({ page }) => {
  await page.goto('/add-watermark');
  await page.locator('input[type=file]').first().setInputFiles(path.join(import.meta.dirname, '.files', 'a.pdf'));
  await expect(page.locator('.go')).toBeEnabled();
  expect(await scan(page)).toEqual([]);
});
