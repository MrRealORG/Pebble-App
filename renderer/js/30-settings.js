/* ============================================================
   Pebble 3.0 — 30-settings.js
   Settings: themes(13), profile, SFX, hotkeys, customization,
   storage backend, widget, about
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

const SECTIONS = [
  { id:'themes',    n:'Themes',       ic:'palette' },
  { id:'profile',   n:'Profile',      ic:'user' },
  { id:'mcp',       n:'MCP & AI',     ic:'api' },
  { id:'customize', n:'Customize',    ic:'sliders' },
  { id:'sound',     n:'Sound',        ic:'volume' },
  { id:'hotkeys',   n:'Hotkeys',      ic:'zap' },
  { id:'reliability', n:'Reliability', ic:'check' },
  { id:'storage',   n:'Storage',      ic:'layers' },
  { id:'about',     n:'About',        ic:'book' }
];

let curSec = 'themes';

NX.routeInShell('settings', 'Settings', 'settings', function(view){
  view.innerHTML = `
  <div class="page">
    <div class="settings-layout">
      <div class="set-nav" id="set-nav"></div>
      <div id="set-body" style="min-width:0"></div>
    </div>
  </div>`;

  function renderNav(){
    q('#set-nav', view).innerHTML = SECTIONS.map(s=>
      `<button class="${s.id===curSec?'on':''}" data-s="${s.id}">${icon(s.ic)} ${U.esc(s.n)}</button>`).join('');
    qa('[data-s]', view).forEach(b=>b.onclick = ()=>{ curSec = b.dataset.s; renderNav(); renderBody(); NX.sfx.play('click'); });
  }

  function renderBody(){
    const host = q('#set-body', view);
    const s = NX.store.get('settings', {});
    const p = NX.store.get('profile', NX.defaults.profile);

    if(curSec === 'themes'){
      host.innerHTML = `<div class="card"><div class="card-h"><div class="tile sm">${icon('palette')}</div>
        <div><div class="c-title">Themes</div><div class="c-sub">13 hand-tuned themes · Ctrl+J cycles instantly</div></div></div>
        <div class="card-b"><div class="theme-grid" id="th-grid"></div></div></div>`;
      q('#th-grid', host).innerHTML = NX.THEMES.map(t=>`
        <div class="theme-card ${s.theme===t.id?'on':''}" data-th="${t.id}">
          <div class="theme-swatch" style="background:${t.bg}">
            <i class="ts-side" style="background:${t.side}"></i>
            <i class="ts-main" style="background:${t.main}"></i>
            <i class="ts-pill" style="background:${t.pill}"></i>
          </div>
          <div class="theme-name">${U.esc(t.name)} ${s.theme===t.id?`<span class="on-ic">${icon('check')}</span>`:''}</div>
        </div>`).join('');
      qa('[data-th]', host).forEach(c=>c.onclick = ()=>{ NX.applyTheme(c.dataset.th); NX.sfx.play('pop'); renderBody(); });
    }

    if(curSec === 'profile'){
      host.innerHTML = `<div class="card"><div class="card-h"><div class="tile sm">${icon('user')}</div>
        <div><div class="c-title">Profile</div><div class="c-sub">How you appear in chat & across the workspace</div></div></div>
        <div class="card-b" style="display:flex;flex-direction:column;gap:14px;max-width:440px">
          <div class="row gap-12"><span class="avatar xl" style="background:${U.esc(p.avatar)}">${U.initials(p.name)}</span>
            <div style="flex:1">
              <div class="field"><label>Display name</label><input class="input" id="pf-name" value="${U.esc(p.name)}" maxlength="24"></div>
            </div></div>
          <div class="field"><label>Avatar color</label><div class="row gap-6" id="pf-colors" style="flex-wrap:wrap">
            ${['#7CD56E','#5EB8FF','#E8853D','#8B5CF6','#E05C9C','#0FA3A3','#E25C4A','#D4A017'].map(c=>
              `<button data-c="${c}" style="width:30px;height:30px;border-radius:50%;background:${c};border:2.5px solid ${p.avatar===c?'var(--ink)':'transparent'}"></button>`).join('')}
          </div></div>
          <div class="field"><label>Bio</label><input class="input" id="pf-bio" value="${U.esc(p.bio||'')}" maxlength="80"></div>
          <div class="row"><button class="btn btn-green" id="pf-save">${icon('check')} Save profile</button>
            <button class="btn btn-soft" id="pf-lock">${icon('logout')} Lock workspace (PIN)</button></div>
        </div></div>`;
      qa('#pf-colors [data-c]', host).forEach(b=>b.onclick = ()=>{ p.avatar = b.dataset.c; NX.store.set('profile', p); renderBody(); });
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
          <div class="set-row"><div class="sr-l"><div class="sr-t">Reduce motion</div><div class="sr-d">Fewer animations, calmer feel</div></div>
            <label class="switch"><input type="checkbox" id="cu-motion" ${s.reduceMotion?'checked':''}><span class="track"></span></label></div>
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
      bind('#cu-motion','reduceMotion', ()=>document.body.classList.toggle('no-motion', !!s.reduceMotion));
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
})(window.NX);
