// Builds the PDFturtle logo SVGs (redrawn from the user's concept image in brand/reference/).
// Run: node brand/build-logo.mjs   → writes brand/logo/*.svg
// Wordmark and the "PDF" on the shell are Noto Sans Black (SIL Open Font Licence), outlined to paths here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@cantoo/fontkit';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'logo');
fs.mkdirSync(out, { recursive: true });
const font = fontkit.openSync(path.join(here, '..', 'node_modules', '@expo-google-fonts', 'noto-sans', '900Black', 'NotoSans_900Black.ttf'));

export const C = { dark: '#135c2a', brand: '#2a7f1b', shell: '#4ea72e', skin: '#8fd14f', belly: '#fff3c4', mouth: '#f08a6c', white: '#ffffff' };

// Outline `text` at `size` px with its baseline at (x, y); returns { d, width }.
function textPath(text, x, y, size, tracking = 0) {
  const s = size / font.unitsPerEm;
  const run = font.layout(text);
  let pen = x;
  const parts = run.glyphs.map((g, i) => {
    const d = g.path.scale(s, -s).translate(pen, y).toSVG();
    pen += run.positions[i].xAdvance * s + tracking * size;
    return d;
  });
  return { d: parts.join(' '), width: pen - x - tracking * size };
}

const r = (n) => Math.round(n * 100) / 100;
const round = (d) => d.replace(/-?\d+\.\d+/g, (m) => String(r(+m)));

// Full-colour mascot on a 320×200 canvas (y 40–240), walking right with speed lines.
function mascot() {
  const pdf = textPath('PDF', 0, 0, 19, -0.02);
  const pdfX = 146 - pdf.width / 2;
  const pdfD = round(textPath('PDF', pdfX, 131, 19, -0.02).d);
  const line = `stroke="${C.dark}" stroke-linejoin="round" stroke-linecap="round"`;
  const o = `${line} stroke-width="9"`;
  return `
  <g fill="none" stroke="${C.brand}" stroke-width="9" stroke-linecap="round">
    <path d="M18 116H42M8 138H44M18 160H40"/>
  </g>
  <path fill="${C.skin}" ${o} d="M98 176C90 192 78 204 66 210C54 216 56 230 72 230C90 230 106 214 116 192Z"/>
  <path fill="${C.skin}" ${o} d="M190 176C196 196 198 212 206 222C214 230 230 226 228 214C222 198 214 186 212 174Z"/>
  <path fill="${C.skin}" ${o} d="M204 158C218 148 226 138 230 128L254 142C248 158 238 170 222 182Z"/>
  <circle fill="${C.skin}" ${o} cx="256" cy="110" r="34"/>
  <ellipse fill="${C.dark}" cx="265" cy="100" rx="7.5" ry="9.5"/>
  <circle fill="${C.white}" cx="267.5" cy="96" r="3"/>
  <path fill="${C.mouth}" ${line} stroke-width="5" d="M252 122Q265 138 280 122Q266 128 252 122Z"/>
  <path fill="${C.belly}" ${o} d="M84 180H214C208 196 190 202 149 202C108 202 90 196 84 180Z"/>
  <path fill="${C.shell}" ${o} d="M70 182C66 118 104 72 152 70C196 68 226 112 226 182Z"/>
  <g transform="rotate(-8 149 131)">
    <path fill="${C.white}" ${line} stroke-width="8" d="M126 96H160L176 112V162A4 4 0 0 1 172 166H126A4 4 0 0 1 122 162V100A4 4 0 0 1 126 96Z"/>
    <path fill="none" ${line} stroke-width="5" d="M160 96V108A4 4 0 0 0 164 112H176"/>
    <path fill="${C.dark}" d="${pdfD}"/>
    <path fill="none" stroke="${C.brand}" stroke-width="5" stroke-linecap="round" d="M131 143H167"/>
    <path fill="none" stroke="${C.skin}" stroke-width="5" stroke-linecap="round" d="M131 154H157"/>
  </g>`;
}

const svg = (vb, title, body, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${extra} role="img" aria-labelledby="t">\n  <title id="t">${title}</title>${body}\n</svg>\n`;

// 1. Mascot (symbol).
fs.writeFileSync(path.join(out, 'pdfturtle-mascot.svg'), svg('0 40 320 200', 'PDFturtle', mascot(), ' width="320" height="200"'));

// 2. Horizontal lockup: mascot + wordmark ("PDF" dark, "turtle" brand green).
const size = 132, base = 196, x0 = 330;
const pdfW = textPath('PDF', x0, base, size, -0.01);
const turtleW = textPath('turtle', x0 + pdfW.width + size * 0.01, base, size, -0.01);
const W = Math.ceil(x0 + pdfW.width + turtleW.width + 24);
fs.writeFileSync(path.join(out, 'pdfturtle-horizontal.svg'), svg(`0 40 ${W} 200`, 'PDFturtle',
  `${mascot()}\n  <path fill="${C.dark}" d="${round(pdfW.d)}"/>\n  <path fill="${C.brand}" d="${round(turtleW.d)}"/>`, ` width="${W}" height="200"`));

// 3. Wordmark only.
const wP = textPath('PDF', 8, 140, 132, -0.01), wT = textPath('turtle', 8 + wP.width + 1.3, 140, 132, -0.01);
const WW = Math.ceil(8 + wP.width + wT.width + 16);
fs.writeFileSync(path.join(out, 'pdfturtle-wordmark.svg'), svg(`0 0 ${WW} 180`, 'PDFturtle',
  `\n  <path fill="${C.dark}" d="${round(wP.d)}"/>\n  <path fill="${C.brand}" d="${round(wT.d)}"/>`, ` width="${WW}" height="180"`));

// 4. Small-size icon: flat turtle silhouette (page shell with folded corner), no text or face details.
// Used for favicon / app icon at 16–64 px where the mascot's details would blur.
const iconBody = `
  <g transform="translate(-6 -18)">
    <path d="M40 172V134H82V92H128A68 68 0 0 1 196 160V172Z"/>
    <path d="M40 128L76 92V128Z"/>
    <path d="M184 146L208 116L226 128L196 172Z"/>
    <circle cx="224" cy="126" r="20"/>
    <path d="M56 166H90V196A10 10 0 0 1 80 206H66A10 10 0 0 1 56 196Z"/>
    <path d="M146 166H180V196A10 10 0 0 1 170 206H156A10 10 0 0 1 146 196Z"/>
  </g>`;
fs.writeFileSync(path.join(out, 'pdfturtle-icon.svg'), svg('0 0 256 256', 'PDFturtle', `\n  <g fill="${C.dark}">${iconBody}\n  </g>`, ' width="256" height="256"'));
// Same silhouette, white on a rounded brand tile (favicon / app icon).
fs.writeFileSync(path.join(out, 'pdfturtle-icon-tile.svg'), svg('0 0 256 256', 'PDFturtle',
  `\n  <rect width="256" height="256" rx="56" fill="${C.brand}"/>\n  <g fill="${C.white}" transform="translate(128 128) scale(0.95) translate(-128 -128)">${iconBody}\n  </g>`, ' width="256" height="256"'));

console.log('wrote', fs.readdirSync(out).join(', '));
