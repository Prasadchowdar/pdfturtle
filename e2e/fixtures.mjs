// Generates the input files every e2e test uses into e2e/.files (no network, no binaries checked in).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import { Document, Packer, Paragraph } from 'docx';
import * as XLSX from 'xlsx';
import PptxGenJS from 'pptxgenjs';

export const DIR = path.join(import.meta.dirname, '.files');

async function pdf(pages, label) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`${label} page ${i}`, { x: 60, y: 760, size: 24, font });
    p.drawText('Invoice for Ravi Kumar. Confidential salary 12345.', { x: 60, y: 720, size: 12, font });
    p.drawText('The quick brown fox jumps over the lazy dog. PDF tools should keep this text intact.', { x: 60, y: 700, size: 12, font });
    p.drawRectangle({ x: 60, y: 500, width: 200, height: 120, color: rgb(0.9, 0.2, 0.2) });
  }
  const form = doc.getForm();
  form.createTextField('fullname').addToPage(doc.getPage(0), { x: 60, y: 420, width: 200, height: 24 });
  return doc.save();
}

// Paper-coloured page with text-like dark bands and sensor noise.
function noisy(w, h) {
  return png(w, h, (x, y) => {
    const ink = y % 40 < 14 && x > 80 && x < w - 80 && (x * 7 + y) % 23 > 6;
    const v = (ink ? 40 : 235) + Math.round((Math.random() - 0.5) * 30);
    return [v, v - 4, v - 14];
  });
}

// Minimal PNG encoder: by default a 200x120 gradient, enough for the image tools.
function png(w = 200, h = 120, px = (x, y) => [x % 256, y * 2 % 256, 120]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(px(x, y).map((v) => Math.max(0, Math.min(255, v))), y * (w * 3 + 1) + 1 + x * 3);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export default async function setup() {
  fs.mkdirSync(DIR, { recursive: true });
  const w = (name, data) => fs.writeFileSync(path.join(DIR, name), data);
  w('a.pdf', await pdf(3, 'Alpha'));
  w('b.pdf', await pdf(2, 'Beta'));
  // Damaged: the catalog's page tree points at an object that isn't a page tree (same byte length, xref intact).
  w('damaged.pdf', Buffer.from(fs.readFileSync(path.join(DIR, 'a.pdf'), 'latin1').replace(/\/Pages (\d) 0 R/, (m, n) => `/Pages ${n === '2' ? 3 : 2} 0 R`), 'latin1'));
  w('image.png', png());
  // A heavy "phone scan": 2 pages of noisy full-page images (worst case for compression), ~5 MB.
  const scan = await PDFDocument.create();
  for (let i = 0; i < 2; i++) scan.addPage([595, 842]).drawImage(await scan.embedPng(noisy(1100, 1560)), { x: 0, y: 0, width: 595, height: 842 });
  w('scan.pdf', await scan.save());
  w('page.html', '<h1>Hello from HTML</h1><p>Second paragraph with <b>bold</b> text.</p>');
  w('doc.docx', await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Hello from Word'), new Paragraph('Second line')] }] })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Item', 'Qty'], ['Pens', 10], ['Books', 3]]), 'Stock');
  w('sheet.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  const pptx = new PptxGenJS();
  pptx.addSlide().addText('Hello from PowerPoint', { x: 1, y: 1, w: 8, h: 1, fontSize: 28 });
  w('slides.pptx', Buffer.from(await pptx.write({ outputType: 'arraybuffer' })));
}
