// Title, description, indexability and structured data per path. Shared by the browser router and the
// server, which writes them (and a prerendered page body, see shell.js) into index.html for crawlers.
import { TOOLS } from './tools.js';
import { PAGE_TITLES } from './pages.js';
import { TOOL_CONTENT, PAGE_META } from './content.js';

const HOME = {
  title: 'PDFturtle: free online PDF tools in your browser',
  description: 'Merge, split, compress, convert, edit, sign and protect PDFs for free. 34 tools that run in your browser, so your files stay on your device. No sign-up.',
};

// Client-side navigation to a path (pushState + let the router run).
export function go(path) {
  history.pushState(null, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
}

// null = unknown path (served as 404).
export function metaFor(pathname) {
  let id;
  try { id = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, ''); } catch { return null; } // malformed %-escape
  if (!id) return { ...HOME, path: '/', index: true, kind: 'home' };
  const t = TOOLS.find((x) => x.id === id);
  if (t) return { title: `${t.name} online, free · PDFturtle`, description: TOOL_CONTENT[t.id]?.meta || t.desc, path: `/${id}`, index: !t.unavailable, kind: 'tool', tool: t };
  const slug = id.startsWith('page/') ? id.slice(5) : id;
  if ((id.startsWith('page/') && PAGE_TITLES[slug]) || id === 'workflows') {
    const [title, description] = PAGE_META[slug] || [`${PAGE_TITLES[slug]} · PDFturtle`, HOME.description];
    return { title, description, path: `/${id}`, index: true, kind: 'page', name: PAGE_TITLES[slug] || 'Workflows' };
  }
  if (id === 'login' || id === 'signup') return { title: `${id === 'login' ? 'Log in' : 'Sign up'} · PDFturtle`, description: HOME.description, path: `/${id}`, index: false, kind: 'auth' };
  if (/^workflow\/\d+$/.test(id)) return { title: 'Workflow · PDFturtle', description: HOME.description, path: `/${id}`, index: false, kind: 'auth' };
  return null;
}

// schema.org JSON-LD for a page (needs the absolute site address). Only facts the site can stand behind:
// no ratings, no reviews.
export function jsonLd(m, base) {
  if (!m || !m.index) return null;
  const site = { '@type': 'WebSite', '@id': `${base}/#website`, name: 'PDFturtle', url: `${base}/` };
  const crumbs = (name) => ({ '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/` },
    { '@type': 'ListItem', position: 2, name, item: base + m.path },
  ] });
  const graph = [site];
  if (m.kind === 'home') graph.push({ '@type': 'Organization', '@id': `${base}/#org`, name: 'PDFturtle', url: `${base}/` });
  if (m.kind === 'tool') {
    graph.push({
      '@type': 'WebApplication', name: m.tool.name, url: base + m.path, description: m.description,
      applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (web browser)', browserRequirements: 'Requires JavaScript',
      isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' }, isPartOf: { '@id': `${base}/#website` },
    }, crumbs(m.tool.name));
  }
  if (m.kind === 'page') graph.push(crumbs(m.name));
  return { '@context': 'https://schema.org', '@graph': graph };
}

// Every indexable path, for sitemap.xml.
export const indexablePaths = () => ['/', ...TOOLS.filter((t) => !t.unavailable).map((t) => `/${t.id}`), '/workflows', ...Object.keys(PAGE_TITLES).map((s) => `/page/${s}`)];
