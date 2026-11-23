// Search-facing copy: per-tool meta description, how-to steps and an explanation, plus titles and
// descriptions for the site pages. Every claim here matches what the code does (see tools.js / server.mjs).

export const TOOL_CONTENT = {
  'merge-pdf': {
    meta: 'Merge PDF files into one document in seconds. Drag to set the order, combine as many PDFs as you need. Free, no sign-up, and files stay on your device.',
    steps: ['Select or drop the PDF files you want to combine.', 'Drag the file cards into the order you want the pages to appear.', 'Press Merge PDF and download the single combined document.'],
    about: [
      'PDFturtle joins whole documents end to end: every page of the first file, then every page of the second, and so on. Page sizes, links inside each document, fonts and images are copied as they are, so nothing is re-rendered or blurred.',
      'Merging happens inside your browser. The files are read from your disk, combined in memory and saved straight back, so contracts, bank statements and ID scans never travel to a server. Need only some pages from each file? Run Extract pages first, or use Organize PDF after merging to drop the pages you do not need.',
    ],
  },
  'split-pdf': {
    meta: 'Split a PDF into separate files by page ranges or every few pages. Extract chapters, invoices or single pages free in your browser, with no upload needed.',
    steps: ['Choose the PDF you want to split.', 'Type the page ranges to keep (for example 1-3, 4-8) or pick a fixed number of pages per file.', 'Press Split PDF and download the parts, bundled as a ZIP when there is more than one.'],
    about: [
      'Splitting is useful when a scanner saved a whole stack of documents as one file, or when you need to send a single chapter of a long report. Ranges can be listed in any order, and you can ask for all ranges to be merged into one new file instead of separate ones.',
      'Each part is a real PDF with the original page content, not a picture of it, so text stays searchable and selectable. The work runs locally in your browser, which also makes it fast for large files: there is nothing to upload and nothing to wait for on a server.',
    ],
  },
  'remove-pages': {
    meta: 'Delete pages from a PDF by number or range: blank pages, ads, cover sheets. Free online and private, because the file is edited in your own browser.',
    steps: ['Select the PDF that has pages you want gone.', 'Enter the pages to delete, such as 2, 5-7.', 'Press Remove pages and download the shorter PDF.'],
    about: [
      'Use Remove pages to drop blank scans, duplicated sheets or pages you are not allowed to share. Everything you keep is copied unchanged, including text, images and page size.',
      'If you would rather pick pages by looking at them, Organize PDF shows thumbnails and lets you delete pages with a click. Remove pages is quicker when you already know the page numbers, especially in long documents.',
    ],
  },
  'extract-pages': {
    meta: 'Extract selected pages from a PDF into a new file. Pick pages by number or range and keep the originals untouched. Free, fast and processed on your device.',
    steps: ['Choose the source PDF.', 'List the pages to extract, for example 1, 4, 10-12.', 'Press Extract pages to download a new PDF with just those pages.'],
    about: [
      'Extract pages is the opposite of Remove pages: instead of saying what to throw away, you say what to keep. The new file contains the chosen pages in the order you typed them, so you can also use it to reorder a short selection.',
      'It is handy for sending one signed page of a contract, a single payslip from a yearly bundle, or the figures from a report. The original file on your computer is never changed.',
    ],
  },
  'organize-pdf': {
    meta: 'Reorder, rotate, delete and insert blank pages in a PDF with drag and drop. See every page as a thumbnail and save the new order. Free and private.',
    steps: ['Open the PDF to see every page as a thumbnail.', 'Drag pages into a new order; use each page’s buttons to rotate it, delete it or add a blank page after it.', 'Press Organize and download the rearranged PDF.'],
    about: [
      'Organize PDF is for documents that came out of the scanner in the wrong order or upside down. You see the actual pages, so there is no guessing which number is which.',
      'Rotation is stored as page rotation, not by redrawing the page, so quality is unchanged. Blank pages match the size of the page before them, which keeps double-sided printing aligned.',
    ],
  },
  'scan-to-pdf': {
    meta: 'Turn phone camera photos of paper documents into a single PDF. Snap pages, keep their order and save one file. Free, with nothing uploaded anywhere.',
    steps: ['On your phone, press Take photos and capture each page.', 'Check the order of the pages and add more if needed.', 'Press Create PDF to save all photos as one document.'],
    about: [
      'Scan to PDF uses your phone’s own camera through the browser, so there is no app to install. Each photo becomes one page, scaled to fit the page size.',
      'Photos stay on the phone while the PDF is built. To make the scanned text searchable and copyable afterwards, run the result through OCR PDF.',
    ],
  },
  'compress-pdf': {
    meta: 'Compress PDF files to a smaller size while keeping text sharp and selectable. Choose extreme, recommended or light compression. Free, no account needed.',
    steps: ['Select one or more PDFs.', 'Pick a level: extreme for the smallest file, recommended for a balance, or less compression for print quality.', 'Press Compress PDF and see how much smaller each file became.'],
    about: [
      'Most of a PDF’s size is usually images. PDFturtle resamples and recompresses them to the resolution the chosen level needs, removes duplicate copies of the same image, and rewrites the file structure more compactly. Text and vector graphics stay as they are, so the result is still searchable.',
      'This full-quality compression runs on the PDFturtle server with Ghostscript, and files are deleted as soon as the result is sent back. If the server is unavailable, a fallback compresses in your browser by turning pages into optimised images. If a file cannot get any smaller, you get the original back rather than a bigger one.',
    ],
  },
  'compress-pdf-to-size': {
    meta: 'Compress a PDF to an exact size limit: 50 KB, 100 KB, 200 KB, 500 KB or 1 MB. Made for online forms and portals. Free and private, in your browser.',
    steps: ['Select or drop your PDF files.', 'Choose the maximum size the form or portal allows.', 'Press Compress to size and download files that are under the limit.'],
    about: [
      'Online application forms, exam and job portals, and visa and scholarship sites often refuse uploads above a fixed size. Ordinary compressors make a file smaller by some amount, so you end up trying again and again. PDFturtle takes the limit itself and finds the best quality that still fits under it.',
      'It changes as little as possible. First it tries rebuilding the file without losing anything, then compression that keeps text selectable. Only if that is not enough does it save pages as images, searching resolution and quality to land just under the limit, with grayscale as a last step. The result tells you what was done, so you know whether the text can still be selected.',
      'Sizes count 1 KB as 1,000 bytes. Portals count either 1,000 or 1,024, so a file under our limit passes both ways.',
    ],
  },
  'compress-pdf-to-50kb': {
    meta: 'Compress a PDF to under 50 KB for strict upload limits on application forms. Finds the best quality that fits. Free, private, no sign-up needed.',
    steps: ['Select your PDF (one or two pages works best at this size).', 'Keep 50 KB selected.', 'Press Compress to size and check the result is readable before uploading.'],
    about: [
      '50 KB is one of the strictest limits you will meet, often used for a single certificate, ID card or caste or income certificate. It is enough for one or two typed pages with their text kept, but a scanned page usually has to be saved as a lower-resolution image, and sometimes in grayscale, to fit.',
      'PDFturtle tries the gentlest methods first and only lowers quality as far as needed. If even the smallest version is above 50 KB, it tells you so instead of handing back a file that will be rejected.',
    ],
    tipsTitle: 'Getting a scan under 50 KB',
    tips: ['Scan or photograph only the document, cropping away the table and margins.', 'One page per file: split multi-page certificates if the portal allows separate uploads.', 'A clean scan of black text on white compresses far smaller than a shadowed phone photo.', 'If the form accepts JPG instead of PDF, a single image is often smaller still.'],
  },
  'compress-pdf-to-100kb': {
    meta: 'Compress a PDF to under 100 KB for application forms and portals that cap upload size. Keeps text where it can. Free, private and in your browser.',
    steps: ['Select or drop your PDF.', '100 KB is already selected.', 'Press Compress to size and download the file that fits.'],
    about: [
      '100 KB is a very common limit for documents such as mark sheets, certificates and proof of address on online forms. Typed documents of several pages usually fit while keeping selectable text. A one- to three-page scan usually fits as page images at readable quality.',
      'PDFturtle aims under 100,000 bytes, so the file is accepted whether the portal counts a kilobyte as 1,000 or 1,024 bytes. Everything happens on your device unless compression that keeps text needs the PDFturtle server, which deletes the file straight after.',
    ],
    tipsTitle: 'If it will not fit in 100 KB',
    tips: ['Remove pages the form does not ask for, such as instruction sheets or blank backs, with Remove pages.', 'Rescan at 150 to 200 DPI; 300 DPI or higher wastes space for on-screen reading.', 'Colour photos of documents are large; grayscale is usually acceptable for certificates.'],
  },
  'compress-pdf-to-200kb': {
    meta: 'Compress a PDF to under 200 KB for forms and portals with a 200 KB upload limit. Best quality that fits, text kept when possible. Free and private.',
    steps: ['Select or drop your PDF.', '200 KB is already selected.', 'Press Compress to size and download the result.'],
    about: [
      'With 200 KB there is room for a few scanned pages in colour, or a longer typed document with its text intact. It is a common limit for degree certificates, experience letters and multi-page ID proofs.',
      'PDFturtle first tries methods that keep the text selectable. Only if those are not enough does it save pages as images, picking the highest resolution and quality that still lands under 200 KB.',
    ],
    tipsTitle: 'Getting the best quality at 200 KB',
    tips: ['Merge only the pages asked for, then compress the merged file once rather than compressing each page separately.', 'Photograph documents in even daylight; shadows and gradients take up a lot of space.', 'Check small print, like roll numbers and dates, is still legible after compressing.'],
  },
  'compress-pdf-to-300kb': {
    meta: 'Compress a PDF to under 300 KB to meet upload limits on job, exam and admission portals. Keeps the most quality that fits. Free, no sign-up needed.',
    steps: ['Select or drop your PDF.', '300 KB is already selected.', 'Press Compress to size and download.'],
    about: [
      '300 KB comfortably fits a handful of scanned pages at good readability, or a long typed document without any loss. It suits combined uploads, such as several semester mark sheets in one file.',
      'If your file is already under 300 KB, PDFturtle gives it back unchanged rather than lowering the quality for nothing.',
    ],
    tipsTitle: 'Combining documents for one upload',
    tips: ['Use Merge PDF to join the documents in the order the form lists them, then compress the merged file.', 'Rotate sideways pages first with Organize PDF; reviewers notice.', 'Name the file clearly, for example with your application number, if the portal shows file names.'],
  },
  'compress-pdf-to-500kb': {
    meta: 'Compress a PDF to under 500 KB for portals and email systems with a 500 KB limit. Multi-page scans stay readable. Free and processed privately.',
    steps: ['Select or drop your PDF.', '500 KB is already selected.', 'Press Compress to size and download.'],
    about: [
      'At 500 KB, multi-page scanned documents such as a full set of mark sheets, a rent agreement or bank statements usually fit at good readability, and most typed documents need no compression at all.',
      'Because PDFturtle looks for the highest quality that fits rather than applying one fixed setting, a 500 KB target gives visibly sharper pages than a 100 KB one from the same file.',
    ],
    tipsTitle: 'Large scans',
    tips: ['If a long scan still does not fit, split it with Split PDF and upload the parts the form asks for.', 'Run OCR PDF after compressing if you want the scanned text to be searchable.', 'Bank statements downloaded as PDFs are usually small already; scans are what make files large.'],
  },
  'compress-pdf-to-1mb': {
    meta: 'Compress a PDF to under 1 MB for uploads, email attachments and portals with a 1 MB limit. High quality kept where possible. Free and private.',
    steps: ['Select or drop your PDF.', '1 MB is already selected.', 'Press Compress to size and download.'],
    about: [
      'A 1 MB limit is generous for most documents: long reports, application bundles and scanned files of a dozen pages or more usually fit with little visible change. It is a common limit on government portals and some email systems.',
      'For larger files, such as presentations exported to PDF with many photos, PDFturtle first tries compression that keeps text and vector graphics sharp before falling back to page images.',
    ],
    tipsTitle: 'Very large PDFs',
    tips: ['If a file is several times larger than 1 MB, check for oversized photos and consider removing pages you do not need first.', 'For email, sharing a link from cloud storage avoids size limits altogether.', 'Keep the original: compressing an already compressed file again loses more quality.'],
  },
  'repair-pdf': {
    meta: 'Repair damaged or corrupt PDF files that will not open or print. Rebuild the file structure and recover readable pages. Free, and runs in your browser.',
    steps: ['Select the damaged PDF files.', 'Press Repair PDF.', 'Download the rebuilt files and open them as usual.'],
    about: [
      'PDFs get damaged by interrupted downloads, broken email attachments or buggy software. PDFturtle first rebuilds the file’s internal tables and page tree, which keeps the text and quality intact.',
      'If that is not possible, it re-reads the file with a more forgiving reader and saves each page it can display as an image. You lose selectable text, but you get the content back. Repair works on several files at once and runs in your browser.',
    ],
  },
  'ocr-pdf': {
    meta: 'Make scanned PDFs searchable with OCR. Recognises text in 33 languages, including Hindi, Tamil, Telugu and Bengali. Free, private, runs in your browser.',
    steps: ['Select a scanned PDF.', 'Choose the document’s language, and a second one if the text is mixed.', 'Press OCR PDF and download a PDF you can search, select and copy from.'],
    about: [
      'OCR (optical character recognition) reads the letters in a scanned image. PDFturtle keeps your page exactly as it looks and adds an invisible text layer on top, placed over the words it recognised, so search and copy work while the page appears unchanged.',
      'Recognition runs on your own device with the Tesseract engine; only the language data is downloaded. That means confidential scans are never uploaded, and it works for 33 languages, including Indian scripts such as Devanagari, Bengali, Tamil, Telugu, Kannada, Malayalam, Gujarati and Gurmukhi.',
    ],
  },
  'jpg-to-pdf': {
    meta: 'Convert JPG, PNG and other images to PDF. Set page size, orientation and margins, and combine many photos into one file. Free and fully in your browser.',
    steps: ['Select or drop your images.', 'Choose the page size, orientation and margin.', 'Press Convert to PDF to get one PDF with an image per page.'],
    about: [
      'Images to PDF is the quickest way to send receipts, handwritten notes or photographed forms as one tidy document. Pages can match each image’s own size, or use A4 or Letter with the image fitted inside.',
      'You can put all images in one PDF or make a separate PDF for each. Nothing leaves your device during the conversion.',
    ],
  },
  'word-to-pdf': {
    meta: 'Convert Word documents (DOC, DOCX, ODT, RTF, TXT) to PDF with layout, fonts, tables and images intact. Free online conversion, no sign-up required.',
    steps: ['Select your Word files.', 'Press Convert to PDF.', 'Download a PDF that looks the same on every device.'],
    about: [
      'Word files can look different depending on the computer and fonts used to open them. A PDF fixes the layout, so headers, tables, page breaks and images stay where you put them.',
      'Conversion uses LibreOffice on the PDFturtle server, the same engine office suites use for printing. Files are processed in a temporary folder that is deleted as soon as your PDF is returned. Without the server, a basic in-browser conversion keeps the text and headings only.',
    ],
  },
  'powerpoint-to-pdf': {
    meta: 'Convert PowerPoint presentations (PPT, PPTX, ODP) to PDF, one slide per page. Share decks that open anywhere without PowerPoint. Free and quick.',
    steps: ['Select your presentation files.', 'Press Convert to PDF.', 'Download the PDF, with each slide as a page.'],
    about: [
      'A PDF of your slides opens on any phone or laptop, cannot be accidentally edited, and keeps your fonts and layout. It is the safest format for sending a deck to a client or uploading it to a portal.',
      'Slides are converted on the PDFturtle server with LibreOffice and the temporary copy is deleted immediately. Animations and embedded video do not carry over, as with any PDF export.',
    ],
  },
  'excel-to-pdf': {
    meta: 'Convert Excel spreadsheets (XLSX, XLS, CSV, ODS) to PDF with columns, borders and number formats preserved. Share tables that print correctly. Free.',
    steps: ['Select your spreadsheet files.', 'Press Convert to PDF.', 'Download a PDF with each sheet laid out for printing.'],
    about: [
      'Spreadsheets are hard to share as they are: column widths change, formulas show up and page breaks fall in odd places. Converting to PDF freezes the numbers exactly as they appear.',
      'Full-fidelity conversion runs with LibreOffice on the PDFturtle server. If the server is not available, PDFturtle still turns each sheet into a clean table in your browser.',
    ],
  },
  'html-to-pdf': {
    meta: 'Convert a web page or HTML file to PDF. Paste a URL or upload HTML, then pick page size, orientation, margins and screen width. Free HTML to PDF tool.',
    steps: ['Paste a web address or select HTML files.', 'Choose the page size (A4, Letter, A3 or Legal), orientation, margin and the screen width to lay the page out for.', 'Press Convert to PDF and download the result.'],
    about: [
      'Saving a web page as PDF is useful for receipts, articles you want to read offline, and records of what a page said on a given day. PDFturtle prints the page with a real Chrome browser on the server, so modern layouts, web fonts and images come out as you see them.',
      'Only public web addresses can be converted; private and local network addresses are refused. Scripts in uploaded HTML files are not run.',
    ],
  },
  'pdf-to-jpg': {
    meta: 'Convert PDF pages to JPG images, or extract every image embedded in a PDF. High-quality output, downloaded as a ZIP. Free and processed in your browser.',
    steps: ['Select the PDF.', 'Choose whether to turn each page into a JPG or to extract the images inside the PDF.', 'Press Convert to JPG and download the images.'],
    about: [
      'Page to JPG renders each page at high resolution, ready for slides, social posts or apps that only accept images. Extract images instead pulls out the original pictures embedded in the document, at their own resolution.',
      'Rendering uses the same PDF engine as Firefox, inside your browser, so even large documents are converted without an upload.',
    ],
  },
  'pdf-to-word': {
    meta: 'Convert PDF to an editable Word document (DOCX). Paragraphs, headings and tables are rebuilt so you can edit, not retype. Free and private in your browser.',
    steps: ['Select your PDFs.', 'Press Convert to WORD.', 'Open the DOCX in Word, Google Docs or LibreOffice and edit.'],
    about: [
      'A PDF stores text as positioned lines, not paragraphs. PDFturtle groups lines back into paragraphs, recognises headings by their size and weight, and detects tables from aligned columns, turning them into real Word tables rather than tab-separated text.',
      'Conversion happens on your device. Text in Indian and right-to-left scripts is put back in reading order. Scanned PDFs have no text to convert, so run OCR PDF on them first.',
    ],
  },
  'pdf-to-powerpoint': {
    meta: 'Convert PDF to PowerPoint (PPTX), with each page as a slide you can present or edit. Turn reports and handouts into decks. Free, no account needed.',
    steps: ['Select your PDFs.', 'Press Convert to PPTX.', 'Open the presentation in PowerPoint, Keynote or Google Slides.'],
    about: [
      'Converting a PDF to slides saves rebuilding a deck by hand when all you have is the exported handout. Each PDF page becomes one slide at the same proportions.',
      'With the PDFturtle server, text and shapes are imported as editable objects using LibreOffice. Without it, each page is placed on its slide as a sharp image, which presents perfectly but cannot be edited.',
    ],
  },
  'pdf-to-excel': {
    meta: 'Convert PDF tables to Excel (XLSX). Columns are detected and numbers stay numbers, ready for formulas and charts. Free PDF to Excel converter.',
    steps: ['Select PDFs that contain tables.', 'Press Convert to EXCEL.', 'Open the XLSX and work with the data.'],
    about: [
      'Copying a table out of a PDF usually gives you one long column of text. PDFturtle finds the columns from how the text is aligned on the page, puts each value in its own cell, and converts amounts like 1,250.00 into real numbers you can sum.',
      'Each page becomes its own sheet. The conversion runs entirely in your browser, which matters for bank statements and financial reports.',
    ],
  },
  'pdf-to-markdown': {
    meta: 'Convert PDF to Markdown with headings, lists and paragraphs kept. Clean text for notes, documentation, static sites and AI tools. Free, in your browser.',
    steps: ['Select your PDFs.', 'Press Convert to Markdown.', 'Download the .md files or paste the text where you need it.'],
    about: [
      'Markdown is plain text with light formatting, the format used by note apps, wikis, GitHub and static site generators. It is also the cleanest way to give a document to an AI assistant.',
      'PDFturtle rebuilds the reading order, marks headings by level and keeps lists as lists, without the page numbers and line breaks that make copied PDF text messy.',
    ],
  },
  'pdf-to-pdfa': {
    meta: 'Convert PDF to PDF/A (1b, 2b or 3b) for long-term archiving and e-filing portals. Fonts embedded and colours defined, as standards require. Free.',
    steps: ['Select your PDFs.', 'Choose the PDF/A level; 2b suits most portals.', 'Press Convert to PDF/A and download the archive-ready files.'],
    about: [
      'PDF/A is the ISO standard for documents that must still open correctly decades from now. Courts, tax and company registries often require it. It embeds every font, fixes the colour space and forbids features such as encryption and external content.',
      'Conversion runs with Ghostscript on the PDFturtle server, and the output was checked with the veraPDF validator during testing. PDF/A-1b forbids transparency, so for files that use it PDFturtle asks you to choose 2b instead.',
    ],
  },
  'rotate-pdf': {
    meta: 'Rotate PDF pages 90, 180 or 270 degrees, for all files at once or one by one. Fix sideways and upside-down scans for free, with no upload needed.',
    steps: ['Select one or more PDFs.', 'Rotate all of them together, or use the button on each file to rotate just that one.', 'Press Rotate PDF and download.'],
    about: [
      'Rotation is saved as a page setting, the way PDF readers expect, so the page content is not redrawn and quality is not touched.',
      'To rotate only some pages of a document, use Organize PDF, which lets you turn individual pages.',
    ],
  },
  'add-page-numbers': {
    meta: 'Add page numbers to a PDF. Choose the position, a format like “Page 1 of 10”, the first number and which pages to number. Free and done in your browser.',
    steps: ['Select your PDFs.', 'Choose where the number goes and how it reads.', 'Press Add page numbers and download.'],
    about: [
      'Numbered pages make long documents, legal bundles and printed reports easy to refer to. Formats can include the total page count, numbering can start from any number and skip a cover page, and facing pages can mirror left and right for printed books.',
      'Numbers are added as real text, not images, so they stay sharp and searchable, with your choice of size, colour and margin.',
    ],
  },
  'add-watermark': {
    meta: 'Add a text or image watermark to PDF pages. Set position, transparency, rotation, a repeating mosaic and which pages to mark. Free and on your device.',
    steps: ['Select your PDFs.', 'Type the watermark text or choose an image, then set position, size, transparency and rotation.', 'Press Add watermark and download.'],
    about: [
      'Watermarks mark a document as a draft, as confidential, or as yours. PDFturtle can place one mark per page or repeat it as a mosaic, on every page or only a range, either over the content or behind it.',
      'Text watermarks work in any language, including Hindi, Tamil, Arabic and Chinese, because PDFturtle embeds the right font for each script.',
    ],
  },
  'crop-pdf': {
    meta: 'Crop PDF pages to remove margins or keep just one area. Draw the crop box on the page and apply it to one page or all. Free crop tool, nothing uploaded.',
    steps: ['Open the PDF.', 'Drag a box over the area you want to keep.', 'Press Crop PDF and download.'],
    about: [
      'Cropping trims wide margins for easier reading on phones, or cuts a page down to a single figure or table.',
      'PDFturtle sets the page’s visible area rather than deleting content, which is how PDF cropping is defined. To make content truly unrecoverable, use Redact PDF instead.',
    ],
  },
  'edit-pdf': {
    meta: 'Edit PDF online: add text, images, shapes, lines, freehand drawing, highlights and white-out boxes, then save. Free PDF editor that runs in your browser.',
    steps: ['Open the PDF.', 'Pick a tool (text, image, rectangle, ellipse, line, draw, highlight or white-out) and drag on the page; move and resize anything you add.', 'Press Save changes and download.'],
    about: [
      'Use Edit PDF to fill in a form that has no fields, annotate a drawing, cover a mistake with white-out, or add a logo.',
      'Text you add can be in any script, including Indian languages and right-to-left text, and stays selectable in the saved PDF. All editing happens on your device.',
    ],
  },
  'pdf-forms': {
    meta: 'Fill in PDF forms online, or add new text fields and checkboxes to any PDF. Flatten answers when done. Free, supports Indian scripts, no upload.',
    steps: ['Open the PDF form.', 'Type into the listed fields, or drag on the page to add new text fields and checkboxes.', 'Press Save form; tick Flatten to make the answers permanent.'],
    about: [
      'PDFturtle lists every fillable field in the document so nothing is missed, including dropdowns and option lists. Answers in Hindi, Tamil and other scripts display correctly because the right font is embedded for each field.',
      'Flattening turns answers into regular page content, so the form can no longer be changed. Leave it unticked if someone else still needs to fill in their part.',
    ],
  },
  'unlock-pdf': {
    meta: 'Remove the password and restrictions from a PDF you are allowed to open, so it can be printed, copied and edited freely. Free, and done in your browser.',
    steps: ['Select the protected PDFs.', 'Enter the password if the file asks for one when opening.', 'Press Unlock PDF and download the unrestricted copy.'],
    about: [
      'Some PDFs open without a password but block printing or copying; others need a password to open at all. Unlock PDF removes both kinds of protection, provided you know the password for files that need one. It does not crack passwords.',
      'Because unlocking runs locally, the password and the document are never sent anywhere.',
    ],
  },
  'protect-pdf': {
    meta: 'Password-protect a PDF with encryption so only people with the password can open it. Secure documents before emailing them. Free, private, in your browser.',
    steps: ['Select your PDFs.', 'Type a password and repeat it.', 'Press Protect PDF and download the encrypted files.'],
    about: [
      'An encrypted PDF cannot be opened, even partly, without its password. That makes it safer to email payslips, medical reports or identity documents.',
      'Encryption is done on your device, so the password is never transmitted. Share the password through a different channel than the file, and keep a copy: it cannot be recovered if lost.',
    ],
  },
  'sign-pdf': {
    meta: 'Sign a PDF yourself: draw or type your signature, add initials, your name and the date, and place them anywhere on the page. Free e-signature in your browser.',
    steps: ['Open the PDF.', 'Draw or type your signature, or choose initials, name or date.', 'Drag a box on the page where it should go, then press Sign.'],
    about: [
      'This is the electronic equivalent of signing a printed page: your signature is added to the document as a visible mark. It suits most everyday agreements, forms and approvals.',
      'It is not a certificate-based digital signature of the kind some government filings require, which also proves the file was not changed after signing. Everything stays on your device.',
    ],
  },
  'redact-pdf': {
    meta: 'Redact PDFs permanently: black out areas or search for words like names and account numbers. Redacted pages are flattened so nothing stays hidden underneath.',
    steps: ['Open the PDF.', 'Drag boxes over what to remove, or type words to find and redact everywhere.', 'Press Redact and download the cleaned file.'],
    about: [
      'Drawing a black rectangle in an ordinary editor leaves the text underneath, where anyone can copy it out. PDFturtle flattens every redacted page into an image after blacking out the areas, so the hidden text and images are really gone.',
      'Search-and-redact finds every occurrence of a word or phrase across the document, which is useful for names, phone numbers, PAN or Aadhaar numbers. Pages without redactions are left unchanged.',
    ],
  },
  'compare-pdf': {
    meta: 'Compare two PDFs and see what changed: a text comparison of added and removed lines, or a visual overlay that highlights differences page by page. Free.',
    steps: ['Add the original PDF, then the new version.', 'Choose text comparison or visual overlay.', 'Press Compare and review the highlighted changes.'],
    about: [
      'Text comparison lines up both documents and marks what was added or removed, ignoring layout shifts, which is ideal for contracts and policies. Visual overlay compares the rendered pages pixel by pixel and shows changes in colour, which catches edits to images, signatures and layout.',
      'Both documents stay on your device during the comparison.',
    ],
  },
  'summarize-pdf': {
    meta: 'Summarise a PDF into clear key points: short, medium or long. Understand reports, papers and contracts in seconds. Free AI PDF summariser.',
    steps: ['Select a PDF with text.', 'Choose how long the summary should be.', 'Press Summarize and read or download the key points.'],
    about: [
      'When the PDFturtle server is set up with AI, the document text is summarised by Claude; PDFturtle does not store it. Otherwise PDFturtle picks the most representative sentences on your own device, which works offline and never sends the text anywhere.',
      'Scanned PDFs need OCR PDF first so there is text to summarise.',
    ],
  },
  'translate-pdf': {
    meta: 'Translate PDF documents into Hindi, Tamil, Telugu, Bengali, English and 15 more languages. Headings and lists are kept, output as Word. Free.',
    steps: ['Select a PDF.', 'Choose the language to translate into.', 'Press Translate and download the translated Word document.'],
    about: [
      'PDFturtle extracts the document’s headings, paragraphs and lists, translates them, and builds a Word file with the same structure. Word is used so that every script displays correctly and the translation can be corrected easily.',
      'Translation uses Claude on the PDFturtle server when it is set up, or the translator built into Chrome on your device.',
    ],
  },
};

// Site pages: <title> (30–60 chars) and description (120–160 chars).
export const PAGE_META = {
  workflows: ['PDF workflows: chain tools into one click · PDFturtle', 'Save a sequence of PDF tools, like merge, add page numbers and compress, with your settings, then run it on any files in one click. Free.'],
  features: ['Features: free, private PDF tools · PDFturtle', 'See what PDFturtle does: 34 PDF tools that run in your browser, support Indian scripts, keep files private and need no account or installation.'],
  pricing: ['Pricing: every PDF tool free · PDFturtle', 'PDFturtle is free: all PDF tools, workflows and batch processing with no sign-up or watermark. See what is included and what a future plan may add.'],
  tools: ['All PDF tools in one place · PDFturtle', 'The full list of PDFturtle tools to organise, optimise, convert, edit, sign and secure PDFs, grouped by task. Every tool is free and runs in your browser.'],
  faq: ['PDF tools FAQ: privacy, limits, formats · PDFturtle', 'Answers about PDFturtle: are files uploaded, which tools use a server, file size limits, supported languages and formats, and how to run it yourself.'],
  developers: ['Developers and self-hosting · PDFturtle', 'Run PDFturtle on your own server with Docker or Node, configure its engines and API, and keep every document inside your own network.'],
  business: ['PDF tools for business teams · PDFturtle', 'Private PDF tools for teams: merge, convert, sign and redact documents without uploading client files to a third party. Self-hosting is available.'],
  education: ['Free PDF tools for students and teachers · PDFturtle', 'Merge notes, convert assignments, compress uploads and make scans searchable, free and without accounts. Works on school computers and phones.'],
  security: ['Security: how PDFturtle keeps files safe · PDFturtle', 'How PDFturtle protects your documents: in-browser processing, deleted temporary files for server conversions, strict browser security and no tracking.'],
  privacy: ['Privacy policy · PDFturtle free PDF tools', 'What PDFturtle collects and why: most files never leave your device, server conversions are deleted at once, and accounts store only email and workflows.'],
  terms: ['Terms and conditions · PDFturtle PDF tools', 'The terms for using PDFturtle’s free PDF tools: acceptable use, your content, availability, limits of liability and how these terms may change.'],
  cookies: ['Cookie policy: one sign-in cookie · PDFturtle', 'PDFturtle uses a single cookie, only when you log in, to keep you signed in. There are no advertising or tracking cookies. Read the details here.'],
  about: ['About PDFturtle: free PDF tools for everyone', 'Why PDFturtle exists: complete, free PDF tools that respect privacy, work in Indian languages and run in any browser, on any device.'],
  contact: ['Contact PDFturtle: support and feedback', 'Get in touch with PDFturtle for support, feedback, bug reports or questions about using or self-hosting the free PDF tools.'],
};
