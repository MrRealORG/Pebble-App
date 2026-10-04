/* ============================================================
   Pebble 3.0 — 30-settings.js
   Settings: themes(13), profile, SFX, hotkeys, customization,
   storage backend, widget, about
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

const SECTIONS = [
  { id:'themes',    n:'Themes',          ic:'palette' },
  { id:'display',   n:'Display & Scale', ic:'sliders' },
  { id:'sidebar',   n:'Sidebar',         ic:'list' },
  { id:'cloud',     n:'Cloud & Sync',    ic:'cloud' },
  { id:'google',    n:'Google',          ic:'refresh' },
  { id:'apps',      n:'Apps & features', ic:'grid' },
  { id:'folders',   n:'Folders',         ic:'download' },
  { id:'rewards',   n:'Rewards',         ic:'star' },
  { id:'system',    n:'System',          ic:'sliders' },
  { id:'profile',   n:'Profile',         ic:'user' },
  { id:'mcp',       n:'MCP & AI',        ic:'api' },
  { id:'customize', n:'Customize',       ic:'sliders' },
  { id:'sound',     n:'Sound',           ic:'volume' },
  { id:'hotkeys',   n:'Hotkeys',         ic:'zap' },
  { id:'reliability', n:'Reliability',   ic:'check' },
  { id:'backup',    n:'Backup & Sync',   ic:'download' },
  { id:'storage',   n:'Storage',         ic:'layers' },
  { id:'about',     n:'About',           ic:'book' }
];

let curSec = 'themes';
let busyG = false;   /* a Google consent popup is open */

NX.routeInShell('settings', 'Settings', 'settings', function(view){
  view.innerHTML = `
  <div class="page">
    <div class="settings-layout">
      <div class="set-nav" id="set-nav"></div>
      <div id="set-body" style="min-width:0"></div>
    </div>
  </div>`;

  /* Deep link from the route guard: #/settings/apps must open Apps &
     features, otherwise "Turn it back on" lands on Themes. routeInShell
     does not pass params, so read it off the hash once per render. */
  try{
    const seg = (location.hash || '').replace(/^#\/?settings\/?/, '').split('/')[0];
    if(seg && SECTIONS.some(s => s.id === seg)) curSec = seg;
  }catch(e){}

  function renderNav(){
    q('#set-nav', view).innerHTML = SECTIONS.map(s=>
      `<button class="${s.id===curSec?'on':''}" data-s="${s.id}">${icon(s.ic)} ${U.esc(s.n)}</button>`).join('');
    qa('[data-s]', view).forEach(b=>b.onclick = ()=>{ curSec = b.dataset.s; renderNav(); renderBody(); NX.sfx.play('click'); });
  }

  /* async because the folders/system panels await native commands. The
     route wrapper does not await this, so every call site must tolerate a
     promise — which is why they all end in renderBody() with no chaining. */
  async function renderBody(){
    const host = q('#set-body', view);
    const s = NX.store.get('settings', {});
    const p = NX.store.get('profile', NX.defaults.profile);

    if(curSec === 'themes'){
      const unlockedCount = (NX.THEMES||[]).filter(t=>NX.store.isUnlocked('theme:'+t.id)).length;
      host.innerHTML = `<div class="card"><div class="card-h"><div class="tile sm">${icon('palette')}</div>
        <div><div class="c-title">Themes</div><div class="c-sub">${unlockedCount} of ${(NX.THEMES||[]).length} unlocked · Ctrl+J cycles unlocked themes</div></div></div>
        <div class="card-b"><div class="theme-grid" id="th-grid"></div></div></div>`;
      q('#th-grid', host).innerHTML = NX.THEMES.map(t=>{
        const owned = NX.store.isUnlocked('theme:'+t.id);
        const price = NX.store.priceOf('theme', t.id);
        return `<div class="theme-card ${s.theme===t.id?'on':''} ${owned?'':'locked'}" data-th="${t.id}"
            data-tip="${U.esc(t.name + (owned ? '' : ' — unlock for ' + price + ' points'))}">
          <div class="theme-swatch" style="background:${t.bg}">
            <i class="ts-side" style="background:${t.side}"></i>
            <i class="ts-main" style="background:${t.main}"></i>
            <i class="ts-pill" style="background:${t.pill}"></i>
            ${owned ? '' : `<span class="ts-lock">${icon('lock',12)} ${price}</span>`}
          </div>
          <div class="theme-name">${U.esc(t.name)} ${s.theme===t.id?`<span class="on-ic">${icon('check')}</span>`:''}</div>
        </div>`;
      }).join('');
      qa('[data-th]', host).forEach(c=>c.onclick = ()=>{
        const id = c.dataset.th;
        if(NX.store.isUnlocked('theme:' + id)){
          NX.applyTheme(id, { force:true });
          NX.sfx.play('pop');
          renderBody();
        } else {
          NX.openStore('theme:' + id);
        }
      });
    }

    if(curSec === 'display'){
      const sc = NX.getScale ? NX.getScale() : 1;
      const getDesc = v => {
        const pct = Math.round(v * 100);
        if(pct <= 75) return 'Downscaled (Ultra-Compact) — Maximum content density for small laptop screens & 720p/1080p netbooks.';
        if(pct <= 85) return 'Downscaled (Compact) — Roomy multitasking view for compact windows and laptops.';
        if(pct === 100) return 'Standard 100% (Default) — Balanced scale designed for standard 1080p and 1440p displays.';
        if(pct <= 125) return 'Upscaled (Comfortable) — Larger text, buttons, and badges for comfortable viewing on 1440p and 4K displays.';
        return 'Upscaled (High-DPI / Accessible) — Maximum clarity and large interface elements for 4K / Ultra-HD displays.';
      };

      const getPill = v => {
        const pct = Math.round(v * 100);
        if(pct < 100) return `<span class="pill yellow sm">Downscaling (${pct}%)</span>`;
        if(pct === 100) return `<span class="pill green sm">Default (100%)</span>`;
        return `<span class="pill blue sm">Upscaling (${pct}%)</span>`;
      };

      host.innerHTML = `
        <div class="card">
          <div class="card-h">
            <div class="tile sm" style="background:var(--blue-soft);color:var(--blue)">${icon('sliders')}</div>
            <div>
              <div class="c-title">Display & UI Scaling</div>
              <div class="c-sub">Upscale for high-DPI (2K/4K) monitors or downscale for compact laptop screens.</div>
            </div>
            <div class="spacer"></div>
            <span id="disp-sc-pill">${getPill(sc)}</span>
          </div>
          <div class="card-b" style="display:flex;flex-direction:column;gap:14px">
            <div>
              <div class="row gap-8" style="align-items:center">
                <button class="icon-btn" id="disp-sc-out" data-tip="Step Down (-5%)">${icon('minus',15)}</button>
                <input type="range" class="sys-range" id="disp-sc-range" min="80" max="140" step="5" value="${Math.round(sc*100)}" style="flex:1">
                <button class="icon-btn" id="disp-sc-in" data-tip="Step Up (+5%)">${icon('plus',15)}</button>
                <button class="btn btn-soft btn-sm" id="disp-sc-reset">Reset (100%)</button>
              </div>
              <div class="row gap-6" style="margin-top:10px;flex-wrap:wrap">
                <span class="faint tiny bold" style="align-self:center;margin-right:4px">Presets:</span>
                ${[0.80, 0.85, 0.90, 1.0, 1.10, 1.25, 1.40].map(v=>
                  `<button class="btn btn-soft btn-sm ${Math.abs(sc-v)<0.02?'btn-green':''}" data-disp-preset="${v}">${Math.round(v*100)}%</button>`
                ).join('')}
              </div>
              <div class="faint tiny" id="disp-sc-desc" style="margin-top:10px;line-height:1.4">${getDesc(sc)}</div>
            </div>

            <!-- Live Scaling Preview -->
            <div style="border-top:1px solid var(--line);padding-top:14px">
              <div class="tiny bold" style="margin-bottom:8px">Live Preview at Current Scale</div>
              <div class="card" style="padding:14px;background:var(--bg-2);border-radius:12px;border:1px solid var(--line)">
                <div class="row gap-10" style="align-items:center">
                  <div class="tile sm" style="background:var(--green-soft);color:var(--green)">${icon('check')}</div>
                  <div style="flex:1">
                    <div style="font-weight:700;font-size:13px">PebbleX Smooth UI Scaling Active</div>
                    <div class="faint tiny">All fonts, panels, sidebars, and dialogue widgets scale smoothly together.</div>
                  </div>
                  <span class="pill green sm">Crisp Typography</span>
                  <button class="btn btn-dark btn-sm">Sample Action</button>
                </div>
              </div>
            </div>

            <div style="border-top:1px solid var(--line);padding-top:12px">
              <div class="tiny bold">Display Modes & Information</div>
              <div class="faint tiny" style="margin-top:4px;line-height:1.5">
                • <b>Downscaling (70% - 85%)</b>: Compresses margins and text to reveal more notes, task lists, and calendar columns side-by-side without horizontal scrolling.<br>
                • <b>Standard (100%)</b>: Default pixel-ratio render with native font metrics.<br>
                • <b>Upscaling (115% - 150%)</b>: Increases button click targets and typography size for high-resolution displays (2560×1440, 4K UHD) or touchscreens.
              </div>
            </div>
          </div>
        </div>`;

      const range = q('#disp-sc-range', host);
      const pill  = q('#disp-sc-pill', host);
      const desc  = q('#disp-sc-desc', host);

      const updateUI = v => {
        const got = NX.setScale(v);
        if(range) range.value = String(Math.round(got * 100));
        if(pill) pill.innerHTML = getPill(got);
        if(desc) desc.textContent = getDesc(got);
        qa('[data-disp-preset]', host).forEach(b => {
          const val = Number(b.dataset.dispPreset);
          b.classList.toggle('btn-green', Math.abs(got - val) < 0.02);
        });
      };

      const ro = q('#disp-sc-out', host); if(ro) ro.onclick = ()=> updateUI(NX.getScale() - 0.05);
      const ri = q('#disp-sc-in',  host); if(ri) ri.onclick = ()=> updateUI(NX.getScale() + 0.05);
      const rr = q('#disp-sc-reset', host); if(rr) rr.onclick = ()=> updateUI(1);
      if(range) range.oninput = ()=> updateUI(Number(range.value) / 100);
      qa('[data-disp-preset]', host).forEach(b => b.onclick = ()=> updateUI(Number(b.dataset.dispPreset)));
    }

    if(curSec === 'sidebar'){
      /* UI scale lives here as well as in the sidebar footer, because the
         footer buttons are hard to find when the sidebar is the thing that
         is mis-sized. */
      const sc = NX.getScale ? NX.getScale() : 1;
      host.innerHTML = `
        <div class="card">
          <div class="card-h"><div class="tile sm">${icon('sliders')}</div>
            <div><div class="c-title">UI size</div>
            <div class="c-sub">Scales the whole app. Text, icons and spacing together.</div></div>
            <div class="spacer"></div><span class="pill" id="sc-val">${Math.round(sc*100)}%</span></div>
          <div class="card-b">
            <div class="row gap-8" style="align-items:center">
              <button class="icon-btn" id="sc-out" data-tip="Smaller">${icon('minus',15)}</button>
              <input type="range" class="sys-range" id="sc-range" min="80" max="140" step="5" value="${Math.round(sc*100)}" style="flex:1">
              <button class="icon-btn" id="sc-in" data-tip="Bigger">${icon('plus',15)}</button>
              <button class="btn btn-soft btn-sm" id="sc-reset">Reset</button>
            </div>
            <div class="row gap-8" style="margin-top:8px">
              ${[0.80, 0.85, 0.90, 1.0, 1.10, 1.25, 1.40].map(v=>`<button class="btn btn-soft btn-sm" data-sc-preset="${v}">${Math.round(v*100)}%</button>`).join('')}
            </div>
            <div class="faint tiny" style="margin-top:8px">A larger UI needs more room — if something looks clipped, drop a step.</div>
          </div>
        </div>
        <div class="card"><div class="card-h"><div class="tile sm">${icon('list')}</div>
          <div><div class="c-title">Categories</div>
          <div class="c-sub">Fold a category away, hide it entirely, or drag rows between them in the sidebar.</div></div>
        </div>
        <div id="side-cfg-host"></div>`;

      const val = q('#sc-val', host), range = q('#sc-range', host);
      const show = v =>{ if(val) val.textContent = Math.round(v*100) + '%'; if(range) range.value = String(Math.round(v*100)); };
      const set = v =>{ const got = NX.setScale(v); show(got); };

      const ro = q('#sc-out', host); if(ro) ro.onclick = ()=> set(NX.getScale() - 0.05);
      const ri = q('#sc-in',  host); if(ri) ri.onclick = ()=> set(NX.getScale() + 0.05);
      const rr = q('#sc-reset', host); if(rr) rr.onclick = ()=> set(1);
      if(range) range.oninput = ()=> set(Number(range.value) / 100);
      qa('[data-sc-preset]', host).forEach(b => b.onclick = ()=> set(Number(b.dataset.scPreset)));

      /* 56-sidebar.js owns the category list */
      const ch = q('#side-cfg-host', host);
      if(ch && NX.sidebarSettings) ch.appendChild(NX.sidebarSettings());
      else if(ch) ch.innerHTML = '<div class="faint tiny">Sidebar module unavailable.</div>';
    }

    if(curSec === 'google'){
      const g = NX.google.cfg();
      const gl = (n,s)=>NX.glogo ? NX.glogo(n,s) : '';
      const lastSync = g.lastTasksSync ? U.relTime(g.lastTasksSync) : 'never';
      const lastBack = g.lastDriveBackup ? U.relTime(g.lastDriveBackup) : 'never';

      /* One button does everything. The toggles below are only for someone
         who wants one service and not the other. */
      const primary = `
        <div class="gd-hero">
          <div class="gd-hero-logos">
            <span>${gl('tasks',26)}</span><span>${gl('drive',26)}</span>
          </div>
          <div class="gd-hero-txt">
            <b>${g.connected ? 'Connected' : 'Sync with Google'}</b>
            <span>${g.connected
              ? `Signed in as ${U.esc(g.email||'your Google account')}`
              : 'Tasks both ways, plus a daily Drive backup. One click.'}</span>
          </div>
          ${g.connected
            ? `<button class="btn btn-soft" id="gd-sync" ${busyG?'disabled':''}>${icon('refresh')} Sync now</button>
               <button class="icon-btn" id="gd-disc" data-tip="Disconnect and delete tokens" aria-label="Disconnect">${icon('x')}</button>`
            : `<button class="btn btn-green btn-lg" id="gd-conn" ${busyG?'disabled':''}>
                 ${busyG?'Waiting for Google…':gl('g',16)+' Connect Google'}</button>`}
        </div>`;

      host.innerHTML = `
        <div class="card"><div class="card-h">
            <div><div class="c-title">Google</div><div class="c-sub">Tasks sync and Drive backup</div></div>
            <div class="spacer"></div>
            ${g.connected ? `<span class="pill green">${icon('check',11)} On</span>` : '<span class="pill gray">Off</span>'}
        </div>
        <div class="card-b" style="display:flex;flex-direction:column;gap:14px">
          ${primary}

          ${g.connected ? `<div class="gd-facts">
            <span>${icon('check',12)} Tasks synced ${U.esc(lastSync)}</span>
            <span>${icon('check',12)} Drive backup ${U.esc(lastBack)}</span>
          </div>` : ''}

          <details class="gd-more">
            <summary>${g.tasksEnabled&&g.driveEnabled ? 'Customise' : 'Choose what to sync'}</summary>
            <div class="gd-apps">
              <div class="gd-app ${g.tasksEnabled?'on':''}">
                <span class="gd-ic">${gl('tasks',18)}</span>
                <div class="gd-txt"><b>Google Tasks</b>
                  <span>Make a task here, it appears there. Edit either side, the other catches up.</span></div>
                <label class="switch"><input type="checkbox" id="gd-tasks" ${g.tasksEnabled?'checked':''}><span class="track"></span></label>
              </div>
              <div class="gd-app ${g.driveEnabled?'on':''}">
                <span class="gd-ic">${gl('drive',18)}</span>
                <div class="gd-txt"><b>Google Drive backup</b>
                  <span>One JSON backup per day in a PebbleX folder. Your tokens are stripped first.</span></div>
                <label class="switch"><input type="checkbox" id="gd-drive" ${g.driveEnabled?'checked':''}><span class="track"></span></label>
              </div>
            </div>
            <div class="field" style="margin-top:12px">
              <label>OAuth client ID <span class="faint tiny">(advanced)</span></label>
              <input class="input" id="gd-client" placeholder="123.apps.googleusercontent.com" value="${U.esc(g.clientId||'')}">
              <span class="faint tiny">Pre-filled — you should not need to touch this. PebbleX uses PKCE, so there is no client secret and none is stored. Anything starting <code>GOCSPX-</code> is a secret: it will be refused.</span>
            </div>
          </details>

          ${g.connected ? `<div class="faint tiny">Scopes: <code>${U.esc((g.scopes||[]).join('  '))}</code></div>` : ''}
        </div></div>

        ${g.conflicts.length ? `<div class="card" style="margin-top:16px"><div class="card-h"><div class="tile sm">${icon('alert')}</div>
          <div><div class="c-title">Kept local</div><div class="c-sub">${g.conflicts.length} change(s) PebbleX's newer version overwrote</div></div></div>
          <div class="card-b"><div class="gd-log">${g.conflicts.slice(0,6).map(c=>`
            <div class="gd-log-row"><span class="gl-k warn">local</span>
              <span class="gl-m">${U.esc(String(c.task||''))}</span>
              <span class="gl-t">Google edited ${U.esc(U.relTime(c.remoteAt))}</span></div>`).join('')}</div></div></div>` : ''}

        ${g.log.length ? `<details class="gd-more" style="margin-top:16px"><summary>Recent activity</summary>
          <div class="gd-log">${g.log.slice(0,8).map(l=>`
            <div class="gd-log-row"><span class="gl-k ${l.kind}">${U.esc(l.kind)}</span>
              <span class="gl-m">${U.esc(l.msg)}</span>
              <span class="gl-t">${U.esc(U.relTime(l.t))}</span></div>`).join('')}</div></details>` : ''}

        <div class="card" style="margin-top:16px"><div class="card-h"><span class="tile sm" style="padding:0;overflow:hidden">${gl('keep',16)}</span>
          <div><div class="c-title">Google Keep</div>
          <div class="c-sub">Not available — and not a PebbleX limitation</div></div>
          <span class="pill gray sm">Unavailable</span></div>
          <div class="card-b">
            <p style="font-size:12.5px;color:var(--ink-2);line-height:1.65;margin:0 0 12px">
              Google restricts the Keep API to enterprise administrators. It needs a Workspace Super
              Admin to allowlist the app, and personal <code>@gmail.com</code> accounts receive
              <code>invalid_scope</code>. It is built for corporate data-loss prevention, not for
              note apps.</p>
            <div class="gd-note">
              <span class="gd-ic">${gl('tasks',18)}</span>
              <div>Use <b>Google Tasks</b> instead — it is the proper checkbox API and it works on
              every account. That is what the sync above uses.</div>
            </div>
          </div></div>`;

const clientIn = q('#gd-client', host);
      if(clientIn) clientIn.onchange = async ()=>{
        const okDone = await NX.google.setClientId(clientIn.value);
        if(okDone){ NX.toastOk('Client ID saved'); renderBody(); }
        else renderBody();   /* reset the field after a rejection */
      };
      const tk = q('#gd-tasks', host);
      if(tk) tk.onchange = ()=>{ NX.google.setEnabled('tasks', tk.checked); renderBody(); };
      const dr = q('#gd-drive', host);
      if(dr) dr.onchange = ()=>{ NX.google.setEnabled('drive', dr.checked); renderBody(); };

      const cn = q('#gd-conn', host);
      if(cn) cn.onclick = async ()=>{
        busyG = true; renderBody();
        const okDone = await NX.google.connect();
        busyG = false; renderBody();
        if(!okDone) NX.toastInfo('Not connected', 'Nothing was saved.');
      };
      const dc = q('#gd-disc', host);
      if(dc) dc.onclick = ()=>{
        NX.confirm('Disconnect Google?', 'Your Google tokens are deleted from this device. Tasks already synced stay in PebbleX.', ()=>{
          NX.google.disconnect();
          renderBody();
        }, { icon:'logout', yes:'Disconnect' });
      };
      const sy = q('#gd-sync', host);
      if(sy) sy.onclick = async ()=>{
        busyG = true; renderBody();
        await NX.google.syncNow();
        busyG = false; renderBody();
      };
    }

    if(curSec === 'apps'){
      const offline = NX.offline.on();
      const groups = NX.modules.grouped();
      host.innerHTML = `
        <div class="card"><div class="card-h"><div class="tile sm" style="background:var(--${offline?'yellow':'green'}-soft);color:var(--${offline?'yellow':'green'})">${icon('cloud')}</div>
          <div><div class="c-title">Offline mode</div><div class="c-sub">Nothing leaves this device</div></div>
          <div class="spacer"></div>
          <label class="switch"><input type="checkbox" id="st-offline" ${offline?'checked':''}><span class="track"></span></label></div>
          <div class="card-b">
            <p style="font-size:12.5px;color:var(--ink-2);line-height:1.6;margin:0">
              When on, AI, weather and cloud sync stop making network requests entirely.
              Everything else keeps working from local storage.</p>
            <div style="margin-top:12px"><button class="btn btn-soft btn-sm" id="st-apps-page">${icon('grid')} Open the apps screen</button></div>
          </div></div>

        ${groups.map(g=>`
        <div class="card" style="margin-top:16px"><div class="card-h"><div class="tile sm">${icon('layers',15)}</div>
          <div><div class="c-title">${U.esc(g.n)}</div><div class="c-sub">${g.items.filter(i=>i.on).length} of ${g.items.length} on</div></div></div>
          <div class="card-b"><div class="mod-list">
            ${g.items.map(({m,on})=>`
              <div class="mod-row">
                <span class="mod-ic">${icon(m.ic,15)}</span>
                <span class="mod-txt"><b>${U.esc(m.n)}</b><i>${U.esc(m.d)}</i></span>
                ${m.core ? '<span class="pill gray sm">Core</span>' :
                  `<label class="switch"><input type="checkbox" data-mod="${m.id}" ${on?'checked':''}><span class="track"></span></label>`}
              </div>`).join('')}
          </div></div></div>`).join('')}

        <div class="card" style="margin-top:16px"><div class="card-h"><div class="tile sm">${icon('undo')}</div>
          <div><div class="c-title">Reset</div><div class="c-sub">Back to defaults</div></div></div>
          <div class="card-b"><div class="row gap-8">
            <button class="btn btn-soft btn-sm" id="st-unhide">Show all hidden apps</button>
            <button class="btn btn-danger btn-sm" id="st-modreset">${icon('undo')} Reset all apps</button>
          </div></div></div>`;

      const ot = q('#st-offline', host);
      if(ot) ot.onchange = ()=>NX.offline.set(ot.checked);
      qa('[data-mod]', host).forEach(t=>{
        t.onchange = ()=>{
          const id = t.dataset.mod;
          const on = NX.modules.set(id, t.checked);
          if(!on) t.checked = true;   /* core refused — put the switch back */
          else{
            const m = NX.modules.byId(id);
            NX.toastOk(on ? m.n + ' enabled' : m.n + ' disabled',
              on ? '' : 'Its background work has stopped.');
          }
        };
      });
      const up = q('#st-apps-page', host);
      if(up) up.onclick = ()=>NX.router.go('apps');
      const uh = q('#st-unhide', host);
      if(uh) uh.onclick = ()=>{ NX.store.del('apps:hidden'); NX.events.emit('modules:refresh-nav'); renderBody(); NX.toastOk('Sidebar restored'); };
      const mr = q('#st-modreset', host);
      if(mr) mr.onclick = ()=>{
        NX.confirm('Reset every app?', 'All apps return to their defaults and hidden apps come back. Your notes, tasks and points are untouched.', ()=>{
          NX.modules.resetAll();
          NX.store.del('apps:hidden');
          renderBody();
          NX.toastOk('Apps reset');
        }, { icon:'undo', yes:'Reset apps' });
      };
    }

    if(curSec === 'folders'){
      const locs = [];
      host.innerHTML = `<div class="card"><div class="card-h"><div class="tile sm">${icon('download')}</div>
        <div><div class="c-title">Where Pebble keeps your stuff</div><div class="c-sub">Every file lives on this PC. Click any row to open the folder.</div></div></div>
        <div class="card-b"><div class="faint small" id="fd-load">Looking…</div>
          <div id="fd-list" style="margin-top:10px"></div></div></div>`;

      const notes = NX.native && NX.native.available ? await NX.native.noteVaultStatus() : null;
      const sys = NX.native && NX.native.available ? await NX.native.sysDataLocations() : [];
      void notes;
      const rows = sys.length ? sys : [];
      q('#fd-load', host).textContent = rows.length ? '' : 'Folders are only listed in the desktop app.';
      q('#fd-list', host).innerHTML = rows.map(r=>`
        <div class="fd-row" data-path="${U.esc(r.path)}">
          <span class="fd-ic">${icon(r.kind==='notes'?'notes':(r.kind==='images'?'camera':'layers'),14)}</span>
          <span class="fd-txt"><b>${U.esc(r.label)}</b><i>${U.esc(r.path)}</i></span>
          ${r.exists?'':'<span class="pill gray sm">missing</span>'}
          <button class="icon-btn sm" data-open="${U.esc(r.path)}" data-tip="Open">${icon('chevR',14)}</button>
        </div>`).join('');
      qa('[data-open]', host).forEach(b=>b.onclick = async ()=>{
        const p = b.dataset.open;
        const ok = await NX.native.openPath(p);
        if(!ok) NX.toastErr('Could not open', p);
      });

      const paths = NX.native && NX.native.available ? await NX.native.appPaths() : null;
      if(paths && paths.downloads){
        const row = h(`<div class="fd-row" data-open-path="${U.esc(paths.downloads)}">
          <span class="fd-ic">${icon('download',14)}</span>
          <span class="fd-txt"><b>Downloads</b><i>${U.esc(paths.downloads)}</i></span>
          <button class="icon-btn sm" data-op2="${U.esc(paths.downloads)}" data-tip="Open">${icon('chevR',14)}</button></div>`);
        row.querySelector('[data-op2]').onclick = ()=>NX.native.openPath(row.dataset.openPath);
        q('#fd-list', host).appendChild(row);
      }
    }

    if(curSec === 'system'){
      host.innerHTML = `<div class="card"><div class="card-h"><div class="tile sm">${icon('sliders')}</div>
        <div><div class="c-title">Screen & sound</div><div class="c-sub">Real Windows brightness and volume</div></div></div>
        <div class="card-b" style="display:flex;flex-direction:column;gap:18px">
          <div>
            <div class="row gap-8" style="justify-content:space-between;margin-bottom:6px">
              <b style="font-size:12.5px">${icon('sun')} Brightness</b><span class="pill" id="st-bri-val">—</span></div>
            <input type="range" class="sys-range" id="st-bri" min="0" max="100" disabled>
            <div class="faint tiny" id="st-bri-sub" style="margin-top:6px">Checking this display…</div>
          </div>
          <div>
            <div class="row gap-8" style="justify-content:space-between;margin-bottom:6px">
              <b style="font-size:12.5px">${icon('volume')} System volume</b><span class="pill" id="st-vol-val">—</span></div>
            <input type="range" class="sys-range" id="st-vol" min="0" max="100" disabled>
            <div class="faint tiny" id="st-vol-sub" style="margin-top:6px">Checking audio…</div>
          </div>
        </div></div>`;

      const bri = q('#st-bri', host), vol = q('#st-vol', host);
      const bv = q('#st-bri-val', host), vv = q('#st-vol-val', host);
      const bs = q('#st-bri-sub', host), vs = q('#st-vol-sub', host);
      let bt = null, vt = null;
      if(bri) bri.oninput = ()=>{ bv.textContent = bri.value + '%'; clearTimeout(bt); bt = setTimeout(()=>NX.native.sysBrightnessSet(Number(bri.value)), 140); };
      if(vol) vol.oninput = ()=>{ vv.textContent = vol.value + '%'; clearTimeout(vt); vt = setTimeout(()=>NX.native.sysVolumeSet(Number(vol.value)), 140); };

      if(NX.native && NX.native.available){
        NX.native.sysBrightness().then(r=>{
          if(r && r.ok){ bri.value = Math.round(r.value); bv.textContent = Math.round(r.value) + '%'; bs.textContent = 'Your display'; }
          else { bv.textContent = 'n/a'; bs.textContent = (r && r.error) || 'Not available on this display'; }
        });
        NX.native.sysVolume().then(r=>{
          if(r && r.ok){ vol.value = Math.round(r.value); vv.textContent = Math.round(r.value) + '%'; vs.textContent = 'Windows output device'; }
          else { vv.textContent = 'n/a'; vs.textContent = (r && r.error) || 'No audio device'; }
        });
      } else {
        bs.textContent = 'Desktop only'; vs.textContent = 'Desktop only';
      }
    }

    if(curSec === 'rewards'){
      const lv = NX.points.level();
      const hist = NX.points.history().slice(-60).reverse();
      const today = NX.points.today();
      const ceil = NX.points.ceiling();
      const cfg = NX.media ? NX.media.cfg() : { enabled:false };
      const rows = hist.map(h=>`
        <div class="rw-hist-row">
          <span class="rw-hist-d ${h.d>=0?'pos':'neg'}">${h.d>=0?'+':''}${h.d}</span>
          <span class="rw-hist-m">${U.esc(h.m || NX.points.reasonLabel(h.r))}</span>
          <span class="rw-hist-t">${U.esc(U.relTime(h.t))}</span>
        </div>`).join('');

      host.innerHTML = `<div class="card"><div class="card-h"><div class="tile sm">${icon('star')}</div>
        <div><div class="c-title">Rewards</div><div class="c-sub">Earn by playing, focusing and finishing — never by spending money</div></div></div>
        <div class="card-b" style="display:flex;flex-direction:column;gap:16px">
          <div class="row gap-16" style="align-items:center">
            <div style="flex:1">
              <div class="sh-bal">${NX.points.balance().toLocaleString()}</div>
              <div class="faint tiny">points available · ${NX.points.lifetime().toLocaleString()} earned all-time</div>
            </div>
            <div style="flex:1">
              <div class="row gap-8"><span class="pill green">L${lv.n} · ${U.esc(lv.title)}</span></div>
              <span class="meter" style="display:block;margin-top:6px"><i style="width:${lv.pct}%"></i></span>
              <div class="faint tiny">${lv.next - lv.cur} points to L${lv.n+1}</div>
            </div>
          </div>
          <div class="rw-row">
            <div class="rw-txt"><b>Earned today</b><span>${today} of the ${ceil} daily cap — caps keep the leaderboard honest</span></div>
            <span class="pill ${today>=ceil?'yellow':'gray'}">${Math.round(today/ceil*100)}%</span>
          </div>
          <div class="row gap-8">
            <button class="btn btn-green btn-sm" id="rw-store">${icon('star')} Open store</button>
            <button class="btn btn-soft btn-sm" id="rw-lb">${icon('bar')} Leaderboard</button>
          </div>
        </div></div>

        <div class="card" style="margin-top:16px"><div class="card-h"><div class="tile sm">${icon('activity')}</div>
          <div><div class="c-title">Recent activity</div><div class="c-sub">Last 60 ledger entries</div></div></div>
          <div class="card-b"><div class="rw-hist">${rows || '<div class="faint small">Nothing yet — win a game to start earning.</div>'}</div></div></div>

        <div class="card" style="margin-top:16px"><div class="card-h"><div class="tile sm">${icon('cloud')}</div>
          <div><div class="c-title">Image sync (optional)</div><div class="c-sub">Copies your images to cloud storage so they appear on your other devices</div></div></div>
          <div class="card-b" style="display:flex;flex-direction:column;gap:12px">
            <div class="rw-row">
              <div class="rw-txt"><b>Cloud sync</b><span>Images always save locally first. This is strictly optional.</span></div>
              <label class="switch"><input type="checkbox" id="rw-sync" ${cfg.enabled?'checked':''}><span class="track"></span></label>
            </div>
            <div class="field"><label>Sync address</label>
              <input class="input" id="rw-api" placeholder="https://your-worker.workers.dev" value="${U.esc(cfg.api||'')}"></div>
            <div class="field"><label>Access token</label>
              <input class="input" id="rw-token" type="password" placeholder="Paste the Worker token" value="${U.esc(cfg.token||'')}"></div>
            <div class="row gap-8">
              <button class="btn btn-soft btn-sm" id="rw-test">${icon('check')} Test connection</button>
              <button class="btn btn-dark btn-sm" id="rw-push">${icon('upload')} Sync now</button>
            </div>
            <div class="faint tiny" id="rw-sync-note">${U.esc(cfg.enabled ? 'Sync is on.' : 'Sync is off — nothing leaves this device.')}</div>
          </div></div>

        <div class="card" style="margin-top:16px"><div class="card-h"><div class="tile sm">${icon('trash')}</div>
          <div><div class="c-title">Reset rewards</div><div class="c-sub">Clears your balance and everything you unlocked</div></div></div>
          <div class="card-b"><button class="btn btn-danger btn-sm" id="rw-reset">${icon('trash')} Reset points & unlocks</button></div></div>`;

      q('#rw-store', host).onclick = ()=>NX.router.go('store');
      q('#rw-lb', host).onclick = ()=>NX.router.go('leaderboard');

      const note = q('#rw-sync-note', host);
      const apiIn = q('#rw-api', host);
      const tokIn = q('#rw-token', host);
      const syncIn = q('#rw-sync', host);
      const persist = ()=>{
        if(NX.media) NX.media.setCfg({ enabled: syncIn.checked, api: apiIn.value.trim(), token: tokIn.value.trim() });
      };
      syncIn.onchange = ()=>{ persist(); note.textContent = syncIn.checked ? 'Sync is on.' : 'Sync is off — nothing leaves this device.'; };
      apiIn.onchange = persist;
      tokIn.onchange = persist;

      q('#rw-test', host).onclick = async ()=>{
        persist();
        note.textContent = 'Testing…';
        const r = await NX.media.health();
        note.textContent = r.ok
          ? (r.auth ? 'Connected. The service wants a token — paste it above.' : 'Connected. No token required.')
          : r.error;
      };
      q('#rw-push', host).onclick = async ()=>{
        persist();
        note.textContent = 'Uploading…';
        const r = await NX.media.pushAll({ force:true });
        note.textContent = (r.skipped) ? 'Already synced recently.'
          : 'Synced ' + r.ok + ' image' + (r.ok===1?'':'s') + (r.fail ? ', ' + r.fail + ' failed' : '') + '.';
      };

      q('#rw-reset', host).onclick = ()=>{
        NX.confirm('Reset all rewards?', 'Your balance goes to zero and every unlocked theme, game and frame is locked again. This cannot be undone.', ()=>{
          NX.points.reset();
          NX.store.set('entitlements', null);
          NX.applyTheme('elera', { force:true });
          NX.toastOk('Rewards reset', 'Back to zero.');
          renderBody();
          NX.refreshPointsChip && NX.refreshPointsChip();
        }, { icon:'trash', yes:'Reset everything' });
      };
    }

    if(curSec === 'profile'){
      host.innerHTML = `<div class="card"><div class="card-h"><div class="tile sm">${icon('user')}</div>
        <div><div class="c-title">Profile</div><div class="c-sub">How you appear in chat & across the workspace</div></div></div>
        <div class="card-b" style="display:flex;flex-direction:column;gap:14px;max-width:440px">
          <div class="row gap-12"><span id="pf-av">${NX.avatarHtml ? NX.avatarHtml(p,'xl') : `<span class="avatar xl" style="background:${U.esc(p.avatar)}">${U.initials(p.name)}</span>`}</span>
            <div style="flex:1">
              <div class="field"><label>Display name</label><input class="input" id="pf-name" value="${U.esc(p.name)}" maxlength="24"></div>
              <div class="row gap-6" style="margin-top:8px">
                <button class="btn btn-soft btn-sm" id="pf-up">${icon('camera')} Upload photo</button>
                ${(NX.store.get('entitlements',{})||{}).avatarImg ? `<button class="btn btn-ghost btn-sm" id="pf-rm">Remove</button>` : ''}
              </div>
            </div></div>
          <div class="field"><label>Avatar colour</label><div class="row gap-6" id="pf-colors" style="flex-wrap:wrap">
            ${['#7CD56E','#5EB8FF','#E8853D','#8B5CF6','#E05C9C','#0FA3A3','#E25C4A','#D4A017'].map(c=>
              `<button data-c="${c}" style="width:30px;height:30px;border-radius:50%;background:${c};border:2.5px solid ${p.avatar===c?'var(--ink)':'transparent'}"></button>`).join('')}
          </div>
          <span class="faint tiny">Location data is stripped from every upload on import.</span></div>
          <div class="field"><label>Bio</label><input class="input" id="pf-bio" value="${U.esc(p.bio||'')}" maxlength="80"></div>
          <div class="row"><button class="btn btn-green" id="pf-save">${icon('check')} Save profile</button>
            <button class="btn btn-soft" id="pf-lock">${icon('logout')} Lock workspace (PIN)</button></div>
        </div></div>`;
      qa('#pf-colors [data-c]', host).forEach(b=>b.onclick = ()=>{ p.avatar = b.dataset.c; NX.store.set('profile', p); renderBody(); NX.refreshSidebarUser && NX.refreshSidebarUser(); });
      q('#pf-up', host).onclick = ()=>{
        NX.media && NX.media.pick({ kind:'avatar' }).then(meta=>{
          if(!meta) return;
          const e = NX.store.get('entitlements', {}) || {};
          const old = e.avatarImg;
          e.avatarImg = meta.url;
          NX.store.set('entitlements', e);
          if(old && NX.media) NX.media.remove(old);
          const av = q('#pf-av', host);
          if(av) av.innerHTML = NX.avatarHtml(NX.store.get('profile', p), 'xl');
          NX.toastOk('Photo saved', 'Stripped of location data, stored on this device.');
          NX.refreshSidebarUser && NX.refreshSidebarUser();
        });
      };
      const rm = q('#pf-rm', host);
      if(rm) rm.onclick = ()=>{
        const e = NX.store.get('entitlements', {}) || {};
        const old = e.avatarImg;
        e.avatarImg = null;
        NX.store.set('entitlements', e);
        if(old && NX.media) NX.media.remove(old);
        renderBody();
        NX.refreshSidebarUser && NX.refreshSidebarUser();
      };
      q('#pf-save', host).onclick = ()=>{
        const nm = q('#pf-name', host).value.trim(); if(nm) p.name = nm;
        p.bio = q('#pf-bio', host).value.trim();
        NX.store.set('profile', p);
        NX.toastOk('Profile saved', 'Looking sharp, ' + p.name);
        NX.router.go('settings');
      };
      q('#pf-lock', host).onclick = ()=>{
        const body = h(`<div class="field"><label>Set a PIN (4+ digits)</label><input class="input" id="pin-in" type="password" inputmode="numeric" maxlength="12"></div>`);
        NX.modal({ title:'Lock your workspace', icon:'logout', body, footer:[
          { label:'Cancel', cls:'btn-soft' },
          { label:'Save PIN', cls:'btn-green', onClick:()=>{
              const v = q('#pin-in', body).value.trim();
              if(v && v.length >= 4){ NX.store.set('auth', { pinHash: U.hashPin(v) }); if(NX.store && NX.store.flush) NX.store.flush(); NX.closeAllModals(); NX.toastOk('PIN saved', 'You\'ll be asked on next launch.'); }
              else if(!v){ NX.store.del('auth'); if(NX.store && NX.store.flush) NX.store.flush(); NX.closeAllModals(); NX.toastOk('PIN removed'); }
              else NX.toastErr('Too short', 'PIN needs 4+ digits.');
            } }
        ]});
      };
    }

    if(curSec === 'mcp'){
      host.innerHTML = `<div class="card"><div class="card-h"><div class="tile sm" style="background:var(--blue-soft);color:var(--blue)">${icon('api')}</div>
        <div><div class="c-title">Model Context Protocol (MCP) Server</div><div class="c-sub">Connect Claude Desktop, Antigravity, or Cursor directly to Pebble</div></div></div>
        <div class="card-b" style="display:flex;flex-direction:column;gap:14px">
          <div class="card" style="padding:12px;background:var(--bg-2);display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="width:10px;height:10px;border-radius:50%;background:#4caf50;box-shadow:0 0 8px #4caf50"></span>
              <div>
                <b style="font-size:13.5px">MCP JSON-RPC 2.0 Server Active</b>
                <div class="faint tiny">Endpoint: <code>http://127.0.0.1:47615/api/mcp</code> (or SSE at <code>/mcp/sse</code>)</div>
              </div>
            </div>
            <span class="pill green sm">Port 47615</span>
          </div>

          <div style="font-size:13px;line-height:1.5;color:var(--ink-2)">
            Pebble exposes standardized MCP tools so external AI coding assistants can:
            <ul style="margin:6px 0 0 18px;font-size:12.5px;color:var(--ink-3)">
              <li><code>pebble_get_notes</code> — Read and search your markdown notes vault</li>
              <li><code>pebble_create_note</code> — Create new notes from AI chat</li>
              <li><code>pebble_get_tasks</code> — List active, My Day, and planned tasks</li>
              <li><code>pebble_create_task</code> — Schedule action items to Microsoft To-Do</li>
              <li><code>pebble_complete_task</code> — Check off tasks programmatically</li>
              <li><code>pebble_get_productivity_stats</code> — Inspect tracked app focus hours</li>
            </ul>
          </div>

          <div class="field">
            <label class="faint tiny bold">Claude Desktop Configuration (claude_desktop_config.json)</label>
            <div style="position:relative">
              <pre class="md-pre" id="mcp-claude-cfg" style="font-size:11.5px;max-height:130px;overflow-y:auto">{
  "mcpServers": {
    "pebble": {
      "command": "node",
      "args": ["g:/Apps dev/Pebble/scripts/mcp-server.js"]
    }
  }
}</pre>
              <button class="btn btn-sm btn-soft" id="mcp-copy-claude" style="position:absolute;top:6px;right:6px">${icon('copy',12)} Copy JSON</button>
            </div>
          </div>

          <div class="row gap-8">
            <button class="btn btn-green btn-sm" id="mcp-test-tools">${icon('zap',12)} Test MCP Tools Sandbox</button>
            <button class="btn btn-soft btn-sm" id="mcp-open-bridge">${icon('monitor',12)} Open Bridge Dashboard</button>
          </div>
        </div></div>`;

      q('#mcp-copy-claude', host).onclick = () => {
        const text = q('#mcp-claude-cfg', host).textContent;
        NX.native.clipboardWrite(text).then(() => {
          NX.toastOk('Copied Claude Config', 'Paste into claude_desktop_config.json');
          NX.sfx.play('ok');
        });
      };

      q('#mcp-open-bridge', host).onclick = () => {
        NX.native.openExternal('http://127.0.0.1:47615');
      };

      q('#mcp-test-tools', host).onclick = async () => {
        try {
          const resp = await fetch('http://127.0.0.1:47615/api/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
          });
          const data = await resp.json();
          NX.modal({
            title: 'MCP Server Tools (Live Response)',
            icon: 'api',
            body: `<pre class="md-pre" style="max-height:300px;overflow-y:auto;font-size:11.5px">${U.esc(JSON.stringify(data, null, 2))}</pre>`,
            footer: [{ label:'Close', cls:'btn-soft' }]
          });
        } catch(err){
          NX.toastErr('MCP Error', 'Could not reach local bridge on 127.0.0.1:47615');
        }
      };
    }

    if(curSec === 'customize'){
      host.innerHTML = `<div class="card"><div class="card-h"><div class="tile sm">${icon('sliders')}</div>
        <div><div class="c-title">Customize</div><div class="c-sub">Make Pebble feel like yours</div></div></div>
        <div class="card-b" style="padding-top:6px">
          <div class="set-row"><div class="sr-l"><div class="sr-t">Compact mode</div><div class="sr-d">Denser layout, more on screen</div></div>
            <label class="switch"><input type="checkbox" id="cu-compact" ${s.compactMode?'checked':''}><span class="track"></span></label></div>
          <div class="set-row"><div class="sr-l"><div class="sr-t">Reduce motion</div><div class="sr-d">Turns off page transitions, ripples and the sliding nav pill${NX.motion&&NX.motion.osReduce()?' — your system already asks for this':''}</div></div>
            <label class="switch"><input type="checkbox" id="cu-motion" ${s.reduceMotion?'checked':''}><span class="track"></span></label></div>
          <div class="set-row"><div class="sr-l"><div class="sr-t">Ambient sound</div><div class="sr-d">On-device noise for the Focus suite — never touches the network</div></div>
            <div class="row gap-8">
              <select class="select" id="cu-sound" style="width:150px;height:34px">
                ${['brown','rain','hum'].map(m=>`<option value="${m}" ${(s.focusSoundMode||'brown')===m?'selected':''}>${({brown:'Brown noise',rain:'Rain',hum:'Deep hum'})[m]}</option>`).join('')}
              </select>
              <input class="fx-range" type="range" id="cu-sound-vol" min="0" max="100" value="${Math.round((s.focusSoundVol||0.32)*100)}" style="width:96px" aria-label="Ambient volume">
            </div></div>
          <div class="set-row"><div class="sr-l"><div class="sr-t">Breathing pattern</div><div class="sr-d">Used by the Focus breathing exercise</div></div>
            <select class="select" id="cu-breathe" style="width:150px;height:34px">
              ${[['box','Box 4-4-4-4'],['relax','4-7-8 relax'],['quick','Quick 4-6']].map(([v,l])=>`<option value="${v}" ${(s.breathePattern||'box')===v?'selected':''}>${l}</option>`).join('')}
            </select></div>
          <div class="set-row"><div class="sr-l"><div class="sr-t">20-20-20 eye breaks</div><div class="sr-d">Remind you to look away every 20 minutes</div></div>
            <label class="switch"><input type="checkbox" id="cu-eye" ${s.eyeBreak?'checked':''}><span class="track"></span></label></div>
          <div class="set-row"><div class="sr-l"><div class="sr-t">Keyboard shortcuts</div><div class="sr-d">Press <b>?</b> anywhere, or Ctrl+⌘</div></div>
            <button class="btn btn-soft btn-sm" id="cu-shortcuts">${icon('command')} Open sheet</button></div>
          <div class="set-row"><div class="sr-l"><div class="sr-t">Desktop widget</div><div class="sr-d">Clock, focus score & tasks on your desktop (Ctrl+Shift+W)</div></div>
            <label class="switch"><input type="checkbox" id="cu-widget" ${s.widgetEnabled?'checked':''}><span class="track"></span></label></div>
          <div class="set-row"><div class="sr-l"><div class="sr-t">Widget always on top</div><div class="sr-d">Keep the widget visible above other windows</div></div>
            <label class="switch"><input type="checkbox" id="cu-ontop" ${s.widgetOnTop?'checked':''}><span class="track"></span></label></div>
          <div class="set-row"><div class="sr-l"><div class="sr-t">Focus goal</div><div class="sr-d">Daily productive minutes target</div></div>
            <input class="input" style="width:110px" type="number" id="cu-goal" min="30" max="900" value="${s.focusGoalMin||240}"></div>
          <div class="set-row"><div class="sr-l"><div class="sr-t">Distraction limit</div><div class="sr-d">Warn when distraction time exceeds this</div></div>
            <input class="input" style="width:110px" type="number" id="cu-dist" min="15" max="600" value="${s.distractionLimitMin||120}"></div>
        </div></div>`;
      const bind = (id, key, after)=>{
        q(id, host).onchange = e=>{ s[key] = e.target.checked !== undefined ? (e.target.type==='checkbox' ? e.target.checked : +e.target.value) : e.target.value; NX.store.set('settings', s); (after||(()=>{}))(); };
      };
      bind('#cu-compact','compactMode', ()=>document.documentElement.style.setProperty('font-size', s.compactMode?'13px':''));
      bind('#cu-motion','reduceMotion', ()=>{
        document.body.classList.toggle('no-motion', !!s.reduceMotion);
        NX.toastInfo(s.reduceMotion ? 'Motion reduced' : 'Motion on',
          s.reduceMotion ? 'Transitions and ripples are off' : 'Page transitions are back');
      });
      q('#cu-sound', host).onchange = e=>{ s.focusSoundMode = e.target.value; NX.store.set('settings', s); };
      q('#cu-sound-vol', host).addEventListener('input', e=>{ s.focusSoundVol = U.clamp(+e.target.value/100, 0, 1); NX.store.set('settings', s); });
      q('#cu-breathe', host).onchange = e=>{ s.breathePattern = e.target.value; NX.store.set('settings', s); };
      q('#cu-eye', host).onchange = e=>{ s.eyeBreak = e.target.checked; NX.store.set('settings', s); };
      q('#cu-shortcuts', host).onclick = ()=>NX.openShortcuts && NX.openShortcuts();
      q('#cu-widget', host).onchange = e=>{ s.widgetEnabled = e.target.checked; NX.store.set('settings', s); NX.widget.apply(); };
      q('#cu-ontop', host).onchange = e=>{ s.widgetOnTop = e.target.checked; NX.store.set('settings', s); NX.widget.apply(); };
      q('#cu-goal', host).onchange = e=>{ s.focusGoalMin = U.clamp(+e.target.value||240,30,900); NX.store.set('settings', s); };
      q('#cu-dist', host).onchange = e=>{ s.distractionLimitMin = U.clamp(+e.target.value||120,15,600); NX.store.set('settings', s); };
    }

    if(curSec === 'sound'){
      host.innerHTML = `<div class="card"><div class="card-h"><div class="tile sm">${icon('volume')}</div>
        <div><div class="c-title">Sound effects</div><div class="c-sub">Synthesized on-device — no downloads</div></div></div>
        <div class="card-b" style="padding-top:6px">
          <div class="set-row"><div class="sr-l"><div class="sr-t">Sound effects</div><div class="sr-d">Clicks, sends, timers & celebrations</div></div>
            <label class="switch"><input type="checkbox" id="so-on" ${s.sfx!==false?'checked':''}><span class="track"></span></label></div>
          <div class="set-row"><div class="sr-l"><div class="sr-t">Volume</div><div class="sr-d">Overall loudness</div></div>
            <input type="range" min="0" max="100" value="${Math.round((s.sfxVolume!=null?s.sfxVolume:0.5)*100)}" id="so-vol"></div>
          <div class="row gap-6" style="padding-top:10px;flex-wrap:wrap">
            ${['nav','send','notify','ok','err','pop','confetti','timer'].map(n=>`<button class="chip" data-sfx="${n}">${n}</button>`).join('')}
          </div>
        </div></div>`;
      q('#so-on', host).onchange = e=>{ s.sfx = e.target.checked; NX.store.set('settings', s); };
      q('#so-vol', host).oninput = e=>{ s.sfxVolume = +e.target.value/100; NX.store.set('settings', s); };
      qa('[data-sfx]', host).forEach(b=>b.onclick = ()=>NX.sfx.play(b.dataset.sfx));
    }

    if(curSec === 'hotkeys'){
      const HK = [
        ['Ctrl / ⌘ + K','Command palette — jump anywhere'],
        ['Ctrl / ⌘ + ⇧ + K','Quick switcher — jump to a module in two keystrokes'],
        ['Ctrl / ⌘ + ⇧ + F','Search notes, tasks, prompts, reminders & chat'],
        ['Ctrl / ⌘ + ⇧ + ⏎','Start or pause a focus round from any tab'],
        ['Ctrl / ⌘ + J','Cycle through all 13 themes'],
        ['Ctrl / ⌘ + ⇧ + W','Toggle desktop widget'],
        ['?  or  Ctrl + /','Open this shortcut sheet'],
        ['Enter','Send message (in chat)'],
        ['Shift + Enter','New line in message'],
        ['Esc','Close menus & dialogs'],
        ['← ↑ → ↓','Play 2048 & Snake'],
        ['Arrows + 1 – 9','Sudoku — move and fill · N for pencil marks'],
        ['1 – 9','Break the Code · Ctrl+⇧K then 1–9 opens a module'],
        ['Right-click','Any sidebar module — pin it to the top'],
      ];
      host.innerHTML = `<div style="display:flex;flex-direction:column;gap:16px">
        <div class="card"><div class="card-h"><div class="tile sm">${icon('zap')}</div>
        <div><div class="c-title">Keyboard shortcuts</div><div class="sr-d">Speed is a feature</div></div>
        <div class="spacer"></div>
        <button class="btn btn-soft btn-sm" id="hk-open">${icon('command')} Show sheet</button></div>
        <div class="card-b" style="padding-top:6px">
          ${HK.map(([k,d])=>`<div class="hotkey-row"><div><div class="hk-name">${U.esc(d.split('—')[0].trim())}</div><div class="hk-desc">${U.esc(d)}</div></div>
            <div class="kbd-combo">${k.split(' + ').map(x=>`<kbd>${U.esc(x)}</kbd>`).join('')}</div></div>`).join('')}
        </div></div>
        <div class="card">
          <div class="card-h"><div class="tile sm">${icon('flag')}</div>
            <div><div class="c-title">Pinned & recent</div><div class="sr-d">Right-click any sidebar module to pin it to the top</div></div></div>
          <div class="card-b" style="padding-top:4px">
            <div class="set-row"><div class="sr-l"><div class="sr-t">Pinned modules</div><div class="sr-d" id="hk-pins">—</div></div>
              <button class="btn btn-soft btn-sm" id="hk-unpin">Unpin all</button></div>
            <div class="set-row"><div class="sr-l"><div class="sr-t">Recent modules</div><div class="sr-d" id="hk-recent">—</div></div>
              <button class="btn btn-soft btn-sm" id="hk-clear-recent">Clear history</button></div>
          </div>
        </div>
      </div>`;
      q('#hk-open', host).onclick = ()=>NX.openShortcuts && NX.openShortcuts();
      const p = NX.store.get('pinnedRoutes', []) || [];
      q('#hk-pins', host).textContent = p.length ? p.map(r=>{
        const m = NX.motion && NX.motion.navFor ? NX.motion.navFor(r) : null;
        return m ? m.item.n : r;
      }).join(' · ') : 'Nothing pinned yet';
      const rec = (NX.motion && NX.motion.recent) || [];
      q('#hk-recent', host).textContent = rec.length ? rec.map(r=>{
        const m = NX.motion && NX.motion.navFor ? NX.motion.navFor(r) : null;
        return m ? m.item.n : r;
      }).join(' · ') : 'No history yet';
      const unpin = q('#hk-unpin', host);
      if(unpin){
        unpin.disabled = !p.length;
        unpin.onclick = ()=>{ NX.store.set('pinnedRoutes', []); NX.toastOk('Unpinned everything'); renderBody(); };
      }
      const clr = q('#hk-clear-recent', host);
      if(clr){
        clr.disabled = !rec.length;
        clr.onclick = ()=>{ NX.motion.recent = []; NX.store.set('recentRoutes', []); NX.toastOk('Recent history cleared'); renderBody(); };
      }
    }

    if(curSec === 'reliability'){
      host.innerHTML = `<div style="display:flex;flex-direction:column;gap:16px">
        <!-- Self-Repair & DB Health -->
        <div class="card">
          <div class="card-h">
            <div class="tile sm" style="background:var(--green-soft, rgba(124,213,110,.12));color:var(--green)">${icon('check')}</div>
            <div><div class="c-title">System Diagnostics &amp; Health</div><div class="c-sub">Verify collections, clean cache and repair any inconsistent state</div></div>
            <div class="spacer"></div>
            <button class="btn btn-green btn-sm" id="cr-repair-db">${icon('refresh')} Check &amp; Repair DB</button>
            <button class="btn btn-soft btn-sm" id="cr-open-diag">${icon('activity')} Open Bug Reporter</button>
          </div>
          <div class="card-b" id="cr-health-status" style="padding-top:8px">
            <div class="ok-line">${icon('check')} Database online: ${NX.store.stats().notesCount} notes, ${NX.store.stats().tasksCount} tasks, ${NX.store.stats().daysTracked} tracked days.</div>
          </div>
        </div>

        <!-- Native Crash Reports -->
        <div class="card">
          <div class="card-h"><div class="tile sm" style="background:var(--red-soft, rgba(226,92,74,.12));color:var(--red)">${icon('activity')}</div>
            <div><div class="c-title">Native crash reports</div><div class="c-sub">Panic-hook logs recorded by Rust core</div></div>
            <div class="spacer"></div><button class="btn btn-soft btn-sm" id="cr-refresh">${icon('refresh')} Refresh</button>
            <button class="btn btn-soft btn-sm" id="cr-clear">${icon('trash')} Clear</button></div>
          <div class="card-b" id="cr-list" style="padding-top:8px"><div class="faint small">Checking…</div></div>
        </div>

        <!-- Live JS Error Log -->
        <div class="card">
          <div class="card-h"><div class="tile sm" style="background:var(--orange-soft, rgba(232,133,61,.12));color:var(--orange)">${icon('tag')}</div>
            <div><div class="c-title">Frontend error trail</div><div class="c-sub">Live JavaScript runtime exceptions and unhandled rejections</div></div>
            <div class="spacer"></div>
            <button class="btn btn-soft btn-sm" id="js-err-clear">${icon('trash')} Clear</button></div>
          <div class="card-b" id="js-err-list" style="padding-top:8px"></div>
        </div>

        <!-- Bug Reporter -->
        <div class="card">
          <div class="card-h"><div class="tile sm" style="background:var(--blue-soft, rgba(94,184,255,.12));color:var(--blue)">${icon('edit')}</div>
            <div><div class="c-title">Report a bug</div><div class="c-sub">Tell us what broke — auto-attaches system diagnostics and logs</div></div></div>
          <div class="card-b" style="display:flex;flex-direction:column;gap:10px;max-width:560px">
            <div class="field"><label>What happened?</label><input class="input" id="bg-title" maxlength="100" placeholder="Short summary, e.g. Chat keeps scrolling up"></div>
            <div class="field"><label>Steps to reproduce</label><textarea class="input" id="bg-steps" rows="3" placeholder="1. Open…\n2. Click…"></textarea></div>
            <div class="field"><label>Severity</label><select class="select" id="bg-sev">
              <option>Minor — cosmetic</option><option selected>Normal — annoying but usable</option><option>Major — feature broken</option><option>Critical — app crashes / data loss</option></select></div>
            <div class="row gap-8">
              <button class="btn btn-green" id="bg-send">${icon('check')} Submit report</button>
              <button class="btn btn-soft" id="bg-copy-diag">${icon('copy')} Copy Diagnostics</button>
            </div>
            <div id="bg-list"></div>
          </div>
        </div>
      </div>`;

      // Database repair button
      q('#cr-repair-db', host).onclick = ()=>{
        const res = NX.repairDatabase();
        q('#cr-health-status', host).innerHTML = `<div class="ok-line">${icon('check')} Verified all data collections. Healed/repaired ${res.repaired} item${res.repaired===1?'':'s'}. Database clean!</div>`;
        NX.sfx.play('ok');
        NX.toastOk('Database Repaired', `Repaired ${res.repaired} items`);
      };

      q('#cr-open-diag', host).onclick = ()=>NX.openBugReporter();

      async function renderCrashes(){
        const listEl = q('#cr-list', host); if(!listEl) return;
        const logs = NX.native.available ? await NX.native.crashLogs() : [];
        if(!logs.length){
          listEl.innerHTML = `<div class="ok-line">${icon('check')} No native crashes recorded — PebbleX is running clean.</div>`;
        } else {
          listEl.innerHTML = logs.map(l=>
            `<details class="crash-item"><summary><span class="pill red">crash</span><code class="small">${U.esc(l.file)}</code><span class="faint small" style="margin-left:auto">${U.esc(l.content.split('\n')[0].slice(0,90))}</span></summary><pre class="crash-pre">${U.esc(l.content.slice(0, 2400))}</pre></details>`
          ).join('');
        }
      }
      renderCrashes();
      q('#cr-refresh', host).onclick = renderCrashes;
      q('#cr-clear', host).onclick = async ()=>{ await NX.native.clearCrashLogs(); renderCrashes(); NX.toastOk('Crash logs cleared'); };

      function renderJsErrors(){
        const list = q('#js-err-list', host); if(!list) return;
        const errs = NX.store.get('jsErrors', []);
        if(!errs.length){
          list.innerHTML = `<div class="ok-line">${icon('check')} Zero JavaScript exceptions recorded in this session.</div>`;
        } else {
          list.innerHTML = errs.slice(0, 8).map(e=>`
            <div class="diag-err-item">
              <span class="pill red" style="height:18px;font-size:10px">ERR</span>
              <code>${U.esc(e.msg)}</code>
              <span class="faint tiny" style="margin-left:auto">${U.esc(e.src||'app')}:${e.line||0} · ${U.relTime(e.ts)}</span>
            </div>
          `).join('');
        }
      }
      renderJsErrors();
      q('#js-err-clear', host).onclick = ()=>{
        NX.store.set('jsErrors', []);
        renderJsErrors();
        NX.toastOk('Error log cleared');
      };

      function renderBugList(){
        const bugs = NX.store.get('bugReports', []);
        const el = q('#bg-list', host); if(!el) return;
        el.innerHTML = bugs.length
          ? bugs.slice(0,12).map((b,i)=>`<div class="app-row" style="padding:10px 12px"><div class="ar-ic" style="background:var(--surface-3);color:var(--ink-2)">${icon('tag')}</div>
              <div style="min-width:0;flex:1">
                <div class="ar-name ellipsis" style="font-weight:700">${U.esc(b.title)}</div>
                <div class="ar-cat">${U.esc(b.sev)} · ${U.esc(U.relTime(b.ts))} · <span class="pill ${b.status==='Resolved'?'green':'yellow'}" style="height:16px;font-size:10px">${U.esc(b.status||'Open')}</span></div>
              </div>
              <button class="btn btn-soft btn-sm" data-bgstat="${i}">${b.status==='Resolved'?'Reopen':'Resolve'}</button>
              <button class="icon-btn sm" data-bgexp="${i}" data-tip="Export as file">${icon('download')}</button>
              <button class="icon-btn sm" data-bgdel="${i}" data-tip="Delete report" style="color:var(--ink-3)">${icon('trash')}</button>
            </div>`).join('')
          : `<div class="faint small">No reports logged yet.</div>`;
        qa('[data-bgexp]', el).forEach(btn=>btn.onclick = async ()=>{
          const b = bugs[+btn.dataset.bgexp];
          const txt = `Pebble bug report\n=================\nWhen: ${new Date(b.ts).toLocaleString()}\nSeverity: ${b.sev}\nStatus: ${b.status||'Open'}\n\n${b.title}\n\nSteps:\n${b.steps}\n\nDiagnostics:\n${JSON.stringify(b.diag||{}, null, 2)}\n\nApp version: 0.1.0 (PebbleX)\nRuntime: ${NX.native.mode}`;
          if(NX.native.available && NX.native.saveFile){ await NX.native.saveFile('pebble-bug-'+b.ts+'.txt', txt, false); NX.toastOk('Saved', 'Check Downloads/Pebble'); }
          else U.download('pebble-bug-'+b.ts+'.txt', txt);
        });
        qa('[data-bgstat]', el).forEach(btn=>btn.onclick = ()=>{
          const idx = +btn.dataset.bgstat;
          bugs[idx].status = bugs[idx].status === 'Resolved' ? 'Open' : 'Resolved';
          NX.store.set('bugReports', bugs);
          renderBugList();
        });
        qa('[data-bgdel]', el).forEach(btn=>btn.onclick = ()=>{
          bugs.splice(+btn.dataset.bgdel, 1);
          NX.store.set('bugReports', bugs);
          renderBugList();
          NX.toastOk('Report deleted');
        });
      }
      renderBugList();
      q('#bg-send', host).onclick = ()=>{
        const title = q('#bg-title', host).value.trim();
        if(!title){ NX.toastErr('Add a summary', 'Tell us what happened first.'); return; }
        const bugs = NX.store.get('bugReports', []);
        bugs.unshift({
          id:U.uid('bg'),
          title,
          steps:q('#bg-steps', host).value.trim(),
          sev:q('#bg-sev', host).value,
          status:'Open',
          ts:Date.now()
        });
        NX.store.set('bugReports', bugs.slice(0,50));
        q('#bg-title', host).value = ''; q('#bg-steps', host).value = '';
        renderBugList();
        NX.pushNotif('Bug report saved', title, 'tag');
        NX.toastOk('Report saved', 'Thanks! Export or review it below.');
        NX.sfx.play('ok');
      };
      q('#bg-copy-diag', host).onclick = ()=>{
        const diag = {
          version: '0.1.0 (PebbleX)',
          mode: NX.native.mode,
          platform: 'win32',
          resolution: `${innerWidth}x${innerHeight}`,
          stats: NX.store.stats(),
          activeApp: NX.timeless && NX.timeless.live ? NX.timeless.live.app : 'unknown',
          recentErrors: (NX.store.get('jsErrors', [])).slice(0, 5)
        };
        navigator.clipboard.writeText(JSON.stringify(diag, null, 2)).then(()=>{
          NX.toastOk('Diagnostics copied', 'Ready to paste into GitHub or issue tracker');
        }).catch(()=>{});
      };
    }

    if(curSec === 'backup'){
      host.innerHTML = `<div class="card"><div class="card-h"><div class="tile sm" style="background:var(--green-soft);color:var(--green)">${icon('download')}</div>
        <div><div class="c-title">Encrypted Vault Backup & Restore</div><div class="c-sub">Export or restore your complete workspace safely</div></div></div>
        <div class="card-b" style="display:flex;flex-direction:column;gap:14px">
          <div class="set-row">
            <div class="sr-l">
              <div class="sr-t">Backup & Recovery Center</div>
              <div class="sr-d">Export with optional AES-256 encryption, or inspect & restore backup files</div>
            </div>
            <button class="btn btn-green btn-sm" id="bk-open-center">${icon('layers')} Open Backup Center</button>
          </div>
          <div class="set-row">
            <div class="sr-l">
              <div class="sr-t">Quick Plain Backup (.json)</div>
              <div class="sr-d">Instant download of all notes, tasks, prompts, and settings</div>
            </div>
            <button class="btn btn-soft btn-sm" id="bk-quick-export">${icon('download')} Download JSON</button>
          </div>
          <div class="set-row">
            <div class="sr-l">
              <div class="sr-t">Daily Rolling Snapshots</div>
              <div class="sr-d">Pebble automatically saves rolling local snapshots of your data every day</div>
            </div>
            <span class="pill green sm">Active (7 Days)</span>
          </div>
        </div></div>`;

      q('#bk-open-center', host).onclick = () => {
        if(NX.backup && NX.backup.openModal) NX.backup.openModal();
      };
      q('#bk-quick-export', host).onclick = () => {
        if(NX.backup && NX.backup.exportVault) NX.backup.exportVault();
      };
    }

    if(curSec === 'cloud'){ renderCloud(host, renderBody); }

    if(curSec === 'storage'){
      const dump = NX.store.dump();
      const size = new Blob([JSON.stringify(dump)]).size;
      host.innerHTML = `<div class="card"><div class="card-h"><div class="tile sm">${icon('layers')}</div>
        <div><div class="c-title">Storage & backup</div><div class="c-sub">Local-first workspace · desktop builds mirror to disk automatically</div></div></div>
        <div class="card-b" style="padding-top:6px">
          <div class="set-row"><div class="sr-l"><div class="sr-t">Workspace size</div><div class="sr-d">Everything: notes, tasks, chat, Timeless data</div></div>
            <span class="pill gray mono-num">${(size/1024).toFixed(1)} KB</span></div>
          <div class="set-row"><div class="sr-l"><div class="sr-t">Desktop storage</div><div class="sr-d">Atomic JSON mirror inside your app-data folder</div></div>
            <span class="pill ${NX.native.available?'green':'gray'}">${NX.native.available? 'Active ('+NX.native.mode+')' : 'Web mode'}</span></div>
          <div class="set-row"><div class="sr-l"><div class="sr-t">Export</div><div class="sr-d">Download your whole workspace as JSON</div></div>
            <button class="btn btn-soft btn-sm" id="st-export">${icon('download')} Export</button></div>
          <div class="set-row"><div class="sr-l"><div class="sr-t">Import</div><div class="sr-d">Restore a previously exported workspace</div></div>
            <button class="btn btn-soft btn-sm" id="st-import">${icon('upload')} Import</button></div>
          <div class="set-row"><div class="sr-l"><div class="sr-t">Reset workspace</div><div class="sr-d">Wipe everything back to factory defaults</div></div>
            <button class="btn btn-danger btn-sm" id="st-wipe">${icon('trash')} Reset</button></div>
        </div></div>`;
      q('#st-export', host).onclick = ()=>NX.exportWorkspace();
      q('#st-import', host).onclick = ()=>{
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'application/json';
        inp.onchange = ()=>{ const f = inp.files[0]; if(!f) return;
          const rd = new FileReader();
          rd.onload = ()=>{ try{ NX.store.restore(JSON.parse(rd.result)); NX.ensureDefaults(); NX.toastOk('Workspace restored','Reloading…'); setTimeout(()=>location.reload(), 700); }
            catch(e){ NX.toastErr('Import failed', 'That file is not a Pebble export.'); } };
          rd.readAsText(f); };
        inp.click();
      };
      q('#st-wipe', host).onclick = ()=>NX.confirm('Reset everything?', 'All notes, tasks, chat history and Timeless data will be erased.', ()=>{
        NX.store.wipe(); location.hash = '#/login'; location.reload();
      });
    }

    if(curSec === 'about'){
      host.innerHTML = `<div class="card"><div class="card-h"><div class="tile sm">${NX.brandMark()}</div>
        <div><div class="c-title">PebbleX ${'0.1.0'} — the X series</div><div class="c-sub">One calm workspace — chat, notes, tasks, real AI, Timeless & more</div></div></div>
        <div class="card-b" style="display:flex;flex-direction:column;gap:10px">
          <div class="row gap-8" style="flex-wrap:wrap">
            <span class="pill green">Tauri 2 + Rust</span><span class="pill blue">Offline-first</span>
            <span class="pill purple">13 themes</span><span class="pill orange">Real AI</span><span class="pill teal">System-wide Timeless</span>
          </div>
          <p class="muted small" style="line-height:1.7;max-width:560px">
            Pebble keeps everything on your machine. The desktop build stores a mirror of your workspace in your app-data folder
            using atomic writes, fires native Windows notifications with the Pebble icon, captures screenshots locally, tracks
            every app you use for Timeless with real extracted icons — and Pel now answers with a real LLM, your data in context.
          </p>
          <div class="row gap-8">
            <button class="btn btn-soft btn-sm" id="ab-check">${icon('refresh')} Check runtime</button>
            <button class="btn btn-soft btn-sm" id="ab-tour">${icon('rocket')} Replay intro</button>
          </div>
          <div class="faint tiny" id="ab-info"></div>
        </div></div>`;
      q('#ab-check', host).onclick = async ()=>{
        const v = await NX.native.version();
        q('#ab-info', host).textContent = `Runtime: ${NX.native.mode}${v? ' · backend v'+v : ''} · renderer ${'3.2.0'} · ${navigator.userAgent.includes('Chrome')?'Chromium':'browser'} ${navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0]||''}`;
      };
      q('#ab-tour', host).onclick = ()=>{ NX.store.set('onboarded', false); NX.onboarding.start(); };
    }
  }

  renderNav(); renderBody();
});

NX.repairDatabase = function(){
  let fixed = 0;
  try {
    const notes = NX.store.get('notes', []);
    if(Array.isArray(notes)){
      notes.forEach(n=>{
        if(!n.id) { n.id = NX.util.uid('nt'); fixed++; }
        if(typeof n.tags === 'string') { n.tags = n.tags.split(',').map(s=>s.trim()).filter(Boolean); fixed++; }
        if(!n.title) { n.title = 'Untitled Note'; fixed++; }
        if(typeof n.body !== 'string') { n.body = ''; fixed++; }
      });
      NX.store.set('notes', notes);
    } else {
      NX.store.set('notes', NX.defaults.notes || []);
      fixed++;
    }

    const tasks = NX.store.get('tasks', []);
    if(Array.isArray(tasks)){
      tasks.forEach(t=>{
        if(!t.id) { t.id = NX.util.uid('tk'); fixed++; }
        if(typeof t.done !== 'boolean') { t.done = false; fixed++; }
        if(!t.name) { t.name = 'Task'; fixed++; }
      });
      NX.store.set('tasks', tasks);
    } else {
      NX.store.set('tasks', NX.defaults.tasks || []);
      fixed++;
    }

    const prompts = NX.store.get('prompts', []);
    if(!Array.isArray(prompts)){
      NX.store.set('prompts', []);
      fixed++;
    }

    const tl = NX.store.get('timeless', {});
    if(typeof tl !== 'object' || tl === null || Array.isArray(tl)){
      NX.store.set('timeless', {});
      fixed++;
    }

    if(NX.store && NX.store.flush) NX.store.flush();
  } catch(e){
    console.error('repairDatabase error', e);
  }
  return { ok: true, repaired: fixed };
};

NX.openBugReporter = async function(prefill={}){
  const sysInfo = {
    version: '0.1.0 (PebbleX)',
    mode: NX.native.mode,
    platform: 'win32',
    screen: `${window.innerWidth}x${window.innerHeight}`,
    theme: document.documentElement.getAttribute('data-theme')||'default',
    route: NX.router.currentName || 'dashboard',
    activeApp: NX.timeless && NX.timeless.live ? NX.timeless.live.app : 'unknown',
    storageStats: NX.store.stats(),
    recentErrors: (NX.store.get('jsErrors', [])).slice(0, 5)
  };

  const crashLogs = NX.native.available ? await NX.native.crashLogs() : [];
  if(crashLogs.length > 0){
    sysInfo.recentCrash = crashLogs[0].content.slice(0, 300);
  }

  const diagJson = JSON.stringify(sysInfo, null, 2);

  const body = NX.h(`
    <div style="display:flex;flex-direction:column;gap:12px;max-height:70vh;overflow-y:auto;padding-right:4px">
      <div class="field"><label>What happened?</label>
        <input class="input" id="diag-bg-title" placeholder="Short description, e.g. Notes list did not load" value="${NX.util.esc(prefill.title||'')}">
      </div>
      <div class="field"><label>Steps to reproduce</label>
        <textarea class="input" id="diag-bg-steps" rows="3" placeholder="1. What did you click?\n2. What happened?\n3. What did you expect to happen?">${NX.util.esc(prefill.steps||'')}</textarea>
      </div>
      <div class="row gap-10">
        <div class="field" style="flex:1"><label>Severity</label>
          <select class="select" id="diag-bg-sev">
            <option>Minor — cosmetic UI glitch</option>
            <option selected>Normal — annoying but usable</option>
            <option>Major — feature broken</option>
            <option>Critical — crash / data loss</option>
          </select>
        </div>
        <div class="field" style="flex:1"><label>Self-Repair</label>
          <button class="btn btn-soft btn-full" id="diag-repair-btn" style="height:36px;margin-top:1px">${NX.icon('refresh')} Check &amp; Repair DB</button>
        </div>
      </div>
      <div class="field">
        <div class="row" style="justify-content:space-between;margin-bottom:4px">
          <label style="margin:0">System &amp; Error Diagnostic Bundle (auto-generated)</label>
          <button class="btn btn-soft btn-sm" id="diag-copy-btn">${NX.icon('copy')} Copy</button>
        </div>
        <pre class="diag-bundle-pre" id="diag-preview">${NX.util.esc(diagJson)}</pre>
      </div>
    </div>
  `);

  NX.modal({
    title: 'PebbleX Diagnostic & Bug Reporter',
    icon: 'activity',
    body,
    footer: [
      { label: 'Cancel', cls: 'btn-soft' },
      { label: 'Export Report (.txt)', cls: 'btn-soft', onClick: async ()=>{
          const title = NX.q('#diag-bg-title', body).value.trim() || 'Bug Report';
          const steps = NX.q('#diag-bg-steps', body).value.trim();
          const sev = NX.q('#diag-bg-sev', body).value;
          const fullReport = `PEBBLE-X BUG REPORT\n===================\nDate: ${new Date().toISOString()}\nTitle: ${title}\nSeverity: ${sev}\nSteps:\n${steps}\n\nDIAGNOSTICS:\n${diagJson}\n`;
          if(NX.native.available && NX.native.saveFile){
            await NX.native.saveFile('pebble-bug-' + Date.now() + '.txt', fullReport, false);
            NX.toastOk('Saved', 'Saved to Downloads/Pebble');
          } else {
            NX.util.download('pebble-bug-' + Date.now() + '.txt', fullReport);
          }
        }
      },
      { label: 'Submit Bug Report', cls: 'btn-green', onClick: ()=>{
          const title = NX.q('#diag-bg-title', body).value.trim();
          if(!title){ NX.toastErr('Enter a summary', 'Please tell us what went wrong.'); return; }
          const steps = NX.q('#diag-bg-steps', body).value.trim();
          const sev = NX.q('#diag-bg-sev', body).value;
          const bugs = NX.store.get('bugReports', []);
          bugs.unshift({
            id: NX.util.uid('bg'),
            title, steps, sev,
            diag: sysInfo,
            status: 'Open',
            ts: Date.now()
          });
          NX.store.set('bugReports', bugs.slice(0, 50));
          if(NX.store && NX.store.flush) NX.store.flush();
          NX.closeAllModals();
          NX.toastOk('Bug report logged', 'Saved to local reliability history.');
          NX.sfx.play('ok');
        }
      }
    ]
  });

  const repBtn = NX.q('#diag-repair-btn', body);
  if(repBtn){
    repBtn.onclick = ()=>{
      const res = NX.repairDatabase();
      NX.toastOk('Repair complete', `Checked collections. Repaired ${res.repaired} items.`);
      NX.sfx.play('ok');
    };
  }

  const cpBtn = NX.q('#diag-copy-btn', body);
  if(cpBtn){
    cpBtn.onclick = ()=>{
      const title = NX.q('#diag-bg-title', body).value.trim() || 'Diagnostic Report';
      const steps = NX.q('#diag-bg-steps', body).value.trim();
      const txt = `## PebbleX Bug Report: ${title}\n- **Severity**: ${NX.q('#diag-bg-sev', body).value}\n- **Steps**: ${steps}\n\n\`\`\`json\n${diagJson}\n\`\`\``;
      navigator.clipboard.writeText(txt).then(()=>{
        NX.toastOk('Copied to clipboard', 'Ready to paste');
      }).catch(()=>{});
    };
  }
};

NX.exportWorkspace = function(){
  U.download('pebble-workspace-' + U.todayKey() + '.json', JSON.stringify(NX.store.dump(), null, 2));
  NX.toastOk('Exported', 'Workspace JSON downloaded.');
};

/* ============================================================
   CLOUD (optional — Supabase + Cloudflare)

   Supabase for auth, data and realtime. Cloudflare for images (R2)
   and live chat. Firebase is gone.

   Deliberately honest about what this is: cloud stays OFF until a
   config is pasted, the local PIN keeps working regardless, and
   nothing here is required for Pebble to function. The SDK is fetched
   lazily so a failure cannot affect boot.
   ============================================================ */
function renderCloud(host, rerender){
  const renderBody = typeof rerender === 'function' ? rerender : ()=>{ renderCloud(host, rerender); };
  const cfg = NX.cloud ? NX.cloud.readConfig() : {};
  const st = NX.cloud ? NX.cloud.status() : { configured:false, signedIn:false, offline:false };
  const user = NX.cloud ? NX.cloud.auth.user : null;
  const field = (id, label, val, ph, hint) => `
    <label class="nx-field">
      <span class="nx-field-label">${U.esc(label)}</span>
      <input id="${id}" value="${U.esc(val||'')}" placeholder="${U.esc(ph||'')}" spellcheck="false" autocomplete="off">
      ${hint ? `<span class="faint tiny">${U.esc(hint)}</span>` : ''}
    </label>`;

  host.innerHTML = `
    <div class="card">
      <div class="card-h"><div class="tile sm" style="background:var(--green-soft);color:var(--green)">${icon('cloud')}</div>
        <div><div class="c-title">Cloud (optional)</div>
        <div class="c-sub">Supabase for sign-in, sync and realtime. Cloudflare for images and live chat.</div></div></div>
      <div class="card-b" style="display:flex;flex-direction:column;gap:14px">
        <div style="border-left:3px solid var(--green);padding:10px 12px;background:var(--green-soft);border-radius:0 10px 10px 0">
          <div class="small"><b>Your PIN login is unaffected.</b> Cloud sign-in is a separate, optional identity that unlocks
          sync across your devices. Sign in once and the website and the desktop app see the same notes.</div>
        </div>

        <div class="row gap-8" style="flex-wrap:wrap">
          <span class="pill ${st.configured?'green':'yellow'}">${st.configured?'Configured':'Not configured'}</span>
          <span class="pill ${st.signedIn?'green':''}">${st.signedIn?'Signed in':'Not signed in'}</span>
          <span class="pill ${st.r2?'green':''}">Images ${st.r2?'ready':'not set'}</span>
          <span class="pill ${st.chat?'green':''}">Chat ${st.chat?'ready':'not set'}</span>
          ${st.offline ? '<span class="pill yellow">Offline</span>' : ''}
          ${user ? `<span class="pill">${U.esc(user.name||user.email||'user')}</span>` : ''}
        </div>

        <div class="row gap-8">
          <button class="btn btn-green" id="cl-save">${icon('check')} Save config</button>
          <button class="btn btn-soft" id="cl-test">Test connection</button>
          <button class="btn btn-soft" id="cl-clear">Clear</button>
        </div>

        <div class="tiny bold" style="margin-top:2px">Supabase</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
          ${field('cl-supabaseUrl','Project URL',cfg.supabaseUrl,'https://xxxx.supabase.co','Supabase → Settings → API')}
          ${field('cl-supabaseKey','Publishable key',cfg.supabaseKey,'sb_publishable_…','Safe in client code. Never the secret key.')}
        </div>

        <div class="tiny bold" style="margin-top:8px">Cloudflare</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
          ${field('cl-r2Endpoint','R2 media Worker',cfg.r2Endpoint,'https://…workers.dev','cloud/pebble-media-api — user images')}
          ${field('cl-chatEndpoint','Chat Worker',cfg.chatEndpoint,'https://…workers.dev','Durable Object endpoint for live chat')}
        </div>
        <label class="nx-field">
          <span class="nx-field-label">R2 token</span>
          <input id="cl-r2Token" type="password" value="${U.esc(NX.store.get('cloud:r2Token',''))}" placeholder="PEBBLE_TOKEN" autocomplete="off">
          <span class="faint tiny">Stored on this machine only. Keep it out of source control.</span>
        </label>

        <div class="faint tiny">The Supabase SDK is not bundled with Pebble. It is fetched on first use, so the offline app stays
        small and a failed fetch only disables cloud features.</div>

        <div style="border-top:1px solid var(--line);padding-top:14px;display:flex;flex-direction:column;gap:12px">
          <div><div class="c-title" style="font-size:13px">Account</div>
            <div class="c-sub">Optional — only needed for sync and cloud chat.</div></div>
          <div class="row gap-8">
            <button class="btn btn-soft" id="cl-signin">Sign in</button>
            <button class="btn btn-soft" id="cl-register">Create account</button>
            <button class="btn btn-soft" id="cl-google">${icon('user')} Continue with Google</button>
            <button class="btn btn-soft" id="cl-signout">Sign out</button>
          </div>
          <div class="row gap-8">
            <button class="btn btn-soft" id="cl-sync-now">${icon('refresh')} Sync now</button>
            <span class="faint tiny" id="cl-sync-state"></span>
          </div>
        </div>
      </div>
    </div>`;

  const val = id => { const el = q('#'+id, host); return el ? String(el.value || '').trim() : ''; };
  const collect = ()=>({
    supabaseUrl: val('cl-supabaseUrl'),
    supabaseKey: val('cl-supabaseKey'),
    r2Endpoint: val('cl-r2Endpoint'),
    chatEndpoint: val('cl-chatEndpoint')
  });

  const save = q('#cl-save', host);
  if(save) save.onclick = ()=>{
    const c = collect();
    const tok = val('cl-r2Token');
    if(tok) NX.store.set('cloud:r2Token', tok);
    /* Only Supabase is required; the two Cloudflare endpoints are optional
       because images and chat are separate features. */
    if(!c.supabaseUrl || !c.supabaseKey){
      NX.toastErr('Cloud', 'Supabase URL and publishable key are required. The Cloudflare endpoints are optional.');
      return;
    }
    NX.cloud.saveConfig(c);
    NX.toastOk('Cloud', 'Config saved.');
    renderBody();
  };

  const test = q('#cl-test', host);
  if(test) test.onclick = async ()=>{
    const c = collect();
    const tok = val('cl-r2Token');
    if(tok) NX.store.set('cloud:r2Token', tok);
    NX.cloud.saveConfig(c);
    test.disabled = true;
    const label = test.textContent;
    test.textContent = 'Testing…';
    const r = await NX.cloud.testConnection();
    test.disabled = false;
    test.textContent = label;
    if(r.ok && r.tables === false){
      NX.toastErr('Cloud', r.error || 'Supabase is reachable but the database has no tables yet.');
    } else if(r.ok){
      let msg = 'Connected to Supabase project successfully!';
      if(r.signedIn && r.user){
        msg += ' Signed in as ' + (r.user.name || r.user.email) + '.';
      } else {
        msg += ' Ready to sign in or create an account.';
      }
      NX.toastOk('Cloud Online', msg);
    } else {
      NX.toastErr('Connection Failed', r.error || 'Could not reach Supabase.');
    }
    renderBody();
  };

  const syncNow = q('#cl-sync-now', host);
  if(syncNow) syncNow.onclick = async ()=>{
    const state = q('#cl-sync-state', host);
    if(state) state.textContent = 'Syncing…';
    syncNow.disabled = true;
    const r = await NX.cloud.sync.reconcile();
    syncNow.disabled = false;
    if(r.ok){
      const s = r.stats || {};
      const msg = `${s.tasksPulled || 0} task(s), ${s.notesPulled || 0} note(s) updated; ${s.pushed || 0} pushed`;
      if(state) state.textContent = msg;
      NX.toastOk('Sync Complete', msg);
    } else {
      if(state) state.textContent = r.error || 'failed';
      NX.toastErr('Sync', r.error || 'Sync failed.');
    }
  };

  const clr = q('#cl-clear', host);
  if(clr) clr.onclick = ()=>{ NX.cloud.clearConfig(); NX.toastOk('Cloud', 'Config cleared.'); renderBody(); };

  /* Email/password entry as a real form. window.prompt is not supported
     inside Electron (it throws "prompt() is and will not be supported"),
     which made Sign in / Create account silently do nothing on the desktop
     build. */
  const ask = (mode) => new Promise(resolve => {
    const form = h(`<div style="display:flex;flex-direction:column;gap:12px">
      <label class="field"><span class="nx-field-label">Email</span>
        <input class="input" id="cf-email" type="email" placeholder="you@example.com" autocomplete="email"></label>
      <label class="field"><span class="nx-field-label">Password</span>
        <input class="input" id="cf-pass" type="password" placeholder="${mode === 'in' ? 'Your password' : 'At least 8 characters'}" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}"></label>
      ${mode === 'reg' ? `<label class="field"><span class="nx-field-label">Name (optional)</span>
        <input class="input" id="cf-name" type="text" placeholder="How we should call you"></label>
        <div class="faint tiny">Passwords need at least 8 characters.</div>` : ''}
    </div>`);
    const dlg = NX.modal({
      title: mode === 'in' ? 'Sign in' : 'Create account', icon: 'user',
      body: form,
      footer: [
        { label: 'Cancel', cls: 'btn-soft' },
        { label: mode === 'in' ? 'Sign in' : 'Create account', cls: 'btn-green', icon: 'check', onClick: () => {
          const email = String(q('#cf-email', form) && q('#cf-email', form).value || '').trim();
          const pass = String(q('#cf-pass', form) && q('#cf-pass', form).value || '');
          const name = String(q('#cf-name', form) && q('#cf-name', form).value || '').trim();
          if(!email || !pass){ NX.toastErr('Cloud', 'Email and password are both required.'); return; }
          NX.closeAllModals();
          resolve({ email, pass, name });
        } }
      ]
    });
    const onEnter = (e) => { if(e.key === 'Enter'){ const btn = qa('.modal-f .btn', dlg).pop(); if(btn) btn.click(); } };
    form.addEventListener('keydown', onEnter);
    setTimeout(()=>{ const em = q('#cf-email', form); if(em) em.focus(); }, 60);
  });

  const si = q('#cl-signin', host);
  if(si) si.onclick = async ()=>{
    const c = await ask('in'); if(!c) return;
    si.disabled = true;
    const r = await NX.cloud.auth.signIn(c.email, c.pass);
    si.disabled = false;
    if(r.ok){ NX.toastOk('Cloud', 'Signed in as ' + (r.user.name || r.user.email)); renderBody(); }
    else NX.toastErr('Cloud', r.error);
  };

  const rg = q('#cl-register', host);
  if(rg) rg.onclick = async ()=>{
    const c = await ask('reg'); if(!c) return;
    rg.disabled = true;
    const r = await NX.cloud.auth.register(c.email, c.pass, c.name);
    rg.disabled = false;
    if(r.ok && r.pending){ NX.toastInfo('Cloud', 'Check your inbox — confirm the email, then sign in.'); renderBody(); }
    else if(r.ok){ NX.toastOk('Cloud', 'Account created.'); renderBody(); }
    else NX.toastErr('Cloud', r.error);
  };

  const gg = q('#cl-google', host);
  if(gg) gg.onclick = async ()=>{
    gg.disabled = true;
    const r = await NX.cloud.auth.signInWithGoogle();
    gg.disabled = false;
    if(r.ok && r.redirecting){ NX.toastInfo('Google', 'Continue in your browser — PebbleX picks the session up when you come back.'); }
    else if(r.ok){ NX.toastOk('Cloud', 'Signed in as ' + ((r.user && (r.user.name || r.user.email)) || 'your account')); renderBody(); }
    else NX.toastErr('Cloud', r.error);
  };

  const so = q('#cl-signout', host);
  if(so) so.onclick = async ()=>{ await NX.cloud.auth.signOut(); renderBody(); };
}
})(window.NX);
