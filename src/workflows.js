// Workflows: save a chain of PDF-in/PDF-out tools with their settings, then run it on any file.
// Saved in this browser (and synced to the account when signed in; see account.js).
import { TOOLS, CATS, color } from './tools.js';
import { go } from './seo.js';

const KEY = 'pdfturtle.workflows';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

// Tools that take one PDF and give back one PDF can be chained. Merge may only start a workflow.
const CHAINABLE = ['merge-pdf', 'compress-pdf', 'repair-pdf', 'ocr-pdf', 'rotate-pdf', 'add-page-numbers', 'add-watermark',
  'pdf-to-pdfa', 'protect-pdf', 'unlock-pdf', 'remove-pages', 'extract-pages'];
export const chainable = () => CHAINABLE.map((id) => TOOLS.find((t) => t.id === id)).filter(Boolean);

let listeners = [];
export const onWorkflowsChange = (fn) => listeners.push(fn);
export function loadWorkflows() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
export function saveWorkflows(list, { silent = false } = {}) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode: keep in memory only */ }
  if (!silent) listeners.forEach((fn) => fn(list));
}

const defaults = (t) => Object.fromEntries((t.options || []).filter((o) => 'def' in o && o.type !== 'image').map((o) => [o.key, o.def]));

// Plain form fields for one step's options (image options are not storable, so they're left out).
function stepOptions(tool, values, onChange) {
  const box = h('<div class="wf-opts"></div>');
  const draw = () => {
    box.replaceChildren();
    for (const o of tool.options || []) {
      if (o.type === 'image' || (o.show && !o.show(values))) continue;
      const v = values[o.key];
      const row = h(`<label class="opt ${o.type === 'checkbox' ? 'check' : ''}"><span>${esc(o.label)}</span></label>`);
      let input;
      if (o.type === 'select' || o.type === 'grid') input = h(`<select>${o.choices.map(([k, l]) => `<option value="${esc(k)}" ${String(v) === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`);
      else if (o.type === 'checkbox') input = h(`<input type="checkbox" ${v ? 'checked' : ''}>`);
      else if (o.type === 'textarea') input = h(`<textarea rows="2">${esc(v)}</textarea>`);
      else input = h(`<input type="${o.type === 'password' ? 'password' : o.type === 'number' ? 'number' : o.type === 'color' ? 'color' : 'text'}" value="${esc(v)}">`);
      input.onchange = () => { values[o.key] = o.type === 'checkbox' ? input.checked : input.value; onChange(); draw(); };
      if (o.type === 'checkbox') row.prepend(input); else row.append(input);
      box.append(row);
    }
  };
  draw();
  return box;
}

// List + editor page (/workflows).
export function workflowsView(frame) {
  const list = loadWorkflows();
  const main = h(`<main class="pick wf"><h1>Workflows</h1><p class="lead">Chain your favourite tools, save the chain, and run it on any PDF in one go.</p>
    <div class="wf-list"></div><button class="bigbtn wf-new">+ Create workflow</button></main>`);
  const listEl = main.querySelector('.wf-list');
  if (!list.length) listEl.append(h('<p class="muted">No workflows yet.</p>'));
  list.forEach((wf, i) => {
    const row = h(`<div class="wf-item"><div><b>${esc(wf.name)}</b><div class="wf-steps">${wf.steps.map((s) => {
      const t = TOOLS.find((x) => x.id === s.tool);
      return t ? `<span class="mini" style="--c:${color(t)}">${t.glyph}</span>${esc(t.name)}` : '';
    }).join(' → ')}</div></div><div class="wf-actions"><a class="wf-run" href="/workflow/${i}">Run</a><button data-edit>Edit</button><button data-del>Delete</button></div></div>`);
    row.querySelector('[data-edit]').onclick = () => editor(frame, i);
    row.querySelector('[data-del]').onclick = () => { if (confirm(`Delete "${wf.name}"?`)) { list.splice(i, 1); saveWorkflows(list); workflowsView(frame); } };
    listEl.append(row);
  });
  main.querySelector('.wf-new').onclick = () => editor(frame, -1);
  frame(main);
}

function editor(frame, index) {
  const list = loadWorkflows();
  const wf = index >= 0 ? structuredClone(list[index]) : { name: 'My workflow', steps: [] };
  const main = h(`<main class="pick wf"><h1>${index >= 0 ? 'Edit' : 'Create'} workflow</h1>
    <label class="opt wf-name"><span>Name</span><input type="text" value="${esc(wf.name)}"></label>
    <div class="wf-chain"></div>
    <div class="wf-add"><select><option value="">+ Add a tool…</option>${chainable().map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>
    <div class="dlrow"><a class="back" href="/workflows" title="Back">←</a><button class="bigbtn wf-save">Save workflow</button></div></main>`);
  main.querySelector('.wf-name input').oninput = (e) => { wf.name = e.target.value; };
  const chain = main.querySelector('.wf-chain');
  const draw = () => {
    chain.replaceChildren();
    wf.steps.forEach((s, i) => {
      const t = TOOLS.find((x) => x.id === s.tool);
      const card = h(`<div class="wf-step"><div class="wf-step-head"><span class="ico" style="--c:${color(t)}">${t.glyph}</span><b>${i + 1}. ${esc(t.name)}</b>
        <span class="wf-move"><button data-up title="Move up">↑</button><button data-down title="Move down">↓</button><button data-x title="Remove">×</button></span></div></div>`);
      card.append(stepOptions(t, s.opts, () => {}));
      card.querySelector('[data-up]').onclick = () => { if (i) { [wf.steps[i - 1], wf.steps[i]] = [wf.steps[i], wf.steps[i - 1]]; draw(); } };
      card.querySelector('[data-down]').onclick = () => { if (i < wf.steps.length - 1) { [wf.steps[i + 1], wf.steps[i]] = [wf.steps[i], wf.steps[i + 1]]; draw(); } };
      card.querySelector('[data-x]').onclick = () => { wf.steps.splice(i, 1); draw(); };
      chain.append(card);
      if (i < wf.steps.length - 1) chain.append(h('<div class="wf-arrow">↓</div>'));
    });
    if (!wf.steps.length) chain.append(h('<p class="muted">Add the first tool below.</p>'));
  };
  main.querySelector('.wf-add select').onchange = (e) => {
    const t = TOOLS.find((x) => x.id === e.target.value);
    e.target.value = '';
    if (!t) return;
    if (t.id === 'merge-pdf' && wf.steps.length) return alert('Merge PDF can only be the first step.');
    wf.steps.push({ tool: t.id, opts: defaults(t) });
    draw();
  };
  main.querySelector('.wf-save').onclick = () => {
    if (!wf.steps.length) return alert('Add at least one tool.');
    wf.name = wf.name.trim() || 'My workflow';
    if (index >= 0) list[index] = wf; else list.push(wf);
    saveWorkflows(list);
    go('/workflows');
  };
  draw();
  frame(main);
}

// Runs a workflow over the picked files: merge (if first) combines them, every later step gets the one PDF
// the previous step produced. `ctxFiles` are { name, bytes, file } like the tool pages use.
export async function runWorkflow(wf, ctxFiles, progress) {
  let files = ctxFiles;
  for (const [i, step] of wf.steps.entries()) {
    const t = TOOLS.find((x) => x.id === step.tool);
    progress(`Step ${i + 1} of ${wf.steps.length}: ${t.name}…`);
    const out = [];
    for (const f of t.id === 'merge-pdf' ? [files] : files.map((x) => [x])) {
      const res = await t.run({ files: f, opts: { ...step.opts }, marks: [], pages: [], values: {}, progress });
      const pdfs = (Array.isArray(res) ? res : res.files || []).filter((r) => r.type === 'application/pdf');
      if (!pdfs.length) throw new Error(`${t.name} produced no PDF`);
      out.push(...pdfs.map((r) => ({ name: r.name, bytes: r.bytes, size: r.bytes.length, file: new File([r.bytes], r.name, { type: 'application/pdf' }) })));
    }
    files = out;
  }
  return files.map((f) => ({ name: f.name, bytes: f.bytes, type: 'application/pdf' }));
}

export const workflowCard = () => `<a class="card wf-card" href="/workflows" data-cat="workflows">
  <span class="ico" style="--c:#33333b">⛓</span><h2>Create a workflow</h2><p>Create custom workflows with your favorite tools, automate tasks, and reuse them anytime.</p></a>`;
export { CATS };
