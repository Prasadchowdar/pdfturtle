// Tool registry: what each tool shows (options/view) and what it runs.
// The PDF engines (pdf.js, pdf-lib, fontkit: ~550 KB gzipped) load after the first paint, not with the
// home page. Every run() awaits them (see the wrapper after TOOLS); other callers use engine().
let ops, r, loading;
export function engine() {
  loading ??= (async () => { [ops, r] = await Promise.all([import('./ops.js'), import('./render.js')]); return { ops, r }; })();
  return loading;
}

export const CATS = {
  organize: { label: 'Organize PDF', color: '#ee6c4d' },
  optimize: { label: 'Optimize PDF', color: '#8fbc5d' },
  convert: { label: 'Convert PDF', color: '#d6bf2d' },
  edit: { label: 'Edit PDF', color: '#ab6993' },
  security: { label: 'PDF Security', color: '#4a7aab' },
  ai: { label: 'PDF Intelligence', color: '#7253e2' },
};

const base = (name) => name.replace(/\.[^.]+$/, '');
const pdfOut = (name, bytes) => [{ name, bytes, type: 'application/pdf' }];
const one = (ctx) => ctx.files[0];
const POS6 = [['tl', 'Top left'], ['tc', 'Top center'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['bc', 'Bottom center'], ['br', 'Bottom right']];
const POS9 = [['tl', 'Top left'], ['tc', 'Top center'], ['tr', 'Top right'], ['ml', 'Middle left'], ['mc', 'Center'], ['mr', 'Middle right'], ['bl', 'Bottom left'], ['bc', 'Bottom center'], ['br', 'Bottom right']];
const PDF = '.pdf,application/pdf';
const IMG = 'image/*';

// Apply a per-file PDF op to every file; single file -> one PDF, many -> zip.
const ext = (name) => name.split('.').pop().toLowerCase();
// Office -> PDF via LibreOffice on the server; in-browser text-only version if the server isn't available.
const office = (fallback) => async (ctx) => Promise.all(ctx.files.map(async (f) => ({
  name: `${base(f.name)}.pdf`, type: 'application/pdf',
  bytes: (await r.api('office', f.bytes, { ext: ext(f.name) })) ?? (await fallback(f.bytes, ext(f.name))),
})));

const each = (suffix, fn) => async (ctx) => {
  const out = [];
  for (const f of ctx.files) out.push({ name: `${base(f.name)}_${suffix}.pdf`, bytes: await fn(f.bytes, ctx.opts, ctx, f), type: 'application/pdf' });
  return out;
};

// Icon colour: per-tool override or the category colour.
export const color = (t) => t.color || CATS[t.cat].color;

export const TOOLS = [
  // ---------- Organize ----------
  { id: 'merge-pdf', cat: 'organize', glyph: '⧉', name: 'Merge PDF', desc: 'Combine PDFs in the order you want with the easiest PDF merger available.',
    accept: PDF, multi: true, minFiles: 2, btn: 'Merge PDF', done: 'PDFs have been merged!',
    note: 'Drag the files to put them in order.',
    run: async (ctx) => pdfOut('merged_pdfturtle.pdf', await ops.merge(ctx.files.map((f) => f.bytes))) },

  { id: 'split-pdf', cat: 'organize', glyph: '✂', name: 'Split PDF', desc: 'Separate one page or a whole set for easy conversion into independent PDF files.',
    accept: PDF, btn: 'Split PDF', done: 'PDF has been split!',
    options: [
      { key: 'mode', label: 'Split mode', type: 'select', def: 'ranges', choices: [['ranges', 'Custom ranges'], ['fixed', 'Fixed ranges (every N pages)'], ['all', 'Extract every page']] },
      { key: 'ranges', label: 'Ranges', type: 'text', def: '1-2, 3-', hint: 'e.g. 1-3, 5, 8-', show: (o) => o.mode === 'ranges' },
      { key: 'mergeRanges', label: 'Merge all ranges in one PDF', type: 'checkbox', def: false, show: (o) => o.mode === 'ranges' },
      { key: 'every', label: 'Pages per file', type: 'number', def: 1, min: 1, show: (o) => o.mode === 'fixed' },
    ],
    run: async (ctx) => (await ops.split(one(ctx).bytes, ctx.opts)).map((p) => ({ name: `${base(one(ctx).name)}_${p.label}.pdf`, bytes: p.bytes, type: 'application/pdf' })) },

  { id: 'remove-pages', cat: 'organize', glyph: '⌫', name: 'Remove pages', desc: 'Select and remove the PDF pages you don’t need. Get a new file without your deleted pages.',
    accept: PDF, btn: 'Remove pages', done: 'Pages have been removed!',
    options: [{ key: 'ranges', label: 'Pages to remove', type: 'text', def: '1', hint: 'e.g. 1, 3-5' }],
    run: async (ctx) => pdfOut(`${base(one(ctx).name)}_removed.pdf`, await ops.removePages(one(ctx).bytes, ctx.opts.ranges)) },

  { id: 'extract-pages', cat: 'organize', glyph: '⇱', name: 'Extract pages', desc: 'Get a new document containing only the desired pages.',
    accept: PDF, btn: 'Extract pages', done: 'Pages have been extracted!',
    options: [{ key: 'ranges', label: 'Pages to extract', type: 'text', def: '1', hint: 'e.g. 1, 3-5' }],
    run: async (ctx) => pdfOut(`${base(one(ctx).name)}_extracted.pdf`, await ops.extractPages(one(ctx).bytes, ctx.opts.ranges)) },

  { id: 'organize-pdf', cat: 'organize', glyph: '▤', name: 'Organize PDF', desc: 'Sort pages of your PDF file however you like. Delete PDF pages or add PDF pages to your document at your convenience.',
    accept: PDF, view: 'pages', btn: 'Organize', done: 'PDF has been organized!',
    note: 'Drag pages to reorder. Use the buttons on each page to rotate, delete or add a blank page after it.',
    run: async (ctx) => pdfOut(`${base(one(ctx).name)}_organized.pdf`, await ops.organize(one(ctx).bytes, ctx.pages)) },

  { id: 'scan-to-pdf', cat: 'organize', glyph: '⎙', name: 'Scan to PDF', desc: 'Capture document scans with your phone camera and turn them into a PDF instantly.',
    accept: IMG, capture: true, multi: true, btn: 'Create PDF', done: 'Your scan is a PDF!', pick: 'Take photos',
    options: [{ key: 'size', label: 'Page size', type: 'select', def: 'a4', choices: [['a4', 'A4'], ['letter', 'US Letter'], ['fit', 'Same as photo']] }],
    run: async (ctx) => pdfOut('scan_pdfturtle.pdf', await ops.imagesToPdf(await Promise.all(ctx.files.map((f) => r.normalizeImage(f.file))), { size: ctx.opts.size, orientation: 'auto', margin: 0 })) },

  // ---------- Optimize ----------
  { id: 'compress-pdf', cat: 'optimize', glyph: '⇲', name: 'Compress PDF', desc: 'Reduce file size while optimizing for maximal PDF quality.',
    accept: PDF, multi: true, btn: 'Compress PDF', done: 'PDFs have been compressed!',
    options: [{ key: 'level', label: 'Compression level', type: 'select', def: 'recommended', choices: [['extreme', 'Extreme — less quality, high compression'], ['recommended', 'Recommended — good quality, good compression'], ['low', 'Less — high quality, less compression']] }],
    run: async (ctx) => {
      const out = [];
      for (const f of ctx.files) {
        const bytes = (await r.api('compress', f.bytes, { level: ctx.opts.level })) ?? (await r.compress(f.bytes, ctx.opts.level));
        out.push({ name: `${base(f.name)}_compressed.pdf`, bytes, type: 'application/pdf', saved: [f.bytes.length, bytes.length] });
      }
      return out;
    } },

  { id: 'compress-pdf-to-size', cat: 'optimize', glyph: '⤓', name: 'Compress PDF to size', desc: 'Shrink a PDF under an exact size limit, like 100 KB or 200 KB, for online application forms and portals.',
    accept: PDF, multi: true, btn: 'Compress to size', done: 'Your PDFs fit the size limit!',
    note: 'Sizes count 1 KB as 1,000 bytes, so the file passes portals that count either way.',
    options: [{ key: 'target', label: 'Maximum file size', type: 'select', def: '200', choices: [['50', '50 KB'], ['100', '100 KB'], ['150', '150 KB'], ['200', '200 KB'], ['300', '300 KB'], ['500', '500 KB'], ['1000', '1 MB'], ['2000', '2 MB']] }],
    run: async (ctx) => {
      const target = +ctx.opts.target * 1000, files = [], notes = [];
      for (const f of ctx.files) {
        const res = await r.compressTo(f.bytes, target, ctx.progress);
        files.push({ name: `${base(f.name)}_${ctx.opts.target}kb.pdf`, bytes: res.bytes, type: 'application/pdf', saved: [f.bytes.length, res.bytes.length] });
        const kb = Math.ceil(res.bytes.length / 1000);
        if (!res.fits) notes.push(`${f.name}: the smallest possible is ${kb} KB, above the ${ctx.opts.target} KB limit. Remove pages you don't need (Remove pages) or split it into parts, then try again.`);
        else if (res.method.startsWith('images')) notes.push(`${f.name}: ${kb} KB. To fit, pages were saved as images${res.method === 'images-gray' ? ' in grayscale' : ''}, so text is no longer selectable. Check it is still readable before you upload it.`);
        else notes.push(`${f.name}: ${kb} KB${res.method === 'unchanged' ? ', already under the limit' : ', text still selectable'}.`);
      }
      return { files, view: 'text', text: notes.join('\n') };
    } },

  { id: 'repair-pdf', cat: 'optimize', glyph: '⚒', name: 'Repair PDF', desc: 'Repair a damaged PDF and recover data from corrupt PDF. Fix PDF files with our Repair tool.',
    accept: PDF, multi: true, btn: 'Repair PDF', done: 'PDFs have been repaired!',
    run: each('repaired', async (bytes) => {
      try { return await ops.repair(bytes); } catch { return r.rasterRepair(bytes); } // pdf.js is more forgiving
    }) },

  { id: 'ocr-pdf', cat: 'optimize', glyph: '⌕', name: 'OCR PDF', desc: 'Easily convert scanned PDF into searchable and selectable documents.',
    accept: PDF, btn: 'OCR PDF', done: 'Your PDF is now searchable!',
    options: [{ key: 'lang', label: 'Document language', type: 'select', def: 'eng', choices: [
      ['eng', 'English'], ['hin', 'Hindi'], ['ben', 'Bengali'], ['tel', 'Telugu'], ['tam', 'Tamil'], ['mar', 'Marathi'], ['guj', 'Gujarati'], ['kan', 'Kannada'], ['mal', 'Malayalam'], ['pan', 'Punjabi'], ['ori', 'Odia'], ['urd', 'Urdu'],
      ['ara', 'Arabic'], ['heb', 'Hebrew'], ['chi_sim', 'Chinese (Simplified)'], ['chi_tra', 'Chinese (Traditional)'], ['jpn', 'Japanese'], ['kor', 'Korean'], ['tha', 'Thai'], ['vie', 'Vietnamese'], ['ind', 'Indonesian'],
      ['spa', 'Spanish'], ['fra', 'French'], ['deu', 'German'], ['por', 'Portuguese'], ['ita', 'Italian'], ['nld', 'Dutch'], ['pol', 'Polish'], ['rus', 'Russian'], ['ukr', 'Ukrainian'], ['tur', 'Turkish'], ['ell', 'Greek'], ['swe', 'Swedish']] },
      { key: 'lang2', label: 'Second language (optional)', type: 'select', def: '', choices: [['', 'None'], ['eng', 'English'], ['hin', 'Hindi'], ['ara', 'Arabic'], ['chi_sim', 'Chinese (Simplified)'], ['spa', 'Spanish'], ['fra', 'French']] }],
    note: 'Text recognition runs on your device. The first run downloads the language model (~10 MB).',
    run: async (ctx) => pdfOut(`${base(one(ctx).name)}_ocr.pdf`, await r.ocr(one(ctx).bytes, [ctx.opts.lang, ctx.opts.lang2].filter(Boolean).join('+'), ctx.progress)) },

  // ---------- Convert to PDF ----------
  { id: 'jpg-to-pdf', cat: 'convert', glyph: '▣', name: 'JPG to PDF', desc: 'Convert JPG images to PDF in seconds. Easily adjust orientation and margins.',
    accept: IMG, multi: true, btn: 'Convert to PDF', done: 'Images have been converted to PDF!', pick: 'Select JPG images',
    options: [
      { key: 'orientation', label: 'Page orientation', type: 'select', def: 'portrait', choices: [['portrait', 'Portrait'], ['landscape', 'Landscape'], ['auto', 'Auto']] },
      { key: 'size', label: 'Page size', type: 'select', def: 'a4', choices: [['a4', 'A4 (297×210 mm)'], ['letter', 'US Letter (215×279.4 mm)'], ['fit', 'Fit (same page size as image)']] },
      { key: 'margin', label: 'Margin', type: 'select', def: '0', choices: [['0', 'No margin'], ['20', 'Small'], ['40', 'Big']] },
      { key: 'mergeAll', label: 'Merge all images in one PDF file', type: 'checkbox', def: true },
    ],
    run: async (ctx) => {
      const imgs = await Promise.all(ctx.files.map((f) => r.normalizeImage(f.file)));
      if (ctx.opts.mergeAll) return pdfOut('images_pdfturtle.pdf', await ops.imagesToPdf(imgs, ctx.opts));
      return Promise.all(imgs.map(async (im, i) => ({ name: `${base(ctx.files[i].name)}.pdf`, bytes: await ops.imagesToPdf([im], ctx.opts), type: 'application/pdf' })));
    } },

  { id: 'word-to-pdf', cat: 'convert', color: '#5f83c6', glyph: 'W', name: 'Word to PDF', desc: 'Make DOC and DOCX files easy to read by converting them to PDF.',
    accept: '.doc,.docx,.odt,.rtf,.txt', multi: true, btn: 'Convert to PDF', done: 'Word files have been converted!', pick: 'Select WORD files',
    run: office((bytes, e) => {
      if (e !== 'docx') throw new Error('Old .doc/.odt/.rtf files need the PDFturtle server (npm run server).');
      return r.wordToPdf(bytes);
    }) },

  { id: 'powerpoint-to-pdf', cat: 'convert', color: '#ff7651', glyph: 'P', name: 'PowerPoint to PDF', desc: 'Make PPT and PPTX slideshows easy to view by converting them to PDF.',
    accept: '.ppt,.pptx,.odp', multi: true, btn: 'Convert to PDF', done: 'Presentations have been converted!', pick: 'Select POWERPOINT files',
    run: office((bytes, e) => {
      if (e !== 'pptx') throw new Error('Old .ppt/.odp files need the PDFturtle server (npm run server).');
      return r.pptToPdf(bytes);
    }) },

  { id: 'excel-to-pdf', cat: 'convert', color: '#5ea162', glyph: 'X', name: 'Excel to PDF', desc: 'Make EXCEL spreadsheets easy to read by converting them to PDF.',
    accept: '.xlsx,.xls,.csv,.ods', multi: true, btn: 'Convert to PDF', done: 'Spreadsheets have been converted!', pick: 'Select EXCEL files',
    run: office((bytes) => r.excelToPdf(bytes)) },

  { id: 'html-to-pdf', cat: 'convert', glyph: '</>', name: 'HTML to PDF', desc: 'Convert webpages in HTML to PDF. Copy and paste the URL of the page you want and convert it to PDF with a click.',
    accept: '.html,.htm', multi: true, urlInput: true, btn: 'Convert to PDF', done: 'HTML has been converted!', pick: 'Select HTML files',
    options: [
      { key: 'screen', label: 'Screen size', type: 'select', def: '1440', choices: [['1920', 'Desktop HD (1920px)'], ['1440', 'Desktop (1440px)'], ['1024', 'Tablet (1024px)'], ['768', 'Tablet portrait (768px)'], ['375', 'Phone (375px)']] },
      { key: 'size', label: 'Page size', type: 'select', def: 'a4', choices: [['a4', 'A4'], ['letter', 'US Letter'], ['a3', 'A3'], ['legal', 'Legal']] },
      { key: 'orientation', label: 'Orientation', type: 'select', def: 'portrait', choices: [['portrait', 'Portrait'], ['landscape', 'Landscape']] },
      { key: 'margin', label: 'Margin', type: 'select', def: 'small', choices: [['none', 'No margin'], ['small', 'Small'], ['big', 'Big']] },
    ],
    run: async (ctx) => Promise.all(ctx.files.map(async (f) => {
      const name = f.url ? `${new URL(f.url).hostname}.pdf` : `${base(f.name)}.pdf`;
      const page = { screen: ctx.opts.screen, size: ctx.opts.size, orientation: ctx.opts.orientation, margin: ctx.opts.margin };
      let bytes = f.url ? await r.api('html', '', { url: f.url, ...page }) : await r.api('html', f.bytes, page);
      if (!bytes && f.url) throw new Error('Converting a web address needs the PDFturtle server (npm run server).');
      bytes ??= await r.htmlToPdf(new TextDecoder().decode(f.bytes));
      return { name, bytes, type: 'application/pdf' };
    })) },

  // ---------- Convert from PDF ----------
  { id: 'pdf-to-jpg', cat: 'convert', glyph: '▧', name: 'PDF to JPG', desc: 'Convert each PDF page into a JPG image.',
    accept: PDF, btn: 'Convert to JPG', done: 'PDF has been converted to images!',
    options: [
      { key: 'mode', label: 'Mode', type: 'select', def: 'pages', choices: [['pages', 'Page to JPG (every page becomes an image)'], ['extract', 'Extract images (images inside the PDF)']] },
      { key: 'dpi', label: 'Image quality', type: 'select', def: '150', choices: [['96', 'Normal (96 DPI)'], ['150', 'High (150 DPI)'], ['300', 'Very high (300 DPI)']], show: (o) => o.mode !== 'extract' },
      { key: 'format', label: 'Format', type: 'select', def: 'jpg', choices: [['jpg', 'JPG'], ['png', 'PNG']] },
    ],
    run: async (ctx) => (ctx.opts.mode === 'extract' ? await r.extractImages(one(ctx).bytes, { format: ctx.opts.format }) : await r.pdfToImages(one(ctx).bytes, { dpi: +ctx.opts.dpi, format: ctx.opts.format })).map((p) => ({ name: `${base(one(ctx).name)}_${p.label}.${p.ext}`, bytes: p.bytes, type: `image/${p.ext === 'jpg' ? 'jpeg' : 'png'}` })) },

  { id: 'pdf-to-word', cat: 'convert', color: '#295795', glyph: 'W', name: 'PDF to Word', desc: 'Easily convert your PDF files into easy to edit DOCX documents.',
    accept: PDF, multi: true, btn: 'Convert to WORD', done: 'PDFs have been converted to Word!',
    note: 'Works on PDFs with real text. For scans, run OCR PDF first.',
    run: async (ctx) => Promise.all(ctx.files.map(async (f) => ({ name: `${base(f.name)}.docx`, bytes: await r.pdfToWord(f.bytes), type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))) },

  { id: 'pdf-to-powerpoint', cat: 'convert', color: '#d04526', glyph: 'P', name: 'PDF to PowerPoint', desc: 'Turn your PDF files into easy to edit PPT and PPTX slideshows.',
    accept: PDF, multi: true, btn: 'Convert to PPTX', done: 'PDFs have been converted to PowerPoint!',
    run: async (ctx) => Promise.all(ctx.files.map(async (f) => ({ name: `${base(f.name)}.pptx`, bytes: (await r.api('pdf2pptx', f.bytes)) ?? (await r.pdfToPptx(f.bytes)), type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }))) },

  { id: 'pdf-to-excel', cat: 'convert', color: '#2e7237', glyph: 'X', name: 'PDF to Excel', desc: 'Pull data straight from PDFs into Excel spreadsheets in a few short seconds.',
    accept: PDF, multi: true, btn: 'Convert to EXCEL', done: 'PDFs have been converted to Excel!',
    run: async (ctx) => Promise.all(ctx.files.map(async (f) => ({ name: `${base(f.name)}.xlsx`, bytes: await r.pdfToExcel(f.bytes), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))) },

  { id: 'pdf-to-markdown', cat: 'ai', glyph: 'M↓', name: 'PDF to Markdown', desc: 'Turn PDFs into Markdown files. Perfect for notes, docs, and LLMs.',
    accept: PDF, multi: true, btn: 'Convert to Markdown', done: 'PDFs have been converted to Markdown!',
    run: async (ctx) => Promise.all(ctx.files.map(async (f) => ({ name: `${base(f.name)}.md`, bytes: new TextEncoder().encode(await r.pdfToMarkdown(f.bytes)), type: 'text/markdown' }))) },

  { id: 'pdf-to-pdfa', cat: 'convert', color: '#4a7aab', glyph: 'A', name: 'PDF to PDF/A', desc: 'Transform your PDF to PDF/A, the ISO-standardized version of PDF for long-term archiving.',
    accept: PDF, multi: true, btn: 'Convert to PDF/A', done: 'PDFs have been converted to PDF/A!',
    options: [{ key: 'level', label: 'PDF/A conformance', type: 'select', def: '2', choices: [['1', 'PDF/A-1b'], ['2', 'PDF/A-2b (recommended)'], ['3', 'PDF/A-3b']] }],
    run: each('pdfa', async (bytes, o) => {
      const out = await r.api('pdfa', bytes, { level: o.level });
      if (!out) throw new Error('PDF/A needs the PDFturtle server with Ghostscript (npm run server).');
      return out;
    }) },

  // ---------- Edit ----------
  { id: 'rotate-pdf', cat: 'edit', glyph: '↻', name: 'Rotate PDF', desc: 'Rotate your PDFs the way you need them. You can even rotate multiple PDFs at once!',
    accept: PDF, multi: true, rotateCards: true, btn: 'Rotate PDF', done: 'PDFs have been rotated!',
    note: 'Use the arrow on each file to rotate it, or rotate them all at once below.',
    options: [{ key: 'deg', label: 'Rotate all files', type: 'select', def: '0', choices: [['0', 'Only as set on each file'], ['90', 'Right (90°)'], ['-90', 'Left (90°)'], ['180', 'Upside down (180°)']] }],
    run: each('rotated', (bytes, o, ctx, f) => ops.rotate(bytes, +o.deg + (f.rot || 0))) },

  { id: 'add-page-numbers', cat: 'edit', glyph: '#', name: 'Page numbers', desc: 'Add page numbers into PDFs with ease. Choose your positions, dimensions, typography.',
    accept: PDF, multi: true, btn: 'Add page numbers', done: 'Page numbers have been added!',
    options: [
      { key: 'position', label: 'Position', type: 'grid', def: 'bc', choices: POS6 },
      { key: 'facing', label: 'Facing pages (mirror left/right)', type: 'checkbox', def: false },
      { key: 'margin', label: 'Margin', type: 'select', def: '30', choices: [['15', 'Small'], ['30', 'Recommended'], ['50', 'Big']] },
      { key: 'start', label: 'First number', type: 'number', def: 1, min: 0 },
      { key: 'from', label: 'From page', type: 'number', def: 1, min: 1 },
      { key: 'to', label: 'To page (blank = last)', type: 'number', def: '', min: 1 },
      { key: 'format', label: 'Text', type: 'select', def: '{n}', choices: [['{n}', 'Page number only'], ['Page {n}', 'Page {n}'], ['Page {n} of {p}', 'Page {n} of {p}'], ['{n} / {p}', '{n} / {p}']] },
      { key: 'size', label: 'Font size', type: 'number', def: 12, min: 6, max: 72 },
      { key: 'color', label: 'Color', type: 'color', def: '#000000' },
    ],
    run: each('numbered', (bytes, o) => ops.pageNumbers(bytes, o)) },

  { id: 'add-watermark', cat: 'edit', glyph: '◈', name: 'Watermark', desc: 'Stamp an image or text over your PDF in seconds. Choose the typography, transparency and position.',
    accept: PDF, multi: true, btn: 'Add watermark', done: 'Watermark has been added!',
    options: [
      { key: 'mode', label: 'Watermark type', type: 'select', def: 'text', choices: [['text', 'Place text'], ['image', 'Place image']] },
      { key: 'text', label: 'Text', type: 'text', def: 'CONFIDENTIAL', show: (o) => o.mode === 'text' },
      { key: 'bold', label: 'Bold', type: 'checkbox', def: true, show: (o) => o.mode === 'text' },
      { key: 'size', label: 'Font size', type: 'number', def: 48, min: 6, max: 200, show: (o) => o.mode === 'text' },
      { key: 'color', label: 'Color', type: 'color', def: '#d0021b', show: (o) => o.mode === 'text' },
      { key: 'image', label: 'Image', type: 'image', show: (o) => o.mode === 'image' },
      { key: 'scale', label: 'Image size (% of page)', type: 'number', def: 40, min: 5, max: 100, show: (o) => o.mode === 'image' },
      { key: 'position', label: 'Position', type: 'grid', def: 'mc', choices: POS9, show: (o) => !o.mosaic },
      { key: 'mosaic', label: 'Mosaic (repeat over page)', type: 'checkbox', def: false },
      { key: 'opacity', label: 'Transparency', type: 'select', def: '0.5', choices: [['1', 'No transparency'], ['0.75', '25%'], ['0.5', '50%'], ['0.25', '75%']] },
      { key: 'rotation', label: 'Rotation', type: 'select', def: '45', choices: [['0', 'Do not rotate'], ['45', '45°'], ['90', '90°'], ['180', '180°'], ['270', '270°']] },
      { key: 'pages', label: 'Pages (blank = all)', type: 'text', def: '', hint: 'e.g. 1-3, 5' },
      { key: 'layer', label: 'Layer', type: 'select', def: 'over', choices: [['over', 'Over the PDF content'], ['under', 'Below the PDF content']] },
    ],
    run: each('watermarked', (bytes, o) => ops.watermark(bytes, o)) },

  { id: 'crop-pdf', cat: 'edit', glyph: '⛶', name: 'Crop PDF', desc: 'Crop margins of PDF documents or select specific areas, then apply the changes to one page or the whole document.',
    accept: PDF, view: 'marks', single: true, modes: [['crop', 'Crop area']], btn: 'Crop PDF', done: 'PDF has been cropped!',
    note: 'Drag a box over the area to keep.',
    options: [{ key: 'scope', label: 'Apply to', type: 'select', def: 'all', choices: [['all', 'All pages'], ['page', 'Only the page I marked']] }],
    run: async (ctx) => {
      const m = ctx.marks[0];
      if (!m) throw new Error('Drag a box on the page to choose the crop area');
      return pdfOut(`${base(one(ctx).name)}_cropped.pdf`, await ops.crop(one(ctx).bytes, m, ctx.opts.scope === 'page' ? m.page : null));
    } },

  { id: 'edit-pdf', cat: 'edit', glyph: '✎', name: 'Edit PDF', desc: 'Add text, images, shapes or highlights to a PDF document. Edit the size, font, and color of the added content.',
    accept: PDF, view: 'marks', btn: 'Save changes', done: 'Your PDF has been edited!',
    modes: [['text', 'Text'], ['image', 'Image'], ['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['line', 'Line'], ['draw', 'Draw'], ['highlight', 'Highlight'], ['whiteout', 'White-out']],
    note: 'Pick a tool, then drag on the page. Drag anything you placed to move it, or its corner to resize.',
    options: [
      { key: 'text', label: 'Text', type: 'textarea', def: 'Your text', show: (o, mode) => mode === 'text' },
      { key: 'size', label: 'Font size', type: 'number', def: 14, min: 6, max: 96, show: (o, mode) => mode === 'text' },
      { key: 'color', label: 'Color', type: 'color', def: '#1a1a1a', show: (o, mode) => ['text', 'rect', 'ellipse', 'line', 'draw'].includes(mode) },
      { key: 'stroke', label: 'Line width', type: 'select', def: '2', choices: [['1', 'Thin'], ['2', 'Normal'], ['4', 'Thick']], show: (o, mode) => ['rect', 'ellipse', 'line', 'draw'].includes(mode) },
      { key: 'image', label: 'Image', type: 'image', show: (o, mode) => mode === 'image' },
    ],
    run: async (ctx) => pdfOut(`${base(one(ctx).name)}_edited.pdf`, await ops.annotate(one(ctx).bytes, ctx.marks)) },

  { id: 'pdf-forms', cat: 'edit', glyph: '☑', name: 'PDF Forms', desc: 'Fill PDF forms yourself, or create interactive fillable PDFs with text fields and checkboxes.',
    accept: PDF, view: 'marks', fields: true, btn: 'Save form', done: 'Your form is ready!',
    modes: [['field-text', 'Text field'], ['field-check', 'Checkbox']],
    note: 'Existing fields are listed below to fill in. Drag on the page to add new fields.',
    options: [{ key: 'flatten', label: 'Flatten (make answers permanent)', type: 'checkbox', def: false }],
    run: async (ctx) => pdfOut(`${base(one(ctx).name)}_form.pdf`, await ops.fillForm(one(ctx).bytes, { values: ctx.values, newFields: ctx.marks, flatten: ctx.opts.flatten })) },

  // ---------- Security ----------
  { id: 'unlock-pdf', cat: 'security', glyph: '🔓︎', name: 'Unlock PDF', desc: 'Remove PDF password security, giving you the freedom to use your PDFs as you want.',
    accept: PDF, multi: true, btn: 'Unlock PDF', done: 'PDFs have been unlocked!',
    options: [{ key: 'password', label: 'Current password (if it has one to open)', type: 'password', def: '' }],
    run: each('unlocked', (bytes, o) => ops.unlock(bytes, o.password)) },

  { id: 'protect-pdf', cat: 'security', glyph: '🔒︎', name: 'Protect PDF', desc: 'Protect PDF files with a password. Encrypt PDF documents to prevent unauthorized access.',
    accept: PDF, multi: true, btn: 'Protect PDF', done: 'PDFs have been protected!',
    options: [
      { key: 'password', label: 'Type password', type: 'password', def: '' },
      { key: 'repeat', label: 'Repeat password', type: 'password', def: '' },
    ],
    run: async (ctx) => {
      if (ctx.opts.password !== ctx.opts.repeat) throw new Error('Passwords do not match');
      return each('protected', (bytes, o) => ops.protect(bytes, o.password))(ctx);
    } },

  { id: 'sign-pdf', cat: 'security', glyph: '✍', name: 'Sign PDF', desc: 'Sign a document yourself: draw or type your signature and place it on the page.',
    accept: PDF, view: 'marks', modes: [['image', 'Signature'], ['initials', 'Initials'], ['name', 'Name'], ['date', 'Date']], signature: true, btn: 'Sign', done: 'Your PDF has been signed!',
    note: 'Draw or type your signature, then drag a box where it should go. Add initials, your name or today\'s date the same way.',
    options: [
      { key: 'initials', label: 'Initials', type: 'text', def: '', show: (o, mode) => mode === 'initials' },
      { key: 'name', label: 'Name', type: 'text', def: '', show: (o, mode) => mode === 'name' },
      { key: 'ink', label: 'Ink colour', type: 'color', def: '#1b2a6b', show: (o, mode) => mode !== 'image' },
    ],
    run: async (ctx) => {
      if (!ctx.marks.length) throw new Error('Drag a box on the page to place your signature');
      return pdfOut(`${base(one(ctx).name)}_signed.pdf`, await ops.annotate(one(ctx).bytes, ctx.marks));
    } },

  { id: 'redact-pdf', cat: 'security', glyph: '▬', name: 'Redact PDF', desc: 'Redact text and graphics to permanently remove sensitive information from a PDF.',
    accept: PDF, view: 'marks', modes: [['redact', 'Redact area']], btn: 'Redact', done: 'Your PDF has been redacted!',
    note: 'Drag boxes over what to remove, or type words to find and redact everywhere. Redacted pages are flattened to images so nothing underneath survives.',
    options: [{ key: 'search', label: 'Search & redact text', type: 'textarea', def: '', hint: 'One word or phrase per line' }],
    run: async (ctx) => {
      const terms = (ctx.opts.search || '').split('\n').filter((t) => t.trim());
      const found = terms.length ? await r.findTextBoxes(one(ctx).bytes, terms) : [];
      if (terms.length && !found.length && !ctx.marks.length) throw new Error('None of those words were found in the PDF');
      const marks = [...ctx.marks, ...found];
      if (!marks.length) throw new Error('Drag at least one box or type text to redact');
      return pdfOut(`${base(one(ctx).name)}_redacted.pdf`, await r.redact(one(ctx).bytes, marks));
    } },

  { id: 'compare-pdf', cat: 'security', glyph: '⇆', name: 'Compare PDF', desc: 'Show a side-by-side document comparison and easily spot changes between different file versions.',
    accept: PDF, multi: true, minFiles: 2, maxFiles: 2, btn: 'Compare', done: 'Comparison',
    note: 'Add the original first, then the new version.',
    options: [{ key: 'mode', label: 'Comparison', type: 'select', def: 'text', choices: [['text', 'Semantic text comparison'], ['visual', 'Content overlay (visual)']] }],
    run: async (ctx) => {
      if (ctx.opts.mode === 'visual') return { view: 'visual', pages: await r.compareVisual(ctx.files[0].bytes, ctx.files[1].bytes), names: ctx.files.map((f) => f.name) };
      const [a, b] = await Promise.all(ctx.files.slice(0, 2).map(async (f) => (await r.pageLines(f.bytes)).flat().map((l) => l.text)));
      return { view: 'diff', diff: r.diffLines(a, b), names: ctx.files.map((f) => f.name) };
    } },

  // ---------- Intelligence ----------
  { id: 'summarize-pdf', cat: 'ai', glyph: '≡', name: 'AI Summarizer', desc: 'Quickly generate concise summaries of PDFs, providing clear and precise key points in seconds.',
    accept: PDF, btn: 'Summarize', done: 'Summary',
    options: [{ key: 'length', label: 'Summary length', type: 'select', def: '6', choices: [['3', 'Short'], ['6', 'Medium'], ['12', 'Long']] }],
    note: 'Uses Claude on the PDFturtle server when it is set up; otherwise picks the key sentences on your device.',
    run: async (ctx) => {
      const text = await r.pdfText(one(ctx).bytes);
      if (!text.trim()) throw new Error('No text found. If this is a scan, run OCR PDF first.');
      ctx.progress('Summarizing…');
      const ai = await r.aiApi('summarize', { text, length: +ctx.opts.length });
      const points = ai?.points ?? r.summarize(text, +ctx.opts.length);
      const summary = points.map((p) => `- ${p}`).join('\n');
      return { view: 'text', text: summary, files: [{ name: `${base(one(ctx).name)}_summary.md`, bytes: new TextEncoder().encode(summary + '\n'), type: 'text/markdown' }] };
    } },

  { id: 'translate-pdf', cat: 'ai', glyph: '文', name: 'Translate PDF', desc: 'Easily translate PDF files powered by AI. Headings and lists are kept.',
    accept: PDF, btn: 'Translate', done: 'Your PDF has been translated!',
    options: [{ key: 'target', label: 'Translate to', type: 'select', def: 'hi', choices: [['en', 'English'], ['hi', 'Hindi'], ['bn', 'Bengali'], ['te', 'Telugu'], ['ta', 'Tamil'], ['mr', 'Marathi'], ['gu', 'Gujarati'], ['kn', 'Kannada'], ['ml', 'Malayalam'], ['ur', 'Urdu'], ['ar', 'Arabic'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['pt', 'Portuguese'], ['it', 'Italian'], ['ru', 'Russian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese']] }],
    note: 'Uses Claude on the PDFturtle server when it is set up, otherwise the translator built into Chrome. Output is a Word file so every script displays correctly.',
    run: async (ctx) => {
      const blocks = r.blocksOf(await r.pageLines(one(ctx).bytes));
      if (!blocks.length) throw new Error('No text found. If this is a scan, run OCR PDF first.');
      ctx.progress('Translating…');
      const ai = await r.aiApi('translate', { blocks: blocks.map((b) => b.text), target: ctx.opts.target });
      const out = ai ? blocks.map((b, i) => ({ ...b, text: ai.blocks[i] })) : await r.translateBlocks(blocks, ctx.opts.target, ctx.progress);
      return [{ name: `${base(one(ctx).name)}_${ctx.opts.target}.docx`, bytes: await r.blocksToDocx(out), type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }];
    } },
];

// Library internals ("Expected instance of PDFDict", "x is not a function", ...) mean a damaged file; say so.
// Landing pages for common upload limits: the same tool with the size preset. `variant` keeps them out of
// menus and the home grid; they're reached from the Compress pages, search and the sitemap.
export const SIZE_PAGES = [['50', '50kb', '50KB'], ['100', '100kb', '100KB'], ['200', '200kb', '200KB'], ['300', '300kb', '300KB'], ['500', '500kb', '500KB'], ['1000', '1mb', '1MB']];
{
  const sized = TOOLS.find((t) => t.id === 'compress-pdf-to-size');
  for (const [kb, slug, label] of SIZE_PAGES) {
    TOOLS.push({ ...sized, id: `compress-pdf-to-${slug}`, name: `Compress PDF to ${label}`, variant: true,
      desc: `Make your PDF smaller than ${label.replace(/(\d)([KM]B)/, '$1 $2')} to meet upload limits on application forms and portals. Free and private.`,
      options: sized.options.map((o) => ({ ...o, def: kb })) });
  }
}

const INTERNAL = /instance of|is not a function|call stack|Cannot read propert|undefined|Failed to parse/i;
for (const t of TOOLS) if (t.run) {
  const run = t.run;
  t.run = async (ctx) => {
    await engine();
    try { return await run(ctx); } catch (e) {
      if (!INTERNAL.test(e?.message || '')) throw e;
      console.error(e);
      throw new Error(t.id === 'repair-pdf' ? 'This PDF is too damaged to repair.' : 'This PDF is damaged in a way this tool can\'t handle. Try "Repair PDF" first, then run this tool on the repaired file.');
    }
  };
}
