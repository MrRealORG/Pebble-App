/* ============================================================
   Pebble — mod-goals.js + mod-journal.js
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, esc, iconHTML } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  /* =====================================================================
     GOALS / OKRs
     ===================================================================== */
  (function () {
    function render(params) {
      const goals = store().goals.all().filter(g => !g.archived);
      const page = h('div.page');
      page.appendChild(NX.components.pageHead({
        icon: 'target', title: 'Goals',
        sub: goals.length ? `${goals.length} active · average progress ${Math.round(goals.reduce((a, g) => a + sel().goalProgress(g), 0) / goals.length)}%` : 'No active goals',
        actions: [
          h('button.btn.sm.primary', { html: iconHTML('plus', 13) + ' New goal', onclick: () => NX.actions.newGoal().then(() => NX.router.render()) }),
          h('button.btn.sm.ghost', { onclick: showArchivedGoals }, 'Archived')
        ]
      }));
      if (!goals.length) {
        page.appendChild(NX.ui.emptyState('target', 'No goals yet', 'A goal without key results is a wish. Define the outcome, then 2–4 measurable results that prove you got there.', 'Create your first goal', () => NX.actions.newGoal()));
        return page;
      }
      const grid = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' } });
      goals.forEach(g => grid.appendChild(goalCard(g, params && params.focus === g.id)));
      page.appendChild(grid);
      page.appendChild(reflection());
      return page;
    }

    function showArchivedGoals() {
      const list = store().goals.all().filter(g => g.archived);
      NX.ui.modal({
        title: 'Archived goals', hideFooter: true,
        body: list.length
          ? h('div.list', list.map(g => h('button.list-row.selectable', {
              style: { width: '100%' },
              onclick: () => { store().goals.update(g.id, { archived: false }); NX.ui.closeTopModal(); NX.router.render(); }
            }, [
              h('span.ico', { html: iconHTML('target', 14) }),
              h('div.lr-main', [
                h('div.lr-title', g.title),
                h('div.lr-sub', (g.category || 'Goal') + ' · ' + sel().goalProgress(g) + '%')
              ]),
              h('span.small.muted', 'click to restore')
            ])))
          : h('p.small.muted', 'Nothing archived.')
      });
    }

    function goalCard(g, highlight) {
      const p = sel().goalProgress(g);
      const days = g.targetDate ? NX.diffDays(g.targetDate, new Date()) : null;
      const card = h('div.card', { style: highlight ? { boxShadow: 'var(--glow)', borderColor: 'var(--brand-1)' } : null });
      card.appendChild(h('div.row', { style: { alignItems: 'flex-start', gap: '14px' } }, [
        h('div', { style: { flex: '0 0 auto' } }, NX.ui.ring(p, 78, 8, g.color)),
        h('div.grow', [
          h('div.row-wrap', { style: { gap: '6px', marginBottom: '4px' } }, [
            h('h3', { style: { fontSize: '17px', letterSpacing: '-.3px' } }, g.title),
            h('span.chip', { style: { background: g.color + '22', color: g.color } }, g.category || 'Goal'),
            statusChip(g, days, p)
          ]),
          g.description ? h('p.small.muted', { style: { marginBottom: '7px', maxWidth: '760px' } }, g.description) : null,
          h('div.row-wrap', { style: { gap: '12px' } }, [
            days !== null ? h('span.small', { style: { color: days < 0 ? 'var(--acc-red)' : days < 14 ? 'var(--acc-org)' : 'var(--tx-3)' } },
              days < 0 ? `${Math.abs(days)} days past target` : days === 0 ? 'Due today' : `${days} days left · ${NX.fmtDate(g.targetDate, 'medium')}`) : null,
            h('span.small.muted', `${(g.keyResults || []).length} key result${(g.keyResults || []).length === 1 ? '' : 's'}`),
            h('span.small.muted', 'Created ' + NX.fmtDate(g.created, 'medium'))
          ])
        ]),
        h('div', { style: { flex: '0 0 auto' } }, [
          h('button.btn.sm.ghost', { html: iconHTML('more', 15), onclick: e => NX.ui.dropdown(e.currentTarget, menu(g), { right: true }) })
        ])
      ]));

      // key results
      if ((g.keyResults || []).length) {
        card.appendChild(h('div.section-head', { style: { marginTop: '16px' } }, [h('h2', { style: { fontSize: '12.5px' } }, 'Key results'), h('div.grow'),
          h('button.btn.xs.ghost', { onclick: () => addKR(g.id) }, '+ Add')]));
        g.keyResults.forEach((kr, i) => {
          const kp = NX.clamp(Math.round((kr.current / (kr.target || 1)) * 100), 0, 100);
          card.appendChild(h('div', { style: { padding: '7px 0', borderBottom: '1px solid var(--bd)' } }, [
            h('div.row', { style: { gap: '9px' } }, [
              h('div.grow', [
                h('div', { style: { fontSize: '13px' } }, kr.text),
                h('div.small.muted', { style: { marginTop: '2px' } }, `${kr.current} / ${kr.target} ${kr.unit || ''} · ${kp}%`)
              ]),
              h('div', { style: { width: '130px', flex: '0 0 auto' } }, h('div.progress.thin', h('i', { style: { width: kp + '%', background: kp >= 100 ? 'var(--acc-grn)' : g.color } }))),
              h('div.row', { style: { gap: '3px', flex: '0 0 auto' } }, [
                h('button.icon-btn', { html: iconHTML('minus', 13), title: 'Decrease', onclick: () => bump(g, i, -1) }),
                h('b.small', { style: { minWidth: '34px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' } }, String(kr.current)),
                h('button.icon-btn', { html: iconHTML('plus', 13), title: 'Increase', onclick: () => bump(g, i, 1) }),
                h('button.icon-btn', { html: iconHTML('edit', 13), title: 'Edit key result', onclick: () => editKR(g, i) })
              ])
            ])
          ]));
        });
      } else {
        card.appendChild(h('div.card.pad-sm', { style: { marginTop: '14px', background: 'var(--bg-sunken)', textAlign: 'center' } }, [
          h('p.small.muted', 'No key results yet — a goal without them cannot be measured.'),
          h('button.btn.sm.primary', { style: { marginTop: '8px' }, onclick: () => addKR(g.id) }, 'Add a key result')
        ]));
      }

      // linked tasks
      const linked = store().tasks.all().filter(t => !t.archived && t.title.toLowerCase().includes(g.title.toLowerCase().split(' ')[0]) && g.title.split(' ').length > 1);
      card.appendChild(h('div.row', { style: { marginTop: '14px', gap: '7px' } }, [
        h('button.btn.sm.subtle', { onclick: () => addKR(g.id) }, '+ Key result'),
        h('button.btn.sm.ghost', { onclick: async () => { const t = await NX.actions.newTask(); if (t) store().tasks.update(t.id, { description: (t.description || '') + '\nGoal: ' + g.title }); } }, '+ Task'),
        h('div.grow'),
        p >= 100 ? h('button.btn.sm.success', { onclick: async () => { if (await NX.ui.confirm({ title: 'Goal complete!', message: `Mark “${g.title}” as achieved and archive it?`, confirmLabel: 'Celebrate & archive', danger: false })) { store().goals.update(g.id, { archived: true, status: 'complete', completedAt: new Date().toISOString() }); NX.ui.toast({ type: 'success', title: '🎉 Goal achieved', message: g.title }); NX.router.render(); } } }, '🎉 Mark achieved') : null,
        h('span.small.muted', `Last updated ${NX.relTime(g.updated)}`)
      ]));
      return card;
    }

    function statusChip(g, days, p) {
      let label = g.status || 'on-track', color = 'grn';
      if (days !== null && days >= 0 && g.created) {
        const totalDays = Math.max(1, NX.diffDays(g.targetDate, new Date(g.created)));
        const expected = NX.clamp(Math.round((1 - days / totalDays) * 100), 0, 100);
        if (p + 20 < expected) { label = 'behind'; color = 'red'; }
        else if (p + 8 < expected) { label = 'at risk'; color = 'org'; }
        else if (p > expected + 10) { label = 'ahead'; color = 'blu'; }
        else { label = 'on track'; color = 'grn'; }
      }
      if (p >= 100) { label = 'complete'; color = 'grn'; }
      if (days !== null && days < 0 && p < 100) { label = 'overdue'; color = 'red'; }
      return h('span.chip.chip-' + color, label);
    }

    function bump(g, i, delta) {
      const krs = NX.deepClone(g.keyResults);
      krs[i].current = Math.max(0, (Number(krs[i].current) || 0) + delta);
      store().goals.update(g.id, { keyResults: krs, progress: sel().goalProgress(Object.assign({}, g, { keyResults: krs })) });
      NX.router.render();
    }

    function addKR(goalId) {
      NX.ui.form({
        title: 'New key result', okLabel: 'Add',
        fields: [
          { key: 'text', label: 'What will you measure?', type: 'text', required: true, full: true, placeholder: 'e.g. Weekly distance' },
          { key: 'current', label: 'Current', type: 'number', value: 0 },
          { key: 'target', label: 'Target', type: 'number', value: 10, required: true },
          { key: 'unit', label: 'Unit', type: 'text', placeholder: 'km, books, %, $…' }
        ]
      }).then(r => {
        if (!r) return;
        const g = store().goals.find(goalId);
        const krs = (g.keyResults || []).concat([{ id: NX.uid('kr'), text: r.text, current: Number(r.current) || 0, target: Number(r.target) || 1, unit: r.unit || '' }]);
        store().goals.update(goalId, { keyResults: krs });
        NX.router.render();
      });
    }

    function editKR(g, i) {
      const kr = g.keyResults[i];
      NX.ui.form({
        title: 'Edit key result', okLabel: 'Save',
        fields: [
          { key: 'text', label: 'Measure', type: 'text', value: kr.text, required: true, full: true },
          { key: 'current', label: 'Current', type: 'number', value: kr.current, step: 'any' },
          { key: 'target', label: 'Target', type: 'number', value: kr.target, step: 'any' },
          { key: 'unit', label: 'Unit', type: 'text', value: kr.unit || '' }
        ]
      }).then(r => {
        if (!r) return;
        const krs = NX.deepClone(g.keyResults);
        krs[i] = Object.assign(krs[i], { text: r.text, current: Number(r.current) || 0, target: Number(r.target) || 1, unit: r.unit });
        store().goals.update(g.id, { keyResults: krs });
        NX.router.render();
      });
    }

    function menu(g) {
      return [
        { icon: 'edit', label: 'Edit goal…', onClick: () => editGoal(g.id) },
        { icon: 'note', label: 'Create a note for this goal', onClick: () => {
            const n = store().notes.create({ title: '🎯 ' + g.title, icon: '🎯', emoji: '🎯', tags: [], parentId: null, order: 0, favorite: true, archived: false, properties: [
              { id: NX.uid('p'), name: 'Category', type: 'text', value: g.category },
              { id: NX.uid('p'), name: 'Target date', type: 'date', value: g.targetDate || '' },
              { id: NX.uid('p'), name: 'Progress', type: 'number', value: sel().goalProgress(g) }
            ], blocks: [
              NX.md.newBlock('h1', { text: g.title }),
              NX.md.newBlock('text', { text: g.description || '' }),
              NX.md.newBlock('h2', { text: 'Key results' }),
              ...((g.keyResults || []).map(kr => NX.md.newBlock('todo', { text: `${kr.text}: ${kr.current}/${kr.target} ${kr.unit || ''}`, done: kr.current >= kr.target }))),
              NX.md.newBlock('h2', { text: 'Next actions' }), NX.md.newBlock('todo'),
              NX.md.newBlock('h2', { text: 'Blockers' }), NX.md.newBlock('bullet'),
              NX.md.newBlock('h2', { text: 'Log' }), NX.md.newBlock('text', { text: NX.fmtDate(new Date(), 'medium') + ' — created this goal page.' })
            ]});
            NX.router.go('notes', { id: n.id });
          } },
        { icon: 'task', label: 'Create tasks from key results', onClick: () => {
            (g.keyResults || []).forEach(kr => store().tasks.create({ title: `${kr.text} → ${kr.target}${kr.unit || ''}`, description: `Key result for goal: ${g.title}`, projectId: null, status: 'To Do', priority: 'High', due: g.targetDate ? new Date(g.targetDate).toISOString() : null, repeat: null, tags: [], checklist: [], estimate: 0, order: 0, done: kr.current >= kr.target, archived: false }, true));
            store().touch(); store().emit('tasks');
            NX.ui.toast({ type: 'success', message: `${(g.keyResults || []).length} tasks created` });
          } },
        '-',
        ...['on-track', 'at-risk', 'behind', 'complete', 'abandoned'].map(s => ({ label: 'Mark as ' + s, checked: g.status === s, onClick: () => { store().goals.update(g.id, { status: s }); NX.router.render(); } })),
        '-',
        { icon: 'archive', label: 'Archive goal', onClick: () => { store().goals.update(g.id, { archived: true }); NX.ui.toast({ message: 'Goal archived' }); NX.router.render(); } },
        { icon: 'trash', label: 'Delete goal', danger: true, onClick: async () => { if (await NX.ui.confirmDelete('“' + g.title + '”')) { store().goals.remove(g.id); NX.router.render(); } } }
      ];
    }

    async function editGoal(id) {
      const g = store().goals.find(id);
      const res = await NX.ui.form({
        title: 'Edit goal', wide: true, okLabel: 'Save',
        fields: [
          { key: 'title', label: 'Goal', type: 'text', value: g.title, required: true, full: true },
          { key: 'description', label: 'Why it matters', type: 'textarea', value: g.description || '', rows: 3, full: true },
          { key: 'category', label: 'Category', type: 'select', value: g.category, options: ['Career', 'Health', 'Learning', 'Finance', 'Personal', 'Creative', 'Other'] },
          { key: 'color', label: 'Colour', type: 'color', value: g.color },
          { key: 'targetDate', label: 'Target date', type: 'date', value: g.targetDate || '' },
          { key: 'status', label: 'Status', type: 'select', value: g.status || 'on-track', options: ['on-track', 'at-risk', 'behind', 'complete', 'abandoned'] }
        ]
      });
      if (!res) return;
      store().goals.update(id, res);
      NX.ui.toast({ type: 'success', message: 'Goal updated' });
      NX.router.render();
    }

    function reflection() {
      const goals = store().goals.all().filter(g => !g.archived);
      if (!goals.length) return h('div');
      return h('div.card', { style: { marginTop: 'var(--sp-4)', background: 'var(--bg-sunken)' } }, [
        h('div.card-head', [h('span', { html: iconHTML('brain', 16), style: { display: 'flex', color: 'var(--acc-pur)' } }), h('h3', 'Coaching prompt')]),
        h('p.small', { style: { lineHeight: '1.7', color: 'var(--tx-2)' } },
          `The goal furthest behind pace is the one telling you something. Either it matters less than you thought, or you are under-resourcing it. Pick one and answer honestly: what is the single next action, and when will you do it?`),
        h('div.row', { style: { marginTop: '11px', gap: '7px' } }, [
          h('button.btn.sm.primary', { onclick: async () => {
              const t = NX.ui.toast({ type: 'info', message: 'Thinking…', duration: 0 });
              const behind = goals.map(g => ({ g, p: sel().goalProgress(g) })).sort((a, b) => a.p - b.p)[0];
              const r = await NX.ai.features.plan(`How do I get "${behind.g.title}" back on track? It is at ${behind.p}% with ${behind.g.targetDate ? NX.diffDays(behind.g.targetDate, new Date()) : '?'} days left.`);
              t.close();
              NX.ui.modal({ title: 'Getting “' + behind.g.title + '” back on track', size: 'wide', body: h('div.md-preview', { html: NX.ai.renderMarkdown(r.text) }) });
            } }, '✨ Ask AI to unblock the weakest goal'),
          h('button.btn.sm.ghost', { onclick: () => {
              const behind = goals.map(g => ({ g, p: sel().goalProgress(g) })).sort((a, b) => a.p - b.p)[0];
              NX.ui.form({ title: 'Next action for “' + behind.g.title + '”', okLabel: 'Create task', fields: [
                { key: 'title', label: 'The single next action', type: 'text', required: true, full: true },
                { key: 'due', label: 'By when', type: 'datetime' }
              ] }).then(r => { if (!r) return; store().tasks.create({ title: r.title, description: 'Next action for goal: ' + behind.g.title, projectId: null, status: 'To Do', priority: 'High', due: r.due ? new Date(r.due).toISOString() : null, repeat: null, tags: [], checklist: [], estimate: 30, order: 0, done: false, archived: false }); NX.ui.toast({ type: 'success', message: 'Task created' }); });
            } }, 'Add a next action')
        ])
      ]);
    }

    NX.router.register({
      id: 'goals', name: 'Goals', icon: 'goal', group: 'track', order: 33,
      render,
      commands: () => [{ label: 'Goals: new goal', icon: 'plus', run: () => NX.actions.newGoal() }]
    });
  })();

  /* =====================================================================
     JOURNAL
     ===================================================================== */
  (function () {
    let currentDate = NX.todayStr();
    let view = NX.localStore.get('nexadesk.journalView', 'day');   // day | timeline | moods | prompts | stats
    const MOODS = [
      { v: 1, e: 'mood1', l: 'Rough' }, { v: 2, e: 'mood2', l: 'Low' }, { v: 3, e: 'mood3', l: 'Okay' },
      { v: 4, e: 'mood4', l: 'Good' }, { v: 5, e: 'mood5', l: 'Great' }
    ];
    const PROMPTS = [
      'What went well today, and why?',
      'What is one thing I am avoiding, and what is the smallest possible step?',
      'What did I learn today that I did not know yesterday?',
      'Who did I help, and who helped me?',
      'What drained my energy? What gave it back?',
      'If today repeated 100 times, would I be happy with the pattern?',
      'What am I grateful for right now? Be specific.',
      'What would I do today if I knew it could not fail?',
      'What is the most important thing I did NOT do today?',
      'How did I show up for the people I care about?',
      'What am I looking forward to tomorrow?',
      'What is one belief I held today that might be wrong?',
      'Where did my attention actually go, and was that a choice?',
      'What would I tell myself from a week ago?'
    ];

    function render(params) {
      if (params && params.date) currentDate = params.date;
      if (params && params.view) view = params.view;
      const page = h('div.page');
      page.appendChild(NX.components.pageHead({
        icon: 'journal', title: 'Journal',
        sub: `${store().journal.count()} entries · ${streakText()}`,
        actions: [
          h('button.btn.sm.subtle', { onclick: () => { currentDate = NX.ymd(NX.addDays(new Date(currentDate), -1)); NX.router.go('journal', { date: currentDate }); } }, '← Prev'),
          h('button.btn.sm.subtle', { onclick: () => { currentDate = NX.todayStr(); NX.router.go('journal', { date: currentDate }); } }, 'Today'),
          h('button.btn.sm.subtle', { onclick: () => { const d = NX.addDays(new Date(currentDate), 1); if (d > new Date()) return; currentDate = NX.ymd(d); NX.router.go('journal', { date: currentDate }); } }, 'Next →'),
          h('button.btn.sm.ghost', { onclick: e => NX.ui.dropdown(e.currentTarget, [
            { icon: 'download', label: 'Export journal as Markdown', onClick: exportJournal },
            { icon: 'sparkle', label: 'AI: reflect on the last 7 days', onClick: reflect },
            { icon: 'chart', label: 'Mood statistics', onClick: () => { view = 'stats'; persist(); } }
          ], { right: true }) }, 'More')
        ]
      }));
      page.appendChild(h('div.tabs', ['day', 'timeline', 'moods', 'prompts', 'stats'].map(v =>
        h('button' + (view === v ? '.on' : ''), { onclick: () => { view = v; persist(); } }, v[0].toUpperCase() + v.slice(1)))));
      if (view === 'day') page.appendChild(dayView());
      else if (view === 'timeline') page.appendChild(timeline());
      else if (view === 'moods') page.appendChild(moodCalendar());
      else if (view === 'prompts') page.appendChild(promptView());
      else page.appendChild(statsView());
      return page;
    }
    function persist() { NX.localStore.set('nexadesk.journalView', view); NX.router.render(); }

    function streakText() {
      let s = 0;
      const d = new Date();
      if (!sel().journalFor(NX.ymd(d))) d.setDate(d.getDate() - 1);
      for (let i = 0; i < 400; i++) {
        if (sel().journalFor(NX.ymd(d))) { s++; d.setDate(d.getDate() - 1); } else break;
      }
      return s ? `${s}-day writing streak 🔥` : 'no active streak';
    }

    /* ---------------- day ---------------- */
    function dayView() {
      const entry = sel().journalFor(currentDate);
      const wrap = h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 290px', gap: 'var(--sp-4)', alignItems: 'start' } });
      if (innerWidth < 1050) wrap.style.gridTemplateColumns = '1fr';
      const main = h('div.col', { style: { gap: 'var(--sp-4)' } });

      // mood + energy
      const moodCard = h('div.card');
      moodCard.appendChild(h('div.card-head', [h('h3', NX.fmtDate(currentDate, 'long')), h('div.grow'),
        NX.isToday(currentDate) ? h('span.chip.chip-grn', 'Today') : h('span.chip', NX.relTime(currentDate))]));
      moodCard.appendChild(h('div.small.muted', { style: { marginBottom: '6px', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.5px' } }, 'How was the day?'));
      moodCard.appendChild(h('div.mood-strip', MOODS.map(m => h('button.mood-btn' + (entry && entry.mood === m.v ? '.on' : ''), {
        title: m.l, onclick: () => { ensure(); setField('mood', m.v); NX.router.render(); }
      }, h('span', { style: { display: 'flex' }, html: NX.glyph(m.e, 24, 1.8) })))));
      moodCard.appendChild(h('div.small.muted', { style: { marginTop: '6px', fontSize: '11px' } }, MOODS.map(m => m.l).join(' · ')));
      moodCard.appendChild(h('div.divider', { style: { margin: '14px 0' } }));
      moodCard.appendChild(h('div.small.muted', { style: { marginBottom: '6px', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.5px' } }, 'Energy'));
      moodCard.appendChild(h('div.row', { style: { gap: '10px' } }, [
        h('input.range.grow', { type: 'range', min: 1, max: 5, value: entry ? (entry.energy || 3) : 3, oninput: e => { const lbl = document.getElementById('energyLbl'); if (lbl) lbl.textContent = e.target.value; }, onchange: e => { ensure(); setField('energy', Number(e.target.value)); } }),
        h('b#energyLbl', { style: { minWidth: '16px', textAlign: 'center' } }, String(entry ? (entry.energy || 3) : 3))
      ]));
      moodCard.appendChild(h('div.divider', { style: { margin: '14px 0' } }));
      moodCard.appendChild(h('div.small.muted', { style: { marginBottom: '6px', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.5px' }, }));
      moodCard.appendChild(h('div.row-wrap', { style: { gap: '5px' } }, ['☀️', '⛅', '🌧️', '❄️', '🌩️', '🌫️'].map(w =>
        h('button.mood-btn' + (entry && entry.weather === w ? '.on' : ''), { style: { width: '38px', height: '38px', fontSize: '18px' }, onclick: () => { ensure(); setField('weather', entry && entry.weather === w ? '' : w); NX.router.render(); } }, w))));
      main.appendChild(moodCard);

      // text
      const ta = h('textarea.textarea', {
        rows: 16, placeholder: 'What happened today? What are you thinking about?\n\nWrite freely — this is only for you.',
        style: { fontSize: '14.5px', lineHeight: '1.75' }
      });
      ta.value = entry ? entry.text || '' : '';
      const saveText = NX.debounce(() => { ensure(); setField('text', ta.value); updateCounts(); }, 700);
      ta.addEventListener('input', saveText);
      const textCard = h('div.card', [
        h('div.card-head', [h('h3', 'Entry'), h('div.grow'),
          h('span.small.muted', { id: 'jCount' }),
          h('button.btn.xs.ghost', { title: 'AI: reflect on this entry', onclick: () => reflectEntry(ta.value) }, '✨ Reflect'),
          h('button.btn.xs.ghost', { title: 'Analyse tone', onclick: () => analyse(ta.value) }, '📊 Analyse')]),
        ta
      ]);
      main.appendChild(textCard);

      // gratitude
      const gCard = h('div.card');
      gCard.appendChild(h('div.card-head', [h('h3', 'Gratitude'), h('div.grow'), h('button.btn.xs.ghost', { onclick: () => { ensure(); const g = (getEntry().gratitude || []).concat(['']); store().journal.update(getEntry().id, { gratitude: g }); NX.router.render(); } }, '+ Add')]));
      const gList = (entry && entry.gratitude) || [];
      if (!gList.length) gCard.appendChild(h('p.small.muted', 'Three specific things. Vague gratitude does not count — “my coffee was good” beats “everything”.'));
      gList.forEach((g, i) => gCard.appendChild(h('div.row', { style: { gap: '7px', marginBottom: '6px' } }, [
        h('span', '🙏'),
        h('input.input.sm.grow', { value: g, placeholder: 'Something you are grateful for…', oninput: NX.debounce(e => { ensure(); const list = getEntry().gratitude.slice(); list[i] = e.target.value; store().journal.update(getEntry().id, { gratitude: list }, true); }, 500) }),
        h('button.icon-btn', { html: iconHTML('x', 13), onclick: () => { ensure(); const list = getEntry().gratitude.slice(); list.splice(i, 1); store().journal.update(getEntry().id, { gratitude: list }); NX.router.render(); } })
      ])));
      main.appendChild(gCard);

      // day at a glance
      const glance = h('div.card');
      glance.appendChild(h('div.card-head', [h('h3', 'That day at a glance')]));
      const dayTasks = sel().tasksDueOn(currentDate);
      const dayHabits = store().habits.all().filter(x => x.active !== false && sel().habitDoneOn(x, currentDate));
      const dayFocus = NX.sum(store().pomodoro.all().filter(p => p.completed && String(p.startedAt).slice(0, 10) === currentDate).map(p => p.actualMinutes || p.plannedMinutes || 0));
      const dayEvents = sel().eventsOn(currentDate);
      const daySpend = NX.sum(store().transactions.all().filter(t => t.date === currentDate).map(t => t.amount));
      glance.appendChild(NX.ui.kv('Tasks due', dayTasks.length ? `${dayTasks.filter(t => t.done).length}/${dayTasks.length} done` : 'none'));
      glance.appendChild(NX.ui.kv('Habits logged', dayHabits.length + '/' + store().habits.all().filter(x => x.active !== false).length));
      glance.appendChild(NX.ui.kv('Focus time', NX.fmtDuration(dayFocus)));
      glance.appendChild(NX.ui.kv('Events', String(dayEvents.length)));
      glance.appendChild(NX.ui.kv('Net spend', (daySpend ? store().getSetting('currencySymbol', '$') + NX.fmtNum(daySpend, 2) : '—')));
      if (dayTasks.length) {
        glance.appendChild(h('div.divider', { style: { margin: '10px 0' } }));
        dayTasks.slice(0, 6).forEach(t => glance.appendChild(h('div.small', { style: { padding: '2px 0', textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? .6 : 1 } }, (t.done ? '✓ ' : '○ ') + t.title)));
      }
      main.appendChild(glance);

      wrap.appendChild(main);

      // sidebar
      const side = h('div.col', { style: { gap: 'var(--sp-4)' } });
      // prompt
      const dayIdx = Math.floor(new Date(currentDate).getTime() / 86400000);
      side.appendChild(h('div.card', { style: { background: 'var(--sel)' } }, [
        h('div.small.muted', { style: { fontWeight: '650', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: '6px' } }, 'Prompt of the day'),
        h('p', { style: { fontSize: '13.5px', fontStyle: 'italic', lineHeight: '1.6' } }, PROMPTS[dayIdx % PROMPTS.length]),
        h('button.btn.sm.ghost', { style: { marginTop: '9px' }, onclick: () => { ensure(); const p = getEntry().prompts || {}; p[PROMPTS[dayIdx % PROMPTS.length]] = ''; store().journal.update(getEntry().id, { prompts: p }); ta.value = (ta.value ? ta.value + '\n\n' : '') + '## ' + PROMPTS[dayIdx % PROMPTS.length] + '\n'; ta.focus(); saveText(); } }, 'Answer in entry'),
        h('button.btn.sm.ghost', { style: { marginTop: '5px' }, onclick: () => NX.router.go('journal', { view: 'prompts' }) }, 'More prompts')
      ]));
      // recent entries
      const recent = store().journal.all().filter(j => j.date !== currentDate).slice(0, 7);
      side.appendChild(h('div.card', [
        h('div.card-head', [h('h3', 'Recent entries')]),
        recent.length ? h('div', recent.map(j => h('button.list-row.selectable', { style: { width: '100%', border: '0' }, onclick: () => { currentDate = j.date; NX.router.go('journal', { date: j.date }); } }, [
          h('span', { style: { display: 'flex', color: 'var(--tx-3)' }, html: NX.glyph((MOODS.find(m => m.v === j.mood) || {}).e || 'note', 15) }),
          h('div.lr-main', [h('div.lr-title', { style: { fontSize: '12.5px' } }, NX.fmtDate(j.date, 'medium')),
            h('div.lr-sub', String(j.text || '').slice(0, 62) + (String(j.text || '').length > 62 ? '…' : ''))])
        ]))) : h('p.small.muted', 'This is your first entry.')
      ]));
      // mood sparkline
      const trend = sel().moodTrend(21);
      side.appendChild(h('div.card', [
        h('div.card-head', [h('h3', 'Mood, 21 days')]),
        NX.ui.sparkline(trend.map(m => m.mood), 240, 46),
        h('div.row', { style: { justifyContent: 'space-between', marginTop: '5px' } }, [
          h('span.tiny.muted', '21 days ago'), h('span.tiny.muted', 'today')
        ])
      ]));
      wrap.appendChild(side);
      setTimeout(updateCounts, 30);
      return wrap;

      function updateCounts() {
        const el = document.getElementById('jCount');
        if (!el) return;
        const w = (ta.value || '').trim().split(/\s+/).filter(Boolean).length;
        el.textContent = `${w} word${w === 1 ? '' : 's'} · saved`;
      }
    }

    function getEntry() { return sel().journalFor(currentDate); }
    function ensure() {
      if (getEntry()) return getEntry();
      return store().journal.create({ date: currentDate, mood: 3, text: '', tags: [], gratitude: [], prompts: {}, energy: 3, weather: '' }, true);
    }
    function setField(k, v) { const e = ensure(); store().journal.update(e.id, { [k]: v }, true); store().touch(); }

    /* ---------------- timeline ---------------- */
    function timeline() {
      const entries = store().journal.all().slice().sort((a, b) => b.date.localeCompare(a.date));
      if (!entries.length) return NX.ui.emptyState('journal', 'No entries yet', 'Start with today — even two sentences count.');
      const wrap = h('div');
      let lastMonth = null;
      entries.forEach(j => {
        const m = NX.fmtDate(j.date, 'medium').split(',')[0] + ' ' + new Date(j.date).getFullYear();
        if (m !== lastMonth) { lastMonth = m; wrap.appendChild(h('div.task-group-head', [h('span', m), h('span.tgh-count', String(entries.filter(x => NX.fmtDate(x.date, 'medium').split(',')[0] + ' ' + new Date(x.date).getFullYear() === m).length))])); }
        const moods = MOODS.find(x => x.v === j.mood);
        wrap.appendChild(h('div.journal-entry', { style: { cursor: 'pointer', borderLeftColor: j.mood >= 4 ? 'var(--acc-grn)' : j.mood <= 2 ? 'var(--acc-red)' : 'var(--brand-1)' }, onclick: () => { currentDate = j.date; view = 'day'; persist(); } }, [
          h('div.je-head', [
            h('span', { style: { fontSize: '15px' } }, moods ? moods.e : '📔'),
            h('b', NX.fmtDate(j.date, 'long')),
            j.energy ? h('span', '⚡ ' + j.energy + '/5') : null,
            j.weather ? h('span', j.weather) : null,
            h('div.grow'),
            h('span', `${String(j.text || '').trim().split(/\s+/).filter(Boolean).length} words`),
            NX.diffDays(new Date(), j.date) === 0 ? h('span.chip.chip-grn', 'today') : h('span', NX.relTime(j.date))
          ]),
          h('div.je-text', String(j.text || '').slice(0, 600) + (String(j.text || '').length > 600 ? '…' : '')),
          (j.gratitude || []).length ? h('div.small.muted', { style: { marginTop: '7px' } }, '🙏 ' + j.gratitude.filter(Boolean).join(' · ')) : null,
          (j.tags || []).length ? h('div.row-wrap', { style: { gap: '4px', marginTop: '6px' } }, j.tags.map(t => NX.components.tagChip(t))) : null
        ]));
      });
      return wrap;
    }

    /* ---------------- mood calendar ---------------- */
    function moodCalendar() {
      const wrap = h('div');
      const MCOLOR = { 1: '#eb5757', 2: '#f2994a', 3: '#8b8f98', 4: '#4caf7d', 5: '#33b8a3' };
      for (let m = 0; m < 4; m++) {
        const cur = NX.addMonths(new Date(), -m);
        const first = NX.startOfMonth(cur);
        const start = NX.startOfWeek(first, 1);
        wrap.appendChild(h('div.card', { style: { marginBottom: 'var(--sp-4)' } }, [
          h('div.card-head', [h('h3', NX.MONTHS[cur.getMonth()] + ' ' + cur.getFullYear()), h('div.grow'),
            h('span.small.muted', `${store().journal.all().filter(j => new Date(j.date).getMonth() === cur.getMonth() && new Date(j.date).getFullYear() === cur.getFullYear()).length} entries`)]),
          h('div.cal-head-row', { style: { background: 'transparent', border: '0' } }, ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => h('div.cal-head-cell', d))),
          h('div.cal-grid', (() => {
            const cells = h('div', { style: { display: 'contents' } });
            const out = [];
            for (let i = 0; i < 42; i++) {
              const d = NX.addDays(start, i);
              const j = sel().journalFor(NX.ymd(d));
              out.push(h('div', {
                style: {
                  minHeight: '58px', border: '1px solid var(--bd)', padding: '4px 5px', cursor: 'pointer',
                  background: j && j.mood ? MCOLOR[j.mood] + '26' : (d.getMonth() === cur.getMonth() ? 'transparent' : 'rgba(127,127,127,.05)'),
                  opacity: d.getMonth() === cur.getMonth() ? 1 : .4
                },
                onclick: () => { currentDate = NX.ymd(d); view = 'day'; persist(); }
              }, [
                h('div.row', [h('span.tiny', { style: { fontWeight: '600', color: 'var(--tx-3)' } }, String(d.getDate())), h('div.grow'), j ? h('span', { style: { display: 'flex', color: 'var(--tx-2)' }, html: NX.glyph((MOODS.find(x => x.v === j.mood) || {}).e || 'note', 13) }) : null]),
                j && j.text ? h('div.tiny.muted', { style: { marginTop: '3px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', lineHeight: '1.35' } }, String(j.text).slice(0, 60)) : null
              ]));
            }
            return out;
          })())
        ]));
      }
      wrap.appendChild(h('div.card.pad-sm', { style: { background: 'var(--bg-sunken)' } }, [
        h('div.small.muted', { style: { fontWeight: '600', marginBottom: '7px' } }, 'Mood legend'),
        h('div.row-wrap', MOODS.map(m => h('span.chip', { style: { background: MCOLOR[m.v] + '22', color: MCOLOR[m.v] } }, m.e + ' ' + m.l)))
      ]));
      return wrap;
    }

    /* ---------------- prompts ---------------- */
    function promptView() {
      const wrap = h('div');
      wrap.appendChild(h('div.card.pad-sm', { style: { background: 'var(--sel)', marginBottom: 'var(--sp-4)' } },
        h('div.small', 'Pick a prompt and answer it. Answers are appended to today\'s entry under a heading.')));
      const grid = h('div.grid.grid-auto');
      PROMPTS.forEach(p => {
        const answered = store().journal.all().some(j => (j.prompts || {})[p] !== undefined);
        grid.appendChild(h('button.card.hoverable', { style: { textAlign: 'left', cursor: 'pointer' }, onclick: async () => {
          const ans = await NX.ui.prompt({ title: p, multiline: true, placeholder: 'Write your answer…', okLabel: 'Save answer' });
          if (ans === null) return;
          const e = ensure();
          const prompts = Object.assign({}, e.prompts || {});
          prompts[p] = ans;
          const text = (e.text || '') + `\n\n## ${p}\n${ans}`;
          store().journal.update(e.id, { prompts, text: text.trim() });
          NX.ui.toast({ type: 'success', message: 'Answer saved to today\'s entry' });
          NX.router.render();
        } }, [
          h('div.row', { style: { marginBottom: '7px' } }, [h('span', { html: iconHTML('edit', 14), style: { color: 'var(--brand-1)', display: 'flex' } }), h('div.grow'), answered ? h('span.chip.chip-grn', 'answered') : null]),
          h('p', { style: { fontSize: '13.5px', lineHeight: '1.55' } }, p)
        ]));
      });
      wrap.appendChild(grid);
      return wrap;
    }

    /* ---------------- stats ---------------- */
    function statsView() {
      const entries = store().journal.all();
      if (!entries.length) return NX.ui.emptyState('chart', 'No data yet', 'Write a few entries and patterns will appear here.');
      const wrap = h('div');
      const moods = entries.filter(j => j.mood);
      const avg = moods.length ? (moods.reduce((a, j) => a + j.mood, 0) / moods.length) : 0;
      const words = NX.sum(entries.map(j => String(j.text || '').trim().split(/\s+/).filter(Boolean).length));
      wrap.appendChild(h('div.grid.grid-4', { style: { marginBottom: 'var(--sp-4)' } }, [
        NX.components.statTile('Entries', entries.length, `${streakText()}`, 'journal'),
        NX.components.statTile('Average mood', avg ? avg.toFixed(2) : '—', 'out of 5', 'smile', avg >= 4 ? 'grn' : avg < 3 ? 'red' : ''),
        NX.components.statTile('Words written', NX.compactNum(words), `${Math.round(words / Math.max(1, entries.length))} avg per entry`, 'note', 'blu'),
        NX.components.statTile('Gratitude items', NX.sum(entries.map(j => (j.gratitude || []).filter(Boolean).length)), 'recorded', 'heart' in NX.ICONS ? 'heart' : 'star', 'pur')
      ]));
      // mood distribution
      const dist = MOODS.map(m => ({ label: m.e, name: m.l, value: entries.filter(j => j.mood === m.v).length, color: { 1: '#eb5757', 2: '#f2994a', 3: '#8b8f98', 4: '#4caf7d', 5: '#33b8a3' }[m.v] }));
      wrap.appendChild(h('div.grid.grid-2', { style: { marginBottom: 'var(--sp-4)' } }, [
        h('div.card', [
          h('div.card-head', [h('h3', 'Mood distribution')]),
          h('div.donut-wrap', [
            NX.ui.donut(dist.filter(d => d.value), 150),
            h('div.donut-legend', dist.map(d => h('div.dl-row', [
              h('span.dl-swatch', { style: { background: d.color } }),
              h('span.dl-name', { html: NX.glyph(d.label, 13) + ' ' + NX.esc(d.name) }),
              h('span.dl-val', String(d.value))
            ])))
          ])
        ]),
        h('div.card', [h('div.card-head', [h('h3', 'Mood by day of week'), h('div.grow'), h('span.small.muted', 'all time')]),
          NX.ui.barChart(NX.DAYS_S.map((d, i) => {
            const items = entries.filter(j => new Date(j.date).getDay() === i && j.mood);
            return { label: d, value: items.length ? Math.round(items.reduce((a, j) => a + j.mood, 0) / items.length * 20) : 0 };
          }), { height: '130px', format: v => (v / 20).toFixed(1) + '/5' })])
      ]));
      // 90-day mood line
      const trend = sel().moodTrend(90);
      wrap.appendChild(h('div.card', { style: { marginBottom: 'var(--sp-4)' } }, [
        h('div.card-head', [h('h3', 'Mood over 90 days')]),
        h('div', { style: { overflowX: 'auto' } }, NX.ui.sparkline(trend.map(t => t.mood), 860, 90)),
        h('div.row', { style: { justifyContent: 'space-between', marginTop: '5px' } }, [h('span.tiny.muted', '90 days ago'), h('span.tiny.muted', 'today')])
      ]));
      // word frequency
      const allText = entries.map(j => j.text).join('\n');
      const kw = NX.aiEngine.keywords(allText, 24);
      wrap.appendChild(h('div.card', [
        h('div.card-head', [h('h3', 'What you write about most')]),
        h('div.row-wrap', { style: { gap: '5px' } }, kw.map(k => h('span.chip', { title: k.count + ' occurrences', style: { fontSize: (10 + Math.min(6, k.count / 2)) + 'px' } }, k.word)))
      ]));
      return wrap;
    }

    async function reflect() {
      const entries = store().journal.all().filter(j => NX.diffDays(new Date(), j.date) <= 7 && NX.diffDays(new Date(), j.date) >= 0);
      if (!entries.length) { NX.ui.toast({ type: 'info', message: 'No entries in the last 7 days' }); return; }
      const text = entries.map(j => `${j.date} (mood ${j.mood}/5): ${j.text}`).join('\n\n');
      const t = NX.ui.toast({ type: 'info', message: 'Reflecting…', duration: 0 });
      const r = await NX.ai.features.summarize(text, { bullets: false, sentences: 3 });
      t.close();
      NX.ui.modal({
        title: 'Reflection on the last 7 days', size: 'wide',
        body: h('div', [
          h('div.small.muted', { style: { marginBottom: '10px' } }, `${entries.length} entries · ${r.source === 'api' ? 'generated with ' + NX.ai.providerInfo().name : 'generated offline'}`),
          h('div.md-preview', { html: NX.ai.renderMarkdown(r.text) })
        ]),
        footer: [h('div.grow'), h('button.btn.primary', { onclick: () => { ensure(); const e = getEntry(); store().journal.update(e.id, { text: (e.text || '') + '\n\n## Weekly reflection\n' + r.text }); NX.ui.closeTopModal(); NX.router.render(); NX.ui.toast({ type: 'success', message: 'Appended to today\'s entry' }); } }, 'Append to today')]
      });
    }

    async function reflectEntry(text) {
      if (!String(text || '').trim()) { NX.ui.toast({ type: 'warn', message: 'Nothing written yet' }); return; }
      const s = NX.aiEngine.sentiment(text);
      const kw = NX.aiEngine.keywords(text, 8);
      const t = NX.ui.toast({ type: 'info', message: 'Analysing…', duration: 0 });
      const r = await NX.ai.features.summarize(text, { sentences: 2 });
      t.close();
      NX.ui.modal({
        title: 'Entry analysis', size: 'wide',
        body: h('div', [
          h('div.card.pad-sm', { style: { background: 'var(--bg-sunken)', marginBottom: '12px' } }, [
            NX.ui.kv('Tone', `${s.emoji} ${s.label} (${s.score > 0 ? '+' : ''}${s.score})`),
            NX.ui.kv('Words', String(NX.aiEngine.readability(text).words)),
            NX.ui.kv('Positive / negative terms', `${s.positive} / ${s.negative}`)
          ]),
          h('div.section-head', [h('h2', { style: { fontSize: '13px' } }, 'Summary')]),
          h('div.md-preview', { html: NX.ai.renderMarkdown(r.text) }),
          kw.length ? h('div', { style: { marginTop: '12px' } }, [
            h('div.section-head', [h('h2', { style: { fontSize: '13px' } }, 'Themes')]),
            h('div.row-wrap', { style: { gap: '5px' } }, kw.map(k => h('span.chip', k.word)))
          ]) : null
        ])
      });
    }

    function analyse(text) { reflectEntry(text); }

    function exportJournal() {
      const L = ['# Journal', '', `Exported ${new Date().toLocaleString()}`, ''];
      store().journal.all().slice().sort((a, b) => b.date.localeCompare(a.date)).forEach(j => {
        L.push(`## ${NX.fmtDate(j.date, 'long')}`);
        L.push(`_Mood: ${(MOODS.find(m => m.v === j.mood) || {}).l || '?'} (${j.mood}/5)${j.energy ? ' · Energy: ' + j.energy + '/5' : ''}${j.weather ? ' · ' + j.weather : ''}_`);
        L.push('');
        L.push(j.text || '_No text._');
        if ((j.gratitude || []).filter(Boolean).length) { L.push(''); L.push('**Grateful for:**'); j.gratitude.filter(Boolean).forEach(g => L.push('- ' + g)); }
        L.push('');
      });
      NX.download(`nexadesk-journal-${NX.todayStr()}.md`, L.join('\n'), 'text/markdown');
      NX.ui.toast({ type: 'success', message: 'Journal exported' });
    }

    NX.router.register({
      id: 'journal', name: 'Journal', icon: 'journal', group: 'life', order: 62,
      render,
      sidebarItems: () => [
        { label: 'Today', emoji: '📅', count: sel().journalFor(NX.todayStr()) ? '✓' : null, go: () => { currentDate = NX.todayStr(); view = 'day'; persist(); } },
        { label: 'Timeline', emoji: '📜', count: store().journal.count(), go: () => { view = 'timeline'; persist(); } },
        { label: 'Mood calendar', emoji: '🗓️', count: null, go: () => { view = 'moods'; persist(); } },
        { label: 'Prompts', emoji: '💭', count: null, go: () => { view = 'prompts'; persist(); } },
        { label: 'Statistics', emoji: '📊', count: null, go: () => { view = 'stats'; persist(); } }
      ],
      commands: () => [
        { label: 'Journal: open today', icon: 'journal', run: () => { currentDate = NX.todayStr(); view = 'day'; persist(); } },
        { label: 'Journal: AI reflection on last 7 days', icon: 'sparkle', run: reflect },
        { label: 'Journal: export as Markdown', icon: 'download', run: exportJournal }
      ]
    });
  })();
})(window.NX);
