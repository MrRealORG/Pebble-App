/* ============================================================
   Pebble — mod-calendar.js : month / week / day / agenda
   with drag-to-create, recurring events and free-time finder
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, esc, iconHTML } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  let cursor = NX.startOfDay(new Date());
  let mode = NX.localStore.get('nexadesk.calMode', 'month');
  const HOUR_H = 46;

  const CAL_COLORS = { Personal: '#7c6cff', Work: '#4aa8e8', Health: '#eb5757', Focus: '#33b8a3', Social: '#e86cb0', Finance: '#4caf7d' };

  function render(params) {
    if (params && params.date) cursor = NX.startOfDay(params.date);
    const page = h('div.page.wide');
    page.appendChild(head());
    const body = h('div', { id: 'calBody' });
    page.appendChild(body);
    paint(body);
    if (params && params.focus) setTimeout(() => { const e = store().events.find(params.focus); if (e) NX.components.openEvent(e.id); }, 120);
    return page;
  }

  function paint(body) {
    NX.clear(body);
    if (mode === 'month') body.appendChild(monthGrid());
    else if (mode === 'week') body.appendChild(timeGrid(7));
    else if (mode === 'day') body.appendChild(timeGrid(1));
    else if (mode === 'agenda') body.appendChild(agenda());
    else if (mode === 'freebusy') body.appendChild(freeBusy());
  }

  function head() {
    const label = {
      month: NX.MONTHS[cursor.getMonth()] + ' ' + cursor.getFullYear(),
      week: (() => { const s = NX.startOfWeek(cursor, ws()); const e = NX.addDays(s, 6); return `${NX.fmtDate(s, 'monthDay')} – ${NX.fmtDate(e, 'monthDay')} ${e.getFullYear()}`; })(),
      day: NX.fmtDate(cursor, 'long'),
      agenda: 'Next 30 days',
      freebusy: 'Free time finder — next 14 days'
    }[mode];
    return h('div', [
      NX.components.pageHead({
        icon: 'calendar', title: 'Calendar', sub: `${store().events.count()} events · ${sel().upcomingEvents(999).length} upcoming`,
        actions: [
          h('button.btn.sm.primary', { html: iconHTML('plus', 13) + ' New event', onclick: () => NX.actions.newEvent().then(() => paint(document.getElementById('calBody'))) }),
          h('button.btn.sm.subtle', { html: iconHTML('clock', 13) + ' Find free time', onclick: () => { mode = 'freebusy'; NX.localStore.set('nexadesk.calMode', mode); NX.router.render(); } }),
          h('button.btn.sm.ghost', { onclick: e => NX.ui.dropdown(e.currentTarget, [
            { icon: 'task', label: 'Import tasks as events', onClick: importTasks },
            { icon: 'download', label: 'Export .ics calendar', onClick: exportICS },
            { icon: 'upload', label: 'Import .ics file…', onClick: importICS },
            '-',
            { icon: 'settings', label: 'Week starts on ' + (ws() === 0 ? 'Sunday' : 'Monday'), onClick: () => { store().setSetting('weekStartsOn', ws() === 0 ? 1 : 0); NX.router.render(); } }
          ], { right: true }) }, 'More')
        ]
      }),
      h('div.toolbar', [
        h('button.btn.sm.ghost', { html: iconHTML('chevL', 15), title: 'Previous', onclick: () => { step(-1); } }),
        h('button.btn.sm.ghost', { title: 'Next', html: iconHTML('chevR', 15), onclick: () => { step(1); } }),
        h('button.btn.sm.ghost', { onclick: () => { cursor = NX.startOfDay(new Date()); paint(document.getElementById('calBody')); updateLabel(); } }, 'Today'),
        h('b#calLabel', { style: { fontSize: '14px', marginLeft: '6px' } }, label),
        h('div.grow'),
        h('div.seg', ['month', 'week', 'day', 'agenda'].map(m =>
          h('button' + (mode === m ? '.on' : ''), { onclick: () => { mode = m; NX.localStore.set('nexadesk.calMode', m); NX.router.render(); } }, m[0].toUpperCase() + m.slice(1)))),
        h('div.tb-sep'),
        h('span.small.muted', 'Drag on the week/day grid to create an event')
      ]),
      calendarLegend()
    ]);
  }
  function updateLabel() { const el = document.getElementById('calLabel'); if (el) { NX.router.render(); } }
  function ws() { return store().getSetting('weekStartsOn', 1); }
  function step(dir) {
    if (mode === 'month') cursor = NX.addMonths(cursor, dir);
    else if (mode === 'week') cursor = NX.addDays(cursor, dir * 7);
    else if (mode === 'agenda') cursor = NX.addDays(cursor, dir * 30);
    else cursor = NX.addDays(cursor, dir);
    NX.router.render();
  }

  function calendarLegend() {
    const cals = NX.unique(store().events.all().map(e => e.calendar).filter(Boolean));
    const hidden = new Set(NX.localStore.get('nexadesk.calHidden', []));
    return h('div.row-wrap', { style: { gap: '6px', marginBottom: '12px' } }, cals.map(c => {
      const on = !hidden.has(c);
      return h('button.chip.clickable' + (on ? '.on' : ''), {
        style: on ? { background: (CAL_COLORS[c] || '#7c6cff') + '22', color: CAL_COLORS[c] || 'var(--brand-1)', borderColor: (CAL_COLORS[c] || '#7c6cff') + '44' } : { opacity: .5 },
        onclick: () => { on ? hidden.add(c) : hidden.delete(c); NX.localStore.set('nexadesk.calHidden', Array.from(hidden)); NX.router.render(); }
      }, [h('span', { style: { width: '7px', height: '7px', borderRadius: '99px', background: CAL_COLORS[c] || '#7c6cff', display: 'inline-block' } }), c]);
    }));
  }
  function visibleEvents() {
    const hidden = new Set(NX.localStore.get('nexadesk.calHidden', []));
    return store().events.all().filter(e => !hidden.has(e.calendar));
  }

  /* ---------------- expand recurring events into a date range ---------------- */
  function expand(from, to) {
    const out = [];
    visibleEvents().forEach(e => {
      const s = new Date(e.start), en = new Date(e.end || e.start);
      const dur = en - s;
      if (!e.repeat) { if (en >= from && s <= to) out.push({ e, start: s, end: new Date(s.getTime() + dur) }); return; }
      let cur = new Date(s);
      let guard = 0;
      while (cur <= to && guard++ < 400) {
        const ce = new Date(cur.getTime() + dur);
        if (ce >= from) out.push({ e, start: new Date(cur), end: ce });
        if (e.repeat === 'daily') cur = NX.addDays(cur, 1);
        else if (e.repeat === 'weekly') cur = NX.addDays(cur, 7);
        else if (e.repeat === 'biweekly') cur = NX.addDays(cur, 14);
        else if (e.repeat === 'monthly') cur = NX.addMonths(cur, 1);
        else if (e.repeat === 'yearly') cur = NX.addMonths(cur, 12);
        else if (e.repeat === 'weekdays') { do { cur = NX.addDays(cur, 1); } while (cur.getDay() === 0 || cur.getDay() === 6); }
        else break;
      }
    });
    return out;
  }

  /* =====================================================================
     MONTH
     ===================================================================== */
  function monthGrid() {
    const first = NX.startOfMonth(cursor);
    const start = NX.startOfWeek(first, ws());
    const names = []; for (let i = 0; i < 7; i++) names.push(NX.DAYS_S[(ws() + i) % 7]);
    const grid = h('div.cal-wrap', [h('div.cal-head-row', names.map(n => h('div.cal-head-cell', n)))]);
    const cells = h('div.cal-grid');
    const range = expand(start, NX.addDays(start, 42));
    for (let i = 0; i < 42; i++) {
      const d = NX.addDays(start, i);
      const dayStart = NX.startOfDay(d), dayEnd = NX.endOfDay(d);
      const evs = range.filter(x => x.start <= dayEnd && x.end >= dayStart)
        .sort((a, b) => (a.e.allDay ? -1 : 0) - (b.e.allDay ? -1 : 0) || a.start - b.start);
      const dayTasks = store().tasks.all().filter(t => !t.archived && t.due && NX.isSameDay(t.due, d));
      const habits = store().habits.all().filter(hb => hb.active !== false && hb.history && hb.history[NX.ymd(d)]);

      const cell = h('div.cal-cell' + (d.getMonth() === cursor.getMonth() ? '' : '.other') + (NX.isToday(d) ? '.today' : '') + (NX.isWeekend(d) ? '.weekend' : ''));
      cell.appendChild(h('div.row', { style: { gap: '3px', marginBottom: '3px' } }, [
        h('div.cal-day', String(d.getDate())),
        h('div.grow'),
        habits.length ? h('span.tiny', { title: habits.length + ' habits done', style: { color: 'var(--acc-org)' } }, '🔥' + habits.length) : null,
        dayTasks.length ? h('span.tiny', { title: dayTasks.length + ' tasks due', style: { color: 'var(--acc-blu)' } }, '✓' + dayTasks.filter(t => t.done).length + '/' + dayTasks.length) : null
      ]));
      evs.slice(0, 3).forEach(x => {
        cell.appendChild(h('div.cal-ev', {
          style: { background: (x.e.color || '#7c6cff') + '22', borderLeftColor: x.e.color || '#7c6cff' },
          onclick: ev => { ev.stopPropagation(); NX.components.openEvent(x.e.id); }
        }, (x.e.allDay ? '◆ ' : NX.fmtTime(x.start).replace(/\s?[AP]M/i, m => m.toLowerCase()) + ' ') + x.e.title));
      });
      const more = evs.length - 3 + Math.max(0, dayTasks.length - 1);
      if (more > 0) cell.appendChild(h('div.cal-more', { onclick: ev => { ev.stopPropagation(); cursor = d; mode = 'day'; NX.localStore.set('nexadesk.calMode', 'day'); NX.router.render(); } }, `+${more} more`));
      cell.addEventListener('click', () => { cursor = d; mode = 'day'; NX.localStore.set('nexadesk.calMode', 'day'); NX.router.render(); });
      cell.addEventListener('dblclick', async ev => { ev.stopPropagation(); const dd = new Date(d); dd.setHours(9, 0, 0, 0); await NX.actions.newEvent(); });
      NX.ui.bindMenu(cell, () => [
        { header: NX.fmtDate(d, 'long') },
        { icon: 'plus', label: 'New event here', onClick: async () => { const dd = new Date(d); dd.setHours(9, 0, 0, 0); await NX.actions.newEvent(); } },
        { icon: 'task', label: 'New task due this day', onClick: async () => { const t = await NX.actions.newTask(); if (t) { const dd = new Date(d); dd.setHours(17, 0, 0, 0); store().tasks.update(t.id, { due: dd.toISOString() }); } } },
        { icon: 'journal', label: 'Open journal for this day', onClick: () => NX.router.go('journal', { date: NX.ymd(d) }) },
        { icon: 'eye', label: 'Switch to day view', onClick: () => { cursor = d; mode = 'day'; NX.localStore.set('nexadesk.calMode', 'day'); NX.router.render(); } }
      ]);
      cells.appendChild(cell);
    }
    grid.appendChild(cells);
    return grid;
  }

  /* =====================================================================
     TIME GRID (week / day)
     ===================================================================== */
  function timeGrid(days) {
    const start = days === 7 ? NX.startOfWeek(cursor, ws()) : NX.startOfDay(cursor);
    const end = NX.addDays(start, days - 1);
    const wrap = h('div.tg-wrap');
    const cols = `56px repeat(${days}, minmax(0,1fr))`;

    const head = h('div.tg-head', { style: { gridTemplateColumns: cols } });
    head.appendChild(h('div.tg-head-cell', { style: { borderRight: '1px solid var(--bd)' } }, h('div.dow', 'GMT' + (new Date().getTimezoneOffset() > 0 ? '-' : '+') + Math.abs(new Date().getTimezoneOffset() / 60))));
    for (let i = 0; i < days; i++) {
      const d = NX.addDays(start, i);
      head.appendChild(h('div.tg-head-cell' + (NX.isToday(d) ? '.today' : ''), {
        onclick: () => { cursor = d; mode = 'day'; NX.localStore.set('nexadesk.calMode', 'day'); NX.router.render(); }
      }, [h('div.dow', NX.DAYS_S[d.getDay()]), h('div.dom', String(d.getDate()))]));
    }
    wrap.appendChild(head);

    const scroll = h('div.tg-scroll');
    const body = h('div.tg-body', { style: { gridTemplateColumns: cols } });
    const gutter = h('div.tg-gutter');
    for (let hh = 0; hh < 24; hh++) gutter.appendChild(h('div.tg-hour', (hh % 12 || 12) + (hh < 12 ? 'am' : 'pm')));
    body.appendChild(gutter);

    const range = expand(NX.startOfDay(start), NX.endOfDay(end));
    for (let i = 0; i < days; i++) {
      const d = NX.addDays(start, i);
      const col = h('div.tg-col');
      for (let hh = 0; hh < 24; hh++) {
        const slot = h('div.tg-slot', { onclick: () => quickCreateAt(d, hh) });
        NX.ui.bindMenu(slot, () => [
          { icon: 'plus', label: `New event at ${hh}:00`, onClick: () => quickCreateAt(d, hh) },
          { icon: 'timer', label: 'Block 90 min of focus', onClick: () => createFocusBlock(d, hh, 90) },
          { icon: 'task', label: 'Add task due here', onClick: async () => { const t = await NX.actions.newTask(); if (t) { const dd = new Date(d); dd.setHours(hh, 0, 0, 0); store().tasks.update(t.id, { due: dd.toISOString() }); } } }
        ]);
        col.appendChild(slot);
      }
      // all-day row placeholder + events
      const dayStart = NX.startOfDay(d), dayEnd = NX.endOfDay(d);
      const dayEvents = range.filter(x => x.start >= dayStart && x.start <= dayEnd && !x.e.allDay);
      const laid = layoutOverlaps(dayEvents);
      laid.forEach(({ x, left, width }) => {
        const topMin = x.start.getHours() * 60 + x.start.getMinutes();
        const durMin = Math.max(15, (x.end - x.start) / 60000);
        const ev = h('div.tg-ev', {
          style: {
            top: (topMin / 60 * HOUR_H) + 'px', height: Math.max(18, durMin / 60 * HOUR_H - 2) + 'px',
            background: (x.e.color || '#7c6cff') + '2e', borderLeftColor: x.e.color || '#7c6cff',
            left: `calc(${left * 100}% + 2px)`, width: `calc(${width * 100}% - 5px)`
          },
          onclick: e => { e.stopPropagation(); NX.components.openEvent(x.e.id); }
        }, [
          h('div.ev-t', x.e.title),
          durMin >= 40 ? h('div.ev-time', NX.fmtTime(x.start) + ' – ' + NX.fmtTime(x.end)) : null,
          x.e.location ? h('div.ev-time', '📍 ' + x.e.location) : null
        ]);
        NX.ui.bindMenu(ev, () => NX.components.eventMenu(x.e));
        // drag to move
        makeDraggableEvent(ev, x, col, d);
        col.appendChild(ev);
      });
      // tasks with due times
      store().tasks.all().filter(t => !t.archived && t.due && NX.isSameDay(t.due, d) && !t.done).forEach(t => {
        const td = new Date(t.due);
        const topMin = td.getHours() * 60 + td.getMinutes();
        col.appendChild(h('div.tg-ev', {
          style: { top: (topMin / 60 * HOUR_H) + 'px', height: '16px', background: 'var(--acc-blu-bg)', borderLeftColor: 'var(--acc-blu)', right: '3px', left: 'auto', width: '48%', fontSize: '10px', zIndex: '1' },
          title: 'Task due: ' + t.title,
          onclick: e => { e.stopPropagation(); NX.components.openTask(t.id); }
        }, h('div.ev-t', '✓ ' + t.title)));
      });
      body.appendChild(col);
    }
    scroll.appendChild(body);

    // now indicator
    const nowLine = h('div.tg-now', { id: 'nowLine', style: { display: 'none' } });
    body.appendChild(nowLine);
    setTimeout(() => positionNow(nowLine, start, days), 30);

    wrap.appendChild(scroll);
    // scroll to 8am
    setTimeout(() => { scroll.scrollTop = Math.max(0, 7.5 * HOUR_H); }, 40);

    // all-day strip
    const allDay = range.filter(x => x.e.allDay && x.start >= NX.startOfDay(start) && x.start <= NX.endOfDay(end));
    if (allDay.length) {
      const strip = h('div.card.pad-sm', { style: { marginBottom: '10px', background: 'var(--bg-sunken)' } }, [
        h('div.small.muted', { style: { fontWeight: '600', marginBottom: '5px' } }, 'All-day'),
        h('div.row-wrap', allDay.map(x => h('span.chip.clickable', {
          style: { background: (x.e.color || '#7c6cff') + '22', color: x.e.color || 'var(--brand-1)' },
          onclick: () => NX.components.openEvent(x.e.id)
        }, `◆ ${x.e.title} · ${NX.fmtDate(x.start, 'monthDay')}`)))
      ]);
      return h('div', [strip, wrap]);
    }
    return wrap;
  }

  function positionNow(line, start, days) {
    const now = new Date();
    if (now < NX.startOfDay(start) || now > NX.endOfDay(NX.addDays(start, days - 1))) { line.style.display = 'none'; return; }
    const dayIdx = NX.diffDays(now, start);
    const mins = now.getHours() * 60 + now.getMinutes();
    const body = line.parentElement;
    if (!body) return;
    const colWidth = 100 / (days + 1);
    line.style.display = 'block';
    line.style.top = (mins / 60 * HOUR_H) + 'px';
    line.style.left = `calc(${colWidth * (dayIdx + 1)}% )`;
    line.style.width = `calc(${colWidth}% )`;
    line.style.right = 'auto';
  }

  /** Simple column packing for overlapping events */
  function layoutOverlaps(list) {
    const sorted = list.slice().sort((a, b) => a.start - b.start || b.end - a.end);
    const out = [];
    let cluster = [], clusterEnd = 0;
    const flush = () => {
      if (!cluster.length) return;
      const columns = [];
      cluster.forEach(x => {
        let placed = false;
        for (let c = 0; c < columns.length; c++) {
          const last = columns[c][columns[c].length - 1];
          if (last.end <= x.start) { columns[c].push(x); out.push({ x, col: c }); placed = true; break; }
        }
        if (!placed) { columns.push([x]); out.push({ x, col: columns.length - 1 }); }
      });
      const n = columns.length;
      out.forEach(o => { if (cluster.includes(o.x)) { o.total = n; o.left = o.col / n; o.width = 1 / n; } });
      cluster = [];
    };
    sorted.forEach(x => {
      if (cluster.length && x.start >= clusterEnd) flush();
      cluster.push(x);
      clusterEnd = Math.max(clusterEnd, x.end.getTime());
    });
    flush();
    return out;
  }

  function makeDraggableEvent(el, x, col, day) {
    let startY = 0, origTop = 0, dragging = false;
    el.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      startY = e.clientY; origTop = parseFloat(el.style.top) || 0; dragging = false;
      const move = ev => {
        if (Math.abs(ev.clientY - startY) < 4) return;
        dragging = true;
        el.style.opacity = '.75';
        const snap = Math.round((origTop + (ev.clientY - startY)) / (HOUR_H / 4)) * (HOUR_H / 4);
        el.style.top = Math.max(0, Math.min(24 * HOUR_H - 20, snap)) + 'px';
      };
      const up = ev => {
        document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
        el.style.opacity = '';
        if (!dragging) return;
        const newTop = parseFloat(el.style.top);
        const mins = Math.round(newTop / HOUR_H * 60 / 15) * 15;
        const dur = x.end - x.start;
        const ns = new Date(day); ns.setHours(0, mins, 0, 0);
        store().events.update(x.e.id, { start: ns.toISOString(), end: new Date(ns.getTime() + dur).toISOString() });
        NX.ui.toast({ type: 'success', message: `Moved to ${NX.fmtTime(ns)}`, duration: 2800,
          actions: [{ label: 'Undo', onClick: () => { store().events.update(x.e.id, { start: x.e.start, end: x.e.end }); NX.router.render(); } }] });
        NX.router.render();
      };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
  }

  async function quickCreateAt(day, hour) {
    const start = new Date(day); start.setHours(hour, 0, 0, 0);
    const end = new Date(start.getTime() + 3600000);
    const e = await NX.ui.form({
      title: 'New event', okLabel: 'Create',
      fields: [
        { key: 'title', label: 'Title', type: 'text', required: true, full: true },
        { key: 'start', label: 'Start', type: 'datetime', value: NX.ymdhm(start) },
        { key: 'end', label: 'End', type: 'datetime', value: NX.ymdhm(end) },
        { key: 'calendar', label: 'Calendar', type: 'select', options: NX.unique(store().events.all().map(x => x.calendar).concat(['Personal', 'Work', 'Health', 'Focus', 'Social'])), value: 'Personal' },
        { key: 'color', label: 'Colour', type: 'color', value: '#7c6cff' },
        { key: 'location', label: 'Location', type: 'text' }
      ]
    });
    if (!e) return;
    store().events.create({ title: e.title, start: new Date(e.start).toISOString(), end: new Date(e.end).toISOString(), allDay: false, location: e.location || '', description: '', color: e.color, calendar: e.calendar, attendees: [], reminder: null, repeat: null, busy: true });
    NX.ui.toast({ type: 'success', message: 'Event created' });
    NX.router.render();
  }

  function createFocusBlock(day, hour, minutes) {
    const start = new Date(day); start.setHours(hour, 0, 0, 0);
    store().events.create({ title: '🎯 Deep work', start: start.toISOString(), end: new Date(start.getTime() + minutes * 60000).toISOString(), allDay: false, color: '#33b8a3', calendar: 'Focus', description: 'Protected focus block', reminder: 5, repeat: null, busy: true });
    NX.ui.toast({ type: 'success', message: `${NX.fmtDuration(minutes)} focus block added` });
    NX.router.render();
  }

  /* =====================================================================
     AGENDA
     ===================================================================== */
  function agenda() {
    const wrap = h('div');
    const range = expand(NX.startOfDay(cursor), NX.addDays(NX.startOfDay(cursor), 30));
    const byDay = new Map();
    range.forEach(x => {
      const k = NX.ymd(x.start);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(x);
    });
    // tasks too
    store().tasks.all().filter(t => !t.archived && t.due && !t.done).forEach(t => {
      const d = new Date(t.due);
      if (d < NX.startOfDay(cursor) || d > NX.addDays(cursor, 30)) return;
      const k = NX.ymd(d);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push({ task: t, start: d, end: d });
    });
    const keys = Array.from(byDay.keys()).sort();
    if (!keys.length) { wrap.appendChild(NX.ui.emptyState('calendar', 'Nothing scheduled', 'The next 30 days are completely clear.')); return wrap; }
    keys.forEach(k => {
      const d = new Date(k);
      const items = byDay.get(k).sort((a, b) => a.start - b.start);
      wrap.appendChild(h('div.agenda-day', [
        h('div.agenda-date', NX.isToday(d) ? 'TODAY — ' + NX.fmtDate(d, 'long') : NX.fmtDate(d, 'long') + ` · ${NX.relTime(d)}`),
        h('div', items.map(x => x.task
          ? h('div.agenda-item', { onclick: () => NX.components.openTask(x.task.id) }, [
              h('div.agenda-time', NX.fmtTime(x.start)),
              h('div.agenda-bar', { style: { background: 'var(--acc-blu)' } }),
              h('div.grow', [h('div', { style: { fontSize: '13px', fontWeight: '550' } }, '✓ ' + x.task.title),
                h('div.small.muted', `${x.task.status} · ${x.task.priority} priority${x.task.projectId ? ' · ' + sel().projectName(x.task.projectId) : ''}`)])
            ])
          : h('div.agenda-item', { onclick: () => NX.components.openEvent(x.e.id) }, [
              h('div.agenda-time', x.e.allDay ? 'all day' : NX.fmtTime(x.start)),
              h('div.agenda-bar', { style: { background: x.e.color || '#7c6cff' } }),
              h('div.grow', [
                h('div', { style: { fontSize: '13px', fontWeight: '550' } }, x.e.title + (x.e.repeat ? ' 🔁' : '')),
                h('div.small.muted', [x.e.location ? '📍 ' + x.e.location : '', x.e.calendar, x.e.attendees && x.e.attendees.length ? x.e.attendees.length + ' attending' : ''].filter(Boolean).join(' · '))
              ]),
              h('div', { style: { flex: '0 0 auto' } }, h('button.icon-btn', { html: iconHTML('more', 14), onclick: ev => { ev.stopPropagation(); NX.ui.dropdown(ev.currentTarget, NX.components.eventMenu(x.e), { right: true }); } }))
            ])
        ))
      ]));
    });
    return wrap;
  }

  /* =====================================================================
     FREE / BUSY
     ===================================================================== */
  function freeBusy() {
    const wrap = h('div');
    wrap.appendChild(h('div.card.pad-sm', { style: { marginBottom: '14px', background: 'var(--sel)' } }, [
      h('b.small', 'Free time finder'),
      h('div.small', { style: { marginTop: '3px', color: 'var(--tx-2)' } }, 'Green blocks are 45+ minutes of unbooked time inside your working hours (08:00–19:00). Click one to book it.')
    ]));
    const start = NX.startOfDay(new Date());
    const range = expand(start, NX.addDays(start, 14));
    for (let i = 0; i < 14; i++) {
      const d = NX.addDays(start, i);
      if (NX.isWeekend(d)) continue;
      const busy = range.filter(x => !x.e.allDay && NX.isSameDay(x.start, d) && x.e.busy !== false)
        .map(x => [Math.max(x.start.getHours() * 60 + x.start.getMinutes(), 8 * 60), Math.min(x.end.getHours() * 60 + x.end.getMinutes(), 19 * 60)])
        .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
      const free = [];
      let cur = 8 * 60;
      busy.forEach(([a, b]) => { if (a - cur >= 45) free.push([cur, a]); cur = Math.max(cur, b); });
      if (19 * 60 - cur >= 45) free.push([cur, 19 * 60]);
      const minsBusy = busy.reduce((acc, [a, b]) => acc + (b - a), 0);
      wrap.appendChild(h('div.card.pad-sm', { style: { marginBottom: '8px' } }, [
        h('div.row', { style: { marginBottom: '8px' } }, [
          h('b.small.grow', NX.isToday(d) ? 'Today — ' + NX.fmtDate(d, 'long') : NX.fmtDate(d, 'long')),
          h('span.chip', `${NX.fmtDuration(minsBusy)} booked`),
          h('span.chip.chip-grn', `${NX.fmtDuration(NX.sum(free.map(f => f[1] - f[0])))} free`)
        ]),
        free.length ? h('div.row-wrap', { style: { gap: '6px' } }, free.map(([a, b]) => h('button.btn.sm.subtle', {
          style: { borderLeft: '3px solid var(--acc-grn)' },
          onclick: async () => { const s = new Date(d); s.setHours(0, a, 0, 0); const e = new Date(d); e.setHours(0, b, 0, 0); await NX.actions.newEvent(); }
        }, `${fmtMin(a)}–${fmtMin(b)} · ${NX.fmtDuration(b - a)}`))) : h('span.small.muted', 'No free blocks of 45+ minutes.')
      ]));
    }
    return wrap;
  }
  function fmtMin(m) { const hh = Math.floor(m / 60), mm = m % 60; return `${(hh % 12 || 12)}${mm ? ':' + NX.pad(mm) : ''}${hh < 12 ? 'am' : 'pm'}`; }

  /* =====================================================================
     IMPORT / EXPORT
     ===================================================================== */
  function importTasks() {
    const open = sel().openTasks().filter(t => t.due);
    if (!open.length) { NX.ui.toast({ type: 'info', message: 'No tasks with due dates to import' }); return; }
    NX.ui.confirm({ title: 'Add tasks to the calendar?', message: `${open.length} tasks with due dates will appear as 30-minute calendar events in a “Tasks” calendar.`, confirmLabel: 'Add them', danger: false })
      .then(ok => {
        if (!ok) return;
        open.forEach(t => {
          const s = new Date(t.due);
          store().events.create({ title: '✓ ' + t.title, start: s.toISOString(), end: new Date(s.getTime() + 1800000).toISOString(), allDay: false, color: '#4aa8e8', calendar: 'Tasks', description: t.description || '', reminder: null, repeat: null, linkedTaskId: t.id, busy: false }, true);
        });
        store().touch(); store().emit('events');
        NX.router.render();
        NX.ui.toast({ type: 'success', message: `${open.length} tasks added to the calendar` });
      });
  }

  function exportICS() {
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pebble//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Pebble'];
    const fmt = d => new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    expand(NX.addDays(new Date(), -365), NX.addDays(new Date(), 365)).forEach(x => {
      L.push('BEGIN:VEVENT');
      L.push('UID:' + x.e.id + '-' + x.start.getTime() + '@nexadesk');
      L.push('DTSTAMP:' + fmt(new Date()));
      if (x.e.allDay) { L.push('DTSTART;VALUE=DATE:' + NX.ymd(x.start).replace(/-/g, '')); L.push('DTEND;VALUE=DATE:' + NX.ymd(NX.addDays(x.end, 1)).replace(/-/g, '')); }
      else { L.push('DTSTART:' + fmt(x.start)); L.push('DTEND:' + fmt(x.end)); }
      L.push('SUMMARY:' + icsEsc(x.e.title));
      if (x.e.location) L.push('LOCATION:' + icsEsc(x.e.location));
      if (x.e.description) L.push('DESCRIPTION:' + icsEsc(x.e.description));
      if (x.e.reminder !== null && x.e.reminder !== undefined) {
        L.push('BEGIN:VALARM', 'TRIGGER:-PT' + x.e.reminder + 'M', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'END:VALARM');
      }
      L.push('END:VEVENT');
    });
    L.push('END:VCALENDAR');
    NX.download(`nexadesk-${NX.todayStr()}.ics`, L.join('\r\n'), 'text/calendar');
    NX.ui.toast({ type: 'success', message: 'Calendar exported as .ics' });
  }
  function icsEsc(s) { return String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }

  async function importICS() {
    let text = null;
    if (store().desktop && window.nex.openDialog) {
      const r = await window.nex.openDialog({ filters: [{ name: 'Calendar', extensions: ['ics'] }] });
      if (r.ok) text = decodeURIComponent(escape(atob(r.files[0].data)));
    } else {
      text = await new Promise(res => {
        const inp = h('input', { type: 'file', accept: '.ics', style: { display: 'none' } });
        inp.onchange = () => { const f = inp.files[0]; if (!f) return res(null); const rd = new FileReader(); rd.onload = () => res(String(rd.result)); rd.readAsText(f); };
        document.body.appendChild(inp); inp.click(); setTimeout(() => inp.remove(), 4000);
      });
    }
    if (!text) return;
    const blocks = text.split('BEGIN:VEVENT').slice(1);
    let count = 0;
    blocks.forEach(b => {
      const get = k => { const m = b.match(new RegExp('^' + k + '[^:]*:(.*)$', 'm')); return m ? m[1].trim().replace(/\\n/g, '\n').replace(/\\([,;\\])/g, '$1') : ''; };
      const dtStart = get('DTSTART'), dtEnd = get('DTEND'), summary = get('SUMMARY');
      if (!summary || !dtStart) return;
      const parse = s => {
        const m = String(s).match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
        if (!m) return null;
        return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0));
      };
      const s = parse(dtStart); if (!s) return;
      const e = parse(dtEnd) || new Date(s.getTime() + 3600000);
      const allDay = !/T\d/.test(String(dtStart));
      store().events.create({ title: summary, start: s.toISOString(), end: e.toISOString(), allDay, location: get('LOCATION'), description: get('DESCRIPTION'), color: '#4aa8e8', calendar: 'Imported', reminder: null, repeat: null, attendees: [], busy: true }, true);
      count++;
    });
    store().touch(); store().emit('events');
    NX.router.render();
    NX.ui.toast({ type: count ? 'success' : 'warn', title: count ? `${count} events imported` : 'No events found', message: count ? 'Added to the “Imported” calendar' : 'That file did not contain any readable VEVENT blocks.' });
  }

  NX.router.register({
    id: 'calendar', name: 'Calendar', icon: 'calendar', group: 'plan', order: 11,
    badge: () => sel().eventsOn(new Date()).length,
    render,
    crumb: p => [],
    sidebarItems: () => [
      { label: 'Today', icon: 'calendar', count: sel().eventsOn(new Date()).length, go: () => { cursor = NX.startOfDay(new Date()); mode = 'day'; NX.localStore.set('nexadesk.calMode', mode); NX.router.navigate('#/calendar'); } },
      { label: 'This week', icon: 'columns', count: null, go: () => { cursor = NX.startOfDay(new Date()); mode = 'week'; NX.localStore.set('nexadesk.calMode', mode); NX.router.navigate('#/calendar'); } },
      { label: 'Month', icon: 'grid', count: null, go: () => { cursor = NX.startOfDay(new Date()); mode = 'month'; NX.localStore.set('nexadesk.calMode', mode); NX.router.navigate('#/calendar'); } },
      { label: 'Agenda (30 days)', icon: 'list', count: null, go: () => { mode = 'agenda'; NX.localStore.set('nexadesk.calMode', mode); NX.router.navigate('#/calendar'); } },
      { label: 'Find free time', icon: 'clock', count: null, go: () => { mode = 'freebusy'; NX.localStore.set('nexadesk.calMode', mode); NX.router.navigate('#/calendar'); } }
    ],
    commands: () => [
      { label: 'Calendar: go to today', icon: 'calendar', run: () => { cursor = NX.startOfDay(new Date()); NX.router.render(); } },
      { label: 'Calendar: export .ics', icon: 'download', run: exportICS },
      { label: 'Calendar: import .ics', icon: 'upload', run: importICS },
      { label: 'Calendar: find free time', icon: 'clock', run: () => { mode = 'freebusy'; NX.localStore.set('nexadesk.calMode', mode); NX.router.render(); } },
      { label: 'Calendar: add tasks to calendar', icon: 'task', run: importTasks }
    ]
  });
})(window.NX);
