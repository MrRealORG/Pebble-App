/* ============================================================
   Pebble — 78-shell-v2.js
   • Dynamic Island (animated top pill: timers, alerts, XP, shortcuts)
   • Splash screen v2 with staged progress
   • Onboarding wizard (name, avatar, modules, theme, data)
   • Module visibility toggles (hide, never delete)
   • Theme Studio (build/save/share custom themes) + custom CSS
   • Updater system (manifest check, download & apply on desktop)
   • Profiles + passcode login + local server sync client
   • Simple Mode toggle
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, iconHTML } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  /* ================================================================
     MODULE VISIBILITY (hide from rail / sidebar / palette / routes)
     ================================================================ */
  NX.features = {
    list: () => NX.router.all(),
    hidden: () => new Set(store().getSetting('hiddenModules', [])),
    isEnabled(id) { return !this.hidden().has(id); },
    setEnabled(id, on) {
      const cur = new Set(store().getSetting('hiddenModules', []));
      on ? cur.delete(id) : cur.add(id);
      store().setSetting('hiddenModules', Array.from(cur));
      NX.shell.buildRail(); NX.shell.buildSidebar();
      NX.ui.toast({ message: (on ? 'Shown: ' : 'Hidden: ') + (NX.router.get(id) || {}).name, duration: 2200 });
      if (!on && NX.router.currentId() === id) NX.router.navigate('#/dashboard');
    },
    // used by router.shell? we patch router.visible below
  };
  // patch router.visible + grouped to respect hidden modules
  const origVisible = NX.router.visible;
  NX.router.visible = function () { return origVisible.call(NX.router).filter(m => NX.features.isEnabled(m.id)); };

  /* ================================================================
     SIMPLE MODE
     ================================================================ */
  NX.shellV2 = {};
  NX.shellV2.toggleSimple = function (force) {
    const on = force !== undefined ? force : document.documentElement.dataset.simple !== 'on';
    document.documentElement.dataset.simple = on ? 'on' : 'off';
    store().setSetting('simpleMode', on);
  };
  NX.shellV2.toggleIsland = function (force) {
    const on = force !== undefined ? force : store().getSetting('islandEnabled', true) === false;
    store().setSetting('islandEnabled', on);
    const el = document.querySelector('.island-wrap');
    if (el) el.style.display = on ? '' : 'none';
  };
  NX.shellV2.toggleBlur = function (on) { document.documentElement.dataset.blur = on ? 'on' : 'off'; store().setSetting('glassBlur', on); };
  NX.shellV2.toggleMotion = function (fast) {
    document.documentElement.dataset.motion = fast ? 'fast' : 'normal';
    store().setSetting('fastMotion', fast);
  };

  /* ================================================================
     DYNAMIC ISLAND
     ================================================================ */
  let islandEl = null, islandExpanded = false;

  function islandState() {
    // priority: lock > reminder due > focus timer running > unread > xp
    if (NX.game && NX.game.isLocked()) return { kind: 'lock', icon: 'lock', txt: 'Locked — tap to unlock', tone: 'alert' };
    const due = sel().dueReminders();
    if (due.length) return { kind: 'reminder', icon: 'clock', txt: due[0].title, sub: due.length > 1 ? `+${due.length - 1} more` : NX.fmtTime(due[0].at), tone: 'alert' };
    const t = NX.timeTracker && NX.timeTracker.state;
    if (t && t.running) return { kind: 'timer', icon: 'clock', txt: NX.fmtClock(NX.timeTracker.elapsedSeconds()), sub: (t.description || 'tracking').slice(0, 26), tone: 'active' };
    const pomo = pomoRunning();
    if (pomo) return { kind: 'pomo', icon: 'target', txt: NX.fmtClock(pomo.remaining), sub: pomo.label, tone: 'active' };
    const unread = sel().unreadInbox().length;
    if (unread) return { kind: 'inbox', icon: 'inbox', txt: unread + ' unread', sub: 'inbox', tone: 'info' };
    const g = NX.game ? NX.game.G() : null;
    if (g) { const lv = NX.game.levelFromXp(g.totalXp); return { kind: 'xp', icon: 'bolt', txt: 'Lv ' + lv.level + ' · ' + NX.fmtNum(g.points) + ' pts', sub: NX.game.rankFor(lv.level), tone: 'idle' }; }
    return { kind: 'idle', icon: 'pebble', txt: 'pebble', sub: '', tone: 'idle' };
  }
  function pomoRunning() {
    // the pomodoro module keeps its state privately; read from the DOM clock if present
    const el = document.getElementById('pomoTime');
    if (el && el.dataset.remaining) return { remaining: Number(el.dataset.remaining), label: 'focus session' };
    return window.__nxPomo || null;
  }
  function parseClock(s) {
    const p = String(s || '').split(':').map(Number);
    return p.length === 2 ? p[0] * 60 + p[1] : (p[0] * 3600 + p[1] * 60 + (p[2] || 0));
  }

  function buildIsland() {
    if (islandEl) islandEl.remove();
    if (store().getSetting('islandEnabled', true) === false) return;
    islandEl = h('div.island-wrap');
    const isl = h('div.island', { id: 'island' });
    islandEl.appendChild(isl);
    document.body.appendChild(islandEl);
    paintIsland();
    isl.addEventListener('click', e => {
      if (islandExpanded && e.target.closest('.isl-item, .isl-btn')) return;
      islandExpanded = !islandExpanded;
      paintIsland();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && islandExpanded) { islandExpanded = false; paintIsland(); } });
    setInterval(() => { if (!islandExpanded) paintIsland(); else paintIslandPanelOnly(); }, 1000);
  }

  function paintIsland() {
    const isl = document.getElementById('island');
    if (!isl) return;
    const s = islandState();
    isl.classList.toggle('expanded', islandExpanded);
    isl.classList.toggle('has-alert', s.tone === 'alert');
    NX.clear(isl);
    // collapsed bar
    isl.appendChild(h('div.isl-left.isl-collapsed-only', [
      s.kind === 'timer' || s.kind === 'pomo' ? h('div.isl-ring') : h('div.isl-dot' + (s.tone === 'alert' ? '.pulse' : ''), { style: s.tone === 'alert' ? { background: 'var(--acc-red)' } : s.tone === 'active' ? { background: 'var(--acc-grn)' } : null })
    ]));
    isl.appendChild(h('div.isl-mid.isl-collapsed-only', [
      h('span.isl-txt', { style: { display: 'flex', alignItems: 'center', gap: '7px' } }, [h('span', { style: { display: 'flex' }, html: NX.glyph(s.icon, 14, 1.8) }), s.txt]),
      s.sub ? h('span.isl-sub', s.sub) : null
    ]));
    isl.appendChild(h('div.isl-right.isl-collapsed-only', [
      h('span.isl-xp', '★ ' + NX.fmtNum((NX.game && NX.game.G().points) || 0))
    ]));
    // expanded panel
    const panel = h('div.isl-panel');
    panel.appendChild(h('div.isp-head', [
      h('span', { style: { display: 'flex', color: 'var(--brand-1)' }, html: NX.glyph(s.icon, 16) }),
      h('span.isp-title', s.txt),
      h('div', { style: { flex: '1' } }),
      h('span.isl-xp', '★ ' + NX.fmtNum((NX.game && NX.game.G().points) || 0)),
      h('button.isl-btn', { onclick: e => { e.stopPropagation(); islandExpanded = false; paintIsland(); } }, 'Close')
    ]));
    const body = h('div.isp-body', { id: 'islBody' });
    panel.appendChild(body);
    panel.appendChild(h('div.isp-foot', [
      h('button.isl-btn.primary', { onclick: e => { e.stopPropagation(); NX.shell.openQuickCapture(); } }, [h('span', { style: { display: 'flex' }, html: NX.glyph('spark', 12) }), 'Capture']),
      h('button.isl-btn', { onclick: e => { e.stopPropagation(); NX.shell.openPalette(); } }, 'Palette'),
      h('button.isl-btn', { onclick: e => { e.stopPropagation(); NX.copilot.toggle(); } }, [h('span', { style: { display: 'flex' }, html: NX.glyph('spark', 12) }), 'Copilot']),
      h('button.isl-btn', { onclick: e => { e.stopPropagation(); NX.router.navigate('#/pomodoro'); } }, [h('span', { style: { display: 'flex' }, html: NX.glyph('target', 12) }), 'Focus']),
      h('button.isl-btn', { onclick: e => { e.stopPropagation(); NX.router.navigate('#/game'); } }, [h('span', { style: { display: 'flex' }, html: NX.glyph('trophy', 12) }), 'Game']),
      h('button.isl-btn', { onclick: e => { e.stopPropagation(); NX.router.navigate('#/settings'); } }, [h('span', { style: { display: 'flex' }, html: NX.glyph('pebble', 12) }), 'Settings'])
    ]));
    isl.appendChild(panel);
    paintIslandPanelOnly();
  }

  function paintIslandPanelOnly() {
    const body = document.getElementById('islBody');
    if (!body) return;
    NX.clear(body);
    const items = [];
    if (NX.game && NX.game.isLocked()) items.push({ icon: 'lock', t: 'App locked', s: 'Tap to watch an ad or work', run: () => NX.game.showLockScreen() });
    sel().dueReminders().slice(0, 4).forEach(r => items.push({ icon: 'clock', t: r.title, s: 'due ' + NX.fmtTime(r.at), run: () => { NX.reminders.complete(r.id); NX.router.navigate('#/reminders'); } }));
    const t = NX.timeTracker && NX.timeTracker.state;
    if (t && t.running) items.push({ icon: 'clock', t: NX.fmtClock(NX.timeTracker.elapsedSeconds()) + ' tracking', s: t.description || '', run: () => NX.timeTracker.stop() });
    sel().tasksDueOn(new Date()).filter(x => !x.done).slice(0, 4).forEach(x => items.push({ icon: '✅', t: x.title, s: 'due today · ' + x.priority, run: () => NX.components.openTask(x.id) }));
    sel().unreadInbox().slice(0, 3).forEach(i => items.push({ icon: 'inbox', t: i.title, s: i.body || '', run: () => NX.router.navigate('#/inbox') }));
    const hab = sel().habitsCompletedToday();
    if (hab.total && hab.done < hab.total) items.push({ icon: 'flame', t: `Habits ${hab.done}/${hab.total}`, s: 'tap to open habits', run: () => NX.router.navigate('#/habits') });
    if (!items.length) items.push({ icon: 'pebble', t: 'All clear', s: 'nothing needs you right now', run: () => {} });
    items.forEach(i => body.appendChild(h('div.isl-item', { onclick: e => { e.stopPropagation(); islandExpanded = false; paintIsland(); i.run(); } }, [
      h('div.ii-ico', { html: NX.glyph(i.icon, 14) }),
      h('div', { style: { flex: '1', minWidth: '0' } }, [h('div.ii-t', i.t), i.s ? h('div.ii-s', i.s) : null])
    ])));
  }

  /* ================================================================
     SPLASH v2
     ================================================================ */
  function splash() {
    const el = h('div.splash2', { id: 'splash2' });
    el.appendChild(h('div.sp2-inner', [
      h('div.sp2-logo', [
        h('div.sp2-ring'), h('div.sp2-ring.r2'),
        h('div.sp2-core', { html: `<svg viewBox="0 0 64 64"><defs><linearGradient id="spg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c6cff"/><stop offset="1" stop-color="#33b8a3"/></linearGradient></defs><rect x="2" y="2" width="60" height="60" rx="20" fill="url(#spg)"/><g fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"><path d="M14 34c0-11 8-19 18-19s18 8 18 19-8 17-18 17-18-6-18-17Z"/><path d="M22 32c0-6 4.5-10.5 10-10.5"/></g></svg>` })
      ]),
      h('div.sp2-name', 'pebble'),
      h('div.sp2-tag', 'everything in one smooth place'),
      h('div.sp2-steps', { id: 'sp2Steps' }, [
        ['load', 'Loading your workspace'],
        ['index', 'Indexing notes, tasks & messages'],
        ['game', 'Restoring your progress'],
        ['ready', 'Warming up the copilot']
      ].map(([k, label]) => h('div.sp2-step', { dataset: { step: k } }, [h('span.sp2-ic'), h('span', label)]))),
      h('div.sp2-bar', h('i', { id: 'sp2Bar' })),
      h('div.sp2-ver', 'v2.0 · ' + (store().desktop ? 'desktop' : 'web'))
    ]));
    document.body.appendChild(el);
    const steps = ['load', 'index', 'game', 'ready'];
    steps.forEach((k, i) => setTimeout(() => {
      const s = el.querySelector(`[data-step="${k}"]`);
      if (s) { s.classList.add('on'); setTimeout(() => { s.classList.remove('on'); s.classList.add('done'); s.querySelector('.sp2-ic').textContent = '✓'; }, 260); }
      const bar = document.getElementById('sp2Bar');
      if (bar) bar.style.width = ((i + 1) / steps.length * 100) + '%';
    }, 240 + i * 300));
    setTimeout(() => { el.classList.add('done'); setTimeout(() => el.remove(), 700); }, 1750);
  }

  /* ================================================================
     ONBOARDING
     ================================================================ */
  function onboarding(done) {
    const state = { name: '', avatar: '🦊', theme: 'dark', modules: new Set(NX.router.all().map(m => m.id)), data: 'sample', commitment: false, minutes: 60 };
    let step = 0;
    const root = h('div.onb', { id: 'onboarding' });
    document.body.appendChild(root);

    const STEPS = [
      { title: 'Welcome to Pebble.', sub: 'Nineteen modules, one window: notes, tasks, calendar, habits, goals, journal, focus, time, finance, contacts, bookmarks, wiki, chat, inbox, AI — plus a game layer on top. Let\'s set it up in 60 seconds.', render: welcome },
      { title: 'What should we call you?', sub: 'This name appears in your profile, the copilot context and chat.', render: nameStep },
      { title: 'Pick an avatar', sub: 'More avatars are unlockable in the Shop with points you earn by working.', render: avatarStep },
      { title: 'Choose your look', sub: 'You can change this any time — and build entirely custom themes in the Theme Studio.', render: themeStep },
      { title: 'Which modules do you want visible?', sub: 'Nothing is deleted. Hidden modules simply disappear from the rail and menus until you turn them back on in Settings → Modules.', render: moduleStep },
      { title: 'Start with sample data or a blank slate?', sub: 'The sample workspace shows every feature with realistic content. Blank is yours from the first click.', render: dataStep },
      { title: 'One last thing: the commitment', sub: 'Optional. Promise a daily work minimum; miss it and Pebble locks until you work or watch a sponsor ad. It is the most loved and most hated feature — your call.', render: commitStep }
    ];

    function draw() {
      NX.clear(root);
      root.appendChild(h('div.onb-progress', STEPS.map((s, i) => h('i' + (i <= step ? '.on' : '')))));
      const inner = h('div.onb-inner');
      const st = STEPS[step];
      const box = h('div.onb-step', [h('div.onb-h', st.title), h('div.onb-sub', st.sub)]);
      st.render(box);
      inner.appendChild(box);
      root.appendChild(inner);
      root.appendChild(h('div.onb-foot', [
        step > 0 ? h('button.btn.ghost', { onclick: () => { step--; draw(); } }, '← Back') : h('span'),
        h('div.grow'),
        h('button.btn.ghost', { onclick: finish }, 'Skip setup'),
        h('button.btn.primary.lg', { onclick: () => { if (step === STEPS.length - 1) finish(); else { step++; draw(); } } }, step === STEPS.length - 1 ? 'Enter Pebble →' : 'Continue →')
      ]));
    }

    function welcome(box) {
      box.appendChild(h('div.onb-cards', [
        ['note', 'Notes & Wiki', 'Blocks, links, graph'],
        ['check', 'Tasks & Kanban', 'Smart priorities'],
        ['cal', 'Calendar', 'Free-time finder'],
        ['flame', 'Habits & Goals', 'Streaks, OKRs'],
        ['spark', 'AI Copilot', 'Agent + voice'],
        ['trophy', 'Game layer', 'XP, shop, quests']
      ].map(([i, t, s]) => h('div.onb-card.on', [h('div.oc-ico', { style: { display: 'flex', justifyContent: 'center', color: 'var(--brand-1)' }, html: NX.glyph(i, 26, 1.6) }), h('b', t), h('span', s)]))));
    }
    function nameStep(box) {
      const inp = h('input.input', { value: state.name || store().getSetting('userName', ''), placeholder: 'Your name', style: { fontSize: '17px', padding: '12px 14px', maxWidth: '360px' } });
      inp.addEventListener('input', () => state.name = inp.value);
      box.appendChild(inp);
      setTimeout(() => inp.focus(), 60);
    }
    function avatarStep(box) {
      const avs = ['fox', 'wave', 'prism', 'orbit', 'cat', 'bloom', 'tide', 'ghost', 'flare', 'leaf', 'gem', 'moon', 'bolt', 'star', 'sun', 'freeze'];
      box.appendChild(h('div.onb-avatars', avs.map(a => h('div.onb-av' + (state.avatar === a ? '.on' : ''), { style: { padding: '6px', borderRadius: '16px', background: 'transparent' }, html: NX.avatarSVG(a + '-' + (state.name || 'you'), 46), onclick: e => { state.avatar = a; NX.$$('.onb-av', box).forEach(x => x.classList.remove('on')); e.currentTarget.classList.add('on'); } }))));
    }
    function themeStep(box) {
      const themes = (NX.THEMES || []).slice(0, 6).map(t => [t.id, t.name, t.bg]);
      box.appendChild(h('div.onb-themes', themes.map(([id, name, bg]) => h('div.onb-card' + (state.theme === id ? '.on' : ''), {
        style: { background: bg, color: id === 'light' || id === 'sepia' ? '#333' : '#eee' },
        onclick: () => { state.theme = id; store().setSetting('theme', id); NX.$$('.onb-themes .onb-card', box).forEach(x => x.classList.remove('on')); }
      }, [h('b', name), h('span', { style: { opacity: .7 } }, 'tap to preview live')]))));
    }
    function moduleStep(box) {
      const groups = NX.router.grouped();
      groups.forEach(g => {
        box.appendChild(h('div.small.muted', { style: { margin: '16px 0 8px', fontWeight: '700', textTransform: 'uppercase', fontSize: '10.5px', letterSpacing: '.6px' } }, g.group.name));
        box.appendChild(h('div.onb-cards', g.modules.map(m => h('div.onb-card' + (state.modules.has(m.id) ? '.on' : ''), {
          onclick: e => { state.modules.has(m.id) ? state.modules.delete(m.id) : state.modules.add(m.id); e.currentTarget.classList.toggle('on'); }
        }, [h('div.oc-ico', { html: iconHTML(m.icon || 'zap', 22) }), h('b', m.name)]))));
      });
    }
    function dataStep(box) {
      box.appendChild(h('div.onb-cards', [
        h('div.onb-card' + (state.data === 'sample' ? '.on' : ''), { onclick: e => { state.data = 'sample'; mark(e); } }, [h('div.oc-ico', { style: { display: 'flex', justifyContent: 'center', color: 'var(--brand-1)' }, html: NX.glyph('gem', 26, 1.6) }), h('b', 'Sample workspace'), h('span', '8 notes, 22 tasks, chat, finance — see everything working')]),
        h('div.onb-card' + (state.data === 'blank' ? '.on' : ''), { onclick: e => { state.data = 'blank'; mark(e); } }, [h('div.oc-ico', { style: { display: 'flex', justifyContent: 'center', color: 'var(--acc-grn)' }, html: NX.glyph('leaf', 26, 1.6) }), h('b', 'Blank slate'), h('span', 'Just you, from zero')])
      ]));
      function mark(e) { NX.$$('.onb-cards .onb-card', e.currentTarget.parentElement).forEach(x => x.classList.remove('on')); e.currentTarget.classList.add('on'); }
    }
    function commitStep(box) {
      box.appendChild(h('div.onb-cards', [
        h('div.onb-card' + (state.commitment ? '.on' : ''), { onclick: e => { state.commitment = true; toggleCards(e); } }, [h('div.oc-ico', { style: { display: 'flex', justifyContent: 'center', color: 'var(--acc-red)' }, html: NX.glyph('lock', 26, 1.6) }), h('b', 'Enable it'), h('span', 'Miss a day → lock + ad unlock')]),
        h('div.onb-card' + (!state.commitment ? '.on' : ''), { onclick: e => { state.commitment = false; toggleCards(e); } }, [h('div.oc-ico', { style: { display: 'flex', justifyContent: 'center', color: 'var(--acc-grn)' }, html: NX.glyph('zen', 26, 1.6) }), h('b', 'No thanks'), h('span', 'Pure zen, no punishment')])
      ]));
      const mins = h('input.input', { type: 'number', value: 60, min: 5, max: 720, step: 5, style: { width: '110px', marginTop: '14px' } });
      mins.addEventListener('change', () => state.minutes = Number(mins.value) || 60);
      box.appendChild(h('div.row', { style: { gap: '9px', marginTop: '6px' } }, [h('span.small.muted', 'Daily commitment (minutes):'), mins]));
      function toggleCards(e) { NX.$$('.onb-cards .onb-card', e.currentTarget.parentElement).forEach(x => x.classList.remove('on')); e.currentTarget.classList.add('on'); }
    }

    function finish() {
      if (state.name) { store().setSetting('userName', state.name); const me = sel().me(); if (me) store().members.update(me.id, { name: state.name, displayName: state.name }, true); }
      if (state.avatar) { const g = NX.game.G(); if (!g.owned.includes('av_onb')) { g.owned.push('av_onb'); } NX.game.SHOP.push({ id: 'av_onb', kind: 'avatar', name: 'Chosen One', price: 0, ico: state.avatar, desc: 'Your onboarding avatar.' }); g.equipped.avatar = 'av_onb'; }
      store().setSetting('theme', state.theme);
      const hidden = NX.router.all().map(m => m.id).filter(id => !state.modules.has(id));
      store().setSetting('hiddenModules', hidden);
      if (state.data === 'blank') NX.store.wipe();
      const g = NX.game.G();
      g.commitment.enabled = state.commitment;
      g.commitment.dailyMinutes = state.minutes;
      g.commitment.startedOn = NX.todayStr();
      store().setSetting('onboarded', true);
      store().save();
      root.remove();
      NX.shell.buildRail(); NX.shell.buildSidebar(); NX.shell.updateUserFooter();
      NX.game.applyCosmetics();
      NX.game.confetti(120);
      NX.ui.toast({ type: 'success', title: 'You\'re in, ' + (state.name || 'friend'), message: 'Press Ctrl+K anytime. The copilot lives behind Ctrl+Shift+C.', duration: 7000 });
      done && done();
    }
    draw();
  }

  /* ================================================================
     THEME STUDIO
     ================================================================ */
  const TOKEN_GROUPS = [
    ['Base surfaces', ['--bg', '--bg-elev', '--bg-sunken', '--bg-hover', '--bg-active', '--bg-card', '--bg-input', '--bg-code']],
    ['Sidebar & rail', ['--bg-rail', '--bg-sidebar']],
    ['Text', ['--tx', '--tx-2', '--tx-3', '--tx-4']],
    ['Borders', ['--bd', '--bd-2', '--bd-strong']],
    ['Brand', ['--brand-1', '--brand-2']]
  ];
  function themeStudio() {
    const cur = {};
    const cs = getComputedStyle(document.documentElement);
    TOKEN_GROUPS.forEach(([, toks]) => toks.forEach(t => cur[t] = rgbToHex(cs.getPropertyValue(t).trim()) || '#888888'));
    let name = 'My Theme';
    const wrap = h('div');
    wrap.appendChild(h('div.row', { style: { marginBottom: '14px', gap: '9px' } }, [
      h('input.input', { value: name, style: { maxWidth: '240px' }, oninput: e => name = e.target.value }),
      h('button.btn.primary', { onclick: () => {
        const id = 'theme_custom_' + NX.slug(name || 'custom');
        if (!NX.game.SHOP.find(s => s.id === id)) NX.game.SHOP.push({ id, kind: 'theme', name, price: 0, ico: '🎨', desc: 'Your custom theme from the Theme Studio.', data: Object.assign({}, cur) });
        const g = NX.game.G(); if (!g.owned.includes(id)) g.owned.push(id);
        g.equipped.theme = id; NX.store.touch(); NX.game.applyCosmetics();
        NX.ui.toast({ type: 'success', title: 'Theme saved: ' + name, message: 'It is in your Shop, equipped and shareable.', duration: 5000 });
      } }, '💾 Save & equip'),
      h('button.btn.subtle', { onclick: () => {
        const css = Object.entries(cur).map(([k, v]) => `${k}: ${v};`).join(' ');
        NX.copyText(`/* Pebble theme: ${name} */\n:root, [data-theme="dark"] { ${css} }`);
        NX.ui.toast({ message: 'CSS copied — share it anywhere', duration: 2200 });
      } }, 'Copy as CSS'),
      h('button.btn.ghost', { onclick: () => { Object.keys(cur).forEach(k => document.documentElement.style.removeProperty(k)); NX.router.render(); } }, 'Reset')
    ]));
    const grid = h('div.grid.grid-2', { style: { gap: '14px' } });
    TOKEN_GROUPS.forEach(([label, toks]) => {
      grid.appendChild(h('div.card.pad-sm', [
        h('div.small.muted', { style: { fontWeight: '700', marginBottom: '7px', fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.6px' } }, label),
        toks.map(t => h('div.ts-swatch', [
          h('input', { type: 'color', value: cur[t], oninput: e => { cur[t] = e.target.value; document.documentElement.style.setProperty(t, e.target.value); } }),
          h('span.ts-name', t),
          h('span.tiny.muted', cur[t])
        ]))
      ]));
    });
    wrap.appendChild(grid);
    wrap.appendChild(h('div.card.pad-sm', { style: { marginTop: '14px', background: 'var(--bg-sunken)' } }, [
      h('b.small', 'Live preview'),
      h('div.row', { style: { gap: '8px', marginTop: '9px', flexWrap: 'wrap' } }, [
        h('button.btn.primary', 'Primary button'), h('button.btn.subtle', 'Subtle'), h('span.chip.chip-pur', 'chip'),
        h('span.tag', '#tag'), h('span.small.muted', 'muted text'), h('b', 'bold text')
      ])
    ]));
    return wrap;
  }
  function rgbToHex(v) {
    if (!v) return null;
    if (v.startsWith('#')) return v.length === 4 ? '#' + v.slice(1).split('').map(c => c + c).join('') : v;
    const m = v.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    return m ? '#' + m.slice(1, 4).map(x => Number(x).toString(16).padStart(2, '0')).join('') : null;
  }

  /* ================================================================
     CUSTOM CSS injection ("unlimited customisation")
     ================================================================ */
  function applyCustomCss() {
    let el = document.getElementById('userCss');
    if (!el) { el = h('style', { id: 'userCss' }); document.head.appendChild(el); }
    el.textContent = store().getSetting('customCss', '') || '';
  }

  /* ================================================================
     UPDATER
     ================================================================ */
  const CURRENT_VERSION = '2.0.0';
  async function checkUpdate(manual) {
    const url = store().getSetting('updateUrl', '') || '';
    if (!url) {
      if (manual) NX.ui.modal({ title: 'Updates', size: 'narrow', body: h('div', [
        h('p.small', { style: { lineHeight: '1.7' } }, [
          'You are on ', h('b', 'v' + CURRENT_VERSION), '.',
          h('br'), 'No update server is configured. Put a JSON manifest URL in the field below and Pebble will check it on launch.',
          h('br'), h('br'), 'Manifest format:',
          h('pre', { style: { background: 'var(--bg-sunken)', padding: '9px', borderRadius: '8px', fontSize: '11px', marginTop: '7px' } }, '{\n  "version": "2.1.0",\n  "url": "https://…/Pebble-complete.zip",\n  "notes": ["Fixed X", "Added Y"]\n}')
        ]),
        h('div.field', { style: { marginTop: '12px' } }, [h('label', 'Update manifest URL'), h('input.input', { id: 'updUrl', value: store().getSetting('updateUrl', ''), placeholder: 'https://your-server/update.json' })]),
      ]), footer: [h('div.grow'), h('button.btn.primary', { onclick: () => { store().setSetting('updateUrl', document.getElementById('updUrl').value.trim()); NX.ui.closeTopModal(); NX.ui.toast({ message: 'Update URL saved' }); } }, 'Save')] });
      return;
    }
    const t = manual ? NX.ui.toast({ type: 'info', message: 'Checking for updates…', duration: 0 }) : null;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const m = await res.json();
      if (t) t.close();
      if (!m.version || cmp(m.version, CURRENT_VERSION) <= 0) {
        if (manual) NX.ui.toast({ type: 'success', title: 'You\'re up to date', message: 'v' + CURRENT_VERSION + ' is the latest', duration: 4000 });
        return;
      }
      showUpdate(m);
    } catch (e) {
      if (t) t.close();
      if (manual) NX.ui.toast({ type: 'error', title: 'Update check failed', message: String(e.message || e), duration: 5000 });
    }
  }
  function cmp(a, b) {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((pa[i] || 0) > (pb[i] || 0)) return 1; if ((pa[i] || 0) < (pb[i] || 0)) return -1; }
    return 0;
  }
  function showUpdate(m) {
    NX.ui.modal({
      title: 'Update available', size: '',
      body: h('div', [
        h('div.upd-hero', [h('div.uh-ico', { style: { display: 'flex', justifyContent: 'center', color: 'var(--brand-1)' }, html: NX.glyph('gem', 46, 1.5) }), h('h2', { style: { fontSize: '21px' } }, 'v' + m.version), h('div.small.muted', 'you are on v' + CURRENT_VERSION)]),
        m.notes && m.notes.length ? h('div.changelog', h('ul', m.notes.map(n => h('li', n)))) : null
      ]),
      footer: [
        h('div.grow'),
        h('button.btn.ghost', { onclick: () => NX.ui.closeTopModal() }, 'Later'),
        h('button.btn.primary', { onclick: async () => {
          NX.ui.closeTopModal();
          // desktop + manifest provides direct asset urls -> stage & restart
          if (store().desktop && window.nex.stageUpdate && m.assets) {
            const t = NX.ui.toast({ type: 'info', message: 'Downloading update…', duration: 0 });
            try {
              const grab = async u => arrayBufferToBase64(await (await fetch(u, { cache: 'no-store' })).arrayBuffer());
              const files = [
                { name: 'index.html', content: await grab(m.assets.index) },
                { name: 'css/bundle.css', content: await grab(m.assets.css) },
                { name: 'js/bundle.js', content: await grab(m.assets.js) }
              ];
              await window.nex.stageUpdate(files);
              t.close();
              NX.ui.confirm({ title: 'Update ready', message: 'v' + m.version + ' is staged. Restart Pebble to apply it?', confirmLabel: 'Restart now', danger: false })
                .then(ok => { if (ok) window.nex.restartForUpdate(); });
            } catch (e) { t.close(); NX.ui.toast({ type: 'error', message: String(e.message || e) }); }
            return;
          }
          if (store().desktop && window.nex.saveDialog) {
            const t = NX.ui.toast({ type: 'info', message: 'Downloading update…', duration: 0 });
            try {
              const r = await fetch(m.url);
              const buf = await r.arrayBuffer();
              const b64 = arrayBufferToBase64(buf);
              const saved = await window.nex.saveDialog({ defaultPath: 'Pebble-' + m.version + '.zip', filters: [{ name: 'Zip', extensions: ['zip'] }], content: b64, base64: true });
              t.close();
              if (saved.ok) NX.ui.toast({ type: 'success', title: 'Update downloaded', message: 'Extract it over your install and restart. ' + saved.path, duration: 9000 });
            } catch (e) { t.close(); NX.ui.toast({ type: 'error', message: String(e.message || e) }); }
          } else {
            window.open(m.url, '_blank');
          }
        } }, '⬇ Download update')
      ]
    });
  }
  function arrayBufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  /* ================================================================
     PROFILES + LOGIN + SERVER SYNC
     ================================================================ */
  function profiles() { return NX.localStore.get('nexadesk.profiles', []); }
  function saveProfiles(p) { NX.localStore.set('nexadesk.profiles', p); }

  async function hashPass(pw) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('nexadesk:' + pw));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { return 'plain:' + pw; }
  }

  function loginScreen(onDone) {
    const ps = profiles();
    const root = h('div', { style: { position: 'fixed', inset: '0', zIndex: '9300', background: 'var(--bg)', overflowY: 'auto' } });
    document.body.appendChild(root);
    const draw = () => {
      NX.clear(root);
      root.appendChild(h('div.login-box', [
        h('div', { style: { textAlign: 'center', marginBottom: '20px' } }, [
          h('div', { style: { display: 'flex', justifyContent: 'center', color: 'var(--brand-1)' }, html: NX.glyph('lock', 40, 1.5) }),
          h('h2', { style: { fontSize: '20px', marginTop: '8px' } }, 'Welcome back'),
          h('div.small.muted', 'Choose a profile or sign in')
        ]),
        h('div.col', { style: { gap: '8px' } }, ps.map(p => h('button.profile-chip', { onclick: async () => {
          if (p.pass) {
            const pw = await NX.ui.prompt({ title: 'Passcode for ' + p.name, message: 'Enter your passcode' });
            if (pw === null) return;
            const hh = await hashPass(pw);
            if (hh !== p.pass) { NX.ui.toast({ type: 'error', message: 'Wrong passcode', duration: 2500 }); return; }
          }
          enter(p);
        } }, [
          h('span', { style: { fontSize: '24px' } }, p.avatar || '🦊'),
          h('div.grow', { style: { textAlign: 'left' } }, [h('b', { style: { fontSize: '13.5px', display: 'block' } }, p.name), h('span.tiny.muted', p.pass ? 'passcode protected' : 'no passcode')]),
          h('span', { html: iconHTML('chevR', 15), style: { color: 'var(--tx-4)', display: 'flex' } })
        ]))),
        h('div.divider'),
        h('button.btn.primary', { style: { width: '100%' }, onclick: async () => {
          const name = await NX.ui.prompt({ title: 'New profile', message: 'Profile name' });
          if (!name) return;
          const wantPass = await NX.ui.confirm({ title: 'Add a passcode?', message: 'Protect this profile with a passcode?', confirmLabel: 'Yes', danger: false });
          let pass = null;
          if (wantPass) { const pw = await NX.ui.prompt({ title: 'Choose passcode' }); if (pw) pass = await hashPass(pw); }
          const p = { id: NX.uid('pf'), name, avatar: '🦊', pass, created: Date.now() };
          ps.push(p); saveProfiles(ps); draw();
        } }, '+ New profile'),
        ps.length ? h('button.btn.ghost', { style: { width: '100%', marginTop: '7px' }, onclick: () => { root.remove(); onDone(); } }, 'Continue without signing in') : h('button.btn.ghost', { style: { width: '100%', marginTop: '7px' }, onclick: () => { root.remove(); onDone(); } }, 'Skip')
      ]));
    };
    function enter(p) {
      store().setSetting('activeProfile', p.id);
      store().setSetting('userName', p.name);
      if (p.avatar) { const g = NX.game.G(); g.equipped.avatar = g.equipped.avatar; }
      root.remove();
      NX.shell.updateUserFooter();
      onDone(p);
    }
    draw();
  }

  /* -------- server sync client -------- */
  async function serverSync() {
    const cfg = store().getSetting('server', null);
    if (!cfg || !cfg.url) return;
    try {
      const token = NX.localStore.get('nexadesk.serverToken', '');
      const push = async () => {
        const r = await fetch(cfg.url.replace(/\/$/, '') + '/api/sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ device: navigator.userAgent.slice(0, 60), data: store().data })
        });
        return r.ok;
      };
      const pull = async () => {
        const r = await fetch(cfg.url.replace(/\/$/, '') + '/api/sync', { headers: { 'Authorization': 'Bearer ' + token } });
        if (!r.ok) return false;
        const j = await r.json();
        if (j && j.data && j.data.notes) { store().importJSON(JSON.stringify({ data: j.data }), 'replace'); return true; }
        return false;
      };
      NX.serverClient = { push, pull, cfg };
    } catch (e) { /* offline */ }
  }

  /* ================================================================
     SETTINGS PANELS (added to the Settings module)
     ================================================================ */
  function modulesPanel() {
    const wrap = h('div');
    wrap.appendChild(h('div.card.pad-sm', { style: { background: 'var(--acc-blu-bg)', borderColor: 'rgba(74,168,232,.3)', marginBottom: '14px' } },
      h('div.small', 'Hiding a module removes it from the rail, sidebar, palette and routing. Your data is never touched — show it again any time and everything is exactly where you left it.')));
    NX.router.grouped().forEach(g => {
      wrap.appendChild(h('div.section-head', [h('h2', { style: { fontSize: '13px' } }, g.group.name)]));
      wrap.appendChild(h('div.card.pad-0', { style: { marginBottom: '12px' } }, g.modules.map(m => {
        const on = NX.features.isEnabled(m.id);
        return h('div.setting-row', { style: { padding: '9px 14px' } }, [
          h('span', { html: iconHTML(m.icon || 'zap', 16), style: { color: on ? 'var(--brand-1)' : 'var(--tx-4)', display: 'flex' } }),
          h('div.sr-text', [h('b', m.name), h('span', on ? 'visible' : 'hidden')]),
          h('div.sr-ctl', h('label.switch', [h('input', { type: 'checkbox', checked: on, onchange: e => NX.features.setEnabled(m.id, e.target.checked) }), h('span.track')]))
        ]);
      })));
    });
    return wrap;
  }

  function customPanel() {
    const wrap = h('div');
    wrap.appendChild(h('div.grid.grid-2', { style: { gap: '14px', alignItems: 'start' } }, [
      h('div.card', [
        h('div.card-head', [h('h3', '🎨 Theme Studio'), h('span.sh-sub.small.muted', 'build & save your own theme')]),
        themeStudio()
      ]),
      h('div', [
        h('div.card', { style: { marginBottom: '14px' } }, [
          h('div.card-head', [h('h3', 'Feel & motion')]),
          settingRow('Simple Mode', 'Hides advanced chrome, bigger type, calmer layout', toggleEl('simpleMode', v => NX.shellV2.toggleSimple(v))),
          settingRow('Glass blur', 'Frosted translucent surfaces', toggleEl('glassBlur', v => NX.shellV2.toggleBlur(v))),
          settingRow('Fast motion', 'Shortens every animation (feels snappier)', toggleEl('fastMotion', v => NX.shellV2.toggleMotion(v))),
          settingRow('Reduced motion', 'Disables animation entirely', toggleEl('reducedMotion', v => { store().setSetting('reducedMotion', v); document.documentElement.classList.toggle('no-motion', v); })),
          settingRow('Dynamic Island', 'The animated pill at the top', toggleEl('islandEnabled', v => NX.shellV2.toggleIsland(v))),
          h('div.setting-row', [
            h('div.sr-text', [h('b', 'Roundness'), h('span', 'scale all corner radii')]),
            h('div.sr-ctl', h('input.range', { type: 'range', min: 0, max: 1.6, step: .1, value: store().getSetting('roundScale', 1), oninput: e => { document.documentElement.style.setProperty('--round-scale', e.target.value); store().setSetting('roundScale', Number(e.target.value)); applyRound(); } }))
          ]),
          h('div.setting-row', [
            h('div.sr-text', [h('b', 'Colour saturation'), h('span', 'whole-app saturation')]),
            h('div.sr-ctl', h('input.range', { type: 'range', min: .4, max: 1.6, step: .05, value: store().getSetting('saturation', 1), oninput: e => { document.documentElement.style.setProperty('--sat', e.target.value); store().setSetting('saturation', Number(e.target.value)); } }))
          ]),
          h('div.setting-row', [
            h('div.sr-text', [h('b', 'Blur strength'), h('span', 'glass surfaces')]),
            h('div.sr-ctl', h('input.range', { type: 'range', min: 0, max: 30, step: 2, value: store().getSetting('blurAmt', 14), oninput: e => { document.documentElement.style.setProperty('--blur-amt', e.target.value + 'px'); store().setSetting('blurAmt', Number(e.target.value)); } }))
          ])
        ]),
        h('div.card', [
          h('div.card-head', [h('h3', '💉 Custom CSS'), h('span.sh-sub.small.muted', 'unlimited customisation')]),
          h('p.small.muted', { style: { marginBottom: '8px' } }, 'Injected live into the app. Target anything: .rail, .card, .island, .copilot…'),
          h('textarea.textarea', { rows: 10, style: { fontFamily: 'var(--font-mono)', fontSize: '11.5px' }, placeholder: '/* e.g. */\n.rail { width: 72px; }\n.card { border-radius: 20px; }', oninput: NX.debounce(e => { store().setSetting('customCss', e.target.value); applyCustomCss(); }, 400) }, store().getSetting('customCss', '') || '')
        ])
      ])
    ]));
    return wrap;
  }
  function applyRound() {
    const s = store().getSetting('roundScale', 1);
    const map = { '--r-xs': 4, '--r-sm': 6, '--r-md': 9, '--r-lg': 13, '--r-xl': 18 };
    Object.entries(map).forEach(([k, v]) => document.documentElement.style.setProperty(k, Math.round(v * s) + 'px'));
  }
  function settingRow(label, hint, ctl) {
    return h('div.setting-row', [h('div.sr-text', [h('b', label), hint ? h('span', hint) : null]), h('div.sr-ctl', ctl)]);
  }
  function toggleEl(key, onchange) {
    const inp = h('input', { type: 'checkbox', checked: !!store().getSetting(key, key === 'islandEnabled' || key === 'glassBlur' ? true : false), onchange: e => onchange(e.target.checked) });
    return h('label.switch', [inp, h('span.track')]);
  }

  function accountPanel() {
    const wrap = h('div');
    const cfg = store().getSetting('server', null) || {};
    wrap.appendChild(h('div.card', { style: { marginBottom: '14px' } }, [
      h('div.card-head', [h('h3', 'Profile & login')]),
      settingRow('Profiles on this machine', String(profiles().length) + ' profile(s)', h('button.btn.sm.subtle', { onclick: () => loginScreen(() => NX.router.render()) }, 'Switch / manage')),
      settingRow('Passcode lock at start', 'Ask for the profile passcode on launch', toggleEl('loginAtStart', v => store().setSetting('loginAtStart', v)))
    ]));
    wrap.appendChild(h('div.card', { style: { marginBottom: '14px' } }, [
      h('div.card-head', [h('h3', 'Real server & sync'), h('span.sh-sub.small.muted', 'run tools/server.js anywhere on your network')]),
      h('p.small.muted', { style: { marginBottom: '10px', lineHeight: '1.7' } }, [
        'Pebble ships with a real Node server: ', h('code', 'node tools/server.js'),
        ' — REST auth (register/login with salted hashes + tokens), JSON persistence on disk, and WebSocket live sync between devices. Point the app at it below.'
      ]),
      h('div.field-row', [
        h('div.field', [h('label', 'Server URL'), h('input.input', { id: 'srvUrl', value: cfg.url || '', placeholder: 'http://192.168.1.20:8787' })]),
        h('div.field', [h('label', 'Username'), h('input.input', { id: 'srvUser', value: cfg.user || '' })]),
        h('div.field', [h('label', 'Password'), h('input.input', { id: 'srvPass', type: 'password', value: '' })])
      ]),
      h('div.row', { style: { gap: '7px', marginTop: '11px' } }, [
        h('button.btn.sm.primary', { onclick: async () => {
          const url = document.getElementById('srvUrl').value.trim();
          const user = document.getElementById('srvUser').value.trim();
          const pass = document.getElementById('srvPass').value;
          if (!url || !user) { NX.ui.toast({ type: 'warn', message: 'URL and username required' }); return; }
          const t = NX.ui.toast({ type: 'info', message: 'Connecting…', duration: 0 });
          try {
            let r = await fetch(url.replace(/\/$/, '') + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, pass }) });
            if (r.status === 404) r = await fetch(url.replace(/\/$/, '') + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, pass }) });
            const j = await r.json();
            t.close();
            if (!r.ok || !j.token) throw new Error(j.error || 'login failed');
            NX.localStore.set('nexadesk.serverToken', j.token);
            store().setSetting('server', { url, user });
            await serverSync();
            NX.ui.toast({ type: 'success', title: 'Connected to server', message: url + ' as ' + user, duration: 5000 });
            NX.router.render();
          } catch (e) { t.close(); NX.ui.toast({ type: 'error', title: 'Connection failed', message: String(e.message || e), duration: 6000 }); }
        } }, 'Connect / register'),
        NX.serverClient ? h('button.btn.sm.subtle', { onclick: async () => { await NX.serverClient.push(); NX.ui.toast({ type: 'success', message: 'Pushed to server' }); } }, '⬆ Push now') : null,
        NX.serverClient ? h('button.btn.sm.subtle', { onclick: async () => { const ok = await NX.serverClient.pull(); NX.ui.toast({ type: ok ? 'success' : 'warn', message: ok ? 'Pulled from server' : 'Nothing newer on server' }); NX.router.render(); } }, '⬇ Pull now') : null
      ]),
      NX.serverClient ? h('div.small.muted', { style: { marginTop: '9px' } }, 'Connected: ' + NX.serverClient.cfg.url) : null
    ]));
    wrap.appendChild(h('div.card', [
      h('div.card-head', [h('h3', 'Updates')]),
      settingRow('Current version', 'v' + CURRENT_VERSION, h('button.btn.sm.subtle', { onclick: () => checkUpdate(true) }, 'Check now')),
      settingRow('Update manifest URL', 'JSON with {version, url, notes[]}', h('input.input.sm', { value: store().getSetting('updateUrl', ''), style: { width: '240px' }, placeholder: 'https://…/update.json', onchange: e => store().setSetting('updateUrl', e.target.value.trim()) })),
      settingRow('Check on launch', '', toggleEl('checkUpdates', v => store().setSetting('checkUpdates', v)))
    ]));
    return wrap;
  }

  /* ================================================================
     BOOT WIRING
     ================================================================ */
  /* ---------- desktop widget island (frameless top pill window) ---------- */
  function widgetMode() {
    document.body.classList.add('widgetmode');
    // every navigation from the widget focuses the real window instead
    NX.router.navigate = function (hash) {
      if (window.nex && window.nex.widgetAction) return window.nex.widgetAction(String(hash));
      location.hash = String(hash);
    };
    const origGo = NX.router.go;
    NX.router.go = function (id, params) {
      let hh = '#/' + id;
      if (params) for (const k in params) { if (k === 'id') hh += '/' + encodeURIComponent(params[k]); }
      return NX.router.navigate(hh);
    };
    buildIsland();
    const isl = document.getElementById('island');
    if (isl) { isl.style.boxShadow = '0 8px 30px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08) inset'; }
  }

  function init() {
    if (new URLSearchParams(location.search).get('widget') === '1') { widgetMode(); return; }
    // apply persisted preferences
    if (store().getSetting('simpleMode')) document.documentElement.dataset.simple = 'on';
    if (store().getSetting('glassBlur') === false) document.documentElement.dataset.blur = 'off';
    if (NX.applyThemeVars) NX.applyThemeVars(store().getSetting('theme', 'dark'));
    if (store().getSetting('fastMotion')) document.documentElement.dataset.motion = 'fast';
    if (store().getSetting('reducedMotion')) document.documentElement.classList.add('no-motion');
    document.documentElement.style.setProperty('--sat', store().getSetting('saturation', 1));
    document.documentElement.style.setProperty('--blur-amt', (store().getSetting('blurAmt', 14)) + 'px');
    applyRound();
    applyCustomCss();
    NX.game.applyCosmetics();

    // splash v2 replaces the old boot splash
    const oldBoot = document.getElementById('boot');
    if (oldBoot) oldBoot.remove();
    splash();

    // island
    buildIsland();

    // copilot + prompts/skills drop
    NX.copilot.init();
    NX.prompts.initDrop();

    // game hooks
    NX.game.hookEvents && NX.game.hookEvents();
    NX.game.evaluateCommitment();

    // xp chip in sidebar footer
    const foot = document.querySelector('.sb-foot');
    if (foot && !foot.querySelector('.xp-chip')) foot.insertBefore(NX.game.xpChip(), foot.firstChild);

    // login gate
    if (store().getSetting('loginAtStart') && profiles().length) {
      loginScreen(() => {});
    } else if (!store().getSetting('onboarded')) {
      setTimeout(() => onboarding(() => { NX.router.render(); }), 1900);
    }

    // update check
    if (store().getSetting('checkUpdates', true)) setTimeout(() => checkUpdate(false), 3000);

    // server sync bootstrap
    serverSync();

    // lock guard on routing
    const origRender = NX.router.render;
    NX.router.render = function () {
      if (NX.game.isLocked() && !NX.game.ALLOWED_WHEN_LOCKED.has(NX.router.parseHash().id)) {
        NX.game.showLockScreen();
        return;
      }
      return origRender.apply(NX.router, arguments);
    };

    // pomodoro state bridge for the island
    setInterval(() => {
      const el = document.getElementById('pomoTime');
      if (NX.router.currentId() === 'pomodoro' && el && el.dataset.remaining) window.__nxPomo = { remaining: Number(el.dataset.remaining), label: 'focus' };
      else if (NX.router.currentId() !== 'pomodoro') window.__nxPomo = null;
    }, 1000);
  }

  NX.shellV2 = Object.assign(NX.shellV2, {
    init, buildIsland, paintIsland, splash, onboarding, themeStudio, modulesPanel, customPanel, accountPanel,
    checkUpdate, loginScreen, profiles, serverSync, applyCustomCss, CURRENT_VERSION
  });

  // auto-run after the shell boots
  const waitForApp = setInterval(() => {
    if (document.getElementById('app') && !document.getElementById('app').hidden) {
      clearInterval(waitForApp);
      setTimeout(init, 80);
    }
  }, 120);
})(window.NX);
