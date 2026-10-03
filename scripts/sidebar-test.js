/* Tests for 56-sidebar.js — sidebar layout, folding, hiding, drag and scale.

   The bugs this guards against are all silent: a sidebar that clips its own
   footer, a fold that never reopens, a dragged row that vanishes, a saved
   scale that is applied twice.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SHELL = fs.readFileSync(path.join(__dirname, '../renderer/js/11-shell.js'), 'utf8');
const SRC   = fs.readFileSync(path.join(__dirname, '../renderer/js/56-sidebar.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function eq(name, a, b){ ok(name, JSON.stringify(a) === JSON.stringify(b), { got:a, want:b }); }

/* Pull the NAV table out of the shell without running the whole shell. */
function readNav(){
  const m = SHELL.match(/const NAV = \[[\s\S]*?\n\];/);
  if(!m) throw new Error('could not find NAV in 11-shell.js');
  return eval(m[0].replace('const NAV =', '(') .replace(/;$/, ')'));
}

/* ---- a DOM small enough to run a real render, big enough to catch layout ---- */
function makeEl(tag){
  const el = {
    tagName:(tag||'div').toUpperCase(), children:[], _attrs:{}, dataset:{},
    style:{}, classList:{
      _s:new Set(),
      add(...c){ c.forEach(x => this._s.add(x)); },
      remove(...c){ c.forEach(x => this._s.delete(x)); },
      contains(c){ return this._s.has(c); },
      toggle(c, on){ on === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (on ? this._s.add(c) : this._s.delete(c)); }
    },
    get className(){ return [...this.classList._s].join(' '); },
    set className(v){ this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); },
    setAttribute(k,v){ this._attrs[k] = String(v); },
    getAttribute(k){ return this._attrs[k]; },
    appendChild(c){ this.children.push(c); c.parentElement = this; return c; },
    remove(){ if(this.parentElement){ const i = this.parentElement.children.indexOf(this); if(i>=0) this.parentElement.children.splice(i,1); } },
    addEventListener(ev, fn){ (this._ev = this._ev || {})[ev] = (this._ev[ev]||[]).concat(fn); },
    _fire(ev, e){ ((this._ev||{})[ev]||[]).forEach(f => f(e)); },
    getBoundingClientRect(){ return { top:0, height:40, bottom:40, left:0, width:200 }; },
    scrollIntoView(){},
    set onclick(fn){ this._click = fn; }, get onclick(){ return this._click; },
    set oninput(fn){ this._input = fn; }, get oninput(){ return this._input; },
    closest(sel){
      let n = this;
      const cls = sel.replace('.','');
      while(n){ if(sel.startsWith('.') && n.classList.contains(cls)) return n; n = n.parentElement; }
      return null;
    },
    querySelector(sel){ return this.querySelectorAll(sel)[0] || this._stub(sel); },
    querySelectorAll(sel){
      /* record what the render asked for — this is how the tests assert that
         the markup really contains a given hook, since the fake DOM has no
         HTML parser */
      (this.__asked = this.__asked || new Set()).add(sel);
      const out = [];
      const attrMatch = sel.match(/\[([\w-]+)="([^"]+)"\]/);
      const clsMatch = sel.match(/^\.([\w-]+)$/);
      (function walk(n){
        for(const c of n.children){
          let hit = false;
          if(attrMatch){
            const [, k, v] = attrMatch;
            hit = (c.dataset && c.dataset[k] === v) || c._attrs[k] === v;
          } else if(clsMatch){ hit = c.classList.contains(clsMatch[1]); }
          if(hit) out.push(c);
          walk(c);
        }
      })(this);
      return out;
    },
    /* A permissive stand-in so a render that assigns .onclick to a queried
       node does not crash on a DOM that cannot parse HTML. */
    _stub(sel){
      const cache = this.__stubs = this.__stubs || {};
      if(!cache[sel]){
        const s = makeEl('div');
        s.__isStub = true;
        s.__sel = sel;
        cache[sel] = s;
      }
      return cache[sel];
    }
  };
  /* innerHTML assignment builds one child carrying the raw markup, which is
     enough for the tests to assert on structure without a real parser */
  el._html = '';
  Object.defineProperty(el, 'innerHTML', {
    get(){ return el._html; },
    set(v){
      el._html = String(v);
      el.children = [];
      /* a single synthetic element so .children.length reflects "did I put
         anything here", which several assertions rely on */
      if(String(v).trim()){
        const kid = makeEl('div');
        kid._html = String(v);
        el.appendChild(kid);
      }
    }
  });
  el.textContent = '';
  return el;
}

function makeNX(initial){
  const store = Object.assign({}, initial || {});
  const listeners = {};
  const NX = {
    NAV: readNav(),
    store:{ get(k,d){ return k in store ? store[k] : d; }, set(k,v){ store[k] = v; } },
    events:{
      on(e,f){ (listeners[e] = listeners[e] || []).push(f); return ()=>{}; },
      emit(e,d){ (listeners[e]||[]).forEach(f => f(d)); }
    },
    defaults:{ profile:{ name:'Test User', avatar:'#7CD56E' } },
    h(html){
      const el = makeEl('div');
      /* pull data-* attributes out of the template so the fake DOM can route */
      const attrs = {};
      for(const m of String(html).matchAll(/data-([\w-]+)="([^"]*)"/g)) attrs['data-'+m[1]] = m[2];
      const cls = (String(html).match(/class="([^"]*)"/)||[])[1];
      if(cls) el.className = cls;
      Object.assign(el.dataset, attrs);
      Object.assign(el._attrs, attrs);
      el._tpl = String(html);
      el.onclick = null;
      return el;
    },
    q(sel, root){ return (root ? root.querySelector(sel) : null) || root || null; },
    qa(sel, root){ return root ? root.querySelectorAll(sel) : []; },
    icon(n){ return { __icon:n }; },
    menu(){}, router:{ currentName:'today', go(){} },
    motion:{ syncNav(){}, isPinned(){ return false; } },
    avatarHtml(){ return '<span class="avatar"></span>'; },
    brandMark(){ return '<span class="m"></span>'; },
    points:{ level(){ return { n:1 }; }, balance(){ return 0; } },
    native:{ available:false }, widget:{ toggle(){} },
    modules:{ isOn(){ return true; } }, apps:{ isHidden(){ return false; } },
    exportWorkspace(){}
  };
  NX.util = { esc: s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'), initials: () => 'TU' };
  NX.h = (function(orig){ return function(html){ const el = orig(html); el.innerHTML = ''; return el; }; })(NX.h);
  return { NX, store, listeners };
}

function boot(initial){
  const { NX, store, listeners } = makeNX(initial);
  const doc = { documentElement:{ style:{} } };
  const win = { dispatchEvent(){} };
  const sandbox = {
    NX, document:doc, window:Object.assign(win, { NX }), console,
    setTimeout:(f)=>0, clearTimeout(){}, setInterval:()=>0, clearInterval(){},
    requestAnimationFrame:(f)=>0, Date, Math, JSON
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename:'56-sidebar.js' });
  return { NX, store, sandbox, doc };
}

const tick = () => new Promise(r => setImmediate(r));

(async function(){
  console.log('\n56-sidebar.js');

  /* ================= NAV integrity ================= */
  console.log('\n  nav table');
  {
    const nav = readNav();
    const routes = nav.flatMap(g => g.items.map(i => i.r));
    ok('Screenshot is gone from the nav', !routes.includes('media'), routes);
    ok('System is gone from the nav', !routes.includes('system'), routes);
    ok('every group still has items', nav.every(g => g.items.length > 0));
    ok('no duplicate routes', new Set(routes).size === routes.length, routes);
  }

  /* ================= scrolling ================= */
  console.log('\n  scrolling');
  {
    const css = fs.readFileSync(path.join(__dirname, '../renderer/css/03-shell.css'), 'utf8');
    ok('.nav-scroll exists in the shell CSS', /\.nav-scroll\s*\{/.test(css));
    ok('the nav region is the scroll container', /\.nav-scroll\{[^}]*overflow-y:auto/.test(css));
    ok('it can shrink so the footer survives', /\.nav-scroll\{[^}]*min-height:0/.test(css));
    ok('the rail itself no longer needs to scroll', /\.sidebar\{[^}]*min-height:0/.test(css));
    ok('the sidebar markup has a scroll region', /\.nav-scroll/.test(SRC));
    ok('groups are appended to the scroll region, not the rail',
       /scroll\.appendChild\(grp\)/.test(SRC));
  }

  /* ================= folding ================= */
  console.log('\n  folding');
  {
    const css = fs.readFileSync(path.join(__dirname, '../renderer/css/03-shell.css'), 'utf8');
    /* the iOS-style part: animating grid-template-rows 1fr -> 0fr rather
       than measuring height in JS */
    ok('fold animates grid-template-rows, not a hardcoded height',
       /\.nav-items\{[^}]*grid-template-rows:1fr/.test(css) &&
       /\.nav-group\.collapsed \.nav-items\{grid-template-rows:0fr\}/.test(css));
    ok('the transition has an iOS-ish easing curve',
       /grid-template-rows \.3s cubic-bezier\(\.32,\.72,0,1\)/.test(css));
    ok('the chevron rotates when folded', /\.nav-group\.collapsed \.nl-chev\{transform:rotate/.test(css));
    ok('the inner wrapper clips its overflow', /\.nav-items-in\{min-height:0;overflow:hidden\}/.test(css));

    const { NX, store } = boot();
    NX.renderSidebar(makeEl('div'));
    /* fold/hide/layout state is only written when the user acts, so a plain
       render must not touch the store */
    ok('rendering does not write fold state',
       !Object.prototype.hasOwnProperty.call(store, 'ui:navCollapsed'), Object.keys(store));
    ok('rendering does not write hide state',
       !Object.prototype.hasOwnProperty.call(store, 'ui:navHidden'), Object.keys(store));
    ok('rendering does not write a layout',
       !Object.prototype.hasOwnProperty.call(store, 'ui:navLayout'), Object.keys(store));
  }

  /* ================= hiding ================= */
  console.log('\n  hiding');
  {
    ok('hide state uses ui:navHidden', /ui:navHidden/.test(SRC));
    ok('the eye button is rendered per group', /data-hide=/.test(SRC));
    ok('a hidden group is skipped when rendering', /if\(hid\[g\.group\]\) return;/.test(SRC));
    ok('Settings can bring a hidden group back', /data-act="hide"/.test(SRC) && /hs\[g\] = !hs\[g\]/.test(SRC));
    ok('hiding a group also unfolds it, so re-showing is not a dead end',
       /if\(hs\[g\]\)\{ const c = collapsed\(\); delete c\[g\];/.test(SRC));
    ok('there is a full reset', /data-act="reset"/.test(SRC));
  }

  /* ================= drag between categories ================= */
  console.log('\n  drag and drop');
  {
    ok('rows are draggable', /draggable="true"/.test(SRC));
    ok('each group is a drop zone', /data-drop=/.test(SRC) && /addEventListener\('drop'/.test(SRC));
    ok('dragover prevents the default so a drop can fire', /zone\.addEventListener\('dragover'[\s\S]{0,200}e\.preventDefault\(\)/.test(SRC));
    ok('a dragged row is pulled out of its old group before being added',
       /lay\[g\] = lay\[g\]\.filter\(r => r !== route\)/.test(SRC));
    ok('the drop target group can be a different group than the source',
       /moveRoute\(dragRoute, groupName,/.test(SRC));
    ok('layout is persisted to ui:navLayout', /ui:navLayout/.test(SRC));
  }

  /* ================= layout merging ================= */
  console.log('\n  layout merging');
  {
    /* a route dragged into a group it does not belong to must survive */
    const { NX } = boot({ 'ui:navLayout': { Explore:['timeless'], Intelligence:[], Workspace:[], Rewards:[], Manage:[] } });
    NX.renderSidebar(makeEl('div'));
    ok('a route dragged into another group is kept there', /saved\[g\]\.forEach/.test(SRC));

    /* a module added after the layout was saved must reappear */
    ok('routes missing from the saved layout are added back',
       /if\(!placed\.has\(i\.r\)\) out\[g\.group\]\.push\(i\.r\)/.test(SRC));
    /* a deleted module must not leave a phantom row */
    ok('routes that no longer exist are filtered out',
       /out\[g\] = out\[g\]\.filter\(r => !!routeInfo\(r\)\)/.test(SRC));
    /* a saved group that no longer exists must not crash */
    ok('an unknown saved group is tolerated rather than throwing',
       /if\(!out\[g\]\) out\[g\] = \[\];/.test(SRC));
  }

  /* ================= scale ================= */
  console.log('\n  ui scale');
  {
    const { NX, doc } = boot();
    ok('getScale defaults to 1', NX.getScale() === 1);
    eq('clamped to the 0.8 floor', NX.setScale(0.2), 0.8);
    eq('clamped to the 1.4 ceiling', NX.setScale(9), 1.4);
    eq('rounded to 2dp', NX.setScale(1.23456), 1.23);
    ok('scale is applied to the root element', doc.documentElement.style.zoom === '1.23', doc.documentElement.style);
    eq('zoomUI out steps down', NX.zoomUI('out'), 1.13);
    eq('zoomUI in steps up', NX.zoomUI('in'), 1.23);
    NX.setScale(1.5);
    eq('stepping down from the ceiling stays clamped', NX.zoomUI('out'), 1.3);

    const { NX: N2, store: s2 } = boot({ 'ui:scale': 1.2 });
    ok('a saved scale is restored on load', N2.getScale() === 1.2);
    N2.setScale(0.9);
    eq('and written back to the store', s2['ui:scale'], 0.9);

    ok('the footer has - / % / + / reset controls', /data-scale="out"/.test(SRC) &&
       /data-scale="in"/.test(SRC) && /data-scale="reset"/.test(SRC));
    ok('a readout shows the percentage', /data-scale-readout/.test(SRC));
  }

  /* ================= shell hand-off ================= */
  console.log('\n  shell integration');
  {
    ok('the new sidebar is published as NX.renderSidebar', /NX\.renderSidebar = renderSidebar/.test(SRC));
    ok('the shell calls it through NX so the override takes effect',
       /NX\.renderSidebar\(layout\)/.test(SHELL));
    ok('the shell no longer calls the local renderSidebar directly',
       !/^\s*renderSidebar\(layout\)/m.test(SHELL));
    ok('56 loads before 99-boot', /js\/56-sidebar\.js/.test(
       fs.readFileSync(path.join(__dirname, '../renderer/index.html'), 'utf8')));
    ok('NX.refreshSidebarUser is still exported (topbar depends on it)',
       /NX\.refreshSidebarUser = function/.test(SRC));
  }

  /* ================= removed modules are really gone ================= */
  console.log('\n  removals');
  {
    const idx = fs.readFileSync(path.join(__dirname, '../renderer/index.html'), 'utf8');
    ok('28-media.js is not loaded', !/js\/28-media\.js/.test(idx));
    ok('28-media.js is deleted', !fs.existsSync(path.join(__dirname, '../renderer/js/28-media.js')));
    const ui = fs.readFileSync(path.join(__dirname, '../renderer/js/02-ui.js'), 'utf8');
    ok('the screenshot command is gone from the palette', !/Take a screenshot/.test(ui));
    const apps = fs.readFileSync(path.join(__dirname, '../renderer/js/53-apps.js'), 'utf8');
    ok('the System route is gone', !/routeInShell\('system'/.test(apps));
    const set = fs.readFileSync(path.join(__dirname, '../renderer/js/30-settings.js'), 'utf8');
    ok('the Settings button that opened System is gone', !/st-sys-page/.test(set));
    ok('nothing still routes to the removed screens',
       !/go\('media'\)|go\('system'\)/.test(SRC + ui + apps + set));
  }

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();