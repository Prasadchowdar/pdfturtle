// Accounts in the browser: header buttons, log in / sign up pages, and syncing saved workflows.
// Everything still works without an account (or without the server); accounts add workflow sync.
import { loadWorkflows, saveWorkflows, onWorkflowsChange } from './workflows.js';
import { go } from './seo.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

let current; // undefined = not checked yet, null = signed out
const listeners = [];
export const onUserChange = (fn) => listeners.push(fn);

async function call(path, method = 'GET', body) {
  let res;
  try {
    res = await fetch(`/api/${path}`, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error('Accounts need the PDFturtle server, which is not reachable right now.'); }
  let data = {};
  try { data = await res.json(); } catch { /* empty or non-JSON */ }
  if (!res.ok) throw new Error(data.error || (res.status === 404 || res.status >= 500 ? 'Accounts need the PDFturtle server, which is not reachable right now.' : `Request failed (${res.status})`));
  return data;
}

function setUser(user) {
  current = user;
  listeners.forEach((fn) => fn(user));
}

export async function me() {
  if (current !== undefined) return current;
  try { setUser((await call('auth/me')).user ?? null); } catch { setUser(null); }
  if (current) await syncWorkflows();
  return current;
}

// Merge server and local workflows (same name + steps counts as one), then store both sides.
async function syncWorkflows() {
  try {
    const remote = (await call('user/workflows')).workflows ?? [];
    const local = loadWorkflows();
    const key = (w) => JSON.stringify([w.name, w.steps]);
    const merged = [...remote, ...local.filter((w) => !remote.some((r) => key(r) === key(w)))];
    saveWorkflows(merged, { silent: true });
    if (merged.length !== remote.length) await call('user/workflows', 'PUT', { workflows: merged });
  } catch (e) { console.warn('Workflow sync failed:', e.message); }
}
onWorkflowsChange(async (list) => {
  if (!current) return;
  try { await call('user/workflows', 'PUT', { workflows: list }); } catch (e) { console.warn('Workflow sync failed:', e.message); }
});

export function accountHeader() {
  const box = h('<div class="acct"></div>');
  const draw = (user) => {
    box.replaceChildren(user
      ? h(`<div class="menu acct-menu"><button class="acct-name" title="${esc(user.email)}"><span class="avatar">${esc(user.name.slice(0, 1).toUpperCase())}</span>${esc(user.name)} ▾</button>
          <div class="drop"><div><span class="dh">${esc(user.email)}</span><a href="/workflows">My workflows</a><a href="#" data-logout>Log out</a></div></div></div>`)
      : h('<div class="acct-btns"><a class="acct-login" href="/login">Log in</a><a class="acct-signup" href="/signup">Sign up</a></div>'));
    box.querySelector('[data-logout]')?.addEventListener('click', (e) => { e.preventDefault(); void logout(); });
  };
  draw(current ?? null);
  onUserChange(draw);
  void me();
  return box;
}

async function logout() {
  try { await call('auth/logout', 'POST', {}); } catch { /* signed out locally anyway */ }
  setUser(null);
  go('/');
}

export function authView(frame, mode) {
  const signup = mode === 'signup';
  const main = h(`<main class="pick auth"><h1>${signup ? 'Create new account' : 'Login to your account'}</h1>
    <form class="auth-form" novalidate>
      ${signup ? '<label class="opt"><span>Name</span><input name="name" autocomplete="name" required></label>' : ''}
      <label class="opt"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="opt"><span>Password</span><input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="8" required></label>
      <p class="err" hidden></p>
      <button class="bigbtn" type="submit">${signup ? 'Sign up' : 'Log in'}</button>
      <p class="muted">${signup ? 'Already a member? <a href="/login">Log in</a>' : 'Don\'t have an account? <a href="/signup">Create an account</a>'}</p>
    </form></main>`);
  const form = main.querySelector('form'), err = main.querySelector('.err');
  form.onsubmit = async (e) => {
    e.preventDefault();
    err.hidden = true;
    const data = Object.fromEntries(new FormData(form));
    form.querySelector('button').disabled = true;
    try {
      const { user } = await call(signup ? 'auth/signup' : 'auth/login', 'POST', data);
      setUser(user);
      await syncWorkflows();
      go('/');
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      form.querySelector('button').disabled = false;
    }
  };
  frame(main);
}
