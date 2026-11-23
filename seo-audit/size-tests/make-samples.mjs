// Builds the fictional sample documents used for the "Tested" sections of the compress-to-size pages.
// Everything here is invented (school, names, numbers) and marked SAMPLE. Output: ./samples/*.pdf
// Run: set PLAYWRIGHT_BROWSERS_PATH=0 && node seo-audit/size-tests/make-samples.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'samples');
fs.mkdirSync(outDir, { recursive: true });
const A4 = [595.28, 841.89];

// Grain + paper tint + optional shadow and tilt, so pages compress like real scans and phone photos do.
const sheet = (w, h, inner, { grain = 0.1, tint = '#f8f5ee', shadow = '', tilt = 0 } = {}) => `<!doctype html><html><head><style>
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#d9d4c7}
  .paper{position:absolute;inset:0;background:${tint};transform:rotate(${tilt}deg) scale(${tilt ? 1.03 : 1});font-family:Georgia,serif;color:#1d1d24}
  .shade{position:absolute;inset:0;background:${shadow || 'none'};pointer-events:none}
  .grain{position:absolute;inset:0;width:100%;height:100%;mix-blend-mode:multiply;opacity:${grain}}
  .s{font-size:${w / 1654}em}
  </style></head><body><div class="paper"><div class="s" style="position:absolute;inset:0">${inner}</div></div>
  <div class="shade"></div>
  <svg class="grain"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>
  </body></html>`;

const seal = `<svg width="190" height="190" viewBox="0 0 190 190" style="position:absolute;right:170px;bottom:300px;opacity:.85">
  <circle cx="95" cy="95" r="88" fill="none" stroke="#1f4fa3" stroke-width="5"/><circle cx="95" cy="95" r="70" fill="none" stroke="#1f4fa3" stroke-width="2"/>
  <text x="95" y="88" text-anchor="middle" font-size="19" fill="#1f4fa3" font-family="Arial" font-weight="700">SAMPLE</text>
  <text x="95" y="112" text-anchor="middle" font-size="14" fill="#1f4fa3" font-family="Arial">PUBLIC SCHOOL</text></svg>`;

const certificate = `<div style="position:absolute;inset:70px;border:14px double #7a5a1e;padding:110px 120px;text-align:center">
  <div style="font-size:34px;letter-spacing:4px;color:#7a5a1e">SAMPLE PUBLIC SCHOOL, EXAMPLE NAGAR</div>
  <div style="font-size:22px;margin-top:6px">Affiliation No. 0000000 (fictional, for testing only)</div>
  <div style="font-size:96px;margin:120px 0 30px;color:#5b1e1e;font-style:italic">Certificate of Achievement</div>
  <div style="font-size:34px;line-height:1.9">This is to certify that</div>
  <div style="font-size:64px;font-weight:700;margin:20px 0">ASHA KUMARI</div>
  <div style="font-size:34px;line-height:1.9">Roll No. 2026/SPS/0147, daughter of Ravi Kumar,<br>has passed the Secondary School Examination held in March 2026<br>in <b>First Division with Distinction</b>, securing 461 out of 500 marks.</div>
  <div style="position:absolute;left:120px;bottom:180px;text-align:left;font-size:26px">Date of issue: 14 May 2026<br>Certificate No. SPS/SSE/26/04417</div>
  <div style="position:absolute;right:420px;bottom:190px;font-size:54px;font-family:'Segoe Script',cursive;color:#14306e">R. Sharma</div>
  <div style="position:absolute;right:400px;bottom:150px;font-size:24px">Principal</div>${seal}
  <div style="position:absolute;left:0;right:0;bottom:70px;font-size:17px;color:#555">SAMPLE DOCUMENT generated for compression testing. Not a real certificate. Verification code: 7Q4-K9P-22X</div></div>`;

const SUBJECTS = [['English', 86, 'A2'], ['Hindi', 91, 'A1'], ['Mathematics', 97, 'A1'], ['Science', 94, 'A1'], ['Social Science', 89, 'A2'], ['Telugu', 93, 'A1'], ['Computer Applications', 98, 'A1'], ['Physical Education', 88, 'A2']];
const marksheet = (page) => `<div style="position:absolute;inset:90px 110px;font-family:Arial,sans-serif">
  <div style="text-align:center;font-size:40px;font-weight:700;color:#0d3b66">SAMPLE BOARD OF SECONDARY EDUCATION</div>
  <div style="text-align:center;font-size:26px;margin:8px 0 40px">Statement of Marks - Term ${page} (fictional, for testing only)</div>
  <table style="width:100%;font-size:26px;border-collapse:collapse;margin-bottom:40px">${[['Name', 'ASHA KUMARI'], ['Roll No.', '2026/SPS/0147'], ['Date of birth', '09-08-2010'], ['School', 'Sample Public School, Example Nagar']].map(([k, v]) => `<tr><td style="padding:8px;width:30%;color:#444">${k}</td><td style="padding:8px;font-weight:700">${v}</td></tr>`).join('')}</table>
  <table style="width:100%;font-size:27px;border-collapse:collapse">
  <tr style="background:#dde7f2">${['Code', 'Subject', 'Max', 'Marks', 'Grade'].map((h) => `<th style="border:2px solid #555;padding:14px;text-align:left">${h}</th>`).join('')}</tr>
  ${SUBJECTS.map(([s, m, g], i) => `<tr>${[`${101 + i * 7 + page}`, s, 100, m - page + 1, g].map((c) => `<td style="border:2px solid #555;padding:14px">${c}</td>`).join('')}</tr>`).join('')}
  <tr style="font-weight:700"><td style="border:2px solid #555;padding:14px" colspan="3">Total</td><td style="border:2px solid #555;padding:14px">${SUBJECTS.reduce((a, [, m]) => a + m - page + 1, 0)} / 800</td><td style="border:2px solid #555;padding:14px">Pass</td></tr></table>
  <div style="font-size:17px;color:#333;margin-top:40px;line-height:1.5">Note: Grades A1 91-100, A2 81-90, B1 71-80, B2 61-70. Marks in internal assessment are shown separately. This statement is a SAMPLE DOCUMENT made for compression testing and has no validity. Serial 00${4470 + page}-T.</div>
  <div style="position:absolute;right:40px;bottom:80px;font-size:44px;font-family:'Segoe Script',cursive;color:#14306e">K. Rao</div>
  <div style="position:absolute;right:40px;bottom:40px;font-size:22px">Controller of Examinations</div></div>`;

const formPage = (page) => `<div style="position:absolute;top:110px;left:120px;width:1530px;zoom:1.45;font-family:Arial,sans-serif;font-size:36px">
  <div style="text-align:center;font-size:52px;font-weight:700">APPLICATION FORM (SAMPLE)</div>
  <div style="text-align:center;font-size:30px;margin-bottom:70px">Page ${page} of 2 - fictional form for compression testing</div>
  ${(page === 1 ? ['Full name', 'Father / Mother name', 'Date of birth', 'Address', 'District', 'Mobile number', 'Email', 'Category'] : ['Qualification', 'Board / University', 'Year of passing', 'Percentage', 'Bank name', 'Account number', 'IFSC', 'Signature'])
    .map((f, i) => `<div style="display:flex;border-bottom:3px solid #333;padding:34px 0"><div style="width:40%">${i + 1 + (page - 1) * 8}. ${f}</div><div style="font-family:'Segoe Script',cursive;color:#1a3d8f;font-size:44px">${(page === 1 ? ['Asha Kumari', 'Ravi Kumar', '09/08/2010', '12-4, Lake Road', 'Example', '90000 00000', 'asha@example.com', 'General'] : ['Class X', 'Sample Board', '2026', '92.2%', 'Example Bank', 'XXXX XXXX 4417', 'EXMP0001234', 'Asha'])[i]}</div></div>`).join('')}</div>`;

const reportHTML = () => {
  const para = (n) => `<p>Section ${n}. This sample project report describes how a small school library moved its catalogue from paper registers to a shared spreadsheet over one term. Volunteers typed each register page, checked the entries against the shelves, and marked missing or damaged books for review. The new catalogue made it easier for students to find titles and for teachers to plan reading lists, and it showed which subjects needed more books.</p>
    <p>The team measured progress every week: pages typed, entries checked and books relabelled. Early weeks were slow while everyone learned the process; once a checklist was agreed, the pace doubled. The main lesson was that agreeing on simple rules first saved far more time than it cost.</p>`;
  const chart = `<svg width="520" height="220" style="margin:12px 0"><rect width="520" height="220" fill="#f4f6fb"/>${[40, 70, 120, 160, 190, 210].map((v, i) => `<rect x="${30 + i * 80}" y="${200 - v * 0.8}" width="50" height="${v * 0.8}" fill="#2a7f1b"/><text x="${55 + i * 80}" y="215" font-size="12" text-anchor="middle">Week ${i + 1}</text>`).join('')}</svg>`;
  return `<!doctype html><html><head><style>body{font-family:Georgia,serif;font-size:12pt;line-height:1.55;color:#222;margin:0}h1{font-family:Arial;color:#0d3b66}h2{font-family:Arial;font-size:14pt;margin-top:22px}</style></head><body>
    <h1>Sample Project Report: Digitising a School Library</h1><p><i>Fictional document created for compression testing.</i></p>
    ${Array.from({ length: 6 }, (_, i) => `<h2>${i + 1}. Part ${i + 1}</h2>${para(i * 3 + 1)}${para(i * 3 + 2)}${i % 2 ? chart : ''}${para(i * 3 + 3)}`).join('')}</body></html>`;
};

const browser = await chromium.launch();
async function shoot(html, w, h, quality) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html);
  const jpg = await page.screenshot({ type: 'jpeg', quality });
  await page.close();
  return jpg;
}
async function imagePdf(file, jpgs) {
  const doc = await PDFDocument.create();
  for (const j of jpgs) { const img = await doc.embedJpg(j); doc.addPage(A4).drawImage(img, { x: 0, y: 0, width: A4[0], height: A4[1] }); }
  fs.writeFileSync(path.join(outDir, file), await doc.save());
}

// 200 DPI flatbed-style scans (1654 x 2339 px per A4 page).
await imagePdf('certificate-scan.pdf', [await shoot(sheet(1654, 2339, certificate), 1654, 2339, 88)]);
await imagePdf('marksheet-scan-3p.pdf', await Promise.all([1, 2, 3].map((p) => shoot(sheet(1654, 2339, marksheet(p), { tint: '#fbfbf7' }), 1654, 2339, 88))));
// Phone photos: higher resolution, uneven light, slight tilt, more grain.
const phone = { grain: 0.24, tint: '#f3efe4', tilt: -1.1, shadow: 'radial-gradient(ellipse at 30% 20%, rgba(0,0,0,0) 35%, rgba(40,30,10,.3) 100%)' };
await imagePdf('form-phone-photo-2p.pdf', await Promise.all([1, 2].map((p) => shoot(sheet(2480, 3508, formPage(p), phone), 2480, 3508, 90))));
// Typed document with selectable text, printed by Chrome (6+ pages).
{
  const page = await browser.newPage();
  await page.setContent(reportHTML());
  fs.writeFileSync(path.join(outDir, 'typed-report.pdf'), await page.pdf({ format: 'A4', margin: { top: '22mm', bottom: '22mm', left: '20mm', right: '20mm' } }));
  await page.close();
}
await browser.close();
for (const f of fs.readdirSync(outDir)) console.log(f.padEnd(26), (fs.statSync(path.join(outDir, f)).size / 1000).toFixed(0), 'KB');
