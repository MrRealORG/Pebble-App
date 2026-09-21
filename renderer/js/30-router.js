/* ============================================================
   Pebble — router.js : module registry + hash routing
   ============================================================ */
(function (NX) {
  'use strict';

  const modules = [];
  const byId = new Map();
  let current = null;
  let currentParams = {};
  let currentPath = '';
  const history = [];
  let cleanupFn = null;
  let renderToken = 0;

  /**
   * register({
   *   id, name, icon, emoji, color, group, groupOrder, order,
   *   badge: () => n, sidebar: (ctx) => Node|Node[], render(params, ctx) -> Node,
   *   onLeave(), crumb: (params) => [{label, hash}], commands: [{id,label,hint,run}],
   *   hidden: bool (not shown in rail/sidebar), wide: bool
   * })
   */
  function register(mod) {
    if (byId.has(mod.id)) { Object.assign(byId.get(mod.id), mod); return byId.get(mod.id); }
    modules.push(mod); byId.set(mod.id, mod);
    modules.sort((a, b) => (a.order || 0) - (b.order || 0));
    return mod;
  }
  function get(id) { return byId.get(id) || null; }
  function all() { return modules; }
  function visible() { return modules.filter(m => !m.hidden); }

  const GROUPS = [
    { id: 'capture',  name: 'Capture',  order: 1 },
    { id: 'plan',     name: 'Plan',     order: 2 },
    { id: 'track',    name: 'Track',    order: 3 },
    { id: 'knowledge',name: 'Knowledge',order: 4 },
    { id: 'connect',  name: 'Connect',  order: 5 },
    { id: 'life',     name: 'Life',     order: 6 },
    { id: 'system',   name: 'System',   order: 9 }
  ];

  function grouped() {
    const map = new Map(GROUPS.map(g => [g.id, []]));
    NX.router.visible().forEach(m => {
      const g = m.group || 'system';
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(m);
    });
    return GROUPS.map(g => ({ group: g, modules: map.get(g.id) || [] })).filter(x => x.modules.length);
  }

  /* ------------------------------ routing ------------------------------ */
  function parseHash() {
    let h = (location.hash || '#/dashboard').replace(/^#\/?/, '');
    if (!h) h = 'dashboard';
    const [pathPart, queryPart] = h.split('?');
    const segs = pathPart.split('/').filter(Boolean);
    const params = {};
    if (queryPart) new URLSearchParams(queryPart).forEach((v, k) => params[k] = v);
    segs.slice(1).forEach((s, i) => { if (!params['p' + i]) params['p' + i] = s; });
    return { id: segs[0] || 'dashboard', path: '/' + segs.join('/'), segments: segs, params, raw: h };
  }

  function navigate(hash, opts) {
    if (typeof hash !== 'string') return;
    if (!hash.startsWith('#')) hash = '#/' + hash.replace(/^\//, '');
    if (location.hash === hash && !(opts && opts.force)) { render(); return; }
    if (opts && opts.replace) location.replace(hash);
    else location.hash = hash;
  }
  function go(id, params) {
    let h = '#/' + id;
    const qs = [];
    if (params) for (const k in params) {
      if (k === 'id') h += '/' + encodeURIComponent(params[k]);
      else if (params[k] !== undefined && params[k] !== null && params[k] !== '') qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`);
    }
    if (qs.length) h += '?' + qs.join('&');
    navigate(h);
  }
  function back() {
    if (history.length > 1) { history.pop(); navigate(history[history.length - 1], { force: true }); }
    else navigate('#/dashboard');
  }

  /* ------------------------------ render ------------------------------ */
  function render() {
    const route = parseHash();
    const token = ++renderToken;
    const mod = get(route.id) || get('dashboard');
    const view = document.getElementById('view');
    if (!view) return;

    if (current && cleanupFn) { try { cleanupFn(); } catch (e) { console.error(e); } cleanupFn = null; }
    if (current && current !== route.id) {
      const prev = get(current);
      if (prev && prev.onLeave) { try { prev.onLeave(); } catch (e) { console.error(e); } }
    }
    if (history[history.length - 1] !== route.raw) history.push(route.raw);
    if (history.length > 60) history.shift();

    current = route.id;
    currentParams = route.params;
    currentPath = route.path;

    NX.clear(view);
    view.scrollTop = 0;
    view.className = 'view' + (mod && mod.wide ? '' : '');

    let node;
    try {
      node = mod.render(route.params, route);
    } catch (e) {
      console.error('render error in module ' + route.id, e);
      node = NX.h('div.page', [
        NX.h('h2', { style: { color: 'var(--acc-red)' } }, 'Something went wrong'),
        NX.h('p.muted', String(e && e.message || e)),
        NX.h('pre', { style: { fontSize: '11px', overflow: 'auto', background: 'var(--bg-code)', padding: '12px', borderRadius: '8px', border: '1px solid var(--bd)' } }, String(e && e.stack || '')),
        NX.h('button.btn.primary', { style: { marginTop: '12px' }, onclick: () => NX.router.navigate('#/dashboard') }, 'Back to dashboard')
      ]);
    }
    if (token !== renderToken) return;   // a newer render started
    if (node) view.appendChild(node);
    if (mod && mod.onMount) { try { cleanupFn = mod.onMount(route.params, route) || null; } catch (e) { console.error(e); } }

    document.dispatchEvent(new CustomEvent('nx:route', { detail: route }));
    if (NX.shell) NX.shell.update(route, mod);
  }

  function currentModule() { return get(current); }
  function currentId() { return current; }
  function params() { return currentParams; }

  function start() {
    window.addEventListener('hashchange', () => render());
    if (!location.hash) location.hash = NX.store.getSetting('startPage', '#/dashboard') || '#/dashboard';
    render();
  }

  NX.router = {
    register, get, all, visible, grouped, GROUPS,
    navigate, go, back, render, start, parseHash,
    currentModule, currentId, params,
    get history() { return history; }
  };
})(window.NX);
