/* ============================================================
   PebbleX — 46-store.js
   Entitlements + the Store route: unlockable themes, gated games,
   avatar/frame/title cosmetics.

   Two rules that are easy to break and were broken before:
     1. cycleTheme (Ctrl+J) must SKIP locked themes, or the hotkey
        looks broken.
     2. applyTheme on boot must be able to force, or a locked-but-
        saved theme bricks startup.
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

const KEY = 'entitlements';

/* ============================================================
   PRICING
   ============================================================ */
const THEME_TIERS = { common: 150, rare: 350, legendary: 700 };
const GAME_TIERS  = { common: 100, mid: 200, deep: 350, premium: 500 };

/* Which games are free. The signature game plus the one everybody
   understands, so the arcade is never a wall of padlocks. */
const FREE_GAMES = ['gm_2048', 'gm_snake'];

/* Themes the CSS already supports and everyone gets. A workspace you
   cannot re-theme at all feels broken. */
const FREE_THEMES = ['elera', 'pebble-dark', 'midnight', 'nord'];

const THEME_TIER = {
  forest:'common', rose:'common', ocean:'common', mono:'common',
  sunset:'rare', candy:'rare', coffee:'rare', slate:'rare',
  neon:'legendary'
};
const GAME_TIER = {
  gm_mem:'common', gm_react:'common', gm_click:'common', gm_simon:'common',
  gm_word:'mid', gm_math:'mid', gm_aim:'mid', gm_type:'mid',
  gm_mine:'deep', gm_sudoku:'deep', gm_stroop:'deep', gm_code:'deep',
  gm_wordle:'premium', gm_2048r:'premium', gm_minex:'premium'
};

const FRAMES = [
  { id:'none',   name:'None' },
  { id:'ring',   name:'Ring' },
  { id:'glow',   name:'Glow' },
  { id:'double', name:'Double' },
  { id:'dash',   name:'Dashed' }
];
const FRAME_PRICE = { ring:100, glow:200, double:250, dash:150 };

/* ============================================================
   ENTITLEMENTS
   ============================================================ */
function blank(){
  return { owned:{}, equipped:{}, avatarImg:null, frame:'none', title:null, showcase:[] };
}
let mem = null;
function ent(){
  if(mem) return mem;
  const raw = NX.store.get(KEY, null);
  mem = (raw && typeof raw === 'object') ? Object.assign(blank(), raw) : blank();
  if(!mem.owned || typeof mem.owned !== 'object') mem.owned = {};
  if(!mem.equipped || typeof mem.equipped !== 'object') mem.equipped = {};
  if(!Array.isArray(mem.showcase)) mem.showcase = [];
  return mem;
}
function save(){
  NX.store.set(KEY, mem);
  NX.events.emit('store:entitlements', mem);
}

/* ---------------------------------------------------------- */

/** Stable per-install id. NOT authentication and NOT a username —
    it exists only so purchases and league rows have a key. */
function pid(){
  const p = NX.store.get('profile', NX.defaults.profile);
  if(p && p.pid) return p.pid;
  const gen = 'p_' + Math.random().toString(16).slice(2,10) + Date.now().toString(16).slice(-4);
  const cur = NX.store.get('profile', NX.defaults.profile);
  cur.pid = gen;
  NX.store.set('profile', cur);
  return gen;
}

function priceOfTheme(id){
  if(FREE_THEMES.indexOf(id) !== -1) return 0;
  return THEME_TIERS[THEME_TIER[id] || 'common'];
}
function priceOfGame(id){
  if(FREE_GAMES.indexOf(id) !== -1) return 0;
  return GAME_TIERS[GAME_TIER[id] || 'common'];
}

/** The single gate everything else asks. key forms:
      'theme:neon' · 'game:gm_sudoku' · 'frame:glow' · 'title:x' */
NX.store = NX.store || {};
NX.store.isUnlocked = function(key){
  if(!key) return false;
  const [kind, id] = String(key).split(':');
  if(kind === 'theme') return FREE_THEMES.indexOf(id) !== -1 || !!ent().owned['theme:' + id];
  if(kind === 'game')  return FREE_GAMES.indexOf(id) !== -1 || !!ent().owned['game:' + id];
  if(kind === 'frame') return id === 'none' || !!ent().owned['frame:' + id];
  if(kind === 'title') return !!ent().owned['title:' + id];
  /* anything the player owns explicitly */
  return !!ent().owned[key];
};

NX.store.priceOf = function(kind, id){
  if(kind === 'theme') return priceOfTheme(id);
  if(kind === 'game') return priceOfGame(id);
  if(kind === 'frame') return FRAME_PRICE[id] || 0;
  return 0;
};

NX.store.unlock = function(key, opts){
  const s = ent();
  if(s.owned[key]) return true;
  const [kind, id] = String(key).split(':');
  const price = NX.store.priceOf(kind, id);
  if(price > 0){
    if(!(NX.points && NX.points.spend(price, key))){
      if(!opts || !opts.silent) NX.toastErr('Not enough points', 'You need ' + price + ' to unlock this.');
      return false;
    }
  }
  s.owned[key] = Date.now();
  save();
  if(kind === 'game' && opts && opts.autoLaunch){
    setTimeout(()=>{ NX.launchGame && NX.launchGame(id, true); }, 260);
  }
  return true;
};

/** Spend only through a confirm — never a single click. */
NX.store.purchase = function(kind, id, opts){
  const key = kind + ':' + id;
  if(NX.store.isUnlocked(key)){
    if(opts && opts.onOwned) opts.onOwned();
    return;
  }
  const price = NX.store.priceOf(kind, id);
  const bal = NX.points ? NX.points.balance() : 0;
  const label = (opts && opts.label) || id;
  const enough = bal >= price;

  NX.modal({
    title: 'Unlock ' + label + '?',
    icon: kind === 'theme' ? 'palette' : (kind === 'game' ? 'game' : 'star'),
    body: `<p style="font-size:13.5px;color:var(--ink-2);line-height:1.6">
        Unlocking <b style="color:var(--ink)">${U.esc(label)}</b> costs
        <b style="color:var(--green-ink)">${price} points</b>.
        ${enough ? '' : `You have <b style="color:var(--ink)">${bal}</b> — ${price - bal} short.`}
      </p>`,
    footer:[
      { label:'Cancel', cls:'btn-soft' },
      { label: enough ? 'Unlock' : 'Not enough', cls: enough ? 'btn-green' : 'btn-soft',
        onClick(){
          if(!enough){ NX.toastInfo('Keep going', 'Earn points by playing, focusing, and finishing tasks.'); return; }
          if(NX.store.unlock(key, { autoLaunch: kind === 'game' })){
            try{ NX.confetti(innerWidth/2, 200); NX.sfx.play('confetti'); }catch(e){}
            NX.toastOk('Unlocked', label + ' is yours.');
            NX.closeAllModals();
            if(opts && opts.onDone) opts.onDone();
          }
        } }
    ]
  });
};

/* ============================================================
   AVATAR
   ============================================================ */
/** One helper for every avatar in the app, so a half-landed image
    feature can never produce mismatched avatars. */
NX.avatarHtml = function(profile, size){
  const e = ent();
  const cls = 'avatar' + (size ? ' ' + size : '');
  const color = (profile && profile.avatar) || '#7CD56E';
  const initials = U.initials((profile && profile.name) || 'You');

  if(e.avatarImg){
    const frame = e.frame && e.frame !== 'none' ? ' avatar-frame-' + e.frame : '';
    const src = e.avatarImg;
    return `<span class="${cls}${frame}"><img src="${U.esc(src)}" alt="" loading="lazy"></span>`;
  }
  const frame = e.frame && e.frame !== 'none' ? ' avatar-frame-' + e.frame : '';
  return `<span class="${cls}${frame}" style="background:${U.esc(color)}">${U.esc(initials)}</span>`;
};

/* ============================================================
   STORE ROUTE
   ============================================================ */
let tab = 'themes';

const TABS = [
  { id:'themes', n:'Themes', ic:'palette' },
  { id:'games',  n:'Games',  ic:'game' },
  { id:'avatar', n:'Avatar', ic:'user' },
  { id:'titles', n:'Titles', ic:'award' }
];

NX.routeInShell('store', 'Store', 'star', function(view){
  view.innerHTML = `<div class="page store-page">
    <div class="store-hud" id="store-hud"></div>
    <div class="store-tabs" id="store-tabs"></div>
    <div id="store-body"></div>
  </div>`;

  function renderHud(){
    const p = NX.store.get('profile', NX.defaults.profile);
    const lv = NX.points.level();
    const today = NX.points.today();
    const ceil = NX.points.ceiling();
    const pct = Math.min(100, Math.round(today / ceil * 100));
    q('#store-hud', view).innerHTML = `
      <span class="tile sm">${icon('star')}</span>
      <div class="sh-main">
        <div class="sh-row"><b class="sh-bal" id="sh-bal">${NX.points.balance().toLocaleString()}</b>
          <span class="faint small">points</span></div>
        <span class="meter"><i style="width:${pct}%"></i></span>
        <span class="faint tiny">${today} earned today · ${ceil} daily cap</span>
      </div>
      <div class="sh-lv">
        <span class="pill green">L${lv.n} · ${U.esc(lv.title)}</span>
        <span class="faint tiny">${lv.next - lv.cur} to L${lv.n + 1}</span>
      </div>`;
    const bal = q('#sh-bal', view);
    if(bal) bal.textContent = NX.points.balance().toLocaleString();
  }

  function renderTabs(){
    q('#store-tabs', view).innerHTML = TABS.map(t=>
      `<button class="${t.id===tab?'on':''}" data-tab="${t.id}">${icon(t.ic)} ${U.esc(t.n)}</button>`).join('');
    qa('[data-tab]', view).forEach(b=>b.onclick = ()=>{ tab = b.dataset.tab; renderTabs(); renderBody(); NX.sfx.play('click'); });
  }

  function renderBody(){
    const host = q('#store-body', view);
    const e = ent();

    /* ---- themes ---- */
    if(tab === 'themes'){
      const themes = (NX.THEMES || []).map(t=>{
        const owned = NX.store.isUnlocked('theme:' + t.id);
        const active = (NX.store.get('settings', {}).theme || '') === t.id;
        const price = NX.store.priceOf('theme', t.id);
        const cur = owned ? 'Equipped' : (active ? 'Active' : price);
        return `<div class="theme-card ${active?'on':''} ${owned?'':'locked'}" data-theme="${t.id}"
            data-tip="${U.esc(t.name + (owned ? '' : ' — ' + price + ' points'))}">
          <div class="theme-swatch" style="background:${t.bg}">
            <i class="ts-side" style="background:${t.side}"></i>
            <i class="ts-main" style="background:${t.main}"></i>
            <i class="ts-pill" style="background:${t.pill}"></i>
            ${owned ? '' : `<span class="ts-lock">${icon('lock',12)} ${price}</span>`}
          </div>
          <div class="theme-name">${U.esc(t.name)} ${active?`<span class="on-ic">${icon('check')}</span>`:''}</div>
          <div class="tc-sub">${U.esc(cur)}</div>
        </div>`;
      }).join('');
      host.innerHTML = `<div class="card"><div class="card-h">
          <div class="tile sm">${icon('palette')}</div>
          <div><div class="c-title">Themes</div>
          <div class="c-sub">A theme changes colours only — never layout</div></div></div>
        <div class="card-b"><div class="theme-grid store-themes">${themes}</div></div></div>`;

      qa('[data-theme]', host).forEach(c=>c.onclick = ()=>{
        const id = c.dataset.theme;
        if(NX.store.isUnlocked('theme:' + id)){
          NX.applyTheme(id, { force:true });
          NX.sfx.play('pop');
          renderBody();
        } else {
          const meta = (NX.THEMES || []).find(t=>t.id===id);
          NX.store.purchase('theme', id, { label: meta ? meta.name : id,
            onDone(){ renderBody(); NX.applyTheme(id, { force:true }); } });
        }
      });
    }

    /* ---- games ---- */
    if(tab === 'games'){
      const games = (NX.GAMES || []).map(g=>{
        const owned = NX.store.isUnlocked('game:' + g.id);
        const best = NX.gameBest(g.id);
        const price = NX.store.priceOf('game', g.id);
        return `<div class="game-card store-game ${owned?'':'locked'}" data-game="${g.id}">
          <div class="g-ic" style="background:${g.color}">${icon(g.icon)}</div>
          ${owned ? '' : `<span class="g-lock">${icon('lock',12)} ${price}</span>`}
          <div class="g-name">${U.esc(g.name)}</div>
          <div class="g-desc">${U.esc(g.desc)}</div>
          <div class="g-best">${best!=null ? 'Best: '+best : (owned ? 'Not played yet' : price+' points')}</div>
        </div>`;
      }).join('');
      const locked = (NX.GAMES||[]).filter(g=>!NX.store.isUnlocked('game:'+g.id)).length;
      host.innerHTML = `<div class="card"><div class="card-h">
          <div class="tile sm">${icon('game')}</div>
          <div><div class="c-title">Arcade games</div>
          <div class="c-sub">${locked ? locked + ' to unlock · earn points by playing the free ones' : 'Everything unlocked'}</div></div></div>
        <div class="card-b"><div class="games-grid">${games}</div></div></div>`;

      qa('[data-game]', host).forEach(c=>c.onclick = ()=>{
        const id = c.dataset.game;
        if(NX.store.isUnlocked('game:' + id)){ NX.router.go('games'); setTimeout(()=>NX.launchGame(id), 80); return; }
        const g = (NX.GAMES||[]).find(x=>x.id===id);
        NX.store.purchase('game', id, { label: g ? g.name : id });
      });
    }

    /* ---- avatar ---- */
    if(tab === 'avatar'){
      const p = NX.store.get('profile', NX.defaults.profile);
      const frames = FRAMES.map(f=>{
        const owned = NX.store.isUnlocked('frame:' + f.id);
        const active = (e.frame || 'none') === f.id;
        return `<div class="frame-card ${active?'on':''} ${owned?'':'locked'}" data-frame="${f.id}"
            data-tip="${owned ? f.name : f.name + ' — ' + (FRAME_PRICE[f.id]||0) + ' points'}">
          <span class="avatar xl avatar-frame-${f.id}" style="background:${U.esc(p.avatar||'#7CD56E')}">${U.esc(U.initials(p.name||'You'))}</span>
          <div class="fc-name">${U.esc(f.name)} ${owned?'':`<span class="fc-price">${FRAME_PRICE[f.id]||0}</span>`}</div>
        </div>`;
      }).join('');

      host.innerHTML = `<div class="card"><div class="card-h">
          <div class="tile sm">${icon('user')}</div>
          <div><div class="c-title">Avatar</div>
          <div class="c-sub">Stored on this device unless you turn on sync</div></div></div>
        <div class="card-b" style="display:flex;flex-direction:column;gap:18px">
          <div class="row gap-14" style="align-items:center">
            <div id="av-prev">${NX.avatarHtml(p, 'xl')}</div>
            <div style="flex:1;display:flex;flex-direction:column;gap:8px">
              <div class="row gap-8">
                <button class="btn btn-soft btn-sm" id="av-pick">${icon('camera')} Upload photo</button>
                ${e.avatarImg ? `<button class="btn btn-ghost btn-sm" id="av-clear">${icon('x')} Remove</button>` : ''}
              </div>
              <span class="faint tiny">Stripped of location data on import · saved at 32/64/128/512 px</span>
            </div>
          </div>
          <div class="field"><label>Avatar frame</label>
            <div class="frame-grid">${frames}</div></div>
        </div></div>`;

      const pick = q('#av-pick', host);
      if(pick) pick.onclick = ()=>{
        NX.media && NX.media.pick({ kind:'avatar' }).then(meta=>{
          if(!meta) return;
          const cur = ent();
          cur.avatarImg = meta.url;
          save();
          const prev = q('#av-prev', host);
          if(prev) prev.innerHTML = NX.avatarHtml(NX.store.get('profile', NX.defaults.profile), 'xl');
          NX.toastOk('Avatar updated', 'Saved to your device.');
          if(NX.refreshSidebarUser) NX.refreshSidebarUser();
        });
      };
      const clear = q('#av-clear', host);
      if(clear) clear.onclick = ()=>{
        const old = ent().avatarImg;
        ent().avatarImg = null;
        save();
        if(old && NX.media) NX.media.remove(old);
        renderBody();
        if(NX.refreshSidebarUser) NX.refreshSidebarUser();
      };

      qa('[data-frame]', host).forEach(c=>c.onclick = ()=>{
        const id = c.dataset.frame;
        if(NX.store.isUnlocked('frame:' + id)){
          ent().frame = id; save(); renderBody();
          if(NX.refreshSidebarUser) NX.refreshSidebarUser();
          return;
        }
        NX.store.purchase('frame', id, { label: (FRAMES.find(f=>f.id===id)||{}).name || id,
          onDone(){ ent().frame = id; save(); renderBody(); if(NX.refreshSidebarUser) NX.refreshSidebarUser(); } });
      });
    }

    /* ---- titles ---- */
    if(tab === 'titles'){
      const titles = NX.points.allTitles();
      const owned = ent().owned;
      const active = e.title;
      const rows = titles.map((t,i)=>{
        const key = 'title:' + t.toLowerCase().replace(/\s+/g,'-');
        const has = !!owned[key] || i + 1 <= NX.points.level().n;
        const isActive = active === t;
        return `<div class="title-row ${isActive?'on':''} ${has?'':'locked'}">
          <span class="tr-lv">L${i + 1}</span>
          <span class="tr-name">${U.esc(t)}</span>
          ${has ? `<button class="btn ${isActive?'btn-soft':'btn-green'} btn-sm" data-title="${U.esc(t)}">${isActive?'In use':'Use'}</button>`
                 : `<span class="pill gray sm">Reach level ${i + 1}</span>`}
        </div>`;
      }).join('');
      host.innerHTML = `<div class="card"><div class="card-h">
          <div class="tile sm">${icon('award')}</div>
          <div><div class="c-title">Titles</div>
          <div class="c-sub">Unlocked automatically as you level up</div></div></div>
        <div class="card-b"><div class="title-list">${rows}</div></div></div>`;

      qa('[data-title]', host).forEach(b=>b.onclick = ()=>{
        ent().title = b.dataset.title;
        save();
        renderBody();
        if(NX.refreshSidebarUser) NX.refreshSidebarUser();
      });
    }
  }

  renderHud(); renderTabs(); renderBody();

  const offPts = NX.events.on('points:changed', renderHud);
  const offEnt = NX.events.on('store:entitlements', ()=>{ renderHud(); renderBody(); });
  view._storeOff = ()=>{ offPts && offPts(); offEnt && offEnt(); };
});

/* deep-link target: open the store focused on one item */
NX.openStore = function(key){
  try{ NX.router.go('store'); }catch(e){ return; }
  if(!key) return;
  const [kind, id] = String(key).split(':');
  setTimeout(()=>{
    if(kind === 'theme'){
      const meta = (NX.THEMES||[]).find(t=>t.id===id);
      NX.store.purchase('theme', id, { label: meta ? meta.name : id });
    } else if(kind === 'game'){
      const g = (NX.GAMES||[]).find(x=>x.id===id);
      NX.store.purchase('game', id, { label: g ? g.name : id });
    }
  }, 220);
};

/* gate shown when a locked game is launched from anywhere */
NX.openGameGate = function(g){
  const price = NX.store.priceOf('game', g.id);
  const bal = NX.points.balance();
  const best = NX.gameBest(g.id);
  NX.modal({
    title: g.name + ' is locked',
    icon:'lock',
    body:`<div style="display:flex;flex-direction:column;gap:12px">
      <p style="font-size:13.5px;color:var(--ink-2);line-height:1.6">${U.esc(g.desc)}</p>
      <div class="gate-row"><span class="faint small">Unlock cost</span>
        <b>${price} points</b></div>
      <div class="gate-row"><span class="faint small">Your balance</span>
        <b style="color:${bal>=price?'var(--green-ink)':'var(--ink)'}">${bal}</b></div>
      ${best!=null?`<div class="gate-row"><span class="faint small">Your best</span><b>${best}</b></div>`:''}
    </div>`,
    footer:[
      { label:'Earn points', cls:'btn-soft', onClick(){ NX.closeAllModals(); NX.router.go('store'); } },
      { label: bal>=price ? 'Unlock' : 'Not enough', cls: bal>=price ? 'btn-green' : 'btn-soft',
        onClick(){
          if(bal < price){ NX.toastInfo('Keep going', 'Free games and focus rounds earn the fastest.'); return; }
          if(NX.store.unlock('game:' + g.id)){
            NX.closeAllModals();
            NX.confetti(innerWidth/2, 200);
            NX.toastOk('Unlocked', g.name);
            setTimeout(()=>NX.launchGame(g.id, true), 200);
          }
        } }
    ]
  });
};

} )(window.NX);