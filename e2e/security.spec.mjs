// Server security regressions (API only, run once).
import { test, expect } from '@playwright/test';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'chromium', 'API tests run once'));

const pdfText = async (buf) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
  let t = '';
  for (let i = 1; i <= doc.numPages; i++) t += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ');
  return t;
};

test('uploaded HTML cannot read server files or reach internal addresses', async ({ request }) => {
  const probes = {
    'file:///C:/Windows/win.ini': /fonts|extensions/i,
    'file:///etc/passwd': /root:/,
    'http://127.0.0.1:5181/api/health': /soffice/,
    'http://169.254.169.254/latest/meta-data/': /ami-id|instance/,
  };
  for (const [target, leak] of Object.entries(probes)) {
    const res = await request.post('/api/html', { data: `<meta http-equiv="refresh" content="0;url=${target}">probe` });
    if (!res.ok()) continue; // refused outright is fine too
    expect(await pdfText(await res.body()), target).not.toMatch(leak);
  }
});

test('URL mode refuses private and non-http addresses', async ({ request }) => {
  for (const u of ['http://localhost:5181/', 'http://127.0.0.1/', 'http://[::1]/', 'http://10.0.0.1/', 'file:///etc/passwd']) {
    const res = await request.post(`/api/html?url=${encodeURIComponent(u)}`);
    expect(res.status(), u).toBe(400);
  }
});

test('API edge cases', async ({ request }) => {
  expect((await request.post('/api/constructor', { data: 'x' })).status()).toBe(404);
  expect((await request.post('/api/office?ext=exe', { data: 'x' })).status()).toBe(400);
  expect((await request.post('/api/compress', { data: 'not a pdf' })).status()).toBe(422);
  expect((await request.get('/assets/missing.js')).status()).toBe(404);
  const home = await request.get('/');
  expect(home.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(home.headers()['x-content-type-options']).toBe('nosniff');
});

test('accounts: CSRF, cookies, throttling', async ({ request }) => {
  const email = `e2e-${Date.now()}@example.com`;
  expect((await request.post('/api/auth/login', { form: { email, password: 'x' } })).status()).toBe(415);
  const su = await request.post('/api/auth/signup', { data: { name: 'E2E', email, password: 'correct horse battery' } });
  expect(su.status()).toBe(201);
  expect(su.headers()['set-cookie']).toMatch(/HttpOnly.*SameSite=Lax|SameSite=Lax.*HttpOnly/);
  expect(su.headers()['set-cookie']).toContain('Secure'); // NODE_ENV=production
  expect((await request.get('/api/user/workflows', { headers: { Cookie: 'pdfturtle_session=forged' } })).status()).toBe(401);
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await request.post('/api/auth/login', { data: { email, password: `wrongpass${i}` } })).status());
  expect(codes.at(-1)).toBe(429);
});
