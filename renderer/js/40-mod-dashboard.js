/* ============================================================
   Pebble — mod-dashboard.js
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, esc, iconHTML } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  const GREETINGS = [
    [5, 'Still up?'], [11, 'Good morning'], [13, 'Midday check-in'], [17, 'Good afternoon'],
    [21, 'Good evening'], [24, 'Winding down']
  ];
  const QUOTES = [
    ['Amateurs sit and wait for inspiration. The rest of us just get up and go to work.', 'Stephen King'],
    ['The best time to plant a tree was twenty years ago. The second best time is now.', 'Chinese proverb'],
    ['You do not rise to the level of your goals. You fall to the level of your systems.', 'James Clear'],
    ['Simplicity is the ultimate sophistication.', 'Leonardo da Vinci'],
    ['What we think, we become.', 'Buddha'],
    ['The way to get started is to quit talking and begin doing.', 'Walt Disney'],
    ['It always seems impossible until it is done.', 'Nelson Mandela'],
    ['Focus is a matter of deciding what things you are not going to do.', 'John Carmack'],
    ['A year from now you may wish you had started today.', 'Karen Lamb'],
    ['Discipline is choosing between what you want now and what you want most.', 'Abraham Lincoln'],
    ['Do the hard jobs first. The easy jobs will take care of themselves.', 'Dale Carnegie'],
    ['Well begun is half done.', 'Aristotle'],
    ['Small deeds done are better than great deeds planned.', 'Peter Marshall'],
    ['Action is the foundational key to all success.', 'Pablo Picasso'],
    ['Either you run the day or the day runs you.', 'Jim Rohn'],
    ['Perfection is not attainable, but if we chase perfection we can catch excellence.', 'Vince Lombardi'],
    ['The secret of getting ahead is getting started.', 'Mark Twain'],
    ['Do not watch the clock. Do what it does. Keep going.', 'Sam Levenson'],
    ['Energy and persistence conquer all things.', 'Benjamin Franklin'],
    ['Never confuse motion with action.', 'Benjamin Franklin']
  ];

  function render() {
    const page = h('div.page');
    page.appendChild(hero());
    page.appendChild(statsRow());
    const main = h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1.62fr) minmax(0,1fr)', gap: 'var(--sp-4)', alignItems: 'start' } });
    if (innerWidth < 1150) main.style.gridTemplateColumns = '1fr';
    const left = h('div.col', { style: { gap: 'var(--sp-4)' } });
    const right = h('div.col', { style: { gap: 'var(--sp-4)' } });
    left.appendChild(todayFocus());
    left.appendChild(upNext());
    left.appendChild(todaySchedule());
    right.appendChild(habitsCard());
    right.appendChild(quickActions());
    right.appendChild(recentNotesCard());
    right.appendChild(insightsCard());
    right.appendChild(streaksCard());
    main.append(left, right);
    page.appendChild(main);
    page.appendChild(activityFeed());
    return page;
  }

  /* ---------------- hero ---------------- */
  function hero() {
    const d = new Date();
    const g = GREETINGS.find(x => d.getHours() < x[0]);
    const name = store().getSetting('userName', 'You');
    const q = QUOTES[(d.getDate() + d.getMonth() * 31) % QUOTES.length];
    const today = sel().tasksDueOn(d).filter(t => !t.done);
    const overdue = sel().overdueTasks();
    const ev = sel().eventsOn(d);
    const hab = sel().habitsCompletedToday();

    const line = [];
    if (overdue.length) line.push(`<b style="color:var(--acc-red)">${overdue.length} overdue</b>`);
    if (today.length) line.push(`${today.length} due today`);
    if (ev.length) line.push(`${ev.length} event${ev.length > 1 ? 's' : ''}`);
    line.push(`${hab.done}/${hab.total} habits`);

    return h('div.dash-hero', [
      h('div.row', { style: { alignItems: 'flex-start' } }, [
        h('div.grow', [
          h('h2', `${g ? g[1] : 'Hello'}, ${name}`),
          h('div.dh-sub', { html: `${NX.fmtDate(d, 'long')} &nbsp;·&nbsp; ${line.join(' &nbsp;·&nbsp; ')}` }),
          h('div.dh-quote', [h('span', `“${q[0]}” `), h('span', { style: { color: 'var(--tx-4)', fontStyle: 'normal' } }, `— ${q[1]}`)])
        ]),
        h('div', { style: { textAlign: 'center', flex: '0 0 auto', marginLeft: '18px' } }, [
          NX.ui.ring(hab.total ? hab.done / hab.total * 100 : 0, 84, 8),
          h('div.small.muted', { style: { marginTop: '5px' } }, 'today')
        ])
      ]),
      h('div.row-wrap', { style: { marginTop: '14px', gap: '7px' } }, [
        h('button.btn.sm.primary', { html: iconHTML('plus', 13) + ' Quick capture', onclick: () => NX.shell.openQuickCapture() }),
        h('button.btn.sm.subtle', { html: iconHTML('note', 13) + ' New note', onclick: () => NX.actions.newNote() }),
        h('button.btn.sm.subtle', { html: iconHTML('task', 13) + ' New task', onclick: () => NX.actions.newTask() }),
        h('button.btn.sm.subtle', { html: iconHTML('timer', 13) + ' Focus session', onclick: () => NX.router.navigate('#/pomodoro') }),
        h('button.btn.sm.subtle', { html: iconHTML('journal', 13) + ' Journal', onclick: () => NX.router.go('journal', { date: NX.todayStr() }) })
      ])
    ]);
  }

  /* ---------------- stats ---------------- */
  function statsRow() {
    const ts = NX.aiEngine.taskSummary();
    const focus = sel().focusMinutesToday();
    const hab = sel().habitsCompletedToday();
    const fin = sel().monthTotals(0);
    const cs = store().getSetting('currencySymbol', '$');
    const cards = [
      { label: 'Open tasks', value: ts.open, sub: `${ts.overdue} overdue · ${ts.today} today`, icon: 'task', accent: ts.overdue ? 'red' : '', go: '#/tasks' },
      { label: 'Completion', value: ts.completionRate + '%', sub: `${ts.done} of ${ts.total} done`, icon: 'check', accent: 'grn', go: '#/tasks' },
      { label: 'Focus today', value: NX.fmtDuration(focus), sub: `${Math.round(focus / 25)} pomodoros`, icon: 'timer', accent: 'blu', go: '#/pomodoro' },
      { label: 'Habits', value: `${hab.done}/${hab.total}`, sub: hab.total ? `${Math.round(hab.done / hab.total * 100)}% today` : 'none set', icon: 'flame', accent: 'org', go: '#/habits' },
      { label: 'Net worth', value: cs + NX.compactNum(sel().netWorth()), sub: `${cs}${NX.fmtNum(fin.net, 0)} this month`, icon: 'money', accent: 'pur', go: '#/finance' },
      { label: 'Notes', value: store().notes.count(), sub: `${sel().noteLinks().length} links`, icon: 'note', go: '#/notes' }
    ];
    return h('div.grid.grid-auto-sm', { style: { marginBottom: 'var(--sp-4)' } },
      cards.map(c => h('div.stat.clickable' + (c.accent ? '.accent-' + c.accent : ''), { onclick: () => NX.router.navigate(c.go) }, [
        h('div.st-label', c.label),
        h('div.st-value', String(c.value)),
        h('div.st-sub', c.sub),
        h('div.st-ico', { html: iconHTML(c.icon, 30) })
      ])));
  }

  /* ---------------- today focus ---------------- */
  function todayFocus() {
    const tasks = sel().tasksDueOn(new Date());
    const overdue = sel().overdueTasks();
    const all = overdue.concat(tasks.filter(t => !overdue.includes(t)));
    const card = h('div.card');
    card.appendChild(h('div.card-head', [
      h('span', { html: iconHTML('target', 17), style: { color: 'var(--brand-1)', display: 'flex' } }),
      h('h3', 'Today'),
      h('span.badge-count', String(all.filter(t => !t.done).length)),
      h('div.grow'),
      h('button.btn.sm.ghost', { onclick: () => NX.router.navigate('#/tasks') }, 'All tasks')
    ]));
    if (!all.length) {
      card.appendChild(NX.ui.emptyState('check', 'Nothing due today', 'A clear day. Add something meaningful, or protect the emptiness.'));
      return card;
    }
    const list = h('div');
    all.slice(0, 12).forEach(t => list.appendChild(NX.components.taskRow(t, { showProject: true, showDue: true })));
    card.appendChild(list);
    const total = NX.sum(all.filter(t => !t.done).map(t => t.estimate || 0));
    if (total) card.appendChild(h('div.small.muted', { style: { marginTop: '10px', paddingTop: '9px', borderTop: '1px solid var(--bd)' } },
      `Estimated effort: ${NX.fmtDuration(total)} · you have ${(23 - new Date().getHours())}h left in the day`));
    return card;
  }

  /* ---------------- next up ---------------- */
  function upNext() {
    const next = sel().nextUp(6);
    const card = h('div.card');
    card.appendChild(h('div.card-head', [
      h('span', { html: iconHTML('zap', 17), style: { color: 'var(--acc-yel)', display: 'flex' } }),
      h('h3', 'Do these next'),
      h('div.grow'),
      h('span.small.muted', 'AI-ranked')
    ]));
    if (!next.length) { card.appendChild(h('p.small.muted', 'No open tasks. Enjoy it, or capture something.')); return card; }
    next.forEach((x, i) => {
      const t = x.task;
      card.appendChild(h('div.task-row', { style: { cursor: 'pointer' }, onclick: () => NX.actions.openResult({ kind: 'task', id: t.id }) }, [
        h('div', { style: { width: '18px', fontSize: '11px', fontWeight: '700', color: i === 0 ? 'var(--brand-1)' : 'var(--tx-4)', flex: '0 0 auto' } }, i === 0 ? '▶' : String(i + 1)),
        h('div.tr-main', [
          h('div.tr-title', t.title),
          h('div.tr-sub', [
            t.projectId ? h('span.chip', { style: { background: sel().projectColor(t.projectId) + '22', color: sel().projectColor(t.projectId) } }, sel().projectName(t.projectId)) : null,
            t.due ? h('span.tr-meta', NX.dueLabel(t.due)) : null,
            h('span.tr-meta', 'score ' + x.score)
          ])
        ]),
        h('div.tr-right', [
          h('button.task-check' + (t.priority === 'High' ? '.p-high' : t.priority === 'Medium' ? '.p-med' : '.p-low'), {
            title: 'Mark done',
            onclick: e => { e.stopPropagation(); NX.components.toggleTaskDone(t.id); NX.router.render(); }
          })
        ])
      ]));
    });
    return card;
  }

  /* ---------------- schedule ---------------- */
  function todaySchedule() {
    const ev = sel().eventsOn(new Date());
    const rem = sel().pendingReminders().filter(r => NX.isSameDay(r.at, new Date()));
    const card = h('div.card');
    card.appendChild(h('div.card-head', [
      h('span', { html: iconHTML('calendar', 17), style: { color: 'var(--acc-blu)', display: 'flex' } }),
      h('h3', 'Schedule'),
      h('div.grow'),
      h('button.btn.sm.ghost', { onclick: () => NX.router.navigate('#/calendar') }, 'Open calendar')
    ]));
    const items = [];
    ev.forEach(e => items.push({ sort: new Date(e.start).getTime(), allDay: e.allDay, node: h('div.agenda-item', { onclick: () => NX.router.go('calendar', { focus: e.id }) }, [
      h('div.agenda-time', e.allDay ? 'all day' : NX.fmtTime(e.start)),
      h('div.agenda-bar', { style: { background: e.color || 'var(--brand-1)' } }),
      h('div.grow', [
        h('div', { style: { fontSize: '12.8px', fontWeight: '550' } }, e.title),
        e.location ? h('div.small.muted', e.location) : null
      ])
    ]) }));
    rem.forEach(r => items.push({ sort: new Date(r.at).getTime(), allDay: false, node: h('div.agenda-item', { onclick: () => NX.router.navigate('#/reminders') }, [
      h('div.agenda-time', NX.fmtTime(r.at)),
      h('div.agenda-bar', { style: { background: r.priority === 'high' ? 'var(--acc-red)' : 'var(--acc-org)' } }),
      h('div.grow', [h('div', { style: { fontSize: '12.8px', fontWeight: '550' } }, '⏰ ' + r.title), r.body ? h('div.small.muted', r.body) : null])
    ]) }));
    items.sort((a, b) => a.sort - b.sort);
    if (!items.length) card.appendChild(h('p.small.muted', 'Nothing scheduled. The day is yours.'));
    else card.appendChild(h('div', items.map(i => i.node)));
    return card;
  }

  /* ---------------- habits ---------------- */
  function habitsCard() {
    const habits = store().habits.all().filter(x => x.active !== false).slice(0, 7);
    const card = h('div.card');
    card.appendChild(h('div.card-head', [
      h('span', { html: iconHTML('flame', 17), style: { color: 'var(--acc-org)', display: 'flex' } }),
      h('h3', 'Habits'),
      h('div.grow'),
      h('button.btn.sm.ghost', { onclick: () => NX.router.navigate('#/habits') }, 'All')
    ]));
    if (!habits.length) { card.appendChild(h('p.small.muted', 'No habits yet.')); return card; }
    const todayKey = NX.todayStr();
    habits.forEach(hb => {
      const done = sel().habitDoneOn(hb, todayKey);
      const streak = sel().habitStreak(hb);
      card.appendChild(h('div.list-row', { style: { borderBottom: '1px solid var(--bd)' } }, [
        h('button.task-check' + (done ? '.on' : ''), {
          style: done ? { background: hb.color, borderColor: hb.color } : null,
          title: done ? 'Undo' : 'Mark done',
          onclick: () => { NX.components.toggleHabit(hb.id, todayKey); NX.router.render(); }
        }),
        h('div.lr-main', [
          h('div.lr-title', `${hb.emoji || '🔥'} ${hb.name}`),
          h('div.lr-sub', `${streak}-day streak · ${sel().habitRate(hb, 14)}% last 14d`)
        ]),
        h('div', { style: { flex: '0 0 auto' } }, NX.ui.sparkline(last14(hb), 62, 22, hb.color))
      ]));
    });
    return card;

    function last14(hb) {
      const out = [];
      for (let i = 13; i >= 0; i--) out.push(sel().habitDoneOn(hb, NX.ymd(NX.addDays(new Date(), -i))) ? 1 : 0);
      return out;
    }
  }

  /* ---------------- quick actions ---------------- */
  function quickActions() {
    const acts = [
      { g: 'note', label: 'New note', run: () => NX.actions.newNote() },
      { g: 'check', label: 'New task', run: () => NX.actions.newTask() },
      { g: 'cal', label: 'New event', run: () => NX.actions.newEvent() },
      { g: 'clock', label: 'Reminder', run: () => NX.actions.newReminder() },
      { g: 'target', label: 'Focus', run: () => NX.router.navigate('#/pomodoro') },
      { g: 'clock', label: 'Track time', run: () => NX.actions.startTimer() },
      { g: 'scratch', label: 'Journal', run: () => NX.router.go('journal', { date: NX.todayStr() }) },
      { g: 'wallet', label: 'Expense', run: () => NX.actions.newTransaction() },
      { g: 'star', label: 'Bookmark', run: () => NX.actions.newBookmark() },
      { g: 'graph', label: 'Wiki page', run: () => NX.actions.newWikiPage() },
      { g: 'orbit', label: 'Weekly review', run: () => NX.actions.weeklyReview() },
      { g: 'spark', label: 'Ask AI', run: () => NX.router.navigate('#/ai') }
    ];
    return h('div.card', [
      h('div.card-head', [h('h3', 'Quick actions')]),
      h('div.quick-actions', acts.map(a => h('button.qa-btn', { onclick: a.run }, [h('span.qa-ico', { html: NX.glyph(a.g, 17) }), h('span', a.label)])))
    ]);
  }

  /* ---------------- recent notes ---------------- */
  function recentNotesCard() {
    const notes = sel().recentNotes(6);
    const card = h('div.card');
    card.appendChild(h('div.card-head', [
      h('span', { html: iconHTML('history', 16), style: { color: 'var(--tx-3)', display: 'flex' } }),
      h('h3', 'Recent notes'), h('div.grow'),
      h('button.btn.sm.ghost', { onclick: () => NX.router.navigate('#/notes') }, 'All')
    ]));
    if (!notes.length) { card.appendChild(h('p.small.muted', 'Nothing yet.')); return card; }
    notes.forEach(n => card.appendChild(h('button.list-row.selectable', { style: { border: '0', width: '100%' }, onclick: () => NX.router.go('notes', { id: n.id }) }, [
      h('span.ico', { style: { fontSize: '15px' } }, n.icon || '📄'),
      h('span.lr-main', [
        h('span.lr-title', { style: { display: 'block' } }, n.title || 'Untitled'),
        h('span.lr-sub', `${sel().noteWordCount(n)} words · ${NX.relTime(n.updated)}`)
      ])
    ])));
    return card;
  }

  /* ---------------- insights ---------------- */
  function insightsCard() {
    const items = NX.aiEngine.insights().slice(0, 5);
    const card = h('div.card');
    card.appendChild(h('div.card-head', [
      h('span', { html: iconHTML('brain', 17), style: { color: 'var(--acc-pur)', display: 'flex' } }),
      h('h3', 'Insights'), h('div.grow'),
      h('button.btn.sm.ghost', { onclick: () => NX.router.go('ai', { tab: 'insights' }) }, 'More')
    ]));
    if (!items.length) { card.appendChild(h('p.small.muted', 'Nothing needs attention. Rare and lovely.')); return card; }
    const colorOf = k => k === 'warn' ? 'var(--acc-org)' : k === 'good' ? 'var(--acc-grn)' : 'var(--acc-blu)';
    items.forEach(it => card.appendChild(h('div', {
      style: { display: 'flex', gap: '9px', padding: '8px 0', borderBottom: '1px solid var(--bd)', cursor: 'pointer' },
      onclick: () => NX.router.navigate(it.link || '#/ai')
    }, [
      h('span', { html: iconHTML(it.icon || 'info', 15), style: { color: colorOf(it.kind), flex: '0 0 auto', marginTop: '2px', display: 'flex' } }),
      h('div.grow', [
        h('div', { style: { fontSize: '12.5px', fontWeight: '600' } }, it.title),
        h('div', { style: { fontSize: '11.5px', color: 'var(--tx-3)', lineHeight: '1.5', marginTop: '1px' } }, it.text)
      ])
    ])));
    return card;
  }

  /* ---------------- streaks ---------------- */
  function streaksCard() {
    const habits = store().habits.all().filter(x => x.active !== false)
      .map(hb => ({ hb, s: sel().habitStreak(hb) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 5);
    const goals = store().goals.all().filter(g => !g.archived).slice(0, 4);
    if (!habits.length && !goals.length) return h('div');
    const card = h('div.card');
    card.appendChild(h('div.card-head', [h('h3', 'Momentum')]));
    habits.forEach(x => card.appendChild(h('div', { style: { display: 'flex', alignItems: 'center', gap: '9px', padding: '5px 0' } }, [
      h('span', { style: { fontSize: '16px' } }, x.hb.emoji || '🔥'),
      h('div.grow', [
        h('div', { style: { fontSize: '12.5px' } }, x.hb.name),
        h('div.progress.thin', { style: { marginTop: '4px' } }, h('i', { style: { width: Math.min(100, x.s / 30 * 100) + '%', background: x.hb.color } }))
      ]),
      h('b', { style: { fontSize: '14px', color: x.hb.color } }, x.s + 'd')
    ])));
    if (goals.length) {
      card.appendChild(h('div.divider', { style: { margin: '12px 0' } }));
      card.appendChild(h('div.small.muted', { style: { fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '.5px' } }, 'Goals'));
      goals.forEach(g => {
        const p = sel().goalProgress(g);
        card.appendChild(h('div', { style: { padding: '5px 0', cursor: 'pointer' }, onclick: () => NX.router.go('goals', { focus: g.id }) }, [
          h('div.row', { style: { justifyContent: 'space-between', marginBottom: '4px' } }, [
            h('span', { style: { fontSize: '12.5px' } }, g.title),
            h('b', { style: { fontSize: '12px', color: g.color } }, p + '%')
          ]),
          h('div.progress.thin', h('i', { style: { width: p + '%', background: g.color } }))
        ]));
      });
    }
    return card;
  }

  /* ---------------- activity ---------------- */
  function activityFeed() {
    const acts = store().activity.all().slice(0, 14);
    if (!acts.length) return h('div');
    return h('div.card', { style: { marginTop: 'var(--sp-4)' } }, [
      h('div.card-head', [h('span', { html: iconHTML('history', 16), style: { display: 'flex', color: 'var(--tx-3)' } }), h('h3', 'Recent activity')]),
      h('div', acts.map(a => h('div', { style: { display: 'flex', gap: '10px', padding: '5px 0', fontSize: '12.3px' } }, [
        h('span', { html: iconHTML(a.icon || 'zap', 14), style: { color: 'var(--tx-4)', marginTop: '2px', display: 'flex' } }),
        h('span.grow', { style: { color: 'var(--tx-2)' } }, a.text),
        h('span.muted.tiny', { style: { flex: '0 0 auto' } }, NX.relTime(a.at))
      ])))
    ]);
  }

  NX.router.register({
    id: 'dashboard', name: 'Dashboard', icon: 'dashboard', group: 'capture', order: 1,
    render,
    commands: () => [
      { label: 'Dashboard: generate a daily briefing', icon: 'sparkle', run: async () => { const r = await NX.ai.features.dailyDigest(); NX.ui.modal({ title: 'Daily briefing', size: 'wide', body: h('pre', { style: { whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '13px', lineHeight: '1.7' }, html: NX.ai.renderMarkdown(r.text) }) }); } },
      { label: 'Dashboard: mark all today\'s habits done', icon: 'flame', run: () => { const k = NX.todayStr(); sel().habitsCompletedToday(); store().habits.all().forEach(hb => { if (!sel().habitDoneOn(hb, k)) NX.components.toggleHabit(hb.id, k, true); }); NX.ui.toast({ type: 'success', message: 'All habits logged' }); NX.router.render(); } }
    ]
  });
})(window.NX);
