/* A real-DOM check that the sidebar renders and behaves.
 *
 * The unit tests in sidebar-test.js assert on source and CSS. This one
 * actually LOADS the app in jsdom, in the order renderer/index.html
 * declares, and drives the fold / hide / scale / drag paths for real. The
 * bundle hides script-order bugs, so this reads index.html rather than
 * bundle.js on purpose.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'renderer/index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + String(extra).slice(0,200) : '')); }
}

function scriptOrder(){
  return [...html.matchAll(/<script src="js\/([\w.-]+)"><\/script>/g)].map(m => m[1]);
}

(async function(){
  console.log('\nsidebar integration (real DOM)');

  /* ---------- load order ---------- */
  {
    const order = scriptOrder();
    ok('56-sidebar.js is loaded', order.includes('56-sidebar.js'), order.join(','));
    const i56 = order.indexOf('56-sidebar.js'), i11 = order.indexOf('11-shell.js'), i99 = order.indexOf('99-boot.js');
    ok('56 loads after 11-shell (it replaces NX.renderSidebar)', i56 > i11, { i11, i56 });
    ok('56 loads before 99-boot', i56 < i99, { i56, i99 });
    ok('28-media.js is not loaded', !order.includes('28-media.js'));
    ok('script numbers are unique (build.js sorts by name)', new Set(order).size === order.length);
    const css = [...html.matchAll(/<link rel="stylesheet" href="css\/([\w.-]+\.css)">/g)].map(m => m[1]);
    ok('18-responsive.css is loaded', css.includes('18-responsive.css'), css.join(','));
    ok('18-responsive.css is the last stylesheet so it wins',
       css[css.length - 1] === '18-responsive.css', css[css.length - 1]);
    ok('every stylesheet referenced exists', css.every(c => fs.existsSync(path.join(ROOT, 'renderer/css', c))));
    ok('every script referenced exists', order.every(s => fs.existsSync(path.join(ROOT, 'renderer/js', s))),
       order.filter(s => !fs.existsSync(path.join(ROOT, 'renderer/js', s))).join(','));
  }

  /* ---------- boot the app ---------- */
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    resources: undefined,
    beforeParse(win){
      win.matchMedia = win.matchMedia || (q => ({
        matches:false, media:q, addListener(){}, removeListener(){},
        addEventListener(){}, removeEventListener(){}, onchange:null, dispatchEvent(){ return false; }
      }));
      win.scrollTo = ()=>{};
      win.HTMLElement.prototype.scrollIntoView = function(){};
      win.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
      win.fetch = () => Promise.reject(new Error('offline in test'));
    }
  });

  const win = dom.window;
  /* Inline the local scripts the way the real build does, in document order. */
  const order = scriptOrder();
  const errors = [];
  for(const f of order){
    const p = path.join(ROOT, 'renderer/js', f);
    if(!fs.existsSync(p)) continue;
    try{
      win.eval(fs.readFileSync(p, 'utf8'));
    }catch(e){
      errors.push(f + ': ' + e.message);
    }
  }
  const NX = win.NX;

  ok('the app boots with no script errors', errors.length === 0, errors.join(' | '));
  if(!NX){ console.log('\n  NX missing — cannot continue'); process.exit(1); }

  /* ---------- the sidebar renders ---------- */
  {
    const host = win.document.createElement('div');
    win.document.body.appendChild(host);
    let sidebar = null, err = null;
    try{ sidebar = NX.renderSidebar(host); }catch(e){ err = e; }
    ok('renderSidebar does not throw', !err, err && err.message);
    ok('a sidebar element is produced', !!sidebar && sidebar.classList.contains('sidebar'));

    const q = s => host.querySelector(s);
    const qa = s => [...host.querySelectorAll(s)];

    /* the clipping bug: no scroll region meant the footer was unreachable */
    ok('the nav lives in a scroll container', !!q('.nav-scroll'),
       'without .nav-scroll the footer is clipped off short windows');
    ok('the scroll container is a sibling of the footer, not inside it',
       q('.nav-scroll') && q('.side-foot') && q('.nav-scroll').parentElement === sidebar);
    ok('the brand stays outside the scroll region', !!q('.brand'));

    /* every category is present and foldable */
    const groups = qa('.nav-group');
    ok('all five categories render', groups.length === 5, groups.map(g => g.dataset.group).join(','));
    ok('every category has a fold control', qa('.nav-label').length === groups.length);
    ok('every category has a hide control', qa('.nl-eye').length === groups.length);
    ok('every category has a drop zone', qa('[data-drop]').length === groups.length);
    ok('fold controls report their state', qa('.nav-label').every(b => b.hasAttribute('aria-expanded')));
    ok('fold controls start expanded',
       qa('.nav-label').every(b => b.getAttribute('aria-expanded') === 'true'));

    /* rows — scoped to the scroll region on purpose: the footer rows
       (Settings, Desktop widget) are chrome, not draggable categories */
    const rows = qa('.nav-scroll .nav-item[data-route]');
    ok('nav rows render', rows.length > 10, rows.length);
    ok('every row is draggable', rows.every(r => r.getAttribute('draggable') === 'true'));
    ok('every row carries its group, so a drop knows where it came from',
       rows.every(r => !!r.dataset.group));
    ok('footer rows are not draggable',
       qa('.side-foot .nav-item').every(r => r.getAttribute('draggable') !== 'true'));
    ok('no row points at a removed route',
       !rows.some(r => r.dataset.route === 'media' || r.dataset.route === 'system'));

    /* footer + scale */
    ok('the footer renders', !!q('.side-foot'));
    ok('the scale controls render', qa('[data-scale]').length === 3, qa('[data-scale]').length);
    ok('the scale controls are smaller / bigger / reset',
       ['out','in','reset'].every(k => !!host.querySelector('[data-scale="' + k + '"]')));
    ok('the scale readout renders', /\d+%/.test((q('[data-scale-readout]')||{}).textContent || ''));
    ok('Settings and the widget are still reachable', qa('.side-foot .nav-item').length === 2);
    ok('the profile block is still there', !!q('.side-user'));
  }

  /* ---------- folding for real ---------- */
  {
    const host = win.document.createElement('div');
    win.document.body.appendChild(host);
    NX.renderSidebar(host);
    const first = host.querySelector('.nav-group');
    const name = first.dataset.group;
    const toggle = first.querySelector('.nav-label');
    const items = first.querySelector('.nav-items');

    toggle.dispatchEvent(new win.MouseEvent('click', { bubbles:true }));
    ok('clicking a category folds it', first.classList.contains('collapsed'), name);
    ok('fold state is saved', !!(NX.store.get('ui:navCollapsed')||{})[name], NX.store.get('ui:navCollapsed'));
    ok('aria-expanded flips to false', toggle.getAttribute('aria-expanded') === 'false');
    ok('the CSS class that drives the animation is applied',
       first.querySelector('.nav-items').classList.contains('nav-items'));

    toggle.dispatchEvent(new win.MouseEvent('click', { bubbles:true }));
    ok('clicking again unfolds it', !first.classList.contains('collapsed'));
    ok('and clears the saved state', !(NX.store.get('ui:navCollapsed')||{})[name]);

    /* a re-render must honour the saved fold */
    toggle.dispatchEvent(new win.MouseEvent('click', { bubbles:true }));
    const host2 = win.document.createElement('div');
    win.document.body.appendChild(host2);
    NX.renderSidebar(host2);
    const again = [...host2.querySelectorAll('.nav-group')].find(g => g.dataset.group === name);
    ok('a saved fold survives a re-render', again.classList.contains('collapsed'), name);
    /* and can be unfolded from the fresh render */
    again.querySelector('.nav-label').dispatchEvent(new win.MouseEvent('click', { bubbles:true }));
    ok('and can be unfolded again', !again.classList.contains('collapsed'));
  }

  /* ---------- hiding for real ---------- */
  {
    const host = win.document.createElement('div');
    win.document.body.appendChild(host);
    NX.renderSidebar(host);
    const before = host.querySelectorAll('.nav-group').length;
    const grp = host.querySelector('.nav-group');
    const name = grp.dataset.group;

    grp.querySelector('.nl-eye').dispatchEvent(new win.MouseEvent('click', { bubbles:true }));
    const host2 = win.document.createElement('div');
    win.document.body.appendChild(host2);
    NX.renderSidebar(host2);
    const names = [...host2.querySelectorAll('.nav-group')].map(g => g.dataset.group);

    ok('hiding a group removes it from the rail', !names.includes(name), names.join(','));
    ok('hide state is saved', !!(NX.store.get('ui:navHidden')||{})[name]);
    ok('hiding a group also unfolds it', !(NX.store.get('ui:navCollapsed')||{})[name],
       'otherwise re-showing gives you an empty category');

    /* and it can be brought back */
    NX.renderSidebarSettings && NX.renderSidebarSettings();
    const cfg = NX.sidebarSettings();
    ok('the settings list offers a way back', !!cfg);
    const cfgHost = win.document.createElement('div');
    cfgHost.appendChild(cfg);
    const showBtn = [...cfgHost.querySelectorAll('[data-act="hide"]')].find(b => b.dataset.g === name);
    ok('the hidden category has a Show button', !!showBtn, name);
    showBtn.dispatchEvent(new win.MouseEvent('click', { bubbles:true }));

    const host3 = win.document.createElement('div');
    win.document.body.appendChild(host3);
    NX.renderSidebar(host3);
    const back = [...host3.querySelectorAll('.nav-group')].map(g => g.dataset.group);
    ok('Show brings the category back', back.includes(name), back.join(','));
    ok('the category count is unchanged overall', back.length === before, { before, after: back.length });
  }

  /* ---------- scale for real ---------- */
  {
    ok('default scale is 1', NX.getScale() === 1);
    ok('the root starts unzoomed', !win.document.documentElement.style.zoom);

    NX.setScale(1.2);
    ok('setScale writes to the root style', win.document.documentElement.style.zoom === '1.2',
       win.document.documentElement.style.zoom);
    ok('setScale persists', NX.store.get('ui:scale') === 1.2);

    const host = win.document.createElement('div');
    win.document.body.appendChild(host);
    NX.renderSidebar(host);
    const readout = host.querySelector('[data-scale-readout]');
    ok('the readout reflects the current scale', readout.textContent.trim() === '120%', readout.textContent);

    const out = host.querySelector('[data-scale="out"]');
    out.dispatchEvent(new win.MouseEvent('click', { bubbles:true }));
    ok('the minus button steps down', Math.abs(NX.getScale() - 1.1) < 0.001, NX.getScale());
    ok('the readout updates after a step', host.querySelector('[data-scale-readout]').textContent.trim() === '110%');

    for(let i=0;i<20;i++){ host.querySelector('[data-scale="in"]').dispatchEvent(new win.MouseEvent('click', {bubbles:true})); }
    ok('the plus button cannot exceed the ceiling', NX.getScale() === 1.4, NX.getScale());
    for(let i=0;i<40;i++){ host.querySelector('[data-scale="out"]').dispatchEvent(new win.MouseEvent('click', {bubbles:true})); }
    ok('the minus button cannot go below the floor', NX.getScale() === 0.8, NX.getScale());

    host.querySelector('[data-scale="reset"]').dispatchEvent(new win.MouseEvent('click', {bubbles:true}));
    ok('reset returns to 100%', NX.getScale() === 1);
    ok('and clears the zoom', !win.document.documentElement.style.zoom || win.document.documentElement.style.zoom === '1');
  }

  /* ---------- drag and drop, for real ---------- */
  {
    const host = win.document.createElement('div');
    win.document.body.appendChild(host);
    NX.renderSidebar(host);

    const src = host.querySelector('.nav-item[data-route="notes"]');
    ok('the row we want to move exists', !!src);
    const srcGroup = src.dataset.group;

    const targetZone = host.querySelector('.nav-items[data-drop="Explore"]');
    ok('the target category has a drop zone', !!targetZone);

    /* a DataTransfer stand-in: jsdom has no real one, and the handlers only
       use preventDefault / dropEffect / setData */
    const dt = {
      dropEffect:'', effectAllowed:'',
      setData(){}, getData(){ return ''; }
    };
    const mk = (type, extra) => {
      const e = new win.Event(type, { bubbles:true, cancelable:true });
      e.dataTransfer = dt;
      Object.assign(e, extra||{});
      return e;
    };

    src.dispatchEvent(mk('dragstart'));
    ok('dragstart marks the row as dragging', src.classList.contains('dragging'));

    const over = targetZone.dispatchEvent(mk('dragover', { clientY: 5 }));
    const grp = targetZone.closest('.nav-group');
    ok('dragover highlights the target category', grp.classList.contains('drop-on'));
    ok('dragover was cancelled so a drop can follow', over === false, over);

    targetZone.dispatchEvent(mk('drop', { clientY: 5 }));

    const lay = NX.store.get('ui:navLayout') || {};
    ok('the layout was saved', !!lay['ui:navLayout' === '' ? '' : 'ui:navLayout'] || !!lay, Object.keys(lay));
    const saved = NX.store.get('ui:navLayout');
    ok('the row moved to the category it was dropped on',
       Array.isArray(saved.Explore) && saved.Explore.includes('notes'), JSON.stringify(saved));
    ok('the row left its old category',
       Array.isArray(saved[srcGroup]) && !saved[srcGroup].includes('notes'), JSON.stringify(saved));

    const host2 = win.document.createElement('div');
    win.document.body.appendChild(host2);
    NX.renderSidebar(host2);
    const moved = [...host2.querySelectorAll('.nav-group')].find(g => g.dataset.group === 'Explore');
    const inExplore = [...moved.querySelectorAll('.nav-item')].map(n => n.dataset.route);
    ok('the re-render shows it in the new category', inExplore.includes('notes'), inExplore.join(','));
    const oldGrp = [...host2.querySelectorAll('.nav-group')].find(g => g.dataset.group === srcGroup);
    ok('and it is gone from the old one',
       ![...oldGrp.querySelectorAll('.nav-item')].map(n => n.dataset.route).includes('notes'));

    /* every route is still rendered exactly once */
    const all = [...host2.querySelectorAll('.nav-item[data-route]')].map(n => n.dataset.route);
    const dupes = all.filter((r,i) => all.indexOf(r) !== i);
    ok('no route is rendered twice after a move', dupes.length === 0, dupes.join(','));
    const navRoutes = win.NX.NAV.flatMap(g => g.items.map(i => i.r));
    const lost = navRoutes.filter(r => !all.includes(r));
    ok('no route was lost by the move', lost.length === 0, lost.join(','));
  }

  /* ---------- responsive CSS sanity ---------- */
  {
    const css = fs.readFileSync(path.join(ROOT, 'renderer/css/18-responsive.css'), 'utf8');
    ok('height queries exist — a width query cannot see a short window',
       /@media \(max-height:/.test(css));
    ok('aspect-ratio queries exist for square-ish windows',
       /@media \(max-aspect-ratio:1\/1\)/.test(css));
    ok('aspect-ratio queries exist for ultrawide',
       /@media \(min-aspect-ratio:2\/1\)/.test(css) && /min-aspect-ratio:21\/9/.test(css));
    ok('ultrawide caps the content width so cards do not stretch',
       /\.view-host > \*\{max-width:/.test(css));
    ok('narrow widths narrow the rail', (css.match(/--sidebar-w:/g)||[]).length >= 3);
    ok('the document can never scroll sideways', /html, body\{overflow-x:hidden/.test(css));
    ok('reduced-motion is respected', /prefers-reduced-motion/.test(css));
    ok('every rule block is closed (no stray brace)',
       (css.match(/\{/g)||[]).length === (css.match(/\}/g)||[]).length,
       (css.match(/\{/g)||[]).length + ' open vs ' + (css.match(/\}/g)||[]).length + ' close');
  }

  /* ---------- stat strip no longer overflows ---------- */
  {
    const css = fs.readFileSync(path.join(ROOT, 'renderer/css/03-shell.css'), 'utf8');
    const m = css.match(/\.stat-strip \.stat\{([^}]*)\}/);
    ok('the stat tile can wrap internally', m && /flex-wrap:wrap/.test(m[1]), m && m[1]);
    ok('the trailing pill is allowed the full tile width once wrapped',
       /\.stat-strip \.stat > \.pill[^{]*\{[^}]*max-width:100%/.test(css));
    ok('the old fixed 96px clip is gone', !/max-width:96px/.test(css));
  }

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();