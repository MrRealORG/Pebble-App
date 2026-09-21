/* ============================================================
   Pebble — mod-reminders.js + mod-habits.js
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, esc, iconHTML } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  /* =====================================================================
     REMINDERS
     ===================================================================== */
  (function () {
    let tab = 'upcoming';

    function render(params) {
      if (params && params.tab) tab = params.tab;
      const page = h('div.page');
      page.appendChild(NX.components.pageHead({
        icon: 'bell', title: 'Reminders',
        sub: `${sel().pendingReminders().length} pending · ${sel().dueReminders().length} due now · native notifications ${store().getSetting('notifyOnReminder', true) ? 'on' : 'off'}`,
        actions: [
          h('button.btn.sm.primary', { html: iconHTML('plus', 13) + ' New reminder', onclick: () => NX.actions.newReminder().then(() => NX.router.render()) }),
          h('button.btn.sm.subtle', { onclick: testNotification }, 'Test notification'),
          h('button.btn.sm.ghost', { onclick: () => NX.router.go('settings', { tab: 'notifications' }) }, 'Notification settings')
        ]
      }));
      page.appendChild(h('div.tabs', ['upcoming', 'due', 'snoozed', 'done', 'all'].map(t =>
        h('button' + (tab === t ? '.on' : ''), { onclick: () => { tab = t; NX.router.render(); } }, t[0].toUpperCase() + t.slice(1)))));
      page.appendChild(body());
      return page;
    }

    function body() {
      const now = Date.now();
      let list = store().reminders.all().slice();
      if (tab === 'upcoming') list = list.filter(r => !r.done && new Date(r.snoozedUntil || r.at).getTime() > now);
      else if (tab === 'due') list = sel().dueReminders();
      else if (tab === 'snoozed') list = list.filter(r => !r.done && r.snoozedUntil && new Date(r.snoozedUntil) > now);
      else if (tab === 'done') list = list.filter(r => r.done);
      list.sort((a, b) => new Date(a.snoozedUntil || a.at) - new Date(b.snoozedUntil || b.at));

      if (!list.length) return NX.ui.emptyState('bell', nothingTitle(), 'Reminders fire as native OS notifications, even when Pebble is minimised to the tray.', 'New reminder', () => NX.actions.newReminder());

      const wrap = h('div');
      let lastDay = null;
      list.forEach(r => {
        const dayKey = NX.ymd(r.snoozedUntil || r.at);
        if (dayKey !== lastDay) {
          lastDay = dayKey;
          wrap.appendChild(h('div.task-group-head', [
            h('span', NX.isToday(dayKey) ? 'TODAY' : NX.isTomorrow(dayKey) ? 'TOMORROW' : NX.fmtDate(dayKey, 'long')),
            h('span.tgh-count', String(list.filter(x => NX.ymd(x.snoozedUntil || x.at) === dayKey).length))
          ]));
        }
        wrap.appendChild(row(r));
      });
      return wrap;
    }
    function nothingTitle() {
      return { upcoming: 'Nothing scheduled', due: 'Nothing due right now', snoozed: 'Nothing snoozed', done: 'Nothing completed yet', all: 'No reminders' }[tab];
    }

    function row(r) {
      const at = new Date(r.snoozedUntil || r.at);
      const overdue = !r.done && at.getTime() <= Date.now();
      const el = h('div.list-row', { style: { padding: '10px 12px', borderLeft: '3px solid ' + (r.done ? 'var(--bd)' : r.priority === 'high' ? 'var(--acc-red)' : overdue ? 'var(--acc-org)' : 'var(--brand-1)'), marginBottom: '5px', borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--bd)', opacity: r.done ? .55 : 1 } });
      el.appendChild(h('button.task-check' + (r.done ? '.on' : ''), { title: r.done ? 'Reopen' : 'Mark done', onclick: () => { r.done ? store().reminders.update(r.id, { done: false, fired: false }) : NX.reminders.complete(r.id); NX.router.render(); } }));
      el.appendChild(h('div.lr-main', [
        h('div.lr-title', { style: { textDecoration: r.done ? 'line-through' : 'none', fontSize: '13.5px' } }, [
          r.priority === 'high' ? h('span', { style: { color: 'var(--acc-red)', marginRight: '5px' } }, '⚑') : null,
          r.title
        ]),
        h('div.lr-sub', [
          NX.fmtDateTime(r.at, 'medium'),
          r.snoozedUntil && !r.done ? ` · snoozed to ${NX.fmtDateTime(r.snoozedUntil, 'medium')}` : '',
          r.repeat ? ` · 🔁 ${NX.recurrence.label(r.repeat)}` : '',
          r.body ? ` · ${r.body}` : ''
        ].join(''))
      ]));
      el.appendChild(h('div.lr-right.row', { style: { gap: '4px' } }, [
        h('span.chip', { style: { fontVariantNumeric: 'tabular-nums' } }, overdue ? 'now' : NX.relTime(at)),
        !r.done ? h('button.btn.xs.ghost', { onclick: () => NX.ui.dropdown(h('div'), snoozeMenu(r)) }, 'Snooze') : null,
        h('button.icon-btn', { html: iconHTML('more', 15), onclick: e => NX.ui.dropdown(e.currentTarget, menu(r), { right: true }) })
      ]));
      return el;
    }

    function snoozeMenu(r) {
      return [
        { header: 'Snooze' },
        ...[[5, '5 minutes'], [10, '10 minutes'], [30, '30 minutes'], [60, '1 hour'], [180, '3 hours'], [720, '12 hours'], [1440, '1 day'], [4320, '3 days'], [10080, '1 week']]
          .map(([m, l]) => ({ label: l, onClick: () => { NX.reminders.snooze(r.id, m); NX.ui.toast({ message: 'Snoozed ' + l, duration: 1800 }); NX.router.render(); } })),
        '-',
        { icon: 'clock', label: 'Snooze until tomorrow 9am', onClick: () => { const d = NX.addDays(new Date(), 1); d.setHours(9, 0, 0, 0); store().reminders.update(r.id, { snoozedUntil: d.toISOString(), fired: false }); NX.router.render(); } },
        { icon: 'clock', label: 'Pick a time…', onClick: async () => {
            const v = await NX.ui.prompt({ title: 'Snooze until', value: NX.ymdhm(NX.addMinutes(new Date(), 60)), message: 'YYYY-MM-DDTHH:MM' });
            if (v) { store().reminders.update(r.id, { snoozedUntil: new Date(v).toISOString(), fired: false }); NX.router.render(); }
          } }
      ];
    }

    function menu(r) {
      return [
        { icon: 'edit', label: 'Edit…', onClick: () => editReminder(r.id) },
        { icon: 'copy', label: 'Duplicate', onClick: () => { const c = NX.deepClone(r); delete c.id; c.done = false; c.fired = false; c.snoozedUntil = null; store().reminders.create(c); NX.router.render(); } },
        { icon: 'repeat', label: r.repeat ? 'Stop repeating' : 'Repeat weekly', onClick: () => { store().reminders.update(r.id, { repeat: r.repeat ? null : 'weekly', fired: false }); NX.router.render(); } },
        '-',
        { icon: 'task', label: 'Turn into a task', onClick: () => {
            store().tasks.create({ title: r.title, description: r.body || '', projectId: null, status: 'To Do', priority: r.priority === 'high' ? 'High' : 'Medium', due: r.at, repeat: r.repeat, tags: [], checklist: [], estimate: 0, order: 0, done: false, archived: false });
            store().reminders.remove(r.id); NX.ui.toast({ type: 'success', message: 'Converted to a task' }); NX.router.render();
          } },
        { icon: 'calendar', label: 'Turn into an event', onClick: () => {
            const s = new Date(r.at);
            store().events.create({ title: r.title, start: s.toISOString(), end: new Date(s.getTime() + 1800000).toISOString(), allDay: false, description: r.body || '', color: '#7c6cff', calendar: 'Personal', reminder: null, repeat: r.repeat, busy: true });
            store().reminders.remove(r.id); NX.ui.toast({ type: 'success', message: 'Converted to an event' }); NX.router.render();
          } },
        '-',
        { icon: 'trash', label: 'Delete', danger: true, onClick: async () => { if (await NX.ui.confirmDelete('this reminder')) { store().reminders.remove(r.id); NX.router.render(); } } }
      ];
    }

    async function editReminder(id) {
      const r = store().reminders.find(id);
      if (!r) return;
      const res = await NX.ui.form({
        title: 'Edit reminder', okLabel: 'Save',
        fields: [
          { key: 'title', label: 'Remind me to…', type: 'text', value: r.title, required: true, full: true },
          { key: 'at', label: 'When', type: 'datetime', value: NX.ymdhm(r.at), required: true },
          { key: 'repeat', label: 'Repeat', type: 'select', value: r.repeat || '', options: NX.recurrence.options.map(o => ({ value: o.value, label: o.label })) },
          { key: 'priority', label: 'Priority', type: 'select', value: r.priority || 'normal', options: [{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'Urgent' }] },
          { key: 'body', label: 'Note', type: 'textarea', value: r.body || '', rows: 3, full: true }
        ]
      });
      if (!res) return;
      store().reminders.update(id, { title: res.title, at: new Date(res.at).toISOString(), repeat: res.repeat || null, priority: res.priority, body: res.body, fired: false, snoozedUntil: null, done: false });
      NX.ui.toast({ type: 'success', message: 'Reminder updated' });
      NX.router.render();
    }

    function testNotification() {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(() => testNotification());
        return;
      }
      NX.shell.notify('Pebble test 🔔', 'If you can see this, native notifications are working.');
      NX.ui.toast({ type: 'success', title: 'Notification sent', message: store().desktop ? 'Check your system notifications.' : ('Browser permission: ' + ('Notification' in window ? Notification.permission : 'unsupported')), duration: 5000 });
    }

    NX.router.register({
      id: 'reminders', name: 'Reminders', icon: 'bell', group: 'plan', order: 12,
      badge: () => sel().dueReminders().length,
      render,
      commands: () => [
        { label: 'Reminders: new reminder', icon: 'plus', run: () => NX.actions.newReminder() },
        { label: 'Reminders: remind me in 10 minutes', icon: 'clock', run: () => { store().reminders.create({ title: 'Quick reminder', body: '', at: NX.addMinutes(new Date(), 10).toISOString(), done: false, priority: 'normal', deepLink: '#/reminders' }); NX.ui.toast({ type: 'success', message: 'Reminder set for 10 minutes' }); } },
        { label: 'Reminders: test notification', icon: 'bell', run: testNotification }
      ]
    });
  })();

  /* =====================================================================
     HABITS
     ===================================================================== */
  (function () {
    let view = NX.localStore.get('nexadesk.habitView', 'today');   // today | heatmap | stats | all

    function render(params) {
      if (params && params.view) view = params.view;
      const habits = store().habits.all().filter(x => x.active !== false);
      const page = h('div.page');
      const t = sel().habitsCompletedToday();
      page.appendChild(NX.components.pageHead({
        icon: 'flame', title: 'Habits',
        sub: `${t.done}/${t.total} logged today · longest active streak ${habits.length ? Math.max(...habits.map(x => sel().habitStreak(x))) : 0} days`,
        actions: [
          h('button.btn.sm.primary', { html: iconHTML('plus', 13) + ' New habit', onclick: () => NX.actions.newHabit().then(() => NX.router.render()) }),
          h('button.btn.sm.subtle', { onclick: () => { markAllToday(); } }, 'Mark all done today'),
          h('button.btn.sm.ghost', { onclick: () => { view = 'heatmap'; persist(); } }, 'Heatmap')
        ]
      }));
      page.appendChild(h('div.grid.grid-4', { style: { marginBottom: 'var(--sp-4)' } }, [
        NX.components.statTile('Today', `${t.done}/${t.total}`, t.total ? Math.round(t.done / t.total * 100) + '% complete' : '', 'check', t.done === t.total && t.total ? 'grn' : ''),
        NX.components.statTile('7-day rate', habits.length ? Math.round(habits.reduce((a, x) => a + sel().habitRate(x, 7), 0) / habits.length) + '%' : '—', 'average across habits', 'chart', 'blu'),
        NX.components.statTile('Best streak', habits.length ? Math.max(...habits.map(x => sel().habitStreak(x)), 0) + 'd' : '—', 'currently active', 'flame', 'org'),
        NX.components.statTile('All-time best', habits.length ? Math.max(...habits.map(x => sel().habitBestStreak(x)), 0) + 'd' : '—', 'longest ever', 'star', 'pur')
      ]));
      page.appendChild(h('div.tabs', ['today', 'heatmap', 'stats', 'all'].map(v =>
        h('button' + (view === v ? '.on' : ''), { onclick: () => { view = v; persist(); } }, v[0].toUpperCase() + v.slice(1)))));
      if (!habits.length) { page.appendChild(NX.ui.emptyState('flame', 'No habits yet', 'Habits are the compound interest of self-improvement. Start with one small thing you can do every single day.', 'Create your first habit', () => NX.actions.newHabit())); return page; }
      if (view === 'today') page.appendChild(todayView(habits));
      else if (view === 'heatmap') page.appendChild(heatmapView(habits));
      else if (view === 'stats') page.appendChild(statsView(habits));
      else page.appendChild(allView(habits));
      return page;
    }
    function persist() { NX.localStore.set('nexadesk.habitView', view); NX.router.render(); }

    function markAllToday() {
      const k = NX.todayStr();
      store().habits.all().filter(x => x.active !== false).forEach(hb => { if (!sel().habitDoneOn(hb, k)) NX.components.toggleHabit(hb.id, k, true); });
      NX.ui.toast({ type: 'success', message: 'All habits logged for today' });
      NX.router.render();
    }

    /* ---------------- today ---------------- */
    function todayView(habits) {
      const wrap = h('div.grid.grid-auto');
      habits.forEach(hb => {
        const done = sel().habitDoneOn(hb, NX.todayStr());
        const streak = sel().habitStreak(hb);
        const rate = sel().habitRate(hb, 30);
        const card = h('div.habit-card');
        card.appendChild(h('div.habit-head', [
          h('span.habit-emoji', { style: { display: 'flex', color: hb.color || 'var(--acc-org)' }, html: NX.glyphOrText(hb.emoji || 'flame', 22) }),
          h('div.grow', [
            h('div.habit-name', hb.name),
            h('div.small.muted', hb.cadence === 'weekdays' ? 'Weekdays' : hb.cadence === 'weekly' ? 'Weekly' : 'Daily')
          ]),
          h('div.habit-streak', streak > 0 ? [h('span', { html: iconHTML('flame', 13), style: { display: 'flex' } }), streak + 'd'] : h('span.muted.tiny', 'no streak')),
          h('button.icon-btn', { html: iconHTML('more', 15), onclick: e => NX.ui.dropdown(e.currentTarget, menu(hb), { right: true }) })
        ]));
        // big toggle
        card.appendChild(h('button', {
          style: {
            width: '100%', padding: '13px', borderRadius: '11px', border: '2px solid ' + (done ? hb.color : 'var(--bd-2)'),
            background: done ? hb.color : 'transparent', color: done ? '#fff' : 'var(--tx-3)',
            fontSize: '13.5px', fontWeight: '650', cursor: 'pointer', transition: 'all .15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
          },
          onclick: () => { NX.components.toggleHabit(hb.id); NX.router.render(); }
        }, done ? [h('span', { html: iconHTML('check', 16), style: { display: 'flex' } }), 'Done today'] : 'Mark done'));

        // week strip
        const week = h('div.habit-week');
        const start = NX.startOfWeek(new Date(), 1);
        for (let i = 0; i < 7; i++) {
          const d = NX.addDays(start, i);
          const k = NX.ymd(d);
          const isDone = sel().habitDoneOn(hb, k);
          const future = d > new Date();
          week.appendChild(h('div.hw-day', [
            h('div.hw-label', NX.DAYS_S[d.getDay()][0]),
            h('div.hw-box' + (isDone ? '.done' : '') + (future ? '.future' : '') + (NX.isToday(d) ? '.today' : ''), {
              style: isDone ? { background: hb.color } : null,
              title: NX.fmtDate(d, 'medium') + (isDone ? ' · done' : ''),
              onclick: () => { if (future) return; NX.components.toggleHabit(hb.id, k); NX.router.render(); }
            }, isDone ? h('span', { html: iconHTML('check', 10), style: { display: 'flex', color: '#fff' } }) : null)
          ]));
        }
        card.appendChild(week);
        card.appendChild(h('div.row', { style: { justifyContent: 'space-between', marginTop: '6px' } }, [
          h('span.tiny.muted', `30-day rate: ${rate}%`),
          h('span.tiny.muted', `Best: ${sel().habitBestStreak(hb)}d`)
        ]));
        card.appendChild(h('div.progress.thin', { style: { marginTop: '5px' } }, h('i', { style: { width: rate + '%', background: hb.color } })));
        if (hb.note) card.appendChild(h('div.small.muted', { style: { marginTop: '9px', paddingTop: '8px', borderTop: '1px solid var(--bd)', fontStyle: 'italic' } }, hb.note));
        wrap.appendChild(card);
      });
      return wrap;
    }

    /* ---------------- heatmap ---------------- */
    function heatmapView(habits) {
      const wrap = h('div');
      wrap.appendChild(h('div.card', { style: { marginBottom: 'var(--sp-4)' } }, [
        h('div.card-head', [h('h3', 'Combined consistency — last 26 weeks'), h('div.grow'),
          h('div.hm-legend', ['Less', ...[0, 1, 2, 3, 4].map(l => h('span.hm-cell' + (l ? '.l' + l : ''))), 'More'])]),
        h('div.heatmap', buildHeatmap(habits, 182, 26))
      ]));
      wrap.appendChild(h('div.section-head', [h('h2', 'Per-habit history'), h('span.sh-sub', 'click any cell to toggle that day')]));
      habits.forEach(hb => {
        wrap.appendChild(h('div.card.pad-sm', { style: { marginBottom: '10px' } }, [
          h('div.row', { style: { marginBottom: '8px' } }, [
            h('span', { style: { display: 'flex', color: hb.color || 'var(--acc-org)' }, html: NX.glyphOrText(hb.emoji || 'flame', 16) }),
            h('b.small.grow', hb.name),
            h('span.chip', sel().habitStreak(hb) + 'd streak'),
            h('span.chip', sel().habitRate(hb, 90) + '% / 90d')
          ]),
          h('div.heatmap', buildHeatmap([hb], 182, 26, hb, hb.color))
        ]));
      });
      return wrap;
    }

    function buildHeatmap(habits, days, weeks, single, color) {
      const wrap = h('div');
      const start = NX.addDays(NX.startOfWeek(new Date(), 0), -(weeks - 1) * 7);
      for (let w = 0; w < weeks; w++) {
        const col = h('div.hm-col');
        for (let d = 0; d < 7; d++) {
          const date = NX.addDays(start, w * 7 + d);
          const key = NX.ymd(date);
          const future = date > new Date();
          let count = 0;
          habits.forEach(hb => { if (sel().habitDoneOn(hb, key)) count++; });
          const total = habits.length || 1;
          const level = future ? 0 : count === 0 ? 0 : Math.min(4, Math.ceil(count / total * 4));
          const cell = h('div.hm-cell' + (level ? '.l' + level : ''), {
            title: `${NX.fmtDate(date, 'medium')} — ${count}/${total}${single ? ' ' + single.name : ''}`,
            style: future ? { opacity: .25 } : (single && level ? { background: color } : null)
          });
          if (single && !future) cell.onclick = () => { NX.components.toggleHabit(single.id, key); NX.router.render(); };
          col.appendChild(cell);
        }
        wrap.appendChild(col);
      }
      return wrap;
    }

    /* ---------------- stats ---------------- */
    function statsView(habits) {
      const wrap = h('div');
      // 30 day per-habit bars
      wrap.appendChild(h('div.card', { style: { marginBottom: 'var(--sp-4)' } }, [
        h('div.card-head', [h('h3', 'Consistency, last 30 days')]),
        h('div', habits.map(hb => {
          const rate = sel().habitRate(hb, 30);
          return h('div', { style: { marginBottom: '10px' } }, [
            h('div.row', { style: { justifyContent: 'space-between', marginBottom: '4px' } }, [
              h('span.small', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [h('span', { style: { display: 'flex', color: hb.color || 'var(--acc-org)' }, html: NX.glyphOrText(hb.emoji || 'flame', 14) }), hb.name]), h('b.small', rate + '%')
            ]),
            h('div.progress', h('i', { style: { width: rate + '%', background: hb.color } }))
          ]);
        }))
      ]));
      // best / worst days of week
      const dowCounts = [0, 0, 0, 0, 0, 0, 0], dowTotals = [0, 0, 0, 0, 0, 0, 0];
      for (let i = 0; i < 90; i++) {
        const d = NX.addDays(new Date(), -i);
        habits.forEach(hb => { dowTotals[d.getDay()]++; if (sel().habitDoneOn(hb, NX.ymd(d))) dowCounts[d.getDay()]++; });
      }
      const dowRate = dowCounts.map((c, i) => ({ day: NX.DAYS_S[i], rate: dowTotals[i] ? Math.round(c / dowTotals[i] * 100) : 0 }));
      wrap.appendChild(h('div.card', { style: { marginBottom: 'var(--sp-4)' } }, [
        h('div.card-head', [h('h3', 'Which day of the week is hardest?'), h('div.grow'), h('span.small.muted', '90 days')]),
        NX.ui.barChart(dowRate.map(d => ({ label: d.day, value: d.rate })), { height: '140px', format: v => v + '%' })
      ]));
      const best = dowRate.slice().sort((a, b) => b.rate - a.rate)[0];
      const worst = dowRate.slice().sort((a, b) => a.rate - b.rate)[0];
      if (best && worst) wrap.appendChild(h('div.card.pad-sm', { style: { background: 'var(--sel)', marginBottom: 'var(--sp-4)' } },
        h('div.small', `You are most consistent on **${best.day}** (${best.rate}%) and weakest on **${worst.day}** (${worst.rate}%). If you want to fix one day, fix ${worst.day}.`.replace(/\*\*/g, ''))));
      // monthly trend
      const months = [];
      for (let m = 5; m >= 0; m--) {
        const from = NX.startOfMonth(NX.addMonths(new Date(), -m));
        const to = NX.addMonths(from, 1);
        let done = 0, total = 0;
        for (let d = new Date(from); d < to && d <= new Date(); d = NX.addDays(d, 1)) {
          habits.forEach(hb => { total++; if (sel().habitDoneOn(hb, NX.ymd(d))) done++; });
        }
        months.push({ label: NX.MONTHS_S[from.getMonth()], value: total ? Math.round(done / total * 100) : 0 });
      }
      wrap.appendChild(h('div.card', [
        h('div.card-head', [h('h3', '6-month trend')]),
        NX.ui.barChart(months, { height: '140px', format: v => v + '%' })
      ]));
      return wrap;
    }

    /* ---------------- manage all ---------------- */
    function allView(habits) {
      const all = store().habits.all();
      const wrap = h('div.db-wrap');
      const table = h('table.db');
      table.appendChild(h('thead', h('tr', ['Icon', 'Name', 'Cadence', 'Target/wk', 'Streak', 'Best', '30d', '90d', 'Status', ''].map(x => h('th', x)))));
      const tbody = h('tbody');
      all.forEach(hb => {
        const tr = h('tr', { onclick: () => editHabit(hb.id) });
        NX.ui.bindMenu(tr, () => menu(hb));
        tr.appendChild(h('td', { html: NX.glyphOrText(hb.emoji || 'flame', 17) }));
        tr.appendChild(h('td', h('b', hb.name)));
        tr.appendChild(h('td', hb.cadence || 'daily'));
        tr.appendChild(h('td.c-num', String(hb.targetPerWeek || 7)));
        tr.appendChild(h('td.c-num', sel().habitStreak(hb) + 'd'));
        tr.appendChild(h('td.c-num', sel().habitBestStreak(hb) + 'd'));
        tr.appendChild(h('td.c-num', sel().habitRate(hb, 30) + '%'));
        tr.appendChild(h('td.c-num', sel().habitRate(hb, 90) + '%'));
        tr.appendChild(h('td', h('span.chip' + (hb.active === false ? '.chip-gry' : '.chip-grn'), hb.active === false ? 'Paused' : 'Active')));
        tr.appendChild(h('td', h('button.icon-btn', { html: iconHTML('more', 14), onclick: e => { e.stopPropagation(); NX.ui.dropdown(e.currentTarget, menu(hb), { right: true }); } })));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(h('div.db-scroll', table));
      return wrap;
    }

    function menu(hb) {
      return [
        { icon: 'edit', label: 'Edit habit…', onClick: () => editHabit(hb.id) },
        { icon: 'check', label: 'Toggle today', onClick: () => { NX.components.toggleHabit(hb.id); NX.router.render(); } },
        '-',
        { header: 'Backfill' },
        ...[1, 2, 3, 5, 7].map(n => ({ label: `Mark last ${n} day${n > 1 ? 's' : ''} done`, onClick: () => { const hist = Object.assign({}, hb.history || {}); for (let i = 1; i <= n; i++) hist[NX.ymd(NX.addDays(new Date(), -i))] = 1; store().habits.update(hb.id, { history: hist }); NX.ui.toast({ message: `${n} days backfilled` }); NX.router.render(); } })),
        { label: 'Clear history', danger: true, onClick: async () => { if (await NX.ui.confirmDelete('all history for “' + hb.name + '”')) { store().habits.update(hb.id, { history: {}, bestStreak: 0 }); NX.router.render(); } } },
        '-',
        { icon: 'bell', label: 'Add a daily reminder', onClick: () => { const d = new Date(); d.setHours(20, 0, 0, 0); store().reminders.create({ title: hb.emoji + ' ' + hb.name, body: 'Daily habit', at: d.toISOString(), repeat: 'daily', done: false, priority: 'normal', deepLink: '#/habits', linkedId: hb.id }); NX.ui.toast({ type: 'success', message: 'Daily reminder at 20:00' }); } },
        { icon: 'copy', label: 'Duplicate', onClick: () => { const c = NX.deepClone(hb); delete c.id; c.name = hb.name + ' (copy)'; c.history = {}; store().habits.create(c); NX.router.render(); } },
        { icon: 'pause', label: hb.active === false ? 'Resume' : 'Pause', onClick: () => { store().habits.update(hb.id, { active: hb.active === false }); NX.router.render(); } },
        { icon: 'trash', label: 'Delete habit', danger: true, onClick: async () => { if (await NX.ui.confirmDelete('“' + hb.name + '”', 'All streak history will be lost.')) { store().habits.remove(hb.id); NX.router.render(); } } }
      ];
    }

    async function editHabit(id) {
      const hb = store().habits.find(id);
      if (!hb) return;
      const res = await NX.ui.form({
        title: 'Edit habit', wide: true, okLabel: 'Save',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: hb.name, required: true },
          { key: 'emoji', label: 'Icon key', type: 'select', value: hb.emoji || 'flame', options: ['flame','leaf','wave','bolt','heart','target','moon','sun','star','gem','zen','tide','orbit','bloom'] },
          { key: 'color', label: 'Colour', type: 'color', value: hb.color },
          { key: 'cadence', label: 'Cadence', type: 'select', value: hb.cadence || 'daily', options: [{ value: 'daily', label: 'Every day' }, { value: 'weekdays', label: 'Weekdays only' }, { value: 'weekly', label: 'Once a week' }] },
          { key: 'targetPerWeek', label: 'Target per week', type: 'number', value: hb.targetPerWeek || 7, min: 1, max: 7 },
          { key: 'active', label: 'Active', type: 'checkbox', value: hb.active !== false },
          { key: 'note', label: 'Why this matters', type: 'textarea', value: hb.note || '', rows: 3, full: true }
        ]
      });
      if (!res) return;
      store().habits.update(id, { name: res.name, emoji: res.emoji, icon: res.emoji, color: res.color, cadence: res.cadence, targetPerWeek: Number(res.targetPerWeek), active: res.active, note: res.note });
      NX.ui.toast({ type: 'success', message: 'Habit updated' });
      NX.router.render();
    }

    NX.router.register({
      id: 'habits', name: 'Habits', icon: 'habit', group: 'track', order: 31,
      badge: () => { const t = sel().habitsCompletedToday(); return t.total - t.done; },
      badgeCount: 'habitsToday',
      render,
      commands: () => [
        { label: 'Habits: mark all done today', icon: 'check', run: markAllToday },
        { label: 'Habits: show heatmap', icon: 'grid', run: () => { view = 'heatmap'; persist(); } },
        { label: 'Habits: new habit', icon: 'plus', run: () => NX.actions.newHabit() }
      ]
    });
  })();
})(window.NX);
