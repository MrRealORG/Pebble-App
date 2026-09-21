/* ============================================================
   Pebble — mod-pomodoro.js + time tracker (NX.timeTracker)
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, esc, iconHTML } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  /* =====================================================================
     POMODORO
     ===================================================================== */
  (function () {
    let mode = 'focus';                 // focus | short | long
    let remaining = 0;
    let running = false;
    let tickTimer = null;
    let rounds = Number(NX.localStore.get('nexadesk.pomoRounds', 0));
    let linkedTaskId = NX.localStore.get('nexadesk.pomoTask', null);
    let startedAt = null;

    const DUR = () => ({
      focus: Number(store().getSetting('pomodoroFocus', 25)) * 60,
      short: Number(store().getSetting('pomodoroShort', 5)) * 60,
      long: Number(store().getSetting('pomodoroLong', 15)) * 60
    });
    const LABEL = { focus: 'Focus', short: 'Short break', long: 'Long break' };
    const COLOR = { focus: 'var(--brand-1)', short: 'var(--acc-grn)', long: 'var(--acc-blu)' };

    function ensureRemaining() { if (!remaining) remaining = DUR()[mode]; }

    function render() {
      ensureRemaining();
      const page = h('div.page.narrow');
      page.appendChild(NX.components.pageHead({
        icon: 'timer', title: 'Focus timer',
        sub: `${sessionsToday()} pomodoros today · ${NX.fmtDuration(sel().focusMinutesToday())} of deep work · round ${rounds + 1} of ${store().getSetting('pomodoroRounds', 4)}`,
        actions: [
          h('button.btn.sm.subtle', { onclick: () => showSettings() }, 'Timer settings'),
          h('button.btn.sm.ghost', { onclick: () => showHistory() }, 'Session log')
        ]
      }));

      const card = h('div.card', { style: { textAlign: 'center', padding: '30px 24px' } });

      // mode switch
      card.appendChild(h('div.seg', { style: { marginBottom: '22px' } }, ['focus', 'short', 'long'].map(m =>
        h('button' + (mode === m ? '.on' : ''), { onclick: () => { mode = m; remaining = DUR()[m]; running = false; stopTick(); NX.router.render(); } }, LABEL[m]))));

      // ring
      const total = DUR()[mode];
      const pct = total ? (1 - remaining / total) * 100 : 0;
      const size = 268, stroke = 14, r = (size - stroke) / 2, c = 2 * Math.PI * r;
      const ring = h('div.pomo-ring', { html: `<svg width="${size}" height="${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--bg-active)" stroke-width="${stroke}"/>
        <circle id="pomoArc" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${COLOR[mode]}" stroke-width="${stroke}"
          stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"
          style="transition:stroke-dashoffset .35s linear"/>
      </svg>` });
      ring.appendChild(h('div.pomo-center', [
        h('div.pomo-mode', LABEL[mode]),
        h('div.pomo-time', { id: 'pomoTime', dataset: { remaining: String(remaining) }, html: (NX.seg ? NX.seg(NX.fmtClock(remaining), 54) : NX.fmtClock(remaining)) }),
        h('div.tiny.muted', { id: 'pomoEnds' }, running ? 'ends ' + NX.fmtTime(new Date(Date.now() + remaining * 1000)) : 'paused')
      ]));
      card.appendChild(ring);

      // controls
      card.appendChild(h('div.pomo-ctl', [
        h('button.btn.icon.lg', { html: iconHTML('skipB', 18), title: 'Reset', style: { width: '42px', height: '42px' }, onclick: () => { remaining = DUR()[mode]; running = false; stopTick(); NX.router.render(); } }),
        h('button.btn.primary.lg', { id: 'pomoPlay', style: { minWidth: '132px', padding: '12px 26px', fontSize: '15px' }, onclick: toggle }, running ? [h('span', { html: iconHTML('pause', 17), style: { display: 'flex' } }), 'Pause'] : [h('span', { html: iconHTML('play', 17), style: { display: 'flex' } }), 'Start']),
        h('button.btn.icon.lg', { html: iconHTML('skipF', 18), title: 'Skip to next phase', style: { width: '42px', height: '42px' }, onclick: () => { completePhase(true); } }),
        h('button.btn.icon.lg', { html: iconHTML('check', 18), title: 'Complete & log this session', style: { width: '42px', height: '42px' }, onclick: () => { completePhase(false); } })
      ]));

      // round dots
      const dots = h('div.pomo-dots');
      for (let i = 0; i < store().getSetting('pomodoroRounds', 4); i++) dots.appendChild(h('i' + (i < rounds ? '.on' : '')));
      card.appendChild(dots);

      // linked task
      const task = linkedTaskId ? store().tasks.find(linkedTaskId) : null;
      card.appendChild(h('div', { style: { marginTop: '22px', paddingTop: '16px', borderTop: '1px solid var(--bd)' } }, [
        h('div.small.muted', { style: { marginBottom: '7px' } }, 'Working on'),
        task ? h('div.row', { style: { justifyContent: 'center', gap: '8px' } }, [
          h('button.task-check' + (task.done ? '.on' : ''), { onclick: () => { NX.components.toggleTaskDone(task.id); NX.router.render(); } }),
          h('span', { style: { fontSize: '13.5px', fontWeight: '550' } }, task.title),
          h('button.btn.xs.ghost', { onclick: () => { linkedTaskId = null; NX.localStore.remove('nexadesk.pomoTask'); NX.router.render(); } }, 'clear')
        ]) : h('button.btn.sm.subtle', { onclick: pickTask }, 'Link a task to this session')
      ]));

      // stats
      const today = store().pomodoro.all().filter(p => NX.isSameDay(p.startedAt, new Date()) && p.completed && p.mode === 'focus');
      const week = store().pomodoro.all().filter(p => new Date(p.startedAt) > NX.addDays(new Date(), -7) && p.completed && p.mode === 'focus');
      card.appendChild(h('div.pomo-stats', [
        h('div.pomo-stat', [h('b', String(today.length)), h('span', 'today')]),
        h('div.pomo-stat', [h('b', NX.fmtDuration(sel().focusMinutesToday())), h('span', 'focus time')]),
        h('div.pomo-stat', [h('b', String(week.length)), h('span', 'this week')]),
        h('div.pomo-stat', [h('b', store().pomodoro.all().filter(p => p.completed && p.mode === 'focus').length), h('span', 'all time')])
      ]));
      page.appendChild(card);

      // 14-day chart
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const d = NX.addDays(new Date(), -i);
        const mins = NX.sum(store().pomodoro.all().filter(p => p.completed && p.mode === 'focus' && NX.isSameDay(p.startedAt, d)).map(p => p.actualMinutes || p.plannedMinutes || 0));
        days.push({ label: NX.DAYS_S[d.getDay()][0] + (d.getDate() % 7 === 1 ? '\n' + d.getDate() : ''), value: mins });
      }
      page.appendChild(h('div.card', { style: { marginTop: 'var(--sp-4)' } }, [
        h('div.card-head', [h('h3', 'Focus minutes, last 14 days'), h('div.grow'), h('span.small.muted', 'total ' + NX.fmtDuration(NX.sum(days.map(d => d.value))))]),
        NX.ui.barChart(days, { height: '120px', format: v => NX.fmtDuration(v) })
      ]));

      // tips
      page.appendChild(h('div.card.pad-sm', { style: { marginTop: 'var(--sp-4)', background: 'var(--bg-sunken)' } }, [
        h('b.small', 'How to actually make this work'),
        h('ul.small.muted', { style: { paddingLeft: '18px', marginTop: '6px', lineHeight: '1.75' } }, [
          h('li', 'Choose the task BEFORE you start the timer. Switching mid-session defeats the point.'),
          h('li', 'When something interrupts you, write it down and return to it later. Do not context switch.'),
          h('li', 'Take the break. Standing up and looking at something distant is what makes the next block work.'),
          h('li', 'Four rounds then a longer break. If you are still going after that, stop — diminishing returns.'),
          h('li', 'Press Space anywhere on this screen to start or pause.')
        ])
      ]));

      return page;
    }

    function pickTask() {
      const tasks = sel().openTasks();
      const inp = h('input.input', { placeholder: 'Search tasks…' });
      const list = h('div.list', { style: { maxHeight: '320px', overflow: 'auto' } });
      const draw = q => {
        NX.clear(list);
        const items = q ? tasks.filter(t => t.title.toLowerCase().includes(q.toLowerCase())) : tasks;
        items.slice(0, 40).forEach(t => list.appendChild(h('button.list-row.selectable', { style: { width: '100%' }, onclick: () => { linkedTaskId = t.id; NX.localStore.set('nexadesk.pomoTask', t.id); NX.ui.closeTopModal(); NX.router.render(); } }, [
          h('span.ico', t.projectId ? h('span', { style: { color: sel().projectColor(t.projectId) } }, '●') : null),
          h('div.lr-main', [h('div.lr-title', t.title), h('div.lr-sub', [t.status, t.priority, t.due ? NX.dueLabel(t.due) : ''].filter(Boolean).join(' · '))])
        ])));
        if (!items.length) list.appendChild(h('p.small.muted', { style: { padding: '12px' } }, 'No open tasks.'));
      };
      inp.addEventListener('input', NX.debounce(() => draw(inp.value), 140));
      NX.ui.modal({ title: 'Link a task', body: h('div', [inp, h('div', { style: { height: '10px' } }), list]), hideFooter: true });
      draw('');
    }

    function toggle() {
      if (running) { running = false; stopTick(); }
      else { running = true; if (!startedAt) startedAt = new Date().toISOString(); startTick(); }
      NX.router.render();
    }

    function startTick() {
      stopTick();
      tickTimer = setInterval(() => {
        remaining--;
        const t = document.getElementById('pomoTime');
        const arc = document.getElementById('pomoArc');
        const ends = document.getElementById('pomoEnds');
        if (t) { t.innerHTML = (NX.seg ? NX.seg(NX.fmtClock(remaining), 54) : NX.fmtClock(remaining)); t.dataset.remaining = String(remaining); }
        if (ends) ends.textContent = 'ends ' + NX.fmtTime(new Date(Date.now() + remaining * 1000));
        if (arc) {
          const total = DUR()[mode], c = 2 * Math.PI * ((268 - 14) / 2);
          arc.setAttribute('stroke-dashoffset', String(c * (remaining / total)));
        }
        document.title = `${NX.fmtClock(remaining)} · ${LABEL[mode]} — Pebble`;
        if (remaining <= 0) completePhase(false);
      }, 1000);
    }
    function stopTick() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } document.title = (store().getSetting('workspaceName', 'My Workspace')) + ' — Pebble'; }

    function completePhase(skipped) {
      stopTick();
      const total = DUR()[mode];
      const actual = skipped ? Math.max(0, total - remaining) : total;
      const rec = {
        mode, plannedMinutes: Math.round(total / 60), actualMinutes: Math.round(actual / 60),
        startedAt: startedAt || new Date(Date.now() - actual * 1000).toISOString(),
        endedAt: new Date().toISOString(),
        taskId: mode === 'focus' ? linkedTaskId : null,
        note: skipped ? 'skipped early' : '', completed: !skipped || actual >= 60
      };
      store().pomodoro.create(rec, true);
      if (mode === 'focus' && linkedTaskId && rec.completed) {
        const t = store().tasks.find(linkedTaskId);
        if (t) store().tasks.update(linkedTaskId, { actual: (t.actual || 0) + rec.actualMinutes }, true);
      }
      store().touch(); store().emit('pomodoro');

      if (mode === 'focus' && rec.completed) {
        rounds++;
        NX.localStore.set('nexadesk.pomoRounds', rounds);
        chime();
        NX.shell.notify('🍅 Focus session complete', `${rec.actualMinutes} minutes${linkedTaskId ? ' on “' + (store().tasks.find(linkedTaskId) || {}).title + '”' : ''}. Time for a break.`);
        const longDue = rounds % Number(store().getSetting('pomodoroRounds', 4)) === 0;
        mode = longDue ? 'long' : 'short';
        NX.ui.toast({ type: 'success', title: `Session ${rounds} complete`, message: longDue ? 'Take a long break — you earned it.' : 'Take a short break.', duration: 6000,
          actions: [{ label: 'Skip break', onClick: () => { mode = 'focus'; remaining = DUR().focus; rounds = rounds; NX.router.render(); } }] });
      } else {
        chime();
        mode = 'focus';
        if (!rec.completed) NX.ui.toast({ type: 'info', message: 'Session ended early — logged as partial', duration: 3200 });
      }
      remaining = DUR()[mode];
      running = false; startedAt = null;
      if (store().getSetting('pomodoroAutoStart', false) && mode !== 'focus') { running = true; }
      NX.router.render();
      if (running) startTick();
    }

    function chime() {
      if (!store().getSetting('pomodoroSound', true)) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        [880, 1174.66, 1567.98].forEach((f, i) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0, ctx.currentTime + i * 0.16);
          g.gain.linearRampToValueAtTime(0.16, ctx.currentTime + i * 0.16 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.16 + 0.42);
          o.connect(g); g.connect(ctx.destination);
          o.start(ctx.currentTime + i * 0.16); o.stop(ctx.currentTime + i * 0.16 + 0.45);
        });
        setTimeout(() => ctx.close(), 1400);
      } catch (e) {}
    }

    function sessionsToday() {
      return store().pomodoro.all().filter(p => p.completed && p.mode === 'focus' && NX.isSameDay(p.startedAt, new Date())).length;
    }

    function showSettings() {
      NX.ui.form({
        title: 'Timer settings', okLabel: 'Save',
        fields: [
          { key: 'pomodoroFocus', label: 'Focus length (min)', type: 'number', value: store().getSetting('pomodoroFocus', 25), min: 1, max: 180 },
          { key: 'pomodoroShort', label: 'Short break (min)', type: 'number', value: store().getSetting('pomodoroShort', 5), min: 1, max: 60 },
          { key: 'pomodoroLong', label: 'Long break (min)', type: 'number', value: store().getSetting('pomodoroLong', 15), min: 1, max: 90 },
          { key: 'pomodoroRounds', label: 'Rounds before a long break', type: 'number', value: store().getSetting('pomodoroRounds', 4), min: 2, max: 12 },
          { key: 'pomodoroSound', label: 'Play a chime', type: 'checkbox', value: store().getSetting('pomodoroSound', true) },
          { key: 'pomodoroAutoStart', label: 'Auto-start breaks', type: 'checkbox', value: store().getSetting('pomodoroAutoStart', false) }
        ]
      }).then(r => {
        if (!r) return;
        store().setSettings(r);
        remaining = DUR()[mode];
        NX.ui.toast({ type: 'success', message: 'Timer settings saved' });
        NX.router.render();
      });
    }

    function showHistory() {
      const all = store().pomodoro.all().slice().sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
      const body = h('div', { style: { maxHeight: '56vh', overflow: 'auto' } });
      if (!all.length) body.appendChild(h('p.small.muted', 'No sessions logged yet.'));
      let lastDay = null;
      all.slice(0, 200).forEach(p => {
        const dk = NX.ymd(p.startedAt);
        if (dk !== lastDay) {
          lastDay = dk;
          const dayItems = all.filter(x => NX.ymd(x.startedAt) === dk);
          body.appendChild(h('div.task-group-head', { style: { position: 'static', background: 'transparent' } }, [
            h('span', NX.isToday(dk) ? 'TODAY' : NX.fmtDate(dk, 'long')),
            h('span.tgh-count', NX.fmtDuration(NX.sum(dayItems.filter(x => x.mode === 'focus' && x.completed).map(x => x.actualMinutes || 0))))
          ]));
        }
        const t = p.taskId ? store().tasks.find(p.taskId) : null;
        body.appendChild(h('div.list-row', [
          h('span', { style: { fontSize: '14px' } }, p.mode === 'focus' ? '🍅' : p.mode === 'long' ? '☕' : '🌿'),
          h('div.lr-main', [
            h('div.lr-title', { style: { fontSize: '12.8px' } }, `${LABEL[p.mode] || p.mode} · ${p.actualMinutes || 0} min${p.completed ? '' : ' (incomplete)'}`),
            h('div.lr-sub', `${NX.fmtTime(p.startedAt)} – ${NX.fmtTime(p.endedAt)}${t ? ' · ' + t.title : ''}${p.note ? ' · ' + p.note : ''}`)
          ]),
          h('button.icon-btn', { html: iconHTML('trash', 13), onclick: () => { store().pomodoro.remove(p.id); NX.ui.closeTopModal(); showHistory(); } })
        ]));
      });
      NX.ui.modal({ title: 'Session log', size: 'wide', hideFooter: true, body });
    }

    function onMount() {
      const keyHandler = e => {
        if (NX.router.currentId() !== 'pomodoro') return;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
        if (e.code === 'Space') { e.preventDefault(); toggle(); }
        else if (e.key === 'r' || e.key === 'R') { remaining = DUR()[mode]; running = false; stopTick(); NX.router.render(); }
        else if (e.key === 's' || e.key === 'S') completePhase(true);
      };
      document.addEventListener('keydown', keyHandler);
      return () => { document.removeEventListener('keydown', keyHandler); stopTick(); };
    }

    NX.router.register({
      id: 'pomodoro', name: 'Focus', icon: 'timer', group: 'track', order: 34,
      render, onMount,
      commands: () => [
        { label: 'Focus: start a session', icon: 'play', run: () => { if (!running) { running = true; startedAt = new Date().toISOString(); startTick(); NX.router.render(); } } },
        { label: 'Focus: pause', icon: 'pause', run: () => { running = false; stopTick(); NX.router.render(); } },
        { label: 'Focus: link a task', icon: 'link', run: pickTask },
        { label: 'Focus: session log', icon: 'history', run: showHistory }
      ]
    });
  })();

  /* =====================================================================
     TIME TRACKER
     ===================================================================== */
  const timer = {
    running: false, startedAt: null, taskId: null, description: '', interval: null, projectId: null
  };
  // restore an in-flight timer across reloads
  (function restore() {
    const saved = NX.localStore.get('nexadesk.timer', null);
    if (saved && saved.running) { Object.assign(timer, saved); }
  })();

  function saveTimerState() { NX.localStore.set('nexadesk.timer', { running: timer.running, startedAt: timer.startedAt, taskId: timer.taskId, description: timer.description, projectId: timer.projectId }); }

  NX.timeTracker = {
    start(taskId) {
      const t = taskId ? store().tasks.find(taskId) : null;
      timer.running = true;
      timer.startedAt = new Date().toISOString();
      timer.taskId = taskId || null;
      timer.description = t ? t.title : '';
      timer.projectId = t ? t.projectId : null;
      saveTimerState();
      tick();
      NX.router.go('time', { tab: 'tracker' });
      NX.ui.toast({ type: 'success', title: 'Timer started', message: t ? t.title : 'Manual time entry' });
    },
    stop() {
      if (!timer.running) return null;
      const minutes = Math.max(1, Math.round((Date.now() - new Date(timer.startedAt).getTime()) / 60000));
      const log = store().timeLogs.create({
        taskId: timer.taskId, projectId: timer.projectId, description: timer.description || 'Untitled work',
        start: timer.startedAt, minutes, billable: true
      }, true);
      if (timer.taskId) {
        const t = store().tasks.find(timer.taskId);
        if (t) store().tasks.update(timer.taskId, { actual: (t.actual || 0) + minutes }, true);
      }
      store().touch(); store().emit('timeLogs');
      timer.running = false; timer.startedAt = null; timer.taskId = null; timer.description = ''; timer.projectId = null;
      saveTimerState();
      NX.ui.toast({ type: 'success', title: `Logged ${NX.fmtDuration(minutes)}`, message: log.description, duration: 4200,
        actions: [{ label: 'Undo', onClick: () => { store().timeLogs.remove(log.id); NX.router.render(); } }] });
      NX.router.render();
      return log;
    },
    get state() { return timer; },
    elapsedSeconds() { return timer.running ? Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000) : 0; }
  };

  function tick() {
    if (timer.interval) clearInterval(timer.interval);
    timer.interval = setInterval(() => {
      const el = document.getElementById('ttClock');
      if (el && timer.running) {
        el.textContent = NX.fmtClock(NX.timeTracker.elapsedSeconds());
        const st = document.getElementById('ttStatus');
        if (st) st.textContent = timer.description || 'Manual entry';
      }
      if (!timer.running) { clearInterval(timer.interval); timer.interval = null; }
    }, 1000);
  }

  (function () {
    let tab = 'tracker';

    function render(params) {
      if (params && params.tab) tab = params.tab;
      const page = h('div.page');
      page.appendChild(NX.components.pageHead({
        icon: 'clock', title: 'Time',
        sub: `${store().timeLogs.count()} logs · ${NX.fmtDuration(NX.sum(store().timeLogs.all().map(l => l.minutes || 0)))} tracked all time`,
        actions: [
          timer.running ? h('button.btn.sm.danger', { html: iconHTML('stop', 13) + ' Stop timer', onclick: () => NX.timeTracker.stop() }) : h('button.btn.sm.primary', { html: iconHTML('play', 13) + ' Start timer', onclick: startManual }),
          h('button.btn.sm.subtle', { html: iconHTML('plus', 13) + ' Log time', onclick: () => manualEntry() }),
          h('button.btn.sm.ghost', { onclick: exportCSV }, 'Export CSV')
        ]
      }));

      // running banner
      if (timer.running) {
        const secs = NX.timeTracker.elapsedSeconds();
        page.appendChild(h('div.card', { style: { background: 'var(--sel)', borderColor: 'var(--brand-1)', marginBottom: 'var(--sp-4)' } }, [
          h('div.row', { style: { gap: '16px' } }, [
            h('div', [
              h('div.tiny.muted', { style: { textTransform: 'uppercase', letterSpacing: '.6px', fontWeight: '650' } }, 'Tracking'),
              h('div', { id: 'ttClock', style: { fontSize: '34px', fontWeight: '700', letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums', color: 'var(--brand-1)' } }, NX.fmtClock(secs))
            ]),
            h('div.grow', [
              h('div', { id: 'ttStatus', style: { fontSize: '14px', fontWeight: '600' } }, timer.description || 'Manual entry'),
              h('div.small.muted', 'Started ' + NX.fmtTime(timer.startedAt) + (timer.taskId ? ' · linked to a task' : ''))
            ]),
            h('button.btn.sm.ghost', { onclick: () => { const d = prompt2(); if (d !== null) { timer.description = d; saveTimerState(); NX.router.render(); } } }, 'Rename'),
            h('button.btn.sm.danger', { onclick: () => NX.timeTracker.stop() }, 'Stop & save')
          ])
        ]));
        tick();
      }

      page.appendChild(h('div.tabs', ['tracker', 'logs', 'reports'].map(t =>
        h('button' + (tab === t ? '.on' : ''), { onclick: () => { tab = t; NX.router.render(); } }, t[0].toUpperCase() + t.slice(1)))));

      if (tab === 'tracker') page.appendChild(trackerTab());
      else if (tab === 'logs') page.appendChild(logsTab());
      else page.appendChild(reportsTab());
      return page;
    }

    function prompt2() {
      const v = window.prompt('What are you working on?', timer.description || '');
      return v === null ? null : v;
    }

    function startManual() {
      const inp = h('input.input', { placeholder: 'What are you working on?', value: timer.description || '' });
      NX.ui.modal({
        title: 'Start the timer', size: 'narrow',
        body: h('div', [
          h('div.field', [h('label', 'Description'), inp]),
          h('div.divider'),
          h('div.field', [h('label', 'Or link an open task'),
            h('select.select', { id: 'ttTask' }, [h('option', { value: '' }, '— manual entry —')].concat(
              sel().openTasks().slice(0, 60).map(t => h('option', { value: t.id }, t.title))))])
        ]),
        footer: [h('div.grow'), h('button.btn.primary', { onclick: () => {
          const tid = document.getElementById('ttTask').value;
          if (tid) { NX.ui.closeTopModal(); NX.timeTracker.start(tid); }
          else { const d = inp.value.trim() || 'Untitled work'; NX.ui.closeTopModal(); NX.timeTracker.start(null); timer.description = d; saveTimerState(); NX.router.render(); }
        } }, 'Start')],
        onMount: () => setTimeout(() => inp.focus(), 40)
      });
    }

    function trackerTab() {
      const wrap = h('div');
      // running tasks first
      const open = sel().openTasks().slice(0, 24);
      wrap.appendChild(h('div.section-head', [h('h2', 'Start tracking a task'), h('span.sh-sub', `${sel().openTasks().length} open`)]));
      if (!open.length) wrap.appendChild(h('p.small.muted', 'No open tasks. Create one, or use the manual timer above.'));
      const grid = h('div.grid.grid-auto');
      open.forEach(t => {
        const logged = NX.sum(store().timeLogs.all().filter(l => l.taskId === t.id).map(l => l.minutes || 0));
        grid.appendChild(h('div.card.hoverable.pad-sm', [
          h('div.row', { style: { alignItems: 'flex-start', gap: '8px' } }, [
            h('button.task-check' + (t.done ? '.on' : ''), { onclick: () => { NX.components.toggleTaskDone(t.id); NX.router.render(); } }),
            h('div.grow', [
              h('div', { style: { fontSize: '13px', fontWeight: '550', lineHeight: '1.4' } }, t.title),
              h('div.small.muted', [t.projectId ? sel().projectName(t.projectId) : null, t.estimate ? 'est ' + NX.fmtDuration(t.estimate) : null, logged ? 'logged ' + NX.fmtDuration(logged) : null].filter(Boolean).join(' · '))
            ]),
            h('button.btn.sm' + (timer.running && timer.taskId === t.id ? '.danger' : '.primary'), {
              html: timer.running && timer.taskId === t.id ? iconHTML('stop', 12) + ' Stop' : iconHTML('play', 12),
              onclick: () => { if (timer.running) NX.timeTracker.stop(); NX.timeTracker.start(t.id); }
            })
          ]),
          t.estimate ? h('div.progress.thin', { style: { marginTop: '9px' } }, h('i', {
            style: { width: Math.min(100, logged / t.estimate * 100) + '%', background: logged > t.estimate ? 'var(--acc-red)' : 'var(--brand-1)' } })) : null
        ]));
      });
      wrap.appendChild(grid);
      return wrap;
    }

    function logsTab() {
      const logs = store().timeLogs.all().slice().sort((a, b) => new Date(b.start) - new Date(a.start));
      if (!logs.length) return NX.ui.emptyState('clock', 'No time logged yet', 'Start the timer, or add a manual entry for work you already did.', 'Log time manually', () => manualEntry());
      const wrap = h('div.db-wrap');
      const table = h('table.db');
      table.appendChild(h('thead', h('tr', ['Description', 'Task', 'Project', 'When', 'Duration', 'Billable', ''].map(x => h('th', x)))));
      const tbody = h('tbody');
      let lastDay = null;
      logs.forEach(l => {
        const dk = NX.ymd(l.start);
        if (dk !== lastDay) {
          lastDay = dk;
          const dayLogs = logs.filter(x => NX.ymd(x.start) === dk);
          tbody.appendChild(h('tr', h('td', { colspan: '7', style: { background: 'var(--bg-sunken)', fontWeight: '650', fontSize: '11.5px' } },
            `${NX.isToday(dk) ? 'Today' : NX.fmtDate(dk, 'long')} — ${NX.fmtDuration(NX.sum(dayLogs.map(x => x.minutes || 0)))}`)));
        }
        const t = l.taskId ? store().tasks.find(l.taskId) : null;
        const tr = h('tr');
        tr.appendChild(h('td', h('b', { style: { fontWeight: '520' } }, l.description || '—')));
        tr.appendChild(h('td', t ? h('span.small.muted', t.title) : h('span.muted', '—')));
        tr.appendChild(h('td', l.projectId ? h('span.chip', { style: { background: sel().projectColor(l.projectId) + '22', color: sel().projectColor(l.projectId) } }, sel().projectName(l.projectId)) : h('span.muted', '—')));
        tr.appendChild(h('td.c-date', NX.fmtTime(l.start)));
        tr.appendChild(h('td.c-num', h('b', NX.fmtDuration(l.minutes || 0))));
        tr.appendChild(h('td', h('label.checkbox', h('input', { type: 'checkbox', checked: !!l.billable, onchange: e => store().timeLogs.update(l.id, { billable: e.target.checked }) }))));
        tr.appendChild(h('td', h('div.row', { style: { gap: '2px' } }, [
          h('button.icon-btn', { html: iconHTML('edit', 13), onclick: () => editLog(l.id) }),
          h('button.icon-btn', { html: iconHTML('copy', 13), title: 'Restart this timer', onclick: () => { NX.timeTracker.start(l.taskId); if (!l.taskId) { timer.description = l.description; saveTimerState(); } } }),
          h('button.icon-btn', { html: iconHTML('trash', 13), onclick: async () => { if (await NX.ui.confirmDelete('this time log')) { store().timeLogs.remove(l.id); NX.router.render(); } } })
        ])));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(h('div.db-scroll', table));
      return wrap;
    }

    function reportsTab() {
      const logs = store().timeLogs.all();
      if (!logs.length) return NX.ui.emptyState('chart', 'No data to report on', 'Log some time first.');
      const wrap = h('div');
      // last 14 days
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const d = NX.addDays(new Date(), -i);
        days.push({ label: NX.DAYS_S[d.getDay()][0], value: NX.sum(logs.filter(l => NX.isSameDay(l.start, d)).map(l => l.minutes || 0)) });
      }
      wrap.appendChild(h('div.card', { style: { marginBottom: 'var(--sp-4)' } }, [
        h('div.card-head', [h('h3', 'Minutes per day — last 14 days'), h('div.grow'),
          h('span.small.muted', `avg ${NX.fmtDuration(Math.round(NX.sum(days.map(d => d.value)) / 14))}/day`)]),
        NX.ui.barChart(days, { height: '140px', format: v => NX.fmtDuration(v) })
      ]));
      // by project
      const projects = store().projects.all();
      const since30 = NX.addDays(new Date(), -30);
      const byProject = projects.map(p => ({ label: p.name, value: NX.sum(logs.filter(l => l.projectId === p.id && new Date(l.start) >= since30).map(l => l.minutes || 0)), color: p.color }))
        .concat([{ label: 'No project', value: NX.sum(logs.filter(l => !l.projectId && new Date(l.start) >= since30).map(l => l.minutes || 0)), color: '#8b8f98' }])
        .filter(x => x.value > 0);
      wrap.appendChild(h('div.grid.grid-2', { style: { marginBottom: 'var(--sp-4)' } }, [
        h('div.card', [h('div.card-head', [h('h3', 'By project — last 30 days')]),
          byProject.length ? h('div.donut-wrap', [NX.ui.donut(byProject, 150),
            h('div.donut-legend', byProject.map(p => h('div.dl-row', [
              h('span.dl-swatch', { style: { background: p.color } }), h('span.dl-name', p.label),
              h('span.dl-val', NX.fmtDuration(p.value))])))]) : h('p.small.muted', 'No time logged in the last 30 days.')]),
        h('div.card', [h('div.card-head', [h('h3', 'Billable vs internal')]),
          (() => {
            const b = NX.sum(logs.filter(l => l.billable).map(l => l.minutes || 0));
            const nb = NX.sum(logs.filter(l => !l.billable).map(l => l.minutes || 0));
            return h('div.donut-wrap', [NX.ui.donut([{ label: 'Billable', value: b, color: '#4caf7d' }, { label: 'Internal', value: nb, color: '#8b8f98' }], 150),
              h('div.donut-legend', [
                h('div.dl-row', [h('span.dl-swatch', { style: { background: '#4caf7d' } }), h('span.dl-name', 'Billable'), h('span.dl-val', NX.fmtDuration(b))]),
                h('div.dl-row', [h('span.dl-swatch', { style: { background: '#8b8f98' } }), h('span.dl-name', 'Internal'), h('span.dl-val', NX.fmtDuration(nb))])
              ])]);
          })()])
      ]));
      // by task
      const byTask = new Map();
      logs.forEach(l => { const k = l.taskId || l.description || 'Untitled'; byTask.set(k, (byTask.get(k) || 0) + (l.minutes || 0)); });
      const top = Array.from(byTask.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
      wrap.appendChild(h('div.card', [
        h('div.card-head', [h('h3', 'Top time sinks')]),
        h('div', top.map(([k, v]) => {
          const t = store().tasks.find(k);
          const max = top[0][1];
          return h('div', { style: { marginBottom: '8px' } }, [
            h('div.row', { style: { justifyContent: 'space-between', marginBottom: '3px' } }, [
              h('span.small.nowrap', { style: { maxWidth: '70%' } }, t ? t.title : k),
              h('b.small', NX.fmtDuration(v))
            ]),
            h('div.progress.thin', h('i', { style: { width: (v / max * 100) + '%' } }))
          ]);
        }))
      ]));
      return wrap;
    }

    async function manualEntry() {
      const r = await NX.ui.form({
        title: 'Log time manually', wide: true, okLabel: 'Save entry',
        fields: [
          { key: 'description', label: 'What did you work on?', type: 'text', required: true, full: true },
          { key: 'taskId', label: 'Link to task', type: 'select', options: [{ value: '', label: '— none —' }].concat(sel().openTasks().concat(sel().doneTasks()).slice(0, 80).map(t => ({ value: t.id, label: t.title }))) },
          { key: 'projectId', label: 'Project', type: 'select', options: [{ value: '', label: '— none —' }].concat(store().projects.all().filter(p => !p.archived).map(p => ({ value: p.id, label: p.name }))) },
          { key: 'date', label: 'Date', type: 'date', value: NX.todayStr() },
          { key: 'time', label: 'Start time', type: 'time', value: '09:00' },
          { key: 'minutes', label: 'Duration (minutes)', type: 'number', value: 30, min: 1, required: true },
          { key: 'billable', label: 'Billable', type: 'checkbox', value: true }
        ]
      });
      if (!r) return;
      const start = new Date(r.date + 'T' + (r.time || '09:00'));
      const task = r.taskId ? store().tasks.find(r.taskId) : null;
      store().timeLogs.create({
        description: r.description, taskId: r.taskId || null, projectId: r.projectId || (task ? task.projectId : null),
        start: start.toISOString(), minutes: Number(r.minutes) || 0, billable: !!r.billable
      });
      if (task) store().tasks.update(task.id, { actual: (task.actual || 0) + (Number(r.minutes) || 0) }, true);
      NX.ui.toast({ type: 'success', title: `${NX.fmtDuration(Number(r.minutes))} logged`, message: r.description });
      NX.router.render();
    }

    async function editLog(id) {
      const l = store().timeLogs.find(id);
      const r = await NX.ui.form({
        title: 'Edit time log', okLabel: 'Save',
        fields: [
          { key: 'description', label: 'Description', type: 'text', value: l.description, required: true, full: true },
          { key: 'minutes', label: 'Duration (minutes)', type: 'number', value: l.minutes, min: 1 },
          { key: 'billable', label: 'Billable', type: 'checkbox', value: !!l.billable },
          { key: 'projectId', label: 'Project', type: 'select', value: l.projectId || '', options: [{ value: '', label: '— none —' }].concat(store().projects.all().map(p => ({ value: p.id, label: p.name }))) }
        ]
      });
      if (!r) return;
      store().timeLogs.update(id, { description: r.description, minutes: Number(r.minutes), billable: !!r.billable, projectId: r.projectId || null });
      NX.router.render();
    }

    function exportCSV() {
      const logs = store().timeLogs.all().slice().sort((a, b) => new Date(b.start) - new Date(a.start));
      const head = ['Date', 'Start', 'Description', 'Task', 'Project', 'Minutes', 'Billable'];
      const rows = logs.map(l => [NX.ymd(l.start), NX.fmtTime(l.start), l.description, l.taskId ? (store().tasks.find(l.taskId) || {}).title || '' : '', l.projectId ? sel().projectName(l.projectId) : '', l.minutes, l.billable ? 'yes' : 'no']);
      NX.download(`nexadesk-time-${NX.todayStr()}.csv`, NX.md.toCSV([head].concat(rows)), 'text/csv');
      NX.ui.toast({ type: 'success', message: `${rows.length} logs exported` });
    }

    document.addEventListener('nx:starttimer', () => startManual());

    NX.router.register({
      id: 'time', name: 'Time', icon: 'clock', group: 'track', order: 35,
      render,
      badge: () => timer.running ? 1 : 0,
      commands: () => [
        { label: 'Time: start the timer', icon: 'play', run: startManual },
        { label: 'Time: stop the timer', icon: 'stop', run: () => NX.timeTracker.stop() },
        { label: 'Time: log time manually', icon: 'plus', run: manualEntry },
        { label: 'Time: export CSV', icon: 'download', run: exportCSV }
      ]
    });
  })();
})(window.NX);
