/* ============================================================
   Pebble — 82-easy.js : the calm layer
   • HOME: one screen, one decision at a time (default landing)
   • Easy Mode: rail shows only 5 essentials + "More" grid
   • Circadian auto-theme (dawn/day/dusk/night)
   • Zen Write fullscreen editor
   • Ambient sound engine (generated, zero assets)
   • Eisenhower matrix view for tasks
   • Streak freezes (game)
   • Share-card export (SVG)
   • Scratchpad (always-there quick notes)
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, iconHTML, glyph, glyphOrText } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  const ESSENTIALS = ['home', 'tasks', 'notes', 'calendar', 'game'];

  NX.easy = {
    isOn: () => store().getSetting('easyMode', true) !== false,
    set(v) {
      store().setSetting('easyMode', v);
      NX.shell.buildRail(); NX.shell.buildSidebar();
      NX.ui.toast({ type: 'success', title: v ? 'Easy Mode on' : 'Full mode on', message: v ? 'Five buttons. One clear home. Everything else lives in ⌘K and the More grid.' : 'All 22 modules are back in the rail.', duration: 5000 });
      if (v && !NX.easy.isEssential(NX.router.currentId())) NX.router.navigate('#/home');
    },
    isEssential(id) { return ESSENTIALS.includes(id) || id === 'settings' || id === 'search' || id === 'ai' || id === 'copilot'; },
    essentials: () => ESSENTIALS
  };

  // rail filtering: patch visible() again (composed with feature hiding)
  const prevVisible = NX.router.visible;
  NX.router.visible = function () {
    let list = prevVisible.call(NX.router);
    if (NX.easy.isOn()) list = list.filter(m => NX.easy.isEssential(m.id));
    return list;
  };

  /* ================= HOME — the calm screen ================= */
  function nextBestAction() {
    // one single suggestion, ranked
    const overdue = sel().overdueTasks();
    if (overdue.length) return { kind: 'task', icon: 'check', title: overdue[0].title, sub: 'overdue — clear it first', run: () => NX.components.openTask(overdue[0].id), done: () => NX.components.toggleTaskDone(overdue[0].id) };
    const due = sel().tasksDueOn(new Date()).filter(t => !t.done);
    if (due.length) return { kind: 'task', icon: 'check', title: due[0].title, sub: 'due today', run: () => NX.components.openTask(due[0].id), done: () => NX.components.toggleTaskDone(due[0].id) };
    const hab = store().habits.all().find(x => x.active !== false && !sel().habitDoneOn(x, NX.todayStr()));
    if (hab) return { kind: 'habit', icon: 'flame', title: hab.name, sub: 'today\'s habit · 2 minutes', run: () => NX.router.navigate('#/habits'), done: () => NX.components.toggleHabit(hab.id) };
    if (sel().focusMinutesToday() < 25) return { kind: 'focus', icon: 'clock', title: 'One focus block', sub: '25 minutes on the thing that matters', run: () => NX.router.navigate('#/pomodoro'), done: null };
    if (!sel().journalFor(NX.todayStr())) return { kind: 'journal', icon: 'note', title: 'Two sentences about today', sub: 'future-you says thanks', run: () => NX.router.go('journal', { date: NX.todayStr() }), done: null };
    return { kind: 'free', icon: 'zen', title: 'You\'re clear', sub: 'nothing is asking for you. enjoy it, or start something small.', run: () => NX.shell.openQuickCapture(), done: null };
  }

  function renderHome() {
    const page = h('div.page.narrow', { style: { maxWidth: '720px', paddingTop: '6vh' } });
    const g = NX.game.G();
    const hour = new Date().getHours();
    const greet = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const name = store().getSetting('userName', 'friend');

    page.appendChild(h('div', { style: { textAlign: 'center', marginBottom: '34px' }, class: 'fade-in' }, [
      h('div', { style: { display: 'inline-flex', color: 'var(--brand-1)', marginBottom: '10px' }, html: glyph('pebble', 44, 1.5) }),
      h('h1', { style: { fontSize: '34px', letterSpacing: '-1px', fontWeight: '800' } }, greet + ', ' + name.split(' ')[0] + '.'),
      h('p', { style: { color: 'var(--tx-3)', fontSize: '15px', marginTop: '6px' } }, NX.fmtDate(new Date(), 'long'))
    ]));

    // THE one card
    const na = nextBestAction();
    const card = h('div.card.hover-lift', { style: { padding: '26px 26px', textAlign: 'center', borderColor: 'rgba(124,108,255,.35)', background: 'linear-gradient(160deg, var(--sel), var(--bg-card) 60%)' } });
    card.appendChild(h('div.small.muted', { style: { textTransform: 'uppercase', letterSpacing: '1.2px', fontSize: '10.5px', fontWeight: '700', marginBottom: '12px' } }, 'the one thing'));
    card.appendChild(h('div', { style: { display: 'flex', justifyContent: 'center', color: 'var(--brand-1)', marginBottom: '10px' }, html: glyph(na.icon, 34, 1.6) }));
    card.appendChild(h('div', { style: { fontSize: '21px', fontWeight: '700', letterSpacing: '-.4px', lineHeight: '1.35' } }, na.title));
    card.appendChild(h('div.small.muted', { style: { marginTop: '5px' } }, na.sub));
    card.appendChild(h('div.row', { style: { justifyContent: 'center', gap: '9px', marginTop: '18px' } }, [
      na.done ? h('button.btn.success.lg.press', { onclick: () => { na.done(); NX.game.award(10, 'Did the one thing'); NX.router.render(); } }, [h('span', { html: iconHTML('check', 16), style: { display: 'flex' } }), 'Done']) : null,
      h('button.btn.primary.lg.press', { onclick: na.run }, 'Open →'),
      h('button.btn.ghost.lg', { title: 'Not this — show the next best thing', onclick: () => { shuffleNext(); } }, 'Something else')
    ]));
    page.appendChild(card);

    // today at a glance — three numbers, no more
    const done = store().tasks.all().filter(t => t.done && t.completed && NX.isToday(t.completed)).length;
    const hab = sel().habitsCompletedToday();
    page.appendChild(h('div.grid.grid-3', { style: { gap: '10px', marginTop: '14px' }, class: 'stagger' }, [
      glance('check', String(done), 'tasks done'),
      glance('flame', hab.done + '/' + hab.total, 'habits'),
      glance('clock', NX.fmtDuration(sel().focusMinutesToday()), 'focus')
    ]));

    // three big friendly buttons
    page.appendChild(h('div.grid.grid-3', { style: { gap: '10px', marginTop: '10px' }, class: 'stagger' }, [
      big('plus', 'Capture a thought', () => NX.shell.openQuickCapture()),
      big('sound', 'Ambient sound', () => NX.easy.soundPanel()),
      big('zen', 'Zen write', () => NX.easy.zenWrite())
    ]));

    // gentle footer row
    page.appendChild(h('div.row', { style: { justifyContent: 'center', gap: '14px', marginTop: '26px', flexWrap: 'wrap' } }, [
      h('button.btn.ghost.sm', { onclick: () => NX.shell.openPalette() }, '⌘K anything'),
      h('button.btn.ghost.sm', { onclick: () => NX.copilot.toggle() }, 'Ask the copilot'),
      h('button.btn.ghost.sm', { onclick: () => NX.easy.moreGrid() }, 'All modules'),
      h('button.btn.ghost.sm', { onclick: () => NX.easy.set(false) }, 'Turn off Easy Mode')
    ]));
    return page;
  }
  function glance(ic, val, label) {
    return h('div.stat', { style: { textAlign: 'center', padding: '14px 8px' } }, [
      h('div', { style: { display: 'flex', justifyContent: 'center', color: 'var(--tx-4)', marginBottom: '4px' }, html: glyph(ic, 17) }),
      h('div.st-value', { style: { fontSize: '20px' } }, val),
      h('div.st-sub', label)
    ]);
  }
  function big(ic, label, fn) {
    return h('button.qa-btn.press', { style: { padding: '16px 8px' }, onclick: fn }, [
      h('span.qa-ico', { style: { background: 'transparent', color: 'var(--brand-1)' }, html: glyph(ic, 22, 1.7) }),
      h('span', label)
    ]);
  }
  let shuffleSkip = new Set();
  function shuffleNext() {
    const cur = nextBestAction();
    shuffleSkip.add(cur.title);
    // temporarily hide skipped by filtering: simplest = rotate habits/tasks lists
    const origFind = Array.prototype.find;
    NX.router.render();
    setTimeout(() => { shuffleSkip.clear(); }, 30000);
  }

  /* ================= MORE grid (all modules, friendly) ================= */
  function moreGrid() {
    const all = NX.router.all().filter(m => !m.hidden);
    NX.ui.modal({
      title: 'Everything in Pebble', subtitle: 'Easy Mode keeps the rail to five. This is the whole toolbox.', size: 'wide', hideFooter: true,
      body: h('div.grid.grid-auto', { style: { gap: '9px' } }, all.map(m => h('button.card.hoverable.pad-sm', { style: { textAlign: 'left', cursor: 'pointer', display: 'flex', gap: '11px', alignItems: 'center' }, onclick: () => { NX.ui.closeTopModal(); NX.router.navigate('#/' + m.id); } }, [
        h('span', { style: { color: 'var(--brand-1)', display: 'flex' }, html: iconHTML(m.icon || 'zap', 19) }),
        h('div', [h('b', { style: { fontSize: '13px', display: 'block' } }, m.name), h('span.tiny.muted', (MODULE_BLURB[m.id] || ''))])
      ])))
    });
  }
  const MODULE_BLURB = {
    home: 'the calm screen', tasks: 'to-dos, kanban, plan', notes: 'write & link ideas', calendar: 'your week, visually',
    game: 'points, shop, quests', reminders: 'never forget again', habits: 'streaks & heatmaps', goals: 'OKRs with pace',
    journal: 'mood & memory', pomodoro: 'focus timer', time: 'where hours go', finance: 'money, budgets', contacts: 'your people',
    bookmarks: 'save the good stuff', wiki: 'knowledge base + graph', chat: 'teams & channels', inbox: 'one list of pings',
    ai: 'insights & tools', search: 'find anything', prompts: 'your prompt library', skills: 'skill wallet', settings: 'make it yours'
  };

  /* ================= circadian auto-theme ================= */
  function circadianTick() {
    if (!store().getSetting('circadian', false)) return;
    const hh = new Date().getHours();
    const want = hh < 6 ? 'midnight' : hh < 9 ? 'sepia' : hh < 18 ? 'light' : hh < 22 ? 'dark' : 'midnight';
    if (store().getSetting('theme') !== want) { store().setSetting('theme', want); }
  }

  /* ================= zen write ================= */
  function zenWrite() {
    const back = h('div', { style: { position: 'fixed', inset: '0', zIndex: '8800', background: 'var(--bg)', overflowY: 'auto' } });
    const ta = h('textarea', { placeholder: 'just write.\n\nnothing else exists right now.', spellcheck: 'true' });
    Object.assign(ta.style, {
      display: 'block', maxWidth: '680px', margin: '10vh auto 0', width: '92%', minHeight: '66vh',
      border: '0', outline: 'none', background: 'transparent', color: 'var(--tx)',
      fontSize: '18px', lineHeight: '1.85', resize: 'none', fontFamily: 'inherit'
    });
    const words = h('span.tiny.muted', '0 words');
    ta.addEventListener('input', NX.debounce(() => {
      words.textContent = ta.value.trim().split(/\s+/).filter(Boolean).length + ' words';
      NX.localStore.set('nexadesk.zen', ta.value);
    }, 250));
    ta.value = NX.localStore.get('nexadesk.zen', '') || '';
    back.appendChild(h('div', { style: { position: 'sticky', top: '0', display: 'flex', gap: '10px', justifyContent: 'center', padding: '14px', alignItems: 'center' }, class: 'glass' }, [
      h('span', { style: { color: 'var(--brand-1)', display: 'flex' }, html: glyph('zen', 17) }),
      h('b.small', 'Zen Write'), words,
      h('button.btn.sm.subtle', { onclick: () => {
        const n = store().notes.create({ title: 'Zen — ' + NX.fmtDate(new Date(), 'medium'), icon: 'note', emoji: '', tags: [], parentId: null, order: 0, favorite: false, archived: false, properties: [], blocks: NX.md.markdownToBlocks(ta.value || '') });
        back.remove(); NX.router.go('notes', { id: n.id });
        NX.ui.toast({ type: 'success', message: 'Saved as a note' });
      } }, 'Save as note'),
      h('button.btn.sm.ghost', { onclick: () => back.remove() }, 'Close (Esc)')
    ]));
    back.appendChild(ta);
    document.body.appendChild(back);
    back.addEventListener('keydown', e => { if (e.key === 'Escape') back.remove(); });
    setTimeout(() => ta.focus(), 60);
  }

  /* ================= ambient sound engine ================= */
  let audioCtx = null, noiseNodes = [];
  const SOUNDS = [
    { id: 'rain', name: 'Rain', icon: 'tide', make: ctx => filteredNoise(ctx, 'lowpass', 900, .5, true) },
    { id: 'brown', name: 'Deep focus', icon: 'sound', make: ctx => filteredNoise(ctx, 'lowpass', 320, .8, false) },
    { id: 'wind', name: 'Wind', icon: 'wave', make: ctx => filteredNoise(ctx, 'bandpass', 500, .35, true) },
    { id: 'waves', name: 'Ocean', icon: 'tide', make: ctx => filteredNoise(ctx, 'lowpass', 700, .55, true, .08) },
    { id: 'white', name: 'White noise', icon: 'spark', make: ctx => filteredNoise(ctx, 'highpass', 400, .18, false) }
  ];
  function filteredNoise(ctx, type, freq, gain, lfo, lfoRate) {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(flt); flt.connect(g); g.connect(ctx.destination);
    let lfoNode = null;
    if (lfo) { lfoNode = ctx.createOscillator(); const lg = ctx.createGain(); lfoNode.frequency.value = lfoRate || .12; lg.gain.value = gain * .45; lfoNode.connect(lg); lg.connect(g.gain); lfoNode.start(); }
    src.start();
    return { stop() { try { src.stop(); lfoNode && lfoNode.stop(); } catch (e) {} } };
  }
  function soundPanel() {
    const playing = new Set(noiseNodes.map(n => n.id));
    NX.ui.modal({
      title: 'Ambient sound', subtitle: 'generated live — no files, no network', size: '', hideFooter: true,
      body: h('div.grid.grid-auto-sm', { style: { gap: '9px' } }, SOUNDS.map(s => h('button.card.hoverable.pad-sm', { style: { textAlign: 'center', cursor: 'pointer', borderColor: playing.has(s.id) ? 'var(--brand-1)' : undefined }, onclick: e => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const i = noiseNodes.findIndex(n => n.id === s.id);
        if (i >= 0) { noiseNodes[i].node.stop(); noiseNodes.splice(i, 1); }
        else noiseNodes.push({ id: s.id, node: s.make(audioCtx) });
        NX.ui.closeTopModal(); soundPanel();
      } }, [
        h('div', { style: { display: 'flex', justifyContent: 'center', color: playing.has(s.id) ? 'var(--brand-1)' : 'var(--tx-3)', marginBottom: '6px' }, html: glyph(s.icon, 24, 1.7) }),
        h('b', { style: { fontSize: '12.5px', display: 'block' } }, s.name),
        h('span.tiny', { style: { color: playing.has(s.id) ? 'var(--acc-grn)' : 'var(--tx-4)' } }, playing.has(s.id) ? 'playing — tap to stop' : 'tap to play')
      ]))),
    });
  }

  /* ================= eisenhower matrix ================= */
  function matrixView() {
    const tasks = sel().openTasks();
    const quad = (t) => {
      const urgent = !!t.due && NX.diffDays(t.due, new Date()) <= 2 || t.priority === 'Urgent';
      const important = t.priority === 'High' || t.priority === 'Urgent' || !!t.projectId;
      return (urgent ? 'u' : 'n') + (important ? 'i' : 'x');
    };
    const BOXES = [
      ['ui', 'Do now', 'urgent + important', 'var(--acc-red)'],
      ['ni', 'Schedule', 'important, not urgent', 'var(--acc-blu)'],
      ['ux', 'Delegate / shrink', 'urgent, not important', 'var(--acc-org)'],
      ['nx', 'Maybe delete', 'neither — be honest', 'var(--tx-4)']
    ];
    const wrap = h('div.page.wide');
    wrap.appendChild(NX.components.pageHead({ icon: 'matrix', title: 'Priority matrix', sub: 'drag nothing — just look. four boxes, one truth.' }));
    const grid = h('div.grid.grid-2', { style: { gap: '12px' } });
    BOXES.forEach(([key, title, sub, color]) => {
      const items = tasks.filter(t => quad(t) === key);
      grid.appendChild(h('div.card', { style: { borderTop: '3px solid ' + color, minHeight: '210px' } }, [
        h('div.row', { style: { marginBottom: '9px' } }, [h('b', { style: { fontSize: '13.5px' } }, title), h('span.badge-count', String(items.length)), h('div.grow'), h('span.tiny.muted', sub)]),
        items.length ? h('div', items.slice(0, 9).map(t => h('div.task-row', { style: { padding: '5px 6px' }, onclick: () => NX.components.openTask(t.id) }, [
          h('button.task-check' + (t.priority === 'High' ? '.p-high' : ''), { onclick: e => { e.stopPropagation(); NX.components.toggleTaskDone(t.id); NX.router.render(); } }),
          h('div.tr-main', h('div.tr-title', { style: { fontSize: '12.6px' } }, t.title))
        ]))) : h('p.tiny.muted', 'empty — good'),
        items.length > 9 ? h('div.tiny.muted', { style: { marginTop: '6px' } }, '+' + (items.length - 9) + ' more') : null
      ]));
    });
    wrap.appendChild(grid);
    return wrap;
  }

  /* ================= streak freezes ================= */
  function freezeUI() {
    const g = NX.game.G();
    g.freezes = g.freezes === undefined ? 1 : g.freezes;
    return h('div.row', { style: { gap: '8px', alignItems: 'center' } }, [
      h('span', { style: { color: 'var(--acc-blu)', display: 'flex' }, html: glyph('freeze', 18) }),
      h('b.small', g.freezes + ' freeze' + (g.freezes === 1 ? '' : 's')),
      h('span.tiny.muted', 'protects a missed day'),
      h('button.btn.xs.subtle', { onclick: () => { if (g.points >= 150) { g.points -= 150; g.freezes++; NX.store.touch(); NX.ui.toast({ type: 'success', message: 'Freeze bought (150 pts)' }); NX.router.render(); } else NX.ui.toast({ type: 'warn', message: 'Needs 150 points' }); } }, 'Buy · 150pts'),
      h('button.btn.xs.ghost', { onclick: () => { const missed = (g.lock.missedDates || []); if (g.freezes > 0 && missed.length) { g.freezes--; missed.pop(); NX.store.touch(); NX.ui.toast({ type: 'success', message: 'Freeze used — miss forgiven' }); NX.router.render(); } else NX.ui.toast({ type: 'info', message: 'Nothing to freeze' }); } }, 'Use')
    ]);
  }

  /* ================= share card (SVG) ================= */
  function shareCard() {
    const g = NX.game.G();
    const lv = NX.game.levelFromXp(g.totalXp);
    const hab = sel().habitsCompletedToday();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="340" viewBox="0 0 640 340">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#141419"/><stop offset="1" stop-color="#1d1b2e"/></linearGradient>
<linearGradient id="ac" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7c6cff"/><stop offset="1" stop-color="#33b8a3"/></linearGradient></defs>
<rect width="640" height="340" rx="26" fill="url(#bg)"/>
<rect x="26" y="26" width="588" height="288" rx="18" fill="none" stroke="url(#ac)" stroke-width="1.4" opacity=".55"/>
<text x="52" y="86" fill="#f0f0ee" font-family="system-ui,sans-serif" font-size="30" font-weight="800">pebble</text>
<text x="52" y="116" fill="#8f8f98" font-family="system-ui,sans-serif" font-size="15">${NX.esc(store().getSetting('userName', 'you'))} · level ${lv.level} ${NX.esc(NX.game.rankFor(lv.level))}</text>
<text x="52" y="180" fill="#e8e8e4" font-family="system-ui,sans-serif" font-size="44" font-weight="800">${NX.fmtNum(g.points)} pts</text>
<text x="52" y="212" fill="#8f8f98" font-family="system-ui,sans-serif" font-size="14">${g.stats.tasksDone || 0} tasks · ${NX.fmtDuration(g.stats.focusMin || 0)} focus · habits ${hab.done}/${hab.total} today</text>
<g transform="translate(52,240)" stroke="url(#ac)" stroke-width="2.2" fill="none" stroke-linecap="round">
<path d="M0 14c0-7.7 6.3-14 14-14s14 6.3 14 14-6.3 14-14 14-14-6.3-14-14Z"/><path d="M6 13c0-4.4 3.6-7.7 8-7.7"/></g>
<text x="96" y="260" fill="#6d6d76" font-family="system-ui,sans-serif" font-size="13">everything in one smooth place</text>
</svg>`;
    NX.ui.modal({
      title: 'Your share card', size: '', body: h('div', [h('div', { html: svg, style: { borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--bd)' } })]),
      footer: [h('div.grow'),
        h('button.btn.ghost', { onclick: () => NX.copyText(svg).then(() => NX.ui.toast({ message: 'SVG copied', duration: 1600 })) }, 'Copy SVG'),
        h('button.btn.primary', { onclick: () => NX.download('pebble-card.svg', svg, 'image/svg+xml') }, 'Download .svg')]
    });
  }

  /* ================= scratchpad ================= */
  function scratchpad() {
    const val = NX.localStore.get('nexadesk.scratch', '') || '';
    const ta = h('textarea.textarea', { rows: 14, placeholder: 'temporary thoughts, pastes, lists…\nauto-saved, never in your notes.' });
    ta.value = val;
    ta.style.fontFamily = 'var(--font-mono)'; ta.style.fontSize = '12.5px';
    ta.addEventListener('input', NX.debounce(() => NX.localStore.set('nexadesk.scratch', ta.value), 300));
    NX.ui.modal({
      title: 'Scratchpad', subtitle: 'auto-saved locally', size: 'wide',
      body: ta,
      footer: [h('button.btn.ghost', { onclick: () => { NX.localStore.set('nexadesk.scratch', ''); ta.value = ''; } }, 'Clear'),
        h('div.grow'),
        h('button.btn.subtle', { onclick: () => { const n = store().notes.create({ title: 'From scratchpad — ' + NX.fmtDate(new Date(), 'medium'), icon: 'note', emoji: '', tags: [], parentId: null, order: 0, favorite: false, archived: false, properties: [], blocks: NX.md.markdownToBlocks(ta.value) }); NX.ui.closeTopModal(); NX.router.go('notes', { id: n.id }); } }, '→ Note'),
        h('button.btn.primary', { onclick: () => NX.ui.closeTopModal() }, 'Done')]
    });
    setTimeout(() => ta.focus(), 50);
  }

  /* ================= register home + wire ================= */
  NX.router.register({
    id: 'home', name: 'Home', icon: 'home', group: 'capture', order: 0,
    render: renderHome,
    commands: () => [
      { label: 'Easy Mode: on', icon: 'shield', run: () => NX.easy.set(true) },
      { label: 'Easy Mode: off (full rail)', icon: 'grid', run: () => NX.easy.set(false) },
      { label: 'Zen Write', icon: 'zen', run: zenWrite },
      { label: 'Ambient sound', icon: 'sound', run: soundPanel },
      { label: 'Scratchpad', icon: 'scratch', run: scratchpad },
      { label: 'Priority matrix', icon: 'matrix', run: () => NX.router.go('tasks', { view: 'matrix' }) },
      { label: 'Share card', icon: 'share', run: shareCard },
      { label: 'All modules grid', icon: 'grid', run: moreGrid }
    ]
  });

  NX.easy.moreGrid = moreGrid;
  NX.easy.zenWrite = zenWrite;
  NX.easy.soundPanel = soundPanel;
  NX.easy.scratchpad = scratchpad;
  NX.easy.shareCard = shareCard;
  NX.easy.matrixView = matrixView;
  NX.easy.freezeUI = freezeUI;
  NX.easy.circadianTick = circadianTick;
  NX.easy.renderHome = renderHome;

  // matrix as a tasks view
  const origTasksRender = NX.router.get('tasks').render;
  NX.router.get('tasks').render = function (params) {
    if (params && params.view === 'matrix') return NX.easy.matrixView();
    return origTasksRender.apply(this, arguments);
  };

  // circadian every 10 min
  setInterval(circadianTick, 600000);
  setTimeout(circadianTick, 4000);

  // freezes in game commitment tab
  const origGameRender = NX.router.get('game').render;
  NX.router.get('game').render = function (params) {
    const page = origGameRender.apply(this, arguments);
    if (params && params.tab === 'commitment') {
      const card = h('div.card', { style: { marginBottom: 'var(--sp-4)' } }, [
        h('div.card-head', [h('h3', 'Streak freezes')]),
        h('p.small.muted', { style: { marginBottom: '10px' } }, 'A freeze forgives one missed day without an ad. Buy them with points, spend them when life happens.'),
        freezeUI()
      ]);
      page.appendChild(card);
    }
    return page;
  };

  // share card button on game home
  const gameHomeAppend = () => {};
  setTimeout(() => {
    const g = NX.router.get('game');
    const or2 = g.render;
    g.render = function (params) {
      const page = or2.apply(this, arguments);
      if (!params || !params.tab || params.tab === 'home') {
        page.appendChild(h('div.row', { style: { justifyContent: 'center', marginTop: '18px' } }, [
          h('button.btn.subtle.sm', { onclick: shareCard }, [h('span', { html: glyph('share', 14), style: { display: 'flex' } }), 'Share your progress card'])
        ]));
      }
      return page;
    };
  }, 0);
})(window.NX);
