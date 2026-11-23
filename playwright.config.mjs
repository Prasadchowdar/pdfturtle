// End-to-end tests against the production build: `npm run e2e`.
// Browsers live in node_modules (PLAYWRIGHT_BROWSERS_PATH=0, set by the npm script).
import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

const PORT = 5181;
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/fixtures.mjs',
  timeout: 120_000,
  workers: 3,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: { baseURL: `http://localhost:${PORT}`, acceptDownloads: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
    { name: 'mobile-chrome', use: devices['Pixel 7'] },
    { name: 'mobile-safari', use: devices['iPhone 14'] },
  ],
  webServer: {
    command: 'npx vite build && node --no-warnings server.mjs',
    url: `http://localhost:${PORT}/api/health`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: { NODE_ENV: 'production', PORT: String(PORT), PDFTURTLE_RATE: '100000', PDFTURTLE_DB: path.join(os.tmpdir(), `pdfturtle-e2e-${Date.now()}.db`) },
  },
});
