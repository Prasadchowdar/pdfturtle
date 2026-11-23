import './style.css';
import { TOOLS, CATS, color, engine } from './tools.js';
import { workflowsView, loadWorkflows, runWorkflow } from './workflows.js';
import { headerHTML, footerHTML, homeMainHTML, toolHeadHTML, toolInfoHTML, pickLabel, link, byId, esc } from './shell.js';
import { accountHeader, authView } from './account.js';
import { pageView } from './pages.js';
import { go, metaFor } from './seo.js';
const openPdf = async (...a) => (await engine()).r.openPdf(...a);
const renderToWidth = async (...a) => (await engine()).r.renderToWidth(...a);
const normalizeImage = async (...a) => (await engine()).r.normalizeImage(...a);
const canvasBytes = async (...a) => (await engine()).r.canvasBytes(...a);
const listFields = async (...a) => (await engine()).ops.listFields(...a);

const app = document.getElementById('app');
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const fmtSize = (n) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(2)} MB`);

let S = null; // state of the open tool page
let carry = null; // result File handed to the next tool via "Continue to…"

// ---------- shell (markup lives in shell.js, shared with the server's prerender) ----------

function frame(main) {
  app.replaceChildren(h(headerHTML()), main, h(footerHTML()));
  app.querySelector('.top').append(accountHeader());
}

function home() {
  S = null;
  const main = h(homeMainHTML());
  main.querySelector('.pills').onclick = (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    main.querySelectorAll('.pills button').forEach((b) => b.classList.toggle('on', b === e.target));
    main.querySelectorAll('.card').forEach((c) => (c.hidden = f !== 'all' && c.dataset.cat !== f));
  };
  frame(main);
}

// ---------- tool page ----------

function accepts(accept, f) {
  return accept.split(',').some((a) => {
    a = a.trim().toLowerCase();
    if (a.startsWith('.')) return f.name.toLowerCase().endsWith(a);
    if (a.endsWith('/*')) return f.type.startsWith(a.slice(0, -1));
    return f.type === a;
  });
}

const defaults = (t) => Object.fromEntries((t.options || []).filter((o) => 'def' in o).map((o) => [o.key, o.def]));

function toolPage(t) {
  S = { tool: t, files: [], opts: defaults(t), marks: [], pages: [], values: {}, fields: [], mode: t.modes?.[0][0], sig: null, canvases: new Map() };
  if (t.unavailable) {
    return frame(h(`<main class="pick"><h1>${esc(t.name)}</h1><p class="lead">${esc(t.desc)}</p><div class="notice">${esc(t.unavailable)}</div><a class="bigbtn" href="/">See all tools</a></main>`));
  }
  if (carry && accepts(t.accept, carry)) { const f = carry; carry = null; return addFiles([f]); }
  pickView();
}

function fileInput(t, cls, label) {
  const el = h(`<label class="${cls}">${label}<input type="file" hidden accept="${t.accept}" ${t.multi ? 'multiple' : ''} ${t.capture ? 'capture="environment"' : ''}></label>`);
  el.querySelector('input').onchange = (e) => addFiles([...e.target.files]);
  return el;
}

function pickView() {
  const t = S.tool;
  const kind = t.accept.includes('pdf') ? 'PDF' : t.accept.includes('image') ? 'images' : 'files';
  const main = h(`<main class="pick">${toolHeadHTML(t)}</main>`);
  main.append(fileInput(t, 'bigbtn', pickLabel(t)));
  main.append(h(`<p class="muted">or drop ${kind === 'PDF' ? 'PDFs' : kind} here</p>`));
  if (t.urlInput) main.append(urlForm());
  const info = toolInfoHTML(t);
  if (info) main.append(h(info));
  frame(main);
}

// HTML to PDF: add a web address as a pseudo-file the server fetches.
function urlForm() {
  const form = h(`<form class="urlform"><input type="url" required placeholder="https://example.com" aria-label="Web page address"><button>Add URL</button></form>`);
  form.onsubmit = (e) => {
    e.preventDefault();
    const url = form.querySelector('input').value.trim();
    S.files.push({ id: crypto.randomUUID(), name: url, url, size: 0, bytes: new Uint8Array(), file: new File([], 'page.url', { type: 'text/uri-list' }) });
    workView();
  };
  return form;
}

async function addFiles(list) {
  const t = S.tool;
  const ok = list.filter((f) => accepts(t.accept, f));
  if (ok.length < list.length) toast(`${list.length - ok.length} file(s) skipped: this tool takes ${t.accept.replace(/,application\/pdf/, '')}`);
  if (!ok.length) return;
  const items = await Promise.all(ok.map(async (f) => ({ id: crypto.randomUUID(), name: f.name, file: f, size: f.size, bytes: new Uint8Array(await f.arrayBuffer()) })));
  if (t.multi) S.files = [...S.files, ...items].slice(0, t.maxFiles || 200);
  else { S.files = [items[0]]; S.marks = []; S.canvases.clear(); }
  const f = S.files[0];
  if (t.view === 'pages' || t.fields) {
    try {
      f.pdf ??= await openPdf(f.bytes);
      if (t.view === 'pages') S.pages = Array.from({ length: f.pdf.numPages }, (_, i) => ({ i, rot: 0 }));
      if (t.fields) { S.fields = await listFields(f.bytes); S.values = Object.fromEntries(S.fields.map((x) => [x.name, x.value])); }
    } catch (e) { toast(e.message); }
  }
  workView();
}

function workView() {
  const main = h(`<main class="work"><section class="stage"></section><aside class="side"></aside></main>`);
  frame(main);
  const stage = main.querySelector('.stage');
  const view = S.tool.view || 'files';
  if (view === 'files') filesStage(stage);
  else if (view === 'pages') pagesStage(stage);
  else marksStage(stage);
  renderSide();
}

async function pdfOf(f) {
  return (f.pdf ??= await openPdf(f.bytes));
}

async function thumbInto(el, f, meta) {
  if (f.url) { el.append(h('<span class="ext">URL</span>')); if (meta) meta.textContent = 'Web page'; return; }
  if (f.file.type.startsWith('image/')) { el.append(h(`<img alt="" src="${URL.createObjectURL(f.file)}">`)); return; }
  if (!/\.pdf$/i.test(f.name) && f.file.type !== 'application/pdf') { el.append(h(`<span class="ext">${esc(f.name.split('.').pop().toUpperCase())}</span>`)); return; }
  try {
    const pdf = await pdfOf(f);
    el.append(await renderToWidth(pdf, 1, 150));
    if (meta) meta.textContent = `${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''} · ${fmtSize(f.size)}`;
  } catch (e) {
    el.append(h(`<span class="ext">${e.name === 'PasswordException' ? '🔒︎' : 'PDF'}</span>`));
  }
}

// Shared drag-to-reorder for a grid of cards backed by array `arr`.
function sortable(card, arr, idx, redraw) {
  card.draggable = true;
  card.ondragstart = (e) => { e.dataTransfer.setData('text/x-idx', String(idx)); card.classList.add('dragging'); };
  card.ondragend = () => card.classList.remove('dragging');
  card.ondragover = (e) => { if (e.dataTransfer.types.includes('text/x-idx')) e.preventDefault(); };
  card.ondrop = (e) => {
    const from = +e.dataTransfer.getData('text/x-idx');
    if (Number.isNaN(from) || from === idx) return;
    e.preventDefault(); e.stopPropagation();
    arr.splice(idx, 0, arr.splice(from, 1)[0]);
    redraw();
  };
}

function filesStage(stage) {
  const t = S.tool;
  const grid = h('<div class="files"></div>');
  S.files.forEach((f, idx) => {
    const c = h(`<div class="fcard"><div class="thumb"></div><div class="fname" title="${esc(f.name)}">${esc(f.name)}</div><div class="fmeta">${fmtSize(f.size)}</div><button class="x" title="Remove">×</button></div>`);
    thumbInto(c.querySelector('.thumb'), f, c.querySelector('.fmeta'));
    c.querySelector('.x').onclick = () => { S.files.splice(idx, 1); S.files.length ? workView() : pickView(); };
    if (t.rotateCards) {
      const rot = h('<button class="rot" title="Rotate this file">↻</button>');
      const turn = () => { const v = c.querySelector('.thumb canvas, .thumb img'); if (v) v.style.transform = `rotate(${f.rot || 0}deg)`; };
      rot.onclick = () => { f.rot = ((f.rot || 0) + 90) % 360; turn(); };
      c.append(rot);
      setTimeout(turn, 400); // after the thumbnail renders
    }
    if (t.multi) sortable(c, S.files, idx, workView);
    grid.append(c);
  });
  if (t.multi && S.files.length > 1) {
    const bar = h('<div class="sortbar"><button data-s="asc" title="Sort A to Z">A→Z</button><button data-s="desc" title="Sort Z to A">Z→A</button></div>');
    bar.onclick = (e) => {
      const dir = e.target.dataset.s;
      if (!dir) return;
      S.files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) * (dir === 'asc' ? 1 : -1));
      workView();
    };
    stage.append(bar);
  }
  stage.append(grid);
  if (t.multi && S.files.length < (t.maxFiles || 200)) stage.append(fileInput(t, 'addmore', '+<span>Add more files</span>'));
}

function pagesStage(stage) {
  const f = S.files[0];
  const grid = h('<div class="files pages"></div>');
  S.pages.forEach((p, idx) => {
    const c = h(`<div class="fcard pcard"><div class="thumb"></div><div class="fname">${p.blank ? 'Blank page' : `Page ${p.i + 1}`}</div>
      <div class="pbtns"><button data-a="rot" title="Rotate">↻</button><button data-a="blank" title="Add blank page after">＋</button><button data-a="del" title="Delete">×</button></div></div>`);
    const th = c.querySelector('.thumb');
    if (!p.blank) {
      const show = (cv) => { th.append(cv); cv.style.transform = `rotate(${p.rot}deg)`; };
      if (S.canvases.has(p.i)) show(S.canvases.get(p.i));
      else void (async () => {
        try { const cv = await renderToWidth(await pdfOf(f), p.i + 1, 130); S.canvases.set(p.i, cv); show(cv); } catch { /* thumbnail only */ }
      })();
    }
    c.querySelector('.pbtns').onclick = (e) => {
      const a = e.target.dataset.a;
      if (a === 'rot' && !p.blank) p.rot = (p.rot + 90) % 360;
      else if (a === 'blank') S.pages.splice(idx + 1, 0, { blank: true });
      else if (a === 'del') S.pages.splice(idx, 1);
      else return;
      workView();
    };
    sortable(c, S.pages, idx, workView);
    grid.append(c);
  });
  stage.append(grid);
}

// ---------- marks (edit / sign / redact / crop / forms) ----------

async function marksStage(stage) {
  const f = S.files[0];
  let pdf;
  try { pdf = await pdfOf(f); } catch (e) { stage.append(h(`<div class="notice">${esc(e.message)}</div>`)); return; }
  const width = Math.min(stage.clientWidth - 32, 820);
  for (let n = 1; n <= pdf.numPages; n++) {
    if (!stage.isConnected) return; // user navigated away mid-render
    const pg = h(`<div class="pg"><div class="ov"></div><span class="pgno">${n}</span></div>`);
    const key = `${n}@${width}`;
    const cv = S.canvases.get(key) || (await renderToWidth(pdf, n, width));
    S.canvases.set(key, cv);
    cv.style.width = `${width}px`;
    pg.prepend(cv);
    pg.dataset.page = n - 1;
    const vp1 = (await pdf.getPage(n)).getViewport({ scale: 1 });
    pg.dataset.scale = width / vp1.width;
    pg.dataset.viewh = vp1.height; // points, for sizing typed initials/name/date to the box
    drawOverlay(pg.querySelector('.ov'), n - 1);
    stage.append(pg);
  }
  drawMarks();
}

function drawOverlay(ov, page) {
  ov.onpointerdown = (e) => {
    if (e.target !== ov) return;
    const R = ov.getBoundingClientRect();
    const sx = (e.clientX - R.left) / R.width, sy = (e.clientY - R.top) / R.height;
    const ghost = h('<div class="mark ghost"></div>');
    ov.append(ghost);
    ov.setPointerCapture(e.pointerId);
    let box = { x: sx, y: sy, w: 0, h: 0 }, flip = { x: false, y: false };
    const path = [[sx, sy]]; // freehand drawing
    const trail = S.mode === 'draw' ? h('<svg class="trail" viewBox="0 0 1 1" preserveAspectRatio="none"><polyline vector-effect="non-scaling-stroke"/></svg>') : null;
    if (trail) ov.append(trail);
    ov.onpointermove = (ev) => {
      const ex = Math.min(1, Math.max(0, (ev.clientX - R.left) / R.width)), ey = Math.min(1, Math.max(0, (ev.clientY - R.top) / R.height));
      box = { x: Math.min(sx, ex), y: Math.min(sy, ey), w: Math.abs(ex - sx), h: Math.abs(ey - sy) };
      flip = { x: ex < sx, y: ey < sy };
      if (trail) { path.push([ex, ey]); trail.firstChild.setAttribute('points', path.map((p) => p.join(',')).join(' ')); }
      else Object.assign(ghost.style, pct(box));
    };
    ov.onpointerup = () => {
      ov.onpointermove = ov.onpointerup = null;
      ghost.remove();
      trail?.remove();
      if (S.mode === 'draw') {
        if (path.length < 2) return;
        const xs = path.map((p) => p[0]), ys = path.map((p) => p[1]);
        const b = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(0.002, Math.max(...xs) - Math.min(...xs)), h: Math.max(0.002, Math.max(...ys) - Math.min(...ys)) };
        // Points relative to the box, so moving and resizing the mark carries the drawing along.
        return addMark(page, { ...b, points: path.map(([x, y]) => [(x - b.x) / b.w, (y - b.y) / b.h]) });
      }
      if (S.mode === 'line') box = { ...box, flipX: flip.x, flipY: flip.y };
      if (box.w < 0.01 || box.h < 0.01) { // a click: drop a default-sized box
        const w = S.mode === 'field-check' ? 0.03 : 0.3, hh = S.mode === 'field-check' ? 0.022 : S.mode === 'image' ? 0.08 : 0.04;
        box = { x: Math.min(sx, 1 - w), y: Math.min(sy, 1 - hh), w, h: hh };
      }
      addMark(page, box);
    };
  };
}

const pct = (b) => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` });

function addMark(page, box) {
  const t = S.tool, o = S.opts, kind = S.mode;
  let m = { page, ...box, kind };
  if (kind === 'text') {
    if (!o.text?.trim()) return toast('Type the text in the panel first');
    m = { ...m, text: o.text, size: o.size, color: o.color };
  } else if (['rect', 'ellipse', 'line', 'draw'].includes(kind)) { m.color = o.color; m.stroke = +o.stroke || 2; if (kind === 'draw') m.kind = 'ink'; }
  else if (kind === 'initials' || kind === 'name' || kind === 'date') {
    const txt = kind === 'date' ? new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : o[kind];
    if (!txt?.trim()) return toast(`Type your ${kind} in the panel first`);
    m = { ...m, kind: 'text', text: txt, size: Math.max(8, Math.round(box.h * 0.6 * +document.querySelector(`.pg[data-page="${page}"]`)?.dataset.viewh || 14)), color: o.ink || '#1b2a6b' };
  } else if (kind === 'image') {
    const img = t.signature ? S.sig : o.image;
    if (!img) return toast(t.signature ? 'Draw or type your signature first' : 'Choose an image in the panel first');
    m.image = img;
  } else if (kind.startsWith('field')) m.text = `${kind === 'field-check' ? 'check' : 'text'}_${S.marks.length + S.fields.length + 1}`;
  if (t.single) S.marks = [m];
  else S.marks.push(m);
  drawMarks();
  renderSide();
}

const imgUrls = new WeakMap();
function drawMarks() {
  document.querySelectorAll('.pg').forEach((pg) => {
    const ov = pg.querySelector('.ov'), page = +pg.dataset.page, scale = +pg.dataset.scale;
    ov.querySelectorAll('.mark').forEach((el) => el.remove());
    S.marks.forEach((m, idx) => {
      if (m.page !== page) return;
      const el = h(`<div class="mark k-${m.kind}"><button class="x" title="Remove">×</button></div>`);
      Object.assign(el.style, pct(m));
      if (m.kind === 'text') { el.append(h(`<span>${esc(m.text)}</span>`)); el.style.color = m.color; el.style.fontSize = `${m.size * scale}px`; }
      if (m.kind === 'rect' || m.kind === 'ellipse') { el.style.borderColor = m.color; el.style.borderWidth = `${m.stroke || 2}px`; }
      if (m.kind === 'line' || m.kind === 'ink') {
        const pts = m.kind === 'line' ? [[m.flipX ? 1 : 0, m.flipY ? 1 : 0], [m.flipX ? 0 : 1, m.flipY ? 0 : 1]] : m.points;
        el.append(h(`<svg viewBox="0 0 1 1" preserveAspectRatio="none"><polyline points="${pts.map((p) => p.join(',')).join(' ')}" stroke="${esc(m.color)}" stroke-width="${m.stroke || 2}" vector-effect="non-scaling-stroke" fill="none"/></svg>`));
      }
      if (m.kind === 'image') {
        if (!imgUrls.has(m.image)) imgUrls.set(m.image, URL.createObjectURL(new Blob([m.image.bytes], { type: m.image.type })));
        el.append(h(`<img alt="" src="${imgUrls.get(m.image)}">`));
      }
      if (m.kind.startsWith('field')) el.append(h(`<span>${esc(m.text)}</span>`));
      el.querySelector('.x').onclick = () => { S.marks.splice(idx, 1); drawMarks(); renderSide(); };
      // Drag to move; drag the corner handle to resize.
      const handle = h('<span class="rs" title="Resize"></span>');
      el.append(handle);
      el.onpointerdown = (e) => {
        if (e.target.closest('.x')) return;
        e.stopPropagation();
        const R = ov.getBoundingClientRect(), start = { ...m }, sx = e.clientX, sy = e.clientY, resize = e.target === handle;
        el.setPointerCapture(e.pointerId);
        el.onpointermove = (ev) => {
          const dx = (ev.clientX - sx) / R.width, dy = (ev.clientY - sy) / R.height;
          if (resize) { m.w = Math.max(0.01, Math.min(1 - m.x, start.w + dx)); m.h = Math.max(0.005, Math.min(1 - m.y, start.h + dy)); }
          else { m.x = Math.min(1 - m.w, Math.max(0, start.x + dx)); m.y = Math.min(1 - m.h, Math.max(0, start.y + dy)); }
          Object.assign(el.style, pct(m));
        };
        el.onpointerup = () => { el.onpointermove = el.onpointerup = null; drawMarks(); };
      };
      ov.append(el);
    });
  });
}

// ---------- sidebar ----------

function renderSide() {
  const side = document.querySelector('.side');
  if (!side) return;
  const t = S.tool;
  side.replaceChildren(h(`<h2>${esc(t.name)}</h2>`));
  if (t.note) side.append(h(`<p class="note">${esc(t.note)}</p>`));
  if (t.modes?.length > 1) {
    const modes = h(`<div class="modes">${t.modes.map(([k, l]) => `<button data-m="${k}" class="${k === S.mode ? 'on' : ''}">${l}</button>`).join('')}</div>`);
    modes.onclick = (e) => { if (e.target.dataset.m) { S.mode = e.target.dataset.m; renderSide(); } };
    side.append(modes);
  }
  if (t.signature) side.append(signaturePad());
  if (t.urlInput) side.append(urlForm());
  for (const o of t.options || []) if (!o.show || o.show(S.opts, S.mode)) side.append(optionEl(o));
  if (t.fields) side.append(fieldsEl());
  if (t.view === 'marks') {
    const info = h(`<div class="marks-info"><span>${S.marks.length} item${S.marks.length === 1 ? '' : 's'} placed</span>${S.marks.length ? '<button class="link">Clear all</button>' : ''}</div>`);
    info.querySelector('button')?.addEventListener('click', () => { S.marks = []; drawMarks(); renderSide(); });
    side.append(info);
  }
  if (t.minFiles && S.files.length < t.minFiles) side.append(h(`<p class="note warn">Add at least ${t.minFiles} files.</p>`));
  side.append(h('<p class="err" hidden></p>'));
  const go = h(`<button class="go">${esc(t.btn)} <span>➜</span></button>`);
  go.disabled = S.files.length < (t.minFiles || 1);
  go.onclick = () => void runTool();
  side.append(go);
}

function optionEl(o) {
  const v = S.opts[o.key];
  const set = (val, redraw) => { S.opts[o.key] = val; if (redraw) renderSide(); };
  const wrap = h(`<label class="opt"><span>${esc(o.label)}</span></label>`);
  let input;
  if (o.type === 'select') {
    input = h(`<select>${o.choices.map(([k, l]) => `<option value="${esc(k)}" ${String(v) === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`);
    input.onchange = () => set(input.value, true);
  } else if (o.type === 'checkbox') {
    wrap.classList.add('check');
    input = h(`<input type="checkbox" ${v ? 'checked' : ''}>`);
    input.onchange = () => set(input.checked, true);
    wrap.prepend(input);
    return wrap;
  } else if (o.type === 'grid') {
    input = h(`<div class="posgrid ${o.choices.length === 6 ? 'six' : ''}">${o.choices.map(([k, l]) => `<button type="button" title="${l}" data-k="${k}" class="${k === v ? 'on' : ''}"></button>`).join('')}</div>`);
    input.onclick = (e) => { if (e.target.dataset.k) set(e.target.dataset.k, true); };
  } else if (o.type === 'textarea') {
    input = h(`<textarea rows="3">${esc(v)}</textarea>`);
    input.oninput = () => set(input.value);
  } else if (o.type === 'image') {
    input = h(`<input type="file" accept="image/*">`);
    input.onchange = async () => { if (input.files[0]) set(await normalizeImage(input.files[0]), true); };
    if (v) wrap.append(h(`<small>✓ image selected</small>`));
  } else {
    input = h(`<input type="${o.type}" value="${esc(v)}" ${o.min !== undefined ? `min="${o.min}"` : ''} ${o.max !== undefined ? `max="${o.max}"` : ''} placeholder="${esc(o.hint || '')}">`);
    input.oninput = () => set(input.value);
  }
  wrap.append(input);
  if (o.hint && o.type === 'text') wrap.append(h(`<small>${esc(o.hint)}</small>`));
  return wrap;
}

function fieldsEl() {
  const box = h(`<div class="fields"><h4>Form fields (${S.fields.length})</h4></div>`);
  if (!S.fields.length) box.append(h('<p class="note">This PDF has no fillable fields yet. Drag on the page to add some.</p>'));
  for (const f of S.fields) {
    const label = h(`<label class="opt"><span>${esc(f.name)}</span></label>`);
    let input;
    if (f.type === 'CheckBox') { input = h(`<input type="checkbox" ${S.values[f.name] ? 'checked' : ''}>`); input.onchange = () => (S.values[f.name] = input.checked); label.classList.add('check'); label.prepend(input); box.append(label); continue; }
    if (f.options) { input = h(`<select><option value=""></option>${f.options.map((x) => `<option ${x === S.values[f.name] ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`); input.onchange = () => (S.values[f.name] = input.value); }
    else { input = h(`<input type="text" value="${esc(S.values[f.name])}">`); input.oninput = () => (S.values[f.name] = input.value); }
    if (!['TextField', 'Dropdown', 'OptionList', 'RadioGroup'].includes(f.type)) input.disabled = true; // signatures/buttons
    label.append(input);
    box.append(label);
  }
  return box;
}

function signaturePad() {
  const box = h(`<div class="sig"><span>Your signature</span><canvas width="560" height="200"></canvas>
    <input type="text" placeholder="…or type your name"><div class="sigbtns"><button class="link" data-c>Clear</button>
    <input type="color" value="#1b2a6b" title="Ink color"></div></div>`);
  const cv = box.querySelector('canvas'), ctx = cv.getContext('2d');
  const [typed, color] = box.querySelectorAll('input');
  const save = async () => { S.sig = { bytes: await canvasBytes(cv, 'image/png'), type: 'image/png' }; };
  if (S.sigCanvas) ctx.drawImage(S.sigCanvas, 0, 0);
  const keep = () => { S.sigCanvas = document.createElement('canvas'); S.sigCanvas.width = cv.width; S.sigCanvas.height = cv.height; S.sigCanvas.getContext('2d').drawImage(cv, 0, 0); void save(); };
  cv.onpointerdown = (e) => {
    const R = cv.getBoundingClientRect(), k = cv.width / R.width;
    ctx.strokeStyle = color.value; ctx.lineWidth = 4; ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo((e.clientX - R.left) * k, (e.clientY - R.top) * k);
    cv.setPointerCapture(e.pointerId);
    cv.onpointermove = (ev) => { ctx.lineTo((ev.clientX - R.left) * k, (ev.clientY - R.top) * k); ctx.stroke(); };
    cv.onpointerup = () => { cv.onpointermove = cv.onpointerup = null; keep(); };
  };
  typed.oninput = () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = color.value; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'italic 84px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive';
    ctx.fillText(typed.value, cv.width / 2, cv.height / 2, cv.width - 20);
    keep();
  };
  box.querySelector('[data-c]').onclick = () => { ctx.clearRect(0, 0, cv.width, cv.height); typed.value = ''; S.sig = null; S.sigCanvas = null; };
  return box;
}

// ---------- run + results ----------

function busy(msg) {
  let el = document.querySelector('.busy');
  if (!msg) return el?.remove();
  if (!el) document.body.append((el = h('<div class="busy"><div class="spin"></div><p></p></div>')));
  el.querySelector('p').textContent = msg;
}

async function runTool() {
  const t = S.tool;
  busy(`${t.btn.replace(/ PDF$/, '')}…`);
  try {
    const res = await t.run({ files: S.files, opts: S.opts, marks: S.marks, pages: S.pages, values: S.values, progress: busy });
    busy(null);
    doneView(res);
  } catch (e) {
    console.error(e);
    busy(null);
    const err = document.querySelector('.side .err');
    if (err) { err.hidden = false; err.textContent = e.message || String(e); }
  }
}

async function download(files, zipName) {
  let blob, name;
  if (files.length === 1) { blob = new Blob([files[0].bytes], { type: files[0].type }); name = files[0].name; }
  else {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const seen = new Map();
    for (const f of files) { const n = seen.get(f.name) || 0; seen.set(f.name, n + 1); zip.file(n ? f.name.replace(/(\.[^.]+)$/, `_${n}$1`) : f.name, f.bytes); }
    blob = await zip.generateAsync({ type: 'blob' });
    name = zipName;
  }
  const a = h(`<a download="${esc(name)}" href="${URL.createObjectURL(blob)}"></a>`);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

function doneView(res) {
  const t = S.tool;
  const files = Array.isArray(res) ? res : res.files || [];
  const main = h(`<main class="done"><h1>${esc(t.done)}</h1><div class="dlrow"><button class="back" title="Back">←</button></div></main>`);
  main.querySelector('.back').onclick = workView;
  if (files.length) {
    const label = files.length > 1 ? 'Download files (ZIP)' : `Download ${files[0].name.split('.').pop().toUpperCase()}`;
    const btn = h(`<button class="bigbtn">⬇ ${label}</button>`);
    btn.onclick = () => void download(files, `pdfturtle_${t.id}.zip`);
    main.querySelector('.dlrow').append(btn);
    const saved = files.filter((f) => f.saved);
    if (saved.length) {
      const [a, b] = saved.reduce(([x, y], f) => [x + f.saved[0], y + f.saved[1]], [0, 0]);
      main.append(h(`<p class="lead">${b < a ? `Your files are now <b>${Math.round((1 - b / a) * 100)}% smaller</b>: ${fmtSize(a)} → ${fmtSize(b)}` : 'These files were already well optimized; nothing smaller was possible.'}</p>`));
    }
  }
  if (res.view === 'text') main.append(h(`<div class="textout">${esc(res.text).replace(/\n/g, '<br>')}</div>`));
  if (res.view === 'diff') main.append(diffEl(res));
  if (res.view === 'visual') main.append(visualDiffEl(res));
  const single = files.length === 1 && files[0].type === 'application/pdf' ? files[0] : null;
  if (single) {
    const next = TOOLS.filter((x) => x.id !== t.id && !x.unavailable && !x.variant && x.accept?.includes('pdf'));
    const grid = h(`<section class="continue"><h2>Continue to…</h2><div class="chips">${next.map((x) => `<a href="/${x.id}"><span class="mini" style="--c:${color(x)}">${x.glyph}</span>${esc(x.name)}</a>`).join('')}</div></section>`);
    grid.onclick = (e) => { if (e.target.closest('a')) carry = new File([single.bytes], single.name, { type: 'application/pdf' }); };
    main.append(grid);
  }
  frame(main);
}

function visualDiffEl({ pages, names }) {
  const el = h(`<div class="vdiff"><p class="lead">${pages.filter((p) => p.changed > 0).length} of ${pages.length} page(s) changed · <span class="swatch del"></span> only in ${esc(names[0])} · <span class="swatch add"></span> only in ${esc(names[1])}</p></div>`);
  for (const p of pages) {
    el.append(h(`<div class="vrow"><h4>Page ${p.n}</h4><div class="vcols">
      <figure>${p.a ? `<img alt="" src="${p.a}">` : '<div class="nopage">No page</div>'}<figcaption>${esc(names[0])}</figcaption></figure>
      <figure><img alt="" src="${p.diff}"><figcaption>Overlay</figcaption></figure>
      <figure>${p.b ? `<img alt="" src="${p.b}">` : '<div class="nopage">No page</div>'}<figcaption>${esc(names[1])}</figcaption></figure></div></div>`));
  }
  return el;
}

function diffEl({ diff, names }) {
  const add = diff.filter((d) => d.t === 'add').length, del = diff.filter((d) => d.t === 'del').length;
  const el = h(`<div class="diff"><p class="lead">${del} line(s) removed · ${add} line(s) added</p>
    <div class="diffcols"><h4>${esc(names[0])}</h4><h4>${esc(names[1])}</h4></div><div class="diffbody"></div></div>`);
  const body = el.querySelector('.diffbody');
  body.innerHTML = diff.map((d) => `<div class="row ${d.t}"><div>${esc(d.a ?? '')}</div><div>${esc(d.b ?? '')}</div></div>`).join('');
  return el;
}

function toast(msg) {
  const el = h(`<div class="toast">${esc(msg)}</div>`);
  document.body.append(el);
  setTimeout(() => el.remove(), 4000);
}

// ---------- routing + global drop ----------

// Title, description, canonical and robots for the current path (the server writes the same on first load).
function setHead(path) {
  const m = metaFor(path) || metaFor('/');
  document.title = m.title;
  const tag = (sel, make) => document.head.querySelector(sel) || document.head.appendChild(make());
  tag('meta[name=description]', () => Object.assign(document.createElement('meta'), { name: 'description' })).content = m.description;
  tag('meta[name=robots]', () => Object.assign(document.createElement('meta'), { name: 'robots' })).content = m.index ? 'index,follow' : 'noindex';
  tag('link[rel=canonical]', () => Object.assign(document.createElement('link'), { rel: 'canonical' })).href = location.origin + m.path;
}

function route() {
  // Old #/tool links (bookmarks, shared links) move to the real path.
  if (location.hash.startsWith('#/')) history.replaceState(null, '', location.hash.slice(1) || '/');
  const id = decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g, '');
  busy(null);
  setHead(location.pathname);
  const wfMatch = id.match(/^workflow\/(\d+)$/);
  const wf = wfMatch && loadWorkflows()[+wfMatch[1]];
  const t = wf ? {
    id: 'workflow', name: wf.name, desc: `Runs ${wf.steps.length} step${wf.steps.length > 1 ? 's' : ''} in order on your PDFs.`, accept: '.pdf,application/pdf',
    multi: true, btn: 'Run workflow', done: 'Workflow complete!', run: (ctx) => runWorkflow(wf, ctx.files, ctx.progress),
  } : byId(id);
  if (id === 'workflows') workflowsView(frame);
  else if (id === 'login' || id === 'signup') authView(frame, id);
  else if (id.startsWith('page/') && pageView(frame, id.slice(5))) { window.scrollTo(0, 0); return; }
  else if (t) toolPage(t);
  else home();
  if (wf) document.title = `${wf.name} · PDFturtle`;
  window.scrollTo(0, 0);
}

document.addEventListener('dragover', (e) => {
  if (S && !S.tool.unavailable && e.dataTransfer?.types.includes('Files')) { e.preventDefault(); document.body.classList.add('dropping'); }
});
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
document.addEventListener('drop', (e) => {
  document.body.classList.remove('dropping');
  if (!S || S.tool.unavailable || !e.dataTransfer?.files.length) return;
  e.preventDefault();
  void addFiles([...e.dataTransfer.files]);
});

// In-app links: plain left clicks on same-site paths route without a page load.
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href^="/"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute('download')) return;
  e.preventDefault();
  if (a.getAttribute('href') !== location.pathname) go(a.getAttribute('href'));
  else route();
});
window.addEventListener('popstate', route);
route();
setTimeout(() => void engine(), 1500); // warm the PDF engines once the page is up
