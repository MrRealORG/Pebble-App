/* ============================================================
   PebbleX — 53-apps.js
   The Apps surface: every module as a card, long-press to act on it
   (like an iOS home screen), plus the System panel for real
   brightness / volume / battery.

   "DELETE" IS A MISNOMER AND THE UI SAYS SO
   Nothing here deletes user data. Long-pressing an app offers
   Disable / Hide / Reset. The only genuinely destructive option lives
   behind an explicit confirm and names exactly what it erases.
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

const HIDE_KEY = 'apps:hidden';

/* ============================================================
   HIDDEN APPS
   ============================================================ */
function hidden(){
  const raw = NX.store.get(HIDE_KEY, []);
  return Array.isArray(raw) ? raw : [];
}
function setHidden(list){
  NX.store.set(HIDE_KEY, list);
  NX.events.emit('modules:refresh-nav');
}
NX.apps = {
  hidden,
  isHidden(id){ return hidden().indexOf(id) !== -1; },
  hide(id){
    const l = hidden();
    if(l.indexOf(id) === -1){ l.push(id); setHidden(l); }
  },
  show(id){
    setHidden(hidden().filter(x => x !== id));
  },
  toggle(id){
    if(this.isHidden(id)) this.show(id); else this.hide(id);
  }
};

/* ============================================================
   APPS ROUTE
   ============================================================ */
NX.routeInShell('apps', 'Apps & features', 'sliders', function(view){
  view.innerHTML = `<div class="page apps-page">
    <div class="row gap-8">
      <span class="pill green">${icon('grid')} Every app, switchable</span>
      <span class="faint small">Long-press an app to hide or disable it</span>
      <span style="flex:1"></span>
      <button class="btn btn-soft btn-sm" id="ap-reset">${icon('undo')} Reset all</button>
    </div>
    <div class="offline-bar" id="ap-offline"></div>
    <div id="ap-groups"></div>
  </div>`;

  /* ---- offline switch ---- */
  function renderOffline(){
    const on = NX.offline.on();
    q('#ap-offline', view).innerHTML = `
      <div class="ob-row">
        <span class="tile sm" style="background:var(--${on?'yellow':'green'}-soft);color:var(--${on?'yellow':'green'})">${icon('cloud',15)}</span>
        <div style="flex:1;min-width:0">
          <b style="font-size:13px">Offline mode</b>
          <div class="faint tiny">${on
            ? 'Nothing is sent or fetched. AI, weather and cloud sync are paused.'
            : 'Pebble can use the internet for AI, weather and cloud sync.'}</div>
        </div>
        <label class="switch"><input type="checkbox" id="ap-off" ${on?'checked':''}><span class="track"></span></label>
      </div>`;
    const t = q('#ap-off', view);
    if(t) t.onchange = ()=>{ NX.offline.set(t.checked); renderOffline(); };
  }

  /* ---- app cards ---- */
  function renderGroups(){
    const groups = NX.modules.grouped();
    q('#ap-groups', view).innerHTML = groups.map(g=>`
      <div class="card" style="margin-bottom:16px">
        <div class="card-h">
          <div class="tile sm">${icon(g.id === 'Background' ? 'layers' : g.id === 'Rewards' ? 'star' : 'grid', 15)}</div>
          <div><div class="c-title">${U.esc(g.n)}</div>
          <div class="c-sub">${g.items.filter(i=>i.on).length} of ${g.items.length} on</div></div>
        </div>
        <div class="card-b">
          <div class="apps-grid">
            ${g.items.map(({m,on})=>{
              const hid = NX.apps.isHidden(m.id);
              return `<div class="app-tile ${on?'':'off'} ${m.core?'core':''} ${hid?'hid':''}" data-app="${m.id}">
                <span class="app-ic" style="background:${on?'var(--green-soft)':'var(--surface-3)'}">${icon(m.ic,20)}</span>
                <span class="app-name ellipsis">${U.esc(m.n)}</span>
                <span class="app-state">${m.core ? 'Core' : (on ? 'On' : 'Off')}</span>
                ${m.net ? `<span class="app-net" data-tip="Needs the internet">${icon('cloud',10)}</span>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>`).join('');

    qa('[data-app]', view).forEach(el=>{
      const id = el.dataset.app;
      el.onclick = ()=>{ if(!el._longPressed) NX.launchApp(id); };
      /* iOS-style long press */
      attachLongPress(el, ()=>{ el._longPressed = true; setTimeout(()=>{ el._longPressed = false; }, 700); appSheet(id); });
    });
  }

  function appSheet(id){
    const m = NX.modules.byId(id);
    if(!m) return;
    const on = NX.modules.isOn(id);
    const hid = NX.apps.isHidden(id);
    NX.modal({
      title: m.n,
      icon: m.ic,
      body: `<p style="font-size:13.5px;color:var(--ink-2);line-height:1.6;margin-bottom:12px">${U.esc(m.d)}</p>
        ${m.net?`<div class="gate-row"><span class="faint small">Needs internet</span><b>Yes</b></div>`:''}
        <div class="gate-row"><span class="faint small">Status</span><b>${m.core?'Always on':(on?'On':'Off')}</b></div>
        <div class="gate-row"><span class="faint small">Hidden from sidebar</span><b>${hid?'Yes':'No'}</b></div>`,
      footer:[
        { label:'Close', cls:'btn-soft' }
      ].concat(m.core ? [] : [
        { label: on ? 'Disable' : 'Enable', cls:'btn-soft',
          onClick(){
            NX.modules.toggle(id);
            NX.closeAllModals();
            renderGroups(); renderOffline();
            NX.toastOk(on ? m.n + ' disabled' : m.n + ' enabled',
              on ? 'Its background work has stopped.' : 'Welcome back.');
          } }
      ]).concat([
        { label: hid ? 'Show in sidebar' : 'Hide from sidebar', cls:'btn-soft',
          onClick(){
            NX.apps.toggle(id);
            NX.closeAllModals();
            renderGroups();
          } }
      ])
    });
  }

  renderOffline();
  renderGroups();

  q('#ap-reset', view).onclick = ()=>{
    NX.confirm('Reset every app?', 'All apps go back to their default state and hidden apps come back. Your notes, tasks and points are untouched.', ()=>{
      NX.modules.resetAll();
      NX.store.del(HIDE_KEY);
      renderGroups();
      NX.toastOk('Apps reset', 'Everything is back to default.');
    }, { icon:'undo', yes:'Reset apps' });
  };

  const off = NX.events.on('modules:changed', ()=>{ renderGroups(); renderOffline(); });
  view._appsOff = off;
});

/* ============================================================
   OPEN AN APP
   ============================================================ */
NX.launchApp = function(id){
  if(!NX.modules.isOn(id)){
    /* send them somewhere useful rather than a dead end */
    const m = NX.modules.byId(id);
    NX.confirm(m ? m.n + ' is switched off' : 'That app is off',
      m ? m.d : 'This feature is disabled in Settings.', ()=>{
        NX.modules.set(id, true);
        NX.router.go(id);
      }, { icon:'check', yes:'Turn it on' });
    return;
  }
  NX.router.go(id);
};

/* ============================================================
   LONG PRESS
   ============================================================ */
function attachLongPress(el, fn){
  let timer = null, sx = 0, sy = 0, fired = false;

  function start(e){
    const t = (e.touches && e.touches[0]) || e;
    sx = t.clientX; sy = t.clientY;
    fired = false;
    timer = setTimeout(()=>{
      fired = true;
      /* visual press-in so it feels like a real long press */
      el.classList.add('pressing');
      try{ if(navigator.vibrate) navigator.vibrate(12); }catch(err){}
      fn();
    }, 520);
  }
  function cancel(){
    if(timer){ clearTimeout(timer); timer = null; }
    el.classList.remove('pressing');
  }
  function move(e){
    const t = (e.touches && e.touches[0]) || e;
    /* moving means scrolling, not pressing */
    if(Math.abs(t.clientX - sx) > 8 || Math.abs(t.clientY - sy) > 8) cancel();
  }

  el.addEventListener('mousedown', start);
  el.addEventListener('touchstart', start, { passive:true });
  el.addEventListener('mousemove', move);
  el.addEventListener('touchmove', move, { passive:true });
  ['mouseup','mouseleave','mouseout','touchend','touchcancel','scroll'].forEach(ev=>
    el.addEventListener(ev, cancel, { passive:true }));
  el.addEventListener('contextmenu', e=>{ if(fired) e.preventDefault(); });
  el._longPressFired = ()=>fired;
}

} )(window.NX);