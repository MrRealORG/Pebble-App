/* ============================================================
   Pebble — 86-widgetwall.js : HOME as a widget wall
   Nothing-OS / fitness-watch style widgets, add/remove/reorder,
   DiceBear avatars wired into the whole app.
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, seg, dotText, dotGrid, analogClock, dicebearIMG } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  const wallState = () => {
    const s = store().getSetting('wallWidgets', null);
    return Array.isArray(s) ? s : ['next', 'tasks', 'focus', 'habits', 'progress', 'clock', 'toggles', 'points', 'ambient', 'you'];
  };
  const saveWall = list => store().setSetting('wallWidgets', list);
  let editing = false;

  /* ================= widget registry ================= */
  const W = {};

  W.next = {
    name: 'Next up', desc: 'departure board for your next event', span: 'w2',
    render() {
      const evs = sel().upcomingEvents(3);
      const rows = evs.length ? evs : null;
      const card = h('div.wgt.w2.sf-ink.board');
      card.appendChild(h('div.wg-label', { style: { color: 'rgba(255,255,255,.55)' } }, [h('span.wg-ico', { html: NX.glyph('cal', 12) }), 'NEXT UP']));
      if (!rows) { card.appendChild(h('div', { style: { fontSize: '12px', opacity: .6 } }, 'nothing scheduled. enjoy the silence.')); return card; }
      rows.forEach(e => {
        const d = new Date(e.start);
        card.appendChild(h('div.bd-row', [
          h('span', { html: NX.dotText(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), 2.2, { color: '#d4f04a', style: 'display:inline-block' }) }),
          h('span', { style: { flex: '1', textAlign: 'right', fontSize: '11px' } }, (e.title || '').slice(0, 26)),
          h('span', { style: { opacity: .55 } }, NX.DAYS_S[d.getDay()].toUpperCase() + ' ' + d.getDate())
        ]));
      });
      card.appendChild(h('div.wg-sub', { style: { color: 'rgba(255,255,255,.5)' } }, evs.length ? 'tap island for actions' : ''));
      card.style.cursor = 'pointer';
      card.onclick = () => NX.router.navigate('#/calendar');
      return card;
    }
  };

  W.tasks = {
    name: 'Tasks today', desc: 'seg-digit counter', span: '',
    render() {
      const due = sel().tasksDueOn(new Date()).filter(t => !t.done);
      const od = sel().overdueTasks().length;
      const card = h('div.wgt.sf-lime');
      card.appendChild(h('div.wg-label', [h('span.wg-ico', { html: NX.glyph('check', 12), style: 'color:inherit' }), 'TASKS TODAY']));
      card.appendChild(h('div.wg-big', { html: seg(String(due.length), 40, { color: '#17171b', dim: 'rgba(0,0,0,.14)' }) }));
      card.appendChild(h('div.wg-sub', od ? od + ' OVERDUE — CLEAR FIRST' : 'ALL CLEAR'));
      card.style.cursor = 'pointer'; card.onclick = () => NX.router.navigate('#/tasks');
      return card;
    }
  };

  W.focus = {
    name: 'Focus', desc: 'minutes of deep work today', span: '',
    render() {
      const m = sel().focusMinutesToday();
      const card = h('div.wgt.sf-orange');
      card.appendChild(h('div.wg-label', [h('span.wg-ico', { html: NX.glyph('target', 12), style: 'color:inherit' }), 'FOCUS']));
      card.appendChild(h('div.wg-big', { html: seg(String(m), 40, { color: '#221204', dim: 'rgba(0,0,0,.14)' }) + '<span class="wg-unit">MIN</span>' }));
      card.appendChild(h('div.wg-sub', m >= 25 ? 'AT LEAST ONE BLOCK. RESPECT.' : 'NO BLOCK YET — START ONE'));
      card.style.cursor = 'pointer'; card.onclick = () => NX.router.navigate('#/pomodoro');
      return card;
    }
  };

  W.habits = {
    name: 'Habits', desc: 'today ring + week dots', span: '',
    render() {
      const t = sel().habitsCompletedToday();
      const card = h('div.wgt.sf-ink', { style: { color: '#f2f3f5' } });
      card.appendChild(h('div.wg-label', { style: { color: 'rgba(255,255,255,.55)' } }, [h('span.wg-ico', { html: NX.glyph('flame', 12), style: 'color:#d4f04a' }), 'HABITS']));
      card.appendChild(h('div.row', { style: { gap: '12px', alignItems: 'center' } }, [
        h('div', { html: NX.ui.ring(t.total ? t.done / t.total * 100 : 0, 62, 7).outerHTML.replace('var(--brand-1)', '#d4f04a') }),
        h('div', [
          h('div', { html: seg(t.done + '/' + t.total, 26, { color: '#f2f3f5', dim: 'rgba(255,255,255,.14)' }) }),
          h('div.wg-sub', { style: { color: 'rgba(255,255,255,.5)' } }, 'TODAY')
        ])
      ]));
      card.style.cursor = 'pointer'; card.onclick = () => NX.router.navigate('#/habits');
      return card;
    }
  };

  W.progress = {
    name: 'Progress matrix', desc: '7-day habit dot matrix', span: 'w2',
    render() {
      const habits = store().habits.all().filter(x => x.active !== false).slice(0, 6);
      const card = h('div.wgt.w2.sf-pink');
      card.appendChild(h('div.wg-label', [h('span.wg-ico', { html: NX.glyph('graph', 12), style: 'color:inherit' }), 'PROGRESS — 7 DAYS']));
      if (!habits.length) { card.appendChild(h('div.wg-sub', 'NO HABITS YET')); return card; }
      card.appendChild(h('div', { html: dotGrid(habits.length, 7, (r, c) => {
        const hb = habits[r];
        const d = NX.addDays(NX.startOfWeek(new Date(), 1), c);
        return sel().habitDoneOn(hb, NX.ymd(d));
      }, { px: 15, gap: 6, on: '#17171b', off: 'rgba(255,255,255,.75)' }) }));
      card.appendChild(h('div.row', { style: { justifyContent: 'space-between', marginTop: '8px' } },
        habits.slice(0, 4).map(hb => h('span', { style: { fontSize: '8.5px', fontWeight: 800, letterSpacing: '1px' } }, (hb.name || '').toUpperCase().slice(0, 10)))));
      card.style.cursor = 'pointer'; card.onclick = () => NX.router.navigate('#/habits');
      return card;
    }
  };

  W.clock = {
    name: 'Clock', desc: 'analog, nothing-style', span: '',
    render() {
      const card = h('div.wgt.sf-paper', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111' } });
      const face = h('div', { html: analogClock(108, { accent: '#e32726' }) });
      card.appendChild(face);
      card.appendChild(h('div', { style: { position: 'absolute', bottom: '12px', left: '0', right: '0', textAlign: 'center' } },
        h('span', { html: dotText(NX.fmtTime(new Date()).replace(/\s?[AP]M/i, ''), 2, { color: '#111' }), style: { display: 'flex', justifyContent: 'center' } })));
      setTimeout(() => { const iv = setInterval(() => { if (!document.body.contains(face)) { clearInterval(iv); return; } face.innerHTML = analogClock(108, { accent: '#e32726' }); }, 1000); }, 0);
      return card;
    }
  };

  W.toggles = {
    name: 'Quick toggles', desc: 'nothing-OS control circles', span: 'w2',
    render() {
      const card = h('div.wgt.w2');
      card.appendChild(h('div.wg-label', [h('span.wg-ico', { html: NX.glyph('pebble', 12) }), 'CONTROL']));
      const T = [
        { t: 'Easy', on: NX.easy.isOn(), run: () => NX.easy.set(!NX.easy.isOn()), ico: 'zen' },
        { t: 'Island', on: store().getSetting('islandEnabled', true) !== false, run: () => NX.shellV2.toggleIsland(), ico: 'island' },
        { t: 'Copilot', on: document.getElementById('copilot') && document.getElementById('copilot').classList.contains('open'), run: () => NX.copilot.toggle(), ico: 'spark' },
        { t: 'Sound', on: !!NX.localStore.get('nexadesk.ambientOn', false), run: () => { NX.easy.soundPanel(); }, ico: 'sound' },
        { t: 'Blur', on: store().getSetting('glassBlur', true) !== false, run: () => NX.shellV2.toggleBlur(!(store().getSetting('glassBlur', true) !== false)), ico: 'prism' },
        { t: 'Motion', on: !store().getSetting('fastMotion', false), run: () => NX.shellV2.toggleMotion(!store().getSetting('fastMotion', false)), ico: 'bolt' },
        { t: 'Dark', on: ['dark', 'midnight', 'bubblegum', 'wexa'].includes(store().getSetting('theme')), run: () => { const cur = store().getSetting('theme'); store().setSetting('theme', ['dark', 'midnight', 'bubblegum', 'wexa'].includes(cur) ? 'nothing' : 'wexa'); }, ico: 'moon' },
        { t: 'Server', on: !!NX.serverClient, run: () => NX.router.go('settings', { tab: 'account' }), ico: 'orbit' }
      ];
      card.appendChild(h('div.qt-grid', T.map(x => h('button.qt' + (x.on ? '.on' : ''), { title: x.t, onclick: () => { x.run(); setTimeout(() => NX.router.render(), 120); } }, [
        h('span', { html: NX.glyph(x.ico, 17, 1.8) }), h('span.qt-t', x.t)
      ]))));
      return card;
    }
  };

  W.points = {
    name: 'Points', desc: 'game currency, seg digits', span: '',
    render() {
      const g = NX.game.G();
      const lv = NX.game.levelFromXp(g.totalXp);
      const card = h('div.wgt.sf-lav');
      card.appendChild(h('div.wg-label', [h('span.wg-ico', { html: NX.glyph('trophy', 12), style: 'color:inherit' }), 'POINTS']));
      card.appendChild(h('div.wg-big', { html: seg(String(g.points), 34, { color: '#17121f', dim: 'rgba(0,0,0,.14)' }) }));
      card.appendChild(h('div.wg-sub', 'LEVEL ' + lv.level + ' · ' + NX.game.rankFor(lv.level).toUpperCase()));
      card.style.cursor = 'pointer'; card.onclick = () => NX.router.navigate('#/game');
      return card;
    }
  };

  W.ambient = {
    name: 'Ambient', desc: 'generated soundscapes', span: '',
    render() {
      const card = h('div.wgt.sf-ink', { style: { color: '#f2f3f5' } });
      card.appendChild(h('div.wg-label', { style: { color: 'rgba(255,255,255,.55)' } }, [h('span.wg-ico', { html: NX.glyph('sound', 12), style: 'color:#f8c1d9' }), 'AMBIENT']));
      card.appendChild(h('div.pill-row', ['rain', 'brown', 'waves'].map(id => {
        const on = NX.localStore.get('nexadesk.ambient.' + id, false);
        return h('button.pill' + (on ? '.on' : ''), { style: on ? 'background:#d4f04a;color:#17171b;border-color:#d4f04a' : 'color:#f2f3f5;border-color:rgba(255,255,255,.25);background:transparent', onclick: e => { e.stopPropagation(); NX.localStore.set('nexadesk.ambient.' + id, !on); NX.easy.soundPanel(); setTimeout(() => { NX.ui.closeTopModal(); NX.router.render(); }, 50); } }, id);
      })));
      card.appendChild(h('div.wg-sub', { style: { color: 'rgba(255,255,255,.5)' } }, 'GENERATED LIVE · NO FILES'));
      return card;
    }
  };

  W.you = {
    name: 'You', desc: 'dicebear avatar card', span: '',
    render() {
      const name = store().getSetting('userName', 'you');
      const card = h('div.wgt.sf-paper', { style: { textAlign: 'center', color: '#111' } });
      card.appendChild(h('div', { style: { display: 'flex', justifyContent: 'center', marginBottom: '8px' }, html: dicebearIMG(name, 74) }));
      card.appendChild(h('div', { style: { fontWeight: 800, fontSize: '13px', letterSpacing: '.2px' } }, name));
      card.appendChild(h('div.wg-sub', (store().getSetting('activeProfile') ? 'SIGNED IN' : 'LOCAL PROFILE')));
      card.style.cursor = 'pointer'; card.onclick = () => NX.router.go('settings', { tab: 'account' });
      return card;
    }
  };

  W.money = {
    name: 'Net worth', desc: 'money in seg digits', span: '',
    render() {
      const cur = store().getSetting('currencySymbol', '$');
      const nw = Math.round(sel().netWorth());
      const card = h('div.wgt.sf-paper', { style: { color: '#111' } });
      card.appendChild(h('div.wg-label', [h('span.wg-ico', { html: NX.glyph('wallet', 12), style: 'color:#e32726' }), 'NET WORTH']));
      card.appendChild(h('div.wg-big', { html: seg(String(Math.abs(nw)), 30, { color: nw < 0 ? '#e32726' : '#111', dim: 'rgba(0,0,0,.12)' }) }));
      card.appendChild(h('div.wg-sub', (nw < 0 ? '-' : '') + cur + ' · THIS MONTH ' + (sel().monthTotals(0).net >= 0 ? '+' : '') + NX.fmtNum(sel().monthTotals(0).net, 0)));
      card.style.cursor = 'pointer'; card.onclick = () => NX.router.navigate('#/finance');
      return card;
    }
  };

  W.streak = {
    name: 'Streak', desc: 'weekday dot grid like a gym card', span: '',
    render() {
      const habits = store().habits.all().filter(x => x.active !== false);
      const best = habits.map(hb => ({ hb, s: sel().habitStreak(hb) })).sort((a, b) => b.s - a.s)[0];
      const card = h('div.wgt.sf-ink', { style: { color: '#f2f3f5' } });
      card.appendChild(h('div.wg-label', { style: { color: 'rgba(255,255,255,.55)' } }, [h('span.wg-ico', { html: NX.glyph('flame', 12), style: 'color:#f5a054' }), 'STREAK']));
      card.appendChild(h('div', { style: { textAlign: 'center', margin: '4px 0 8px' } }, [
        h('div', { style: { fontSize: '12px', fontWeight: 700 } }, best ? best.hb.name : 'no habits'),
        h('div.wg-sub', { style: { color: 'rgba(255,255,255,.5)' } }, best ? best.s + '/7 THIS WEEK' : '')
      ]));
      const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
      card.appendChild(h('div.row', { style: { justifyContent: 'space-between' } }, days.map((d, i) => {
        const date = NX.addDays(NX.startOfWeek(new Date(), 1), i);
        const done = habits.some(hb => sel().habitDoneOn(hb, NX.ymd(date)));
        return h('div', { style: { textAlign: 'center' } }, [
          h('div', { style: { fontSize: '8px', opacity: .5, marginBottom: '4px', fontWeight: 800 } }, d),
          h('div', { style: { width: '10px', height: '10px', borderRadius: '99px', background: done ? '#d4f04a' : 'rgba(255,255,255,.16)', margin: '0 auto' } })
        ]);
      })));
      return card;
    }
  };

  W.mood = {
    name: 'Mood', desc: 'today in one dot face', span: '',
    render() {
      const j = sel().journalFor(NX.todayStr());
      const card = h('div.wgt.sf-pink');
      card.appendChild(h('div.wg-label', [h('span.wg-ico', { html: NX.glyph('heart', 12), style: 'color:inherit' }), 'MOOD']));
      card.appendChild(h('div', { style: { display: 'flex', justifyContent: 'center', color: '#17171b', padding: '6px 0' }, html: NX.glyph(j ? 'mood' + j.mood : 'mood3', 54, 1.6) }));
      card.appendChild(h('div.wg-sub', { style: { textAlign: 'center' } }, j ? 'LOGGED · TAP TO EDIT' : 'NOT LOGGED YET'));
      card.style.cursor = 'pointer'; card.onclick = () => NX.router.go('journal', { date: NX.todayStr() });
      return card;
    }
  };

  /* ================= HOME v3 ================= */
  function renderHomeV3() {
    const page = h('div.page', { style: { maxWidth: '1180px', paddingTop: '26px' } });
    const hour = new Date().getHours();
    const greet = hour < 5 ? 'STILL UP' : hour < 12 ? 'GOOD MORNING' : hour < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
    const name = store().getSetting('userName', 'friend');

    page.appendChild(h('div.row', { style: { alignItems: 'flex-end', gap: '14px', marginBottom: '18px', flexWrap: 'wrap' } }, [
      h('div.grow', [
        h('div', { html: dotText(greet + ', ' + name.toUpperCase(), 3.1, { color: 'var(--tx-2)' }) }),
        h('h1', { style: { fontSize: '30px', fontWeight: 700, letterSpacing: '-.8px', marginTop: '8px' } }, NX.fmtDate(new Date(), 'long'))
      ]),
      h('button.pill' + (editing ? '.on' : ''), { onclick: () => { editing = !editing; NX.router.render(); } }, editing ? 'Done editing' : 'Edit widgets'),
      h('button.pill', { onclick: () => widgetPicker() }, '+ Add widget')
    ]));

    // THE ONE THING — stays above the wall, calm
    const na = NX.easyOneThing();
    page.appendChild(h('div.card', { style: { padding: '22px', textAlign: 'center', marginBottom: '16px', borderColor: 'color-mix(in srgb, var(--brand-1) 35%, transparent)' } }, [
      h('div.wg-label', { style: { justifyContent: 'center' } }, [h('span.wg-ico', { html: NX.glyph('target', 12) }), 'THE ONE THING']),
      h('div', { style: { fontSize: '20px', fontWeight: 700, letterSpacing: '-.3px', margin: '6px 0 3px' } }, na.title),
      h('div.small.muted', na.sub),
      h('div.row', { style: { justifyContent: 'center', gap: '9px', marginTop: '14px' } }, [
        na.done ? h('button.btn.success.press', { onclick: () => { na.done(); NX.game.award(10, 'Did the one thing'); NX.router.render(); } }, 'DONE') : null,
        h('button.btn.primary.press', { onclick: na.run }, 'OPEN'),
        h('button.btn.ghost', { onclick: () => NX.router.render() }, 'SOMETHING ELSE')
      ])
    ]));

    // the wall
    const list = wallState();
    const wall = h('div.widget-wall.stagger');
    list.forEach((id, idx) => {
      const wdef = W[id];
      if (!wdef) return;
      let node;
      try { node = wdef.render(); } catch (e) { console.warn('widget failed', id, e); return; }
      if (editing) {
        node.classList.add('wall-editing');
        node.appendChild(h('button.wg-x', { style: { display: 'grid' }, title: 'remove', onclick: e => { e.stopPropagation(); const l = wallState().filter(x => x !== id); saveWall(l); NX.router.render(); } }, '×'));
        node.appendChild(h('div', { style: { position: 'absolute', bottom: '8px', right: '10px', display: 'flex', gap: '4px' } }, [
          h('button.pill', { style: { padding: '2px 8px', fontSize: '9px' }, onclick: e => { e.stopPropagation(); const l = wallState(); const i = l.indexOf(id); if (i > 0) { l.splice(i, 1); l.splice(i - 1, 0, id); saveWall(l); NX.router.render(); } } }, '←'),
          h('button.pill', { style: { padding: '2px 8px', fontSize: '9px' }, onclick: e => { e.stopPropagation(); const l = wallState(); const i = l.indexOf(id); if (i < l.length - 1) { l.splice(i, 1); l.splice(i + 1, 0, id); saveWall(l); NX.router.render(); } } }, '→')
        ]));
      }
      wall.appendChild(node);
    });
    page.appendChild(wall);

    page.appendChild(h('div.row', { style: { justifyContent: 'center', gap: '14px', marginTop: '22px', flexWrap: 'wrap' } }, [
      h('button.pill', { onclick: () => NX.shell.openPalette() }, 'ANYTHING · ⌘K'),
      h('button.pill', { onclick: () => NX.copilot.toggle() }, 'ASK COPILOT'),
      h('button.pill', { onclick: () => NX.easy.moreGrid() }, 'ALL MODULES'),
      h('button.pill', { onclick: () => NX.easy.set(false) }, 'FULL MODE')
    ]));
    return page;
  }

  function widgetPicker() {
    const have = new Set(wallState());
    NX.ui.modal({
      title: 'Add widgets', subtitle: 'your wall, your rules', size: 'wide', hideFooter: true,
      body: h('div.wpick', Object.entries(W).map(([id, wdef]) => h('button', {
        style: have.has(id) ? { opacity: .45 } : null,
        onclick: () => {
          if (have.has(id)) { saveWall(wallState().filter(x => x !== id)); }
          else saveWall(wallState().concat([id]));
          NX.ui.closeTopModal(); NX.router.render();
        }
      }, [
        h('span', { style: { display: 'flex', color: 'var(--brand-1)' }, html: NX.glyph({ next: 'cal', tasks: 'check', focus: 'target', habits: 'flame', progress: 'graph', clock: 'clock', toggles: 'pebble', points: 'trophy', ambient: 'sound', you: 'heart', money: 'wallet', streak: 'flame', mood: 'heart' }[id] || 'pebble', 20, 1.7) }),
        h('b', wdef.name + (have.has(id) ? ' ✓' : '')),
        h('span', wdef.desc)
      ])))
    });
  }

  /* ================= wire-up & app-wide renewals ================= */
  // expose one-thing helper used above
  NX.easyOneThing = function () {
    const overdue = sel().overdueTasks();
    if (overdue.length) return { title: overdue[0].title, sub: 'overdue — clear it first', run: () => NX.components.openTask(overdue[0].id), done: () => NX.components.toggleTaskDone(overdue[0].id) };
    const due = sel().tasksDueOn(new Date()).filter(t => !t.done);
    if (due.length) return { title: due[0].title, sub: 'due today', run: () => NX.components.openTask(due[0].id), done: () => NX.components.toggleTaskDone(due[0].id) };
    const hb = store().habits.all().find(x => x.active !== false && !sel().habitDoneOn(x, NX.todayStr()));
    if (hb) return { title: hb.name, sub: 'today\'s habit · two minutes', run: () => NX.router.navigate('#/habits'), done: () => NX.components.toggleHabit(hb.id) };
    if (sel().focusMinutesToday() < 25) return { title: 'One focus block', sub: '25 minutes on the thing that matters', run: () => NX.router.navigate('#/pomodoro'), done: null };
    if (!sel().journalFor(NX.todayStr())) return { title: 'Two sentences about today', sub: 'future-you says thanks', run: () => NX.router.go('journal', { date: NX.todayStr() }), done: null };
    return { title: 'You\'re clear', sub: 'nothing is asking for you', run: () => NX.shell.openQuickCapture(), done: null };
  };

  // replace home render with the widget wall
  const homeMod = NX.router.get('home');
  if (homeMod) homeMod.render = renderHomeV3;

  // DiceBear avatars app-wide: wrap NX.ui.avatar
  const origAvatar = NX.ui.avatar;
  NX.ui.avatar = function (name, color, size, presence) {
    const el = origAvatar(name, color, size, presence);
    if (store().getSetting('dicebear', true) === false) return el;
    const px = size === 'xs' ? 18 : size === 'sm' ? 22 : size === 'lg' ? 38 : size === 'xl' ? 62 : 26;
    el.innerHTML = dicebearIMG(name, px) + (presence ? el.innerHTML.match(/<span class="presence.*?<\/span>/)?.[0] || '' : '');
    el.style.background = 'transparent';
    return el;
  };

  NX.widgetWall = { W, renderHomeV3, widgetPicker, wallState, saveWall };
})(window.NX);
