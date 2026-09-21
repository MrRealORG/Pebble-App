/* ============================================================
   Pebble — bookmarks, contacts (CRM), finance, inbox
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, esc, iconHTML } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  /* =====================================================================
     BOOKMARKS
     ===================================================================== */
  (function () {
    let view = NX.localStore.get('nexadesk.bmView', 'grid');
    let folder = '', status = '', query = '';

    function render() {
      const all = store().bookmarks.all();
      const page = h('div.page');
      page.appendChild(NX.components.pageHead({
        icon: 'bookmark', title: 'Bookmarks',
        sub: `${all.length} saved · ${all.filter(b => b.status === 'unread').length} unread · ${NX.unique(all.map(b => b.folder).filter(Boolean)).length} folders`,
        actions: [
          h('button.btn.sm.primary', { html: iconHTML('plus', 13) + ' Add link', onclick: () => NX.actions.newBookmark().then(() => NX.router.render()) }),
          h('button.btn.sm.subtle', { onclick: () => importBookmarks() }, 'Import'),
          h('button.btn.sm.ghost', { onclick: exportBookmarks }, 'Export')
        ]
      }));
      page.appendChild(NX.components.filterBar([
        { type: 'seg', value: view, onChange: v => { view = v; NX.localStore.set('nexadesk.bmView', v); NX.router.render(); }, options: [{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }] },
        { type: 'search', placeholder: 'Search bookmarks…', value: query, width: 220, onInput: v => { query = v; NX.router.render(); } },
        { type: 'select', value: status, onChange: v => { status = v; NX.router.render(); }, options: [{ value: '', label: 'Any status' }, 'unread', 'reading', 'read', 'archived'] },
        { type: 'spacer' },
        { type: 'text', text: 'Folders:' }
      ]));
      // folder chips
      const folders = NX.unique(all.map(b => b.folder).filter(Boolean));
      page.appendChild(h('div.row-wrap', { style: { gap: '5px', marginBottom: '14px' } }, [
        h('span.chip.clickable' + (!folder ? '.on' : ''), { onclick: () => { folder = ''; NX.router.render(); } }, 'All'),
        ...folders.map(f => h('span.chip.clickable' + (folder === f ? '.on' : ''), { onclick: () => { folder = folder === f ? '' : f; NX.router.render(); } }, `${f} (${all.filter(b => b.folder === f).length})`)),
        h('span.chip.clickable', { onclick: async () => { const v = await NX.ui.prompt({ title: 'New folder name' }); if (v) { folder = v; NX.router.render(); } } }, '+ Folder')
      ]));

      let list = all.slice();
      if (folder) list = list.filter(b => b.folder === folder);
      if (status) list = list.filter(b => b.status === status);
      if (query) {
        const q = query.toLowerCase();
        list = list.filter(b => (b.title || '').toLowerCase().includes(q) || (b.url || '').toLowerCase().includes(q) || (b.description || '').toLowerCase().includes(q) || (b.tags || []).some(t => String(t).toLowerCase().includes(q)));
      }
      list.sort((a, b) => new Date(b.created) - new Date(a.created));

      if (!list.length) { page.appendChild(NX.ui.emptyState('bookmark', 'Nothing here', 'Save links you want to come back to. They become searchable alongside everything else.', 'Add a link', () => NX.actions.newBookmark())); return page; }

      if (view === 'grid') {
        const grid = h('div.grid.grid-auto');
        list.forEach(b => grid.appendChild(card(b)));
        page.appendChild(grid);
      } else {
        const wrap = h('div.db-wrap');
        const table = h('table.db');
        table.appendChild(h('thead', h('tr', ['Title', 'URL', 'Folder', 'Status', 'Tags', 'Rating', 'Saved', ''].map(x => h('th', x)))));
        const tbody = h('tbody');
        list.forEach(b => {
          const tr = h('tr', { onclick: () => openUrl(b) });
          NX.ui.bindMenu(tr, () => menu(b));
          tr.appendChild(h('td', h('b', { style: { fontWeight: '520' } }, b.title)));
          tr.appendChild(h('td', h('a.small.nowrap', { href: b.url, target: '_blank', rel: 'noopener', onclick: e => e.stopPropagation(), style: { maxWidth: '220px', display: 'block' } }, hostOf(b.url))));
          tr.appendChild(h('td', b.folder || h('span.muted', '—')));
          tr.appendChild(h('td', h('span.chip.chip-' + ({ unread: 'blu', reading: 'org', read: 'grn', archived: 'gry' }[b.status] || 'gry'), b.status || 'unread')));
          tr.appendChild(h('td', h('div.cell-tags', (b.tags || []).map(t => h('span.tag', t)))));
          tr.appendChild(h('td', b.rating ? '★'.repeat(b.rating) : h('span.muted', '—')));
          tr.appendChild(h('td.c-date', NX.fmtDate(b.created, 'short')));
          tr.appendChild(h('td', h('button.icon-btn', { html: iconHTML('more', 14), onclick: e => { e.stopPropagation(); NX.ui.dropdown(e.currentTarget, menu(b), { right: true }); } })));
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(h('div.db-scroll', table));
        page.appendChild(wrap);
      }
      return page;
    }

    function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; } }
    function openUrl(b) {
      store().bookmarks.update(b.id, { lastOpened: new Date().toISOString() }, true);
      if (b.status === 'unread') store().bookmarks.update(b.id, { status: 'reading' }, true);
      store().touch();
      if (store().desktop && window.nex.openExternal) window.nex.openExternal(b.url);
      else window.open(b.url, '_blank', 'noopener');
    }

    function card(b) {
      const host = hostOf(b.url);
      const c = h('div.bm-card');
      NX.ui.bindMenu(c, () => menu(b));
      c.onclick = () => openUrl(b);
      c.appendChild(h('div.bm-fav', { style: { background: NX.colorFromString(host) + '22', color: NX.colorFromString(host) } }, (host[0] || '🔗').toUpperCase()));
      c.appendChild(h('div.grow', { style: { minWidth: '0' } }, [
        h('div.bm-title', b.title),
        h('div.bm-url', host),
        b.description ? h('div.bm-desc', b.description) : null,
        h('div.row-wrap', { style: { gap: '4px', marginTop: '6px' } }, [
          b.folder ? h('span.chip', b.folder) : null,
          h('span.chip.chip-' + ({ unread: 'blu', reading: 'org', read: 'grn', archived: 'gry' }[b.status] || 'gry'), b.status || 'unread'),
          b.rating ? h('span.chip.chip-yel', '★'.repeat(b.rating)) : null,
          ...(b.tags || []).slice(0, 2).map(t => h('span.tag', t))
        ])
      ]));
      c.appendChild(h('button.icon-btn', { html: iconHTML('more', 15), onclick: e => { e.stopPropagation(); NX.ui.dropdown(e.currentTarget, menu(b), { right: true }); } }));
      return c;
    }

    function menu(b) {
      return [
        { icon: 'link', label: 'Open link', onClick: () => openUrl(b) },
        { icon: 'copy', label: 'Copy URL', onClick: () => NX.copyText(b.url).then(() => NX.ui.toast({ message: 'Copied', duration: 1400 })) },
        { icon: 'note', label: 'Create a note with a summary', onClick: async () => {
            const t = NX.ui.toast({ type: 'info', message: 'Drafting note…', duration: 0 });
            const r = await NX.ai.features.draftNote(`${b.title} — ${b.url}. ${b.description || ''}`);
            t.close();
            const n = store().notes.create({ title: '🔖 ' + b.title, icon: '🔖', emoji: '🔖', tags: [], parentId: null, order: 0, favorite: false, archived: false, properties: [
              { id: NX.uid('p'), name: 'URL', type: 'url', value: b.url },
              { id: NX.uid('p'), name: 'Status', type: 'text', value: b.status }
            ], blocks: [NX.md.newBlock('bookmark', { src: b.url, title: b.title, description: b.description || '' }), ...NX.md.markdownToBlocks(r.text)] });
            NX.router.go('notes', { id: n.id });
          } },
        { icon: 'task', label: 'Create a task to read it', onClick: () => { store().tasks.create({ title: 'Read: ' + b.title, description: b.url, projectId: null, status: 'To Do', priority: 'Low', due: null, repeat: null, tags: [], checklist: [], estimate: 20, order: 0, done: false, archived: false }); NX.ui.toast({ type: 'success', message: 'Task created' }); } },
        '-',
        { header: 'Mark as' },
        ...['unread', 'reading', 'read', 'archived'].map(s => ({ label: s, checked: b.status === s, onClick: () => { store().bookmarks.update(b.id, { status: s }); NX.router.render(); } })),
        '-',
        { icon: 'edit', label: 'Edit…', onClick: () => editBookmark(b.id) },
        { icon: 'folder', label: 'Move to folder…', onClick: async () => { const v = await NX.ui.prompt({ title: 'Folder', value: b.folder || '', message: NX.unique(store().bookmarks.all().map(x => x.folder).filter(Boolean)).join(', ') || 'No folders yet' }); if (v !== null) { store().bookmarks.update(b.id, { folder: v }); NX.router.render(); } } },
        { icon: 'trash', label: 'Delete', danger: true, onClick: async () => { if (await NX.ui.confirmDelete('this bookmark')) { store().bookmarks.remove(b.id); NX.router.render(); } } }
      ];
    }

    async function editBookmark(id) {
      const b = store().bookmarks.find(id);
      const r = await NX.ui.form({
        title: 'Edit bookmark', wide: true, okLabel: 'Save',
        fields: [
          { key: 'title', label: 'Title', type: 'text', value: b.title, required: true, full: true },
          { key: 'url', label: 'URL', type: 'url', value: b.url, required: true, full: true },
          { key: 'folder', label: 'Folder', type: 'text', value: b.folder || '' },
          { key: 'status', label: 'Status', type: 'select', value: b.status || 'unread', options: ['unread', 'reading', 'read', 'archived'] },
          { key: 'rating', label: 'Rating (0-5)', type: 'number', value: b.rating || 0, min: 0, max: 5 },
          { key: 'tags', label: 'Tags', type: 'text', value: (b.tags || []).join(', '), full: true },
          { key: 'description', label: 'Description', type: 'textarea', value: b.description || '', rows: 2, full: true },
          { key: 'note', label: 'My notes', type: 'textarea', value: b.note || '', rows: 3, full: true }
        ]
      });
      if (!r) return;
      store().bookmarks.update(id, { title: r.title, url: r.url, folder: r.folder, status: r.status, rating: Number(r.rating) || 0, tags: r.tags.split(',').map(x => x.trim()).filter(Boolean), description: r.description, note: r.note });
      NX.router.render();
    }

    async function importBookmarks() {
      let text = null;
      const inp = h('input', { type: 'file', accept: '.html,.json,.csv,.txt', style: { display: 'none' } });
      inp.onchange = () => { const f = inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => parse(String(rd.result)); rd.readAsText(f); };
      document.body.appendChild(inp); inp.click(); setTimeout(() => inp.remove(), 4000);
      function parse(txt) {
        let count = 0;
        // Netscape bookmark HTML
        const re = /<A[^>]+HREF="([^"]+)"[^>]*>([^<]*)<\/A>/gi;
        let m;
        while ((m = re.exec(txt))) {
          const url = m[1], title = m[2].trim();
          if (!/^https?:/i.test(url)) continue;
          if (store().bookmarks.all().some(b => b.url === url)) continue;
          const folderMatch = txt.slice(Math.max(0, m.index - 400), m.index).match(/<H3[^>]*>([^<]+)<\/H3>(?![\s\S]*<H3)/i);
          store().bookmarks.create({ url, title: title || hostOf2(url), folder: folderMatch ? folderMatch[1].trim() : '', status: 'unread', tags: [], description: '', rating: 0, note: '' }, true);
          count++;
        }
        if (!count) {
          // plain list of URLs
          (txt.match(/https?:\/\/[^\s"'<>()]+/g) || []).forEach(url => {
            if (store().bookmarks.all().some(b => b.url === url)) return;
            store().bookmarks.create({ url, title: hostOf2(url), folder: 'Imported', status: 'unread', tags: [], description: '', rating: 0, note: '' }, true);
            count++;
          });
        }
        store().touch(); store().emit('bookmarks');
        NX.router.render();
        NX.ui.toast({ type: count ? 'success' : 'warn', title: count ? `${count} bookmarks imported` : 'Nothing imported', message: count ? '' : 'That file had no recognisable links.' });
      }
      function hostOf2(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
    }

    function exportBookmarks() {
      const L = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', '<TITLE>Bookmarks</TITLE>', '<H1>Bookmarks</H1>', '<DL><p>'];
      const byFolder = new Map();
      store().bookmarks.all().forEach(b => { const k = b.folder || 'Unfiled'; if (!byFolder.has(k)) byFolder.set(k, []); byFolder.get(k).push(b); });
      byFolder.forEach((items, f) => {
        L.push(`    <DT><H3>${NX.esc(f)}</H3>`);
        L.push('    <DL><p>');
        items.forEach(b => L.push(`        <DT><A HREF="${NX.esc(b.url)}" ADD_DATE="${Math.floor(new Date(b.created).getTime() / 1000)}" TAGS="${NX.esc((b.tags || []).join(','))}">${NX.esc(b.title)}</A>`));
        L.push('    </DL><p>');
      });
      L.push('</DL><p>');
      NX.download(`nexadesk-bookmarks-${NX.todayStr()}.html`, L.join('\n'), 'text/html');
      NX.ui.toast({ type: 'success', message: `${store().bookmarks.count()} bookmarks exported (browser-importable HTML)` });
    }

    NX.router.register({
      id: 'bookmarks', name: 'Bookmarks', icon: 'bookmark', group: 'knowledge', order: 25,
      render,
      commands: () => [
        { label: 'Bookmarks: add a link', icon: 'plus', run: () => NX.actions.newBookmark() },
        { label: 'Bookmarks: export', icon: 'download', run: exportBookmarks },
        { label: 'Bookmarks: import', icon: 'upload', run: importBookmarks }
      ]
    });
  })();

  /* =====================================================================
     CONTACTS — personal CRM
     ===================================================================== */
  (function () {
    let query = '', tagFilter = '', view = NX.localStore.get('nexadesk.ctView', 'grid'), openId = null;

    function render(params) {
      if (params && params.id) openId = params.id;
      const all = store().contacts.all();
      const page = h('div.page');
      const needFollowUp = all.filter(c => c.nextFollowUp && new Date(c.nextFollowUp) <= NX.addDays(new Date(), 7));
      const neglected = all.filter(c => !c.lastContact || NX.diffDays(new Date(), c.lastContact) > 60);

      page.appendChild(NX.components.pageHead({
        icon: 'contact', title: 'Contacts',
        sub: `${all.length} people · ${needFollowUp.length} need follow-up this week · ${neglected.length} not touched in 60+ days`,
        actions: [
          h('button.btn.sm.primary', { html: iconHTML('plus', 13) + ' New contact', onclick: () => NX.actions.newContact().then(() => NX.router.render()) }),
          h('button.btn.sm.subtle', { onclick: () => { view = view === 'grid' ? 'table' : 'grid'; NX.localStore.set('nexadesk.ctView', view); NX.router.render(); } }, view === 'grid' ? 'Table view' : 'Grid view'),
          h('button.btn.sm.ghost', { onclick: exportCSV }, 'Export CSV')
        ]
      }));
      page.appendChild(h('div.grid.grid-4', { style: { marginBottom: 'var(--sp-4)' } }, [
        NX.components.statTile('People', all.length, `${NX.unique(all.flatMap(c => c.tags || [])).length} tags`, 'contact'),
        NX.components.statTile('Follow-ups due', needFollowUp.length, 'next 7 days', 'bell', needFollowUp.length ? 'org' : ''),
        NX.components.statTile('Neglected', neglected.length, 'no contact in 60+ days', 'warn', neglected.length > 2 ? 'red' : ''),
        NX.components.statTile('Birthdays soon', all.filter(c => c.birthday && birthdayWithin(c.birthday, 30)).length, 'next 30 days', 'star', 'pur')
      ]));
      page.appendChild(NX.components.filterBar([
        { type: 'search', placeholder: 'Search people…', value: query, width: 230, onInput: v => { query = v; NX.router.render(); } },
        { type: 'select', value: tagFilter, onChange: v => { tagFilter = v; NX.router.render(); }, options: [{ value: '', label: 'All groups' }].concat(NX.unique(all.flatMap(c => c.tags || [])).map(t => ({ value: t, label: t }))) },
        { type: 'chip', label: 'Needs follow-up', active: tagFilter === '__followup', onClick: () => { tagFilter = tagFilter === '__followup' ? '' : '__followup'; NX.router.render(); } },
        { type: 'chip', label: 'Neglected', active: tagFilter === '__neglected', onClick: () => { tagFilter = tagFilter === '__neglected' ? '' : '__neglected'; NX.router.render(); } },
        { type: 'chip', label: 'Upcoming birthdays', active: tagFilter === '__bday', onClick: () => { tagFilter = tagFilter === '__bday' ? '' : '__bday'; NX.router.render(); } }
      ]));

      let list = all.slice();
      if (query) { const q = query.toLowerCase(); list = list.filter(c => [c.name, c.role, c.company, c.email, c.notes].filter(Boolean).join(' ').toLowerCase().includes(q)); }
      if (tagFilter === '__followup') list = list.filter(c => c.nextFollowUp && new Date(c.nextFollowUp) <= NX.addDays(new Date(), 7));
      else if (tagFilter === '__neglected') list = list.filter(c => !c.lastContact || NX.diffDays(new Date(), c.lastContact) > 60);
      else if (tagFilter === '__bday') list = list.filter(c => c.birthday && birthdayWithin(c.birthday, 30));
      else if (tagFilter) list = list.filter(c => (c.tags || []).includes(tagFilter));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      if (!list.length) { page.appendChild(NX.ui.emptyState('contact', 'No contacts match', 'A personal CRM is worth its weight in gold — but only if you actually log the interactions.', 'Add a contact', () => NX.actions.newContact())); return page; }

      if (view === 'grid') {
        const grid = h('div.grid.grid-auto');
        list.forEach(c => grid.appendChild(contactCard(c)));
        page.appendChild(grid);
      } else {
        const wrap = h('div.db-wrap');
        const table = h('table.db');
        table.appendChild(h('thead', h('tr', ['Name', 'Role', 'Company', 'Email', 'Phone', 'Tags', 'Last contact', 'Follow-up', ''].map(x => h('th', x)))));
        const tbody = h('tbody');
        list.forEach(c => {
          const tr = h('tr', { onclick: () => showContact(c.id) });
          tr.appendChild(h('td', h('div.row', { style: { gap: '8px' } }, [NX.ui.avatar(c.name, c.color, 'xs'), h('b', { style: { fontWeight: '520' } }, c.name)])));
          tr.appendChild(h('td', c.role || h('span.muted', '—')));
          tr.appendChild(h('td', c.company || h('span.muted', '—')));
          tr.appendChild(h('td', c.email ? h('a', { href: 'mailto:' + c.email, onclick: e => e.stopPropagation() }, c.email) : h('span.muted', '—')));
          tr.appendChild(h('td.c-date', c.phone || h('span.muted', '—')));
          tr.appendChild(h('td', h('div.cell-tags', (c.tags || []).map(t => h('span.tag', t)))));
          const days = c.lastContact ? NX.diffDays(new Date(), c.lastContact) : null;
          tr.appendChild(h('td.c-date', days === null ? h('span.muted', 'never') : h('span', { style: { color: days > 60 ? 'var(--acc-red)' : days > 30 ? 'var(--acc-org)' : 'inherit' } }, days + 'd ago')));
          tr.appendChild(h('td.c-date', c.nextFollowUp ? h('span', { style: { color: NX.isPast(c.nextFollowUp) ? 'var(--acc-red)' : 'inherit' } }, NX.dueLabel(c.nextFollowUp)) : h('span.muted', '—')));
          tr.appendChild(h('td', h('button.icon-btn', { html: iconHTML('more', 14), onclick: e => { e.stopPropagation(); NX.ui.dropdown(e.currentTarget, menu(c), { right: true }); } })));
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(h('div.db-scroll', table));
        page.appendChild(wrap);
      }
      if (openId) { setTimeout(() => showContact(openId), 60); openId = null; }
      return page;
    }

    function birthdayWithin(dateStr, days) {
      const d = new Date(dateStr);
      if (isNaN(d)) return false;
      const now = new Date();
      const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
      if (next < now) next.setFullYear(now.getFullYear() + 1);
      return NX.diffDays(next, now) <= days;
    }

    function contactCard(c) {
      const days = c.lastContact ? NX.diffDays(new Date(), c.lastContact) : null;
      const card = h('div.contact-card');
      NX.ui.bindMenu(card, () => menu(c));
      card.onclick = () => showContact(c.id);
      card.appendChild(NX.ui.avatar(c.name, c.color, 'lg'));
      card.appendChild(h('div.grow', { style: { minWidth: '0' } }, [
        h('div.cc-name', c.name),
        h('div.cc-role', [c.role, c.company].filter(Boolean).join(' · ') || 'No role set'),
        h('div.cc-meta', [
          ...(c.tags || []).slice(0, 3).map(t => h('span.tag', t)),
          days !== null ? h('span.chip' + (days > 60 ? '.chip-red' : days > 30 ? '.chip-org' : '.chip-grn'), days === 0 ? 'contacted today' : days + 'd ago') : h('span.chip.chip-gry', 'never contacted'),
          c.nextFollowUp ? h('span.chip' + (NX.isPast(c.nextFollowUp) ? '.chip-red' : ''), '🔔 ' + NX.dueLabel(c.nextFollowUp)) : null,
          c.birthday && birthdayWithin(c.birthday, 30) ? h('span.chip.chip-pnk', '🎂 soon') : null
        ]),
        c.notes ? h('div.small.muted', { style: { marginTop: '7px', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.5' } }, c.notes) : null
      ]));
      return card;
    }

    function showContact(id) {
      const c = store().contacts.find(id);
      if (!c) return;
      const interactions = (c.interactions || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
      const body = h('div');
      body.appendChild(h('div', { style: { display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '16px' } }, [
        NX.ui.avatar(c.name, c.color, 'xl'),
        h('div.grow', [
          h('h2', { style: { fontSize: '21px', letterSpacing: '-.4px' } }, c.name),
          h('div.small.muted', [c.role, c.company].filter(Boolean).join(' · ') || '—'),
          h('div.row-wrap', { style: { gap: '5px', marginTop: '6px' } }, (c.tags || []).map(t => h('span.tag', t)))
        ])
      ]));
      body.appendChild(h('div.card.pad-sm', { style: { background: 'var(--bg-sunken)', marginBottom: '14px' } }, [
        c.email ? NX.ui.kv('Email', c.email) : null,
        c.phone ? NX.ui.kv('Phone', c.phone) : null,
        c.birthday ? NX.ui.kv('Birthday', NX.fmtDate(c.birthday, 'long') + (birthdayWithin(c.birthday, 60) ? ' 🎂' : '')) : null,
        NX.ui.kv('Last contact', c.lastContact ? NX.fmtDate(c.lastContact, 'medium') + ` (${NX.diffDays(new Date(), c.lastContact)}d ago)` : 'never'),
        NX.ui.kv('Next follow-up', c.nextFollowUp ? NX.fmtDate(c.nextFollowUp, 'medium') : 'not set'),
        NX.ui.kv('Interactions logged', String(interactions.length))
      ]));
      if (c.notes) body.appendChild(h('div.card.pad-sm', { style: { marginBottom: '14px', background: 'var(--sel)' } }, [
        h('div.small.muted', { style: { fontWeight: '650', marginBottom: '5px', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '.5px' } }, 'Notes about them'),
        h('div', { style: { fontSize: '13px', lineHeight: '1.65', whiteSpace: 'pre-wrap' } }, c.notes)
      ]));

      body.appendChild(h('div.row', { style: { gap: '6px', marginBottom: '12px' } }, [
        h('button.btn.sm.primary', { onclick: () => logInteraction(c.id) }, '+ Log interaction'),
        h('button.btn.sm.subtle', { onclick: async () => { const v = await NX.ui.prompt({ title: 'Follow up on', value: NX.ymdhm(NX.addDays(new Date(), 14)) + '', message: 'When should you reach out next? (YYYY-MM-DDTHH:MM)' }); if (v) { store().contacts.update(c.id, { nextFollowUp: new Date(v).toISOString() }); NX.ui.closeTopModal(); showContact(id); NX.ui.toast({ type: 'success', message: 'Follow-up scheduled' }); } } }, '🔔 Schedule follow-up'),
        h('button.btn.sm.ghost', { onclick: () => { if (c.email) { if (store().desktop && window.nex.openExternal) window.nex.openExternal('mailto:' + c.email); else location.href = 'mailto:' + c.email; } } }, '✉️ Email'),
        h('button.btn.sm.ghost', { onclick: () => editContact(c.id) }, 'Edit')
      ]));

      body.appendChild(h('div.section-head', [h('h2', { style: { fontSize: '13px' } }, 'Interaction history'), h('span.sh-sub', String(interactions.length))]));
      if (!interactions.length) body.appendChild(h('p.small.muted', 'Nothing logged yet. Log every meaningful touch — that is what makes this useful in six months.'));
      interactions.forEach(i => body.appendChild(h('div.list-row', [
        h('span', { style: { fontSize: '14px' } }, { call: '📞', email: '✉️', meeting: '🗓️', message: '💬', coffee: '☕', other: '•' }[i.type] || '•'),
        h('div.lr-main', [h('div.lr-title', { style: { fontSize: '12.8px' } }, i.note || i.type), h('div.lr-sub', NX.fmtDate(i.date, 'long') + ' · ' + i.type)]),
        h('button.icon-btn', { html: iconHTML('trash', 13), onclick: () => { store().contacts.update(c.id, { interactions: (c.interactions || []).filter(x => x.id !== i.id) }); NX.ui.closeTopModal(); showContact(id); } })
      ])));

      // related data
      const notes = store().notes.all().filter(n => sel().notePlain(n).toLowerCase().includes(c.name.toLowerCase()));
      if (notes.length) {
        body.appendChild(h('div.section-head', { style: { marginTop: '16px' } }, [h('h2', { style: { fontSize: '13px' } }, 'Mentioned in notes')]));
        notes.slice(0, 6).forEach(n => body.appendChild(h('button.list-row.selectable', { style: { width: '100%' }, onclick: () => { NX.ui.closeTopModal(); NX.router.go('notes', { id: n.id }); } }, [
          h('span', { style: { fontSize: '14px' } }, n.icon || '📄'), h('div.lr-main', [h('div.lr-title', n.title), h('div.lr-sub', NX.relTime(n.updated))])])));
      }
      NX.ui.modal({ title: c.name, size: 'wide', hideFooter: true, body });
    }

    async function logInteraction(id) {
      const r = await NX.ui.form({
        title: 'Log an interaction', okLabel: 'Save',
        fields: [
          { key: 'type', label: 'Type', type: 'select', options: ['call', 'email', 'meeting', 'message', 'coffee', 'other'], value: 'email' },
          { key: 'date', label: 'When', type: 'datetime', value: NX.ymdhm(new Date()) },
          { key: 'note', label: 'What happened / what to remember', type: 'textarea', rows: 3, required: true, full: true },
          { key: 'followUp', label: 'Follow up on', type: 'datetime' }
        ]
      });
      if (!r) return;
      const c = store().contacts.find(id);
      const list = (c.interactions || []).concat([{ id: NX.uid('in'), date: new Date(r.date).toISOString(), type: r.type, note: r.note }]);
      store().contacts.update(id, { interactions: list, lastContact: new Date(r.date).toISOString(), nextFollowUp: r.followUp ? new Date(r.followUp).toISOString() : c.nextFollowUp });
      NX.ui.closeTopModal(); showContact(id);
      NX.ui.toast({ type: 'success', message: 'Interaction logged' });
    }

    async function editContact(id) {
      const c = store().contacts.find(id);
      const r = await NX.ui.form({
        title: 'Edit contact', wide: true, okLabel: 'Save',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: c.name, required: true },
          { key: 'color', label: 'Colour', type: 'color', value: c.color },
          { key: 'role', label: 'Role', type: 'text', value: c.role || '' },
          { key: 'company', label: 'Company', type: 'text', value: c.company || '' },
          { key: 'email', label: 'Email', type: 'email', value: c.email || '' },
          { key: 'phone', label: 'Phone', type: 'text', value: c.phone || '' },
          { key: 'birthday', label: 'Birthday', type: 'date', value: c.birthday || '' },
          { key: 'tags', label: 'Tags', type: 'text', value: (c.tags || []).join(', '), full: true },
          { key: 'notes', label: 'Notes', type: 'textarea', value: c.notes || '', rows: 4, full: true }
        ]
      });
      if (!r) return;
      store().contacts.update(id, { name: r.name, color: r.color, role: r.role, company: r.company, email: r.email, phone: r.phone, birthday: r.birthday, tags: r.tags.split(',').map(x => x.trim()).filter(Boolean), notes: r.notes });
      NX.ui.closeTopModal(); showContact(id); NX.router.render();
    }

    function menu(c) {
      return [
        { icon: 'eye', label: 'Open profile', onClick: () => showContact(c.id) },
        { icon: 'edit', label: 'Edit…', onClick: () => editContact(c.id) },
        { icon: 'plus', label: 'Log an interaction', onClick: () => logInteraction(c.id) },
        '-',
        { icon: 'note', label: 'Create a note about them', onClick: () => {
            const n = store().notes.create({ title: '👤 ' + c.name, icon: '👤', emoji: '👤', tags: [], parentId: null, order: 0, favorite: false, archived: false, properties: [
              { id: NX.uid('p'), name: 'Email', type: 'text', value: c.email || '' },
              { id: NX.uid('p'), name: 'Role', type: 'text', value: [c.role, c.company].filter(Boolean).join(', ') }
            ], blocks: [NX.md.newBlock('h1', { text: c.name }), NX.md.newBlock('text', { text: c.notes || '' }), NX.md.newBlock('h2', { text: 'Interaction log' }), ...(c.interactions || []).map(i => NX.md.newBlock('bullet', { text: `${NX.fmtDate(i.date, 'medium')} — ${i.type}: ${i.note}` }))] });
            NX.router.go('notes', { id: n.id });
          } },
        { icon: 'bell', label: 'Remind me to reach out…', onClick: async () => { const d = await NX.ui.prompt({ title: 'Remind me on', value: NX.ymdhm(NX.addDays(new Date(), 14)), message: 'YYYY-MM-DDTHH:MM' }); if (d) { store().reminders.create({ title: 'Reach out to ' + c.name, body: c.notes ? c.notes.slice(0, 100) : '', at: new Date(d).toISOString(), done: false, priority: 'normal', deepLink: '#/contacts' }); NX.ui.toast({ type: 'success', message: 'Reminder set' }); } } },
        { icon: 'mail', label: 'Copy email', onClick: () => NX.copyText(c.email || '').then(() => NX.ui.toast({ message: 'Email copied', duration: 1400 })) },
        '-',
        { icon: 'trash', label: 'Delete contact', danger: true, onClick: async () => { if (await NX.ui.confirmDelete(c.name)) { store().contacts.remove(c.id); NX.router.render(); } } }
      ];
    }

    function exportCSV() {
      const head = ['Name', 'Role', 'Company', 'Email', 'Phone', 'Tags', 'Birthday', 'Last contact', 'Next follow-up', 'Interactions', 'Notes'];
      const rows = store().contacts.all().map(c => [c.name, c.role, c.company, c.email, c.phone, (c.tags || []).join('; '), c.birthday, c.lastContact ? NX.fmtDate(c.lastContact, 'medium') : '', c.nextFollowUp ? NX.fmtDate(c.nextFollowUp, 'medium') : '', (c.interactions || []).length, c.notes]);
      NX.download(`nexadesk-contacts-${NX.todayStr()}.csv`, NX.md.toCSV([head].concat(rows)), 'text/csv');
      NX.ui.toast({ type: 'success', message: `${rows.length} contacts exported` });
    }

    NX.router.register({
      id: 'contacts', name: 'Contacts', icon: 'contact', group: 'connect', order: 52,
      badge: () => store().contacts.all().filter(c => c.nextFollowUp && NX.isPast(c.nextFollowUp)).length,
      render,
      commands: () => [
        { label: 'Contacts: new contact', icon: 'plus', run: () => NX.actions.newContact() },
        { label: 'Contacts: who needs follow-up?', icon: 'bell', run: () => { tagFilter = '__followup'; NX.router.render(); } },
        { label: 'Contacts: export CSV', icon: 'download', run: exportCSV }
      ]
    });
  })();

  /* =====================================================================
     FINANCE
     ===================================================================== */
  (function () {
    let tab = NX.localStore.get('nexadesk.finTab', 'overview');
    let monthOffset = 0;

    function render(params) {
      if (params && params.tab) tab = params.tab;
      const cur = store().getSetting('currencySymbol', '$');
      const page = h('div.page');
      const fin = sel().monthTotals(monthOffset);
      page.appendChild(NX.components.pageHead({
        icon: 'money', title: 'Finance',
        sub: `${store().transactions.count()} transactions · ${store().accounts.count()} accounts · ${store().categories.count()} categories`,
        actions: [
          h('button.btn.sm.primary', { html: iconHTML('plus', 13) + ' Add transaction', onclick: () => NX.actions.newTransaction().then(() => NX.router.render()) }),
          h('button.btn.sm.subtle', { onclick: () => NX.router.go('settings', { tab: 'finance' }) }, 'Accounts & categories'),
          h('button.btn.sm.ghost', { onclick: exportCSV }, 'Export CSV')
        ]
      }));
      page.appendChild(h('div.grid.grid-4', { style: { marginBottom: 'var(--sp-4)' } }, [
        NX.components.statTile('Net worth', cur + NX.fmtNum(sel().netWorth(), 0), `${store().accounts.all().filter(a => !a.archived).length} accounts`, 'money', sel().netWorth() >= 0 ? 'grn' : 'red'),
        NX.components.statTile('Income this month', cur + NX.fmtNum(fin.income, 0), NX.MONTHS_S[new Date(NX.addMonths(new Date(), monthOffset)).getMonth()], 'chart', 'grn'),
        NX.components.statTile('Spent this month', cur + NX.fmtNum(fin.expense, 0), `${fin.count} transactions`, 'money', 'red'),
        NX.components.statTile('Saved', cur + NX.fmtNum(fin.net, 0), fin.income ? Math.round(fin.net / fin.income * 100) + '% savings rate' : '—', 'goal', fin.net >= 0 ? 'blu' : 'red')
      ]));
      page.appendChild(h('div.tabs', ['overview', 'transactions', 'budgets', 'accounts', 'insights'].map(t =>
        h('button' + (tab === t ? '.on' : ''), { onclick: () => { tab = t; NX.localStore.set('nexadesk.finTab', t); NX.router.render(); } }, t[0].toUpperCase() + t.slice(1)))));
      if (tab === 'overview') page.appendChild(overview(cur));
      else if (tab === 'transactions') page.appendChild(transactions(cur));
      else if (tab === 'budgets') page.appendChild(budgets(cur));
      else if (tab === 'accounts') page.appendChild(accounts(cur));
      else page.appendChild(insights(cur));
      return page;
    }

    function monthNav() {
      const d = NX.addMonths(new Date(), monthOffset);
      return h('div.row', { style: { gap: '7px' } }, [
        h('button.btn.sm.ghost', { html: iconHTML('chevL', 14), onclick: () => { monthOffset--; NX.router.render(); } }),
        h('b', NX.MONTHS[d.getMonth()] + ' ' + d.getFullYear()),
        h('button.btn.sm.ghost', { html: iconHTML('chevR', 14), onclick: () => { monthOffset++; NX.router.render(); } }),
        monthOffset !== 0 ? h('button.btn.sm.ghost', { onclick: () => { monthOffset = 0; NX.router.render(); } }, 'This month') : null
      ]);
    }

    function overview(cur) {
      const wrap = h('div');
      const byCat = sel().spendByCategory(monthOffset);
      const tx = sel().monthTransactions(monthOffset);
      wrap.appendChild(h('div.grid.grid-2', { style: { marginBottom: 'var(--sp-4)' } }, [
        h('div.card', [
          h('div.card-head', [h('h3', 'Spending by category'), h('div.grow'), monthNav()]),
          byCat.length ? h('div.donut-wrap', [
            NX.ui.donut(byCat.slice(0, 8).map(c => ({ label: c.name, value: Math.round(c.amount), color: c.color })), 158),
            h('div.donut-legend', byCat.slice(0, 9).map(c => h('div.dl-row', { onclick: () => { tab = 'transactions'; NX.router.render(); } }, [
              h('span.dl-swatch', { style: { background: c.color } }),
              h('span.dl-name', `${c.icon || ''} ${c.name}`),
              h('span.dl-val', cur + NX.fmtNum(c.amount, 0) + (c.budget ? ` / ${cur}${NX.fmtNum(c.budget, 0)}` : ''))
            ])))
          ]) : h('p.small.muted', 'No spending recorded this month.')
        ]),
        h('div.card', [
          h('div.card-head', [h('h3', 'Income vs spending — 6 months')]),
          (() => {
            const out = [];
            for (let m = 5; m >= 0; m--) {
              const t = sel().monthTotals(-m);
              out.push({ label: NX.MONTHS_S[new Date(NX.addMonths(new Date(), -m)).getMonth()], value: Math.round(t.income - t.expense), color: (t.income - t.expense) >= 0 ? '#4caf7d' : '#eb5757' });
            }
            return NX.ui.barChart(out, { height: '158px', format: v => cur + NX.fmtNum(v, 0) });
          })()
        ])
      ]));
      // budget progress
      const overBudget = byCat.filter(c => c.budget && c.amount > c.budget);
      const nearBudget = byCat.filter(c => c.budget && c.amount / c.budget > 0.8 && c.amount <= c.budget);
      if (overBudget.length || nearBudget.length) {
        wrap.appendChild(h('div.card', { style: { marginBottom: 'var(--sp-4)', background: overBudget.length ? 'var(--acc-red-bg)' : 'var(--acc-org-bg)' } }, [
          h('div.card-head', [h('span', { html: iconHTML('warn', 16), style: { display: 'flex', color: overBudget.length ? 'var(--acc-red)' : 'var(--acc-org)' } }), h('h3', overBudget.length ? `${overBudget.length} categor${overBudget.length === 1 ? 'y is' : 'ies are'} over budget` : `${nearBudget.length} categories nearing the limit`)]),
          h('div', overBudget.concat(nearBudget).slice(0, 6).map(c => h('div', { style: { marginBottom: '9px' } }, [
            h('div.row', { style: { justifyContent: 'space-between', marginBottom: '3px' } }, [
              h('span.small', `${c.icon || ''} ${c.name}`),
              h('b.small', { style: { color: c.amount > c.budget ? 'var(--acc-red)' : 'var(--acc-org)' } }, `${cur}${NX.fmtNum(c.amount, 0)} of ${cur}${NX.fmtNum(c.budget, 0)}`)
            ]),
            h('div.progress', h('i', { style: { width: Math.min(100, c.amount / c.budget * 100) + '%', background: c.amount > c.budget ? 'var(--acc-red)' : 'var(--acc-org)' } }))
          ])))
        ]));
      }
      // recent
      wrap.appendChild(h('div.card', [
        h('div.card-head', [h('h3', 'Recent transactions'), h('div.grow'), h('button.btn.sm.ghost', { onclick: () => { tab = 'transactions'; NX.router.render(); } }, 'See all')]),
        h('div', tx.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10).map(t => txnRow(t, cur)))
      ]));
      return wrap;
    }

    function txnRow(t, cur) {
      const cat = store().categories.find(t.categoryId);
      const acc = store().accounts.find(t.accountId);
      return h('div.txn-row', { onclick: () => editTxn(t.id) }, [
        h('div.txn-ico', { style: { background: (cat ? cat.color : '#8b8f98') + '22', color: cat ? cat.color : 'var(--tx-3)' } }, cat ? (cat.icon || '•') : '•'),
        h('div.grow', { style: { minWidth: '0' } }, [
          h('div.nowrap', { style: { fontSize: '13px', fontWeight: '520' } }, t.description),
          h('div.small.muted', [NX.fmtDate(t.date, 'medium'), cat ? cat.name : 'Uncategorised', acc ? acc.name : '', t.recurring ? '🔁 recurring' : ''].filter(Boolean).join(' · '))
        ]),
        (t.tags || []).length ? h('div.cell-tags', t.tags.slice(0, 2).map(x => h('span.tag', x))) : null,
        h('div.txn-amt' + (t.amount >= 0 ? '.in' : '.out'), (t.amount >= 0 ? '+' : '−') + cur + NX.fmtNum(Math.abs(t.amount), 2)),
        h('button.icon-btn', { html: iconHTML('more', 14), onclick: e => { e.stopPropagation(); NX.ui.dropdown(e.currentTarget, txnMenu(t), { right: true }); } })
      ]);
    }

    function transactions(cur) {
      const all = store().transactions.all().slice().sort((a, b) => new Date(b.date) - new Date(a.date));
      const wrap = h('div');
      let q = '', catF = '', typeF = '', accF = '';
      const bar = NX.components.filterBar([
        { type: 'search', placeholder: 'Search transactions…', width: 240, onInput: v => { q = v.toLowerCase(); draw(); } },
        { type: 'select', options: [{ value: '', label: 'All categories' }].concat(store().categories.all().map(c => ({ value: c.id, label: c.name }))), onChange: v => { catF = v; draw(); } },
        { type: 'select', options: [{ value: '', label: 'Income & expenses' }, { value: 'income', label: 'Income only' }, { value: 'expense', label: 'Expenses only' }], onChange: v => { typeF = v; draw(); } },
        { type: 'select', options: [{ value: '', label: 'All accounts' }].concat(store().accounts.all().map(a => ({ value: a.id, label: a.name }))), onChange: v => { accF = v; draw(); } },
        { type: 'spacer' },
        { type: 'text', text: '' }
      ]);
      wrap.appendChild(bar);
      const listBox = h('div');
      wrap.appendChild(listBox);
      draw();
      function draw() {
        NX.clear(listBox);
        let list = all;
        if (q) list = list.filter(t => (t.description || '').toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q));
        if (catF) list = list.filter(t => t.categoryId === catF);
        if (typeF) list = list.filter(t => (t.amount >= 0 ? 'income' : 'expense') === typeF);
        if (accF) list = list.filter(t => t.accountId === accF);
        listBox.appendChild(h('div.small.muted', { style: { marginBottom: '8px' } },
          `${list.length} transactions · net ${cur}${NX.fmtNum(NX.sum(list.map(t => t.amount)), 2)} · in ${cur}${NX.fmtNum(NX.sum(list.filter(t => t.amount > 0).map(t => t.amount)), 2)} · out ${cur}${NX.fmtNum(NX.sum(list.filter(t => t.amount < 0).map(t => -t.amount)), 2)}`));
        if (!list.length) { listBox.appendChild(NX.ui.emptyState('money', 'No transactions', 'Add one to start tracking.')); return; }
        const card = h('div.card.pad-0');
        let lastMonth = null;
        list.forEach(t => {
          const mk = NX.fmtDate(t.date, 'medium').split(',')[0] + ' ' + new Date(t.date).getFullYear();
          if (mk !== lastMonth) {
            lastMonth = mk;
            const monthTx = list.filter(x => NX.fmtDate(x.date, 'medium').split(',')[0] + ' ' + new Date(x.date).getFullYear() === mk);
            card.appendChild(h('div.task-group-head', { style: { position: 'static' } }, [
              h('span', mk), h('div.grow'),
              h('span.small', { style: { color: 'var(--acc-grn)' } }, '+' + cur + NX.fmtNum(NX.sum(monthTx.filter(x => x.amount > 0).map(x => x.amount)), 0)),
              h('span.small', { style: { color: 'var(--acc-red)' } }, '−' + cur + NX.fmtNum(NX.sum(monthTx.filter(x => x.amount < 0).map(x => -x.amount)), 0))
            ]));
          }
          card.appendChild(txnRow(t, cur));
        });
        listBox.appendChild(card);
      }
      return wrap;
    }

    function budgets(cur) {
      const wrap = h('div');
      wrap.appendChild(h('div.row', { style: { marginBottom: '12px' } }, [monthNav(), h('div.grow'),
        h('button.btn.sm.subtle', { onclick: () => setBudgets() }, 'Set budgets')]));
      const cats = store().categories.all().filter(c => c.type === 'expense');
      const byCat = sel().spendByCategory(monthOffset);
      const map = new Map(byCat.map(x => [x.categoryId, x]));
      const grid = h('div.grid.grid-auto');
      cats.forEach(c => {
        const spent = (map.get(c.id) || {}).amount || 0;
        const budget = c.budget || 0;
        const pct = budget ? Math.round(spent / budget * 100) : 0;
        const left = budget - spent;
        grid.appendChild(h('div.card.pad-sm', { style: { borderTop: '3px solid ' + c.color } }, [
          h('div.row', { style: { marginBottom: '8px' } }, [
            h('span', { style: { fontSize: '17px' } }, c.icon || '•'),
            h('b.small.grow', c.name),
            budget ? h('span.chip' + (pct > 100 ? '.chip-red' : pct > 80 ? '.chip-org' : '.chip-grn'), pct + '%') : h('span.chip.chip-gry', 'no budget')
          ]),
          h('div.row', { style: { justifyContent: 'space-between', marginBottom: '5px' } }, [
            h('span.small.muted', cur + NX.fmtNum(spent, 0) + ' spent'),
            h('b.small', budget ? cur + NX.fmtNum(budget, 0) : '—')
          ]),
          h('div.progress' + (pct > 100 ? '.red' : pct > 80 ? '.org' : '.grn'), h('i', { style: { width: Math.min(100, pct) + '%' } })),
          budget ? h('div.small', { style: { marginTop: '6px', color: left >= 0 ? 'var(--acc-grn)' : 'var(--acc-red)' } },
            left >= 0 ? `${cur}${NX.fmtNum(left, 0)} left` : `${cur}${NX.fmtNum(-left, 0)} over`) : null,
          h('div.row', { style: { marginTop: '9px', gap: '5px' } }, [
            h('button.btn.xs.ghost', { onclick: () => setBudgets(c.id) }, 'Set budget'),
            h('button.btn.xs.ghost', { onclick: () => { tab = 'transactions'; NX.router.render(); } }, 'View spending')
          ])
        ]));
      });
      wrap.appendChild(grid);
      const totalBudget = NX.sum(cats.map(c => c.budget || 0));
      const totalSpent = NX.sum(byCat.map(c => c.amount));
      wrap.appendChild(h('div.card', { style: { marginTop: 'var(--sp-4)', background: 'var(--bg-sunken)' } }, [
        h('div.row', { style: { justifyContent: 'space-between', marginBottom: '6px' } }, [
          h('b', 'Total budget'), h('b', `${cur}${NX.fmtNum(totalSpent, 0)} / ${cur}${NX.fmtNum(totalBudget, 0)}`)]),
        h('div.progress.thick' + (totalSpent > totalBudget ? '.red' : ''), h('i', { style: { width: Math.min(100, totalBudget ? totalSpent / totalBudget * 100 : 0) + '%' } })),
        h('div.small.muted', { style: { marginTop: '7px' } }, totalBudget ? (totalSpent > totalBudget ? `You are ${cur}${NX.fmtNum(totalSpent - totalBudget, 0)} over for the month.` : `${cur}${NX.fmtNum(totalBudget - totalSpent, 0)} left to spend.`) : 'No budgets set yet.')
      ]));
      return wrap;
    }

    function setBudgets(catId) {
      const cats = store().categories.all().filter(c => c.type === 'expense');
      NX.ui.form({
        title: catId ? 'Set budget' : 'Set monthly budgets', wide: !catId, okLabel: 'Save',
        fields: (catId ? cats.filter(c => c.id === catId) : cats).map(c => ({
          key: c.id, label: `${c.icon || ''} ${c.name}`, type: 'number', value: c.budget || 0, min: 0, step: '10'
        }))
      }).then(r => {
        if (!r) return;
        Object.keys(r).forEach(id => store().categories.update(id, { budget: Number(r[id]) || 0 }, true));
        store().touch(); store().emit('categories');
        NX.ui.closeTopModal(); NX.router.render();
        NX.ui.toast({ type: 'success', message: 'Budgets saved' });
      });
    }

    function accounts(cur) {
      const wrap = h('div');
      wrap.appendChild(h('div.row', { style: { marginBottom: '12px' } }, [
        h('div.grow'), h('button.btn.sm.primary', { onclick: () => addAccount() }, '+ Add account')
      ]));
      const grid = h('div.grid.grid-auto');
      store().accounts.all().forEach(a => {
        const txs = store().transactions.all().filter(t => t.accountId === a.id);
        grid.appendChild(h('div.card', { style: { borderTop: '3px solid ' + (a.color || '#7c6cff') } }, [
          h('div.row', { style: { marginBottom: '8px' } }, [
            h('div.grow', [h('b', a.name), h('div.small.muted', [a.institution, a.type].filter(Boolean).join(' · '))]),
            h('button.icon-btn', { html: iconHTML('more', 15), onclick: e => NX.ui.dropdown(e.currentTarget, [
              { icon: 'edit', label: 'Edit account…', onClick: () => editAccount(a.id) },
              { icon: 'plus', label: 'Add a transaction', onClick: () => NX.actions.newTransaction() },
              { icon: 'archive', label: a.archived ? 'Unarchive' : 'Archive', onClick: () => { store().accounts.update(a.id, { archived: !a.archived }); NX.router.render(); } },
              { icon: 'trash', label: 'Delete account', danger: true, onClick: async () => { if (await NX.ui.confirmDelete(a.name)) { store().accounts.remove(a.id); NX.router.render(); } } }
            ], { right: true }) })
          ]),
          h('div', { style: { fontSize: '27px', fontWeight: '700', letterSpacing: '-1px', color: a.balance < 0 ? 'var(--acc-red)' : 'inherit' } }, cur + NX.fmtNum(a.balance, 2)),
          a.limit ? h('div.small.muted', { style: { marginTop: '3px' } }, `${Math.round(Math.abs(a.balance) / a.limit * 100)}% of ${cur}${NX.fmtNum(a.limit, 0)} limit`) : null,
          a.limit ? h('div.progress.thin', { style: { marginTop: '6px' } }, h('i', { style: { width: Math.min(100, Math.abs(a.balance) / a.limit * 100) + '%', background: Math.abs(a.balance) / a.limit > 0.7 ? 'var(--acc-red)' : a.color } })) : null,
          h('div.divider', { style: { margin: '11px 0' } }),
          NX.ui.kv('Transactions', String(txs.length)),
          NX.ui.kv('This month', cur + NX.fmtNum(NX.sum(txs.filter(t => { const d = new Date(t.date); const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }).map(t => t.amount)), 2))
        ]));
      });
      wrap.appendChild(grid);
      return wrap;
    }

    function insights(cur) {
      const wrap = h('div');
      const all = store().transactions.all();
      const expenses = all.filter(t => t.amount < 0);
      // monthly trend
      const months = [];
      for (let m = 11; m >= 0; m--) {
        const t = sel().monthTotals(-m);
        months.push({ label: NX.MONTHS_S[new Date(NX.addMonths(new Date(), -m)).getMonth()], value: Math.round(t.expense) });
      }
      wrap.appendChild(h('div.card', { style: { marginBottom: 'var(--sp-4)' } }, [
        h('div.card-head', [h('h3', 'Spending trend — 12 months')]),
        NX.ui.barChart(months, { height: '150px', format: v => cur + NX.fmtNum(v, 0) })
      ]));
      // recurring
      const recurring = all.filter(t => t.recurring);
      const byDesc = new Map();
      recurring.forEach(t => { const k = t.description; if (!byDesc.has(k)) byDesc.set(k, []); byDesc.get(k).push(t); });
      const subs = Array.from(byDesc.entries()).filter(([k, v]) => v.length >= 2 && v[0].amount < 0)
        .map(([k, v]) => ({ name: k, amount: Math.abs(v[0].amount), count: v.length })).sort((a, b) => b.amount - a.amount);
      if (subs.length) {
        wrap.appendChild(h('div.card', { style: { marginBottom: 'var(--sp-4)' } }, [
          h('div.card-head', [h('h3', 'Recurring charges detected'), h('div.grow'), h('span.small.muted', `${cur}${NX.fmtNum(NX.sum(subs.map(s => s.amount)), 2)}/month total`)]),
          h('div', subs.slice(0, 12).map(s => h('div.list-row', [
            h('div.lr-main', [h('div.lr-title', s.name), h('div.lr-sub', `seen ${s.count} times · ${cur}${NX.fmtNum(s.amount * 12, 0)}/year`)]),
            h('b', { style: { color: 'var(--acc-red)' } }, cur + NX.fmtNum(s.amount, 2))
          ])))
        ]));
      }
      // biggest expenses
      const biggest = expenses.slice().sort((a, b) => a.amount - b.amount).slice(0, 10);
      wrap.appendChild(h('div.grid.grid-2', [
        h('div.card', [h('div.card-head', [h('h3', 'Largest single expenses')]),
          h('div', biggest.map(t => h('div.list-row', [
            h('div.lr-main', [h('div.lr-title', t.description), h('div.lr-sub', NX.fmtDate(t.date, 'medium') + ' · ' + ((store().categories.find(t.categoryId) || {}).name || 'Uncategorised'))]),
            h('b', { style: { color: 'var(--acc-red)' } }, cur + NX.fmtNum(-t.amount, 2))
          ])))]),
        h('div.card', [h('div.card-head', [h('h3', 'Category trends')]),
          (() => {
            const cats = store().categories.all().filter(c => c.type === 'expense').slice(0, 6);
            return h('div', cats.map(c => {
              const last3 = [0, 1, 2].map(m => NX.sum(sel().monthTransactions(-m).filter(t => t.categoryId === c.id && t.amount < 0).map(t => -t.amount)));
              const trend = last3[2] - last3[0];
              return h('div', { style: { marginBottom: '11px' } }, [
                h('div.row', { style: { justifyContent: 'space-between', marginBottom: '3px' } }, [
                  h('span.small', `${c.icon || ''} ${c.name}`),
                  h('span.small', { style: { color: trend > 0 ? 'var(--acc-red)' : 'var(--acc-grn)' } }, `${trend > 0 ? '↑' : '↓'} ${cur}${NX.fmtNum(Math.abs(trend), 0)} over 3mo`)
                ]),
                NX.ui.sparkline(last3, 200, 26, c.color)
              ]);
            }));
          })()])
      ]));
      // AI observations
      wrap.appendChild(h('div.card', { style: { marginTop: 'var(--sp-4)', background: 'var(--sel)' } }, [
        h('div.card-head', [h('span', { html: iconHTML('sparkle', 16), style: { display: 'flex', color: 'var(--acc-pur)' } }), h('h3', 'What the numbers say')]),
        h('div', { id: 'finInsight' }, h('p.small.muted', 'Loading…'))
      ]));
      setTimeout(async () => {
        const items = NX.aiEngine.insights().filter(i => i.link === '#/finance');
        const el = document.getElementById('finInsight');
        if (!el) return;
        NX.clear(el);
        if (!items.length) { el.appendChild(h('p.small.muted', 'No budget warnings right now.')); return; }
        items.forEach(i => el.appendChild(h('div', { style: { padding: '5px 0', fontSize: '12.8px' } }, [h('b', i.title), h('div.muted', i.text)])));
      }, 30);
      return wrap;
    }

    async function addAccount() {
      const a = await NX.ui.form({
        title: 'New account', okLabel: 'Create',
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'institution', label: 'Institution', type: 'text' },
          { key: 'type', label: 'Type', type: 'select', options: ['checking', 'savings', 'credit', 'investment', 'cash', 'other'], value: 'checking' },
          { key: 'balance', label: 'Current balance', type: 'number', step: '0.01', value: 0 },
          { key: 'limit', label: 'Credit limit (if any)', type: 'number', step: '100' },
          { key: 'color', label: 'Colour', type: 'color', value: NX.colorFromString(String(Math.random())) }
        ]
      });
      if (!a) return;
      store().accounts.create({ name: a.name, institution: a.institution || '', type: a.type, balance: Number(a.balance) || 0, limit: Number(a.limit) || 0, currency: store().getSetting('currency', 'USD'), color: a.color, archived: false });
      NX.router.render();
    }
    async function editAccount(id) {
      const a = store().accounts.find(id);
      const r = await NX.ui.form({
        title: 'Edit account', okLabel: 'Save',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: a.name, required: true },
          { key: 'institution', label: 'Institution', type: 'text', value: a.institution || '' },
          { key: 'type', label: 'Type', type: 'select', value: a.type, options: ['checking', 'savings', 'credit', 'investment', 'cash', 'other'] },
          { key: 'balance', label: 'Balance', type: 'number', step: '0.01', value: a.balance },
          { key: 'limit', label: 'Credit limit', type: 'number', step: '100', value: a.limit || '' },
          { key: 'color', label: 'Colour', type: 'color', value: a.color }
        ]
      });
      if (!r) return;
      store().accounts.update(id, { name: r.name, institution: r.institution, type: r.type, balance: Number(r.balance) || 0, limit: Number(r.limit) || 0, color: r.color });
      NX.router.render();
    }

    async function editTxn(id) {
      const t = store().transactions.find(id);
      const r = await NX.ui.form({
        title: 'Edit transaction', wide: true, okLabel: 'Save',
        fields: [
          { key: 'description', label: 'Description', type: 'text', value: t.description, required: true, full: true },
          { key: 'amount', label: 'Amount', type: 'number', step: '0.01', value: t.amount, required: true, hint: 'Negative = money out' },
          { key: 'date', label: 'Date', type: 'date', value: t.date },
          { key: 'categoryId', label: 'Category', type: 'select', value: t.categoryId || '', options: [{ value: '', label: '— none —' }].concat(store().categories.all().map(c => ({ value: c.id, label: `${c.icon || '•'} ${c.name}` }))) },
          { key: 'accountId', label: 'Account', type: 'select', value: t.accountId || '', options: [{ value: '', label: '— none —' }].concat(store().accounts.all().map(a => ({ value: a.id, label: a.name }))) },
          { key: 'recurring', label: 'Recurring', type: 'checkbox', value: !!t.recurring },
          { key: 'note', label: 'Note', type: 'textarea', value: t.note || '', rows: 2, full: true }
        ]
      });
      if (!r) return;
      const oldAmt = t.amount, oldAcc = t.accountId;
      store().transactions.update(id, { description: r.description, amount: Number(r.amount), date: r.date, categoryId: r.categoryId || null, accountId: r.accountId || null, recurring: !!r.recurring, note: r.note, type: Number(r.amount) >= 0 ? 'income' : 'expense' });
      if (oldAcc) { const a = store().accounts.find(oldAcc); if (a) store().accounts.update(oldAcc, { balance: a.balance - oldAmt }, true); }
      if (r.accountId) { const a = store().accounts.find(r.accountId); if (a) store().accounts.update(r.accountId, { balance: a.balance + Number(r.amount) }, true); }
      store().touch();
      NX.router.render();
    }

    function txnMenu(t) {
      return [
        { icon: 'edit', label: 'Edit…', onClick: () => editTxn(t.id) },
        { icon: 'copy', label: 'Duplicate', onClick: () => { const c = NX.deepClone(t); delete c.id; c.date = NX.todayStr(); store().transactions.create(c); NX.router.render(); } },
        { icon: 'repeat', label: t.recurring ? 'Mark as one-off' : 'Mark as recurring', onClick: () => { store().transactions.update(t.id, { recurring: !t.recurring }); NX.router.render(); } },
        '-',
        { icon: 'trash', label: 'Delete', danger: true, onClick: async () => {
            if (await NX.ui.confirmDelete('this transaction')) {
              if (t.accountId) { const a = store().accounts.find(t.accountId); if (a) store().accounts.update(t.accountId, { balance: a.balance - t.amount }, true); }
              store().transactions.remove(t.id); NX.router.render();
            }
          } }
      ];
    }

    function exportCSV() {
      const head = ['Date', 'Description', 'Amount', 'Category', 'Account', 'Type', 'Recurring', 'Note'];
      const rows = store().transactions.all().slice().sort((a, b) => new Date(b.date) - new Date(a.date)).map(t => [
        t.date, t.description, t.amount, (store().categories.find(t.categoryId) || {}).name || '', (store().accounts.find(t.accountId) || {}).name || '',
        t.amount >= 0 ? 'income' : 'expense', t.recurring ? 'yes' : 'no', t.note || ''
      ]);
      NX.download(`nexadesk-finance-${NX.todayStr()}.csv`, NX.md.toCSV([head].concat(rows)), 'text/csv');
      NX.ui.toast({ type: 'success', message: `${rows.length} transactions exported` });
    }

    NX.router.register({
      id: 'finance', name: 'Finance', icon: 'money', group: 'life', order: 63,
      render,
      commands: () => [
        { label: 'Finance: add a transaction', icon: 'plus', run: () => NX.actions.newTransaction() },
        { label: 'Finance: set budgets', icon: 'chart', run: () => { tab = 'budgets'; NX.localStore.set('nexadesk.finTab', tab); NX.router.render(); } },
        { label: 'Finance: export CSV', icon: 'download', run: exportCSV }
      ]
    });
  })();

  /* =====================================================================
     INBOX
     ===================================================================== */
  (function () {
    let filter = 'all';
    function render() {
      const all = store().inbox.all().slice().sort((a, b) => new Date(b.created) - new Date(a.created));
      const unread = all.filter(i => !i.read);
      const page = h('div.page');
      page.appendChild(NX.components.pageHead({
        icon: 'inbox', title: 'Inbox',
        sub: `${unread.length} unread of ${all.length} · reminders, due tasks, chat mentions, AI insights and budget alerts all land here`,
        actions: [
          h('button.btn.sm.primary', { onclick: () => { all.forEach(i => store().inbox.update(i.id, { read: true }, true)); store().touch(); store().emit('inbox'); NX.router.render(); NX.ui.toast({ type: 'success', message: 'Inbox cleared' }); } }, 'Mark all read'),
          h('button.btn.sm.ghost', { onclick: async () => { if (await NX.ui.confirm({ title: 'Clear the inbox?', message: 'This removes every notification. Your actual data is untouched.', confirmLabel: 'Clear', danger: true })) { all.forEach(i => store().inbox.remove(i.id, true)); store().touch(); store().emit('inbox'); NX.router.render(); } } }, 'Clear all')
        ]
      }));
      page.appendChild(NX.components.filterBar([
        { type: 'seg', value: filter, onChange: v => { filter = v; NX.router.render(); }, options: [
          { value: 'all', label: `All (${all.length})` }, { value: 'unread', label: `Unread (${unread.length})` },
          { value: 'reminder', label: 'Reminders' }, { value: 'task', label: 'Tasks' }, { value: 'chat', label: 'Chat' },
          { value: 'ai', label: 'AI' }, { value: 'finance', label: 'Finance' }
        ] }
      ]));
      let list = all;
      if (filter === 'unread') list = unread;
      else if (filter !== 'all') list = all.filter(i => i.type === filter);
      if (!list.length) { page.appendChild(NX.ui.emptyState('inbox', 'Inbox zero', filter === 'all' ? 'Nothing needs your attention. That is the point of having an inbox.' : 'Nothing in this filter.')); return page; }
      const card = h('div.card.pad-0');
      list.forEach(i => {
        const color = { high: 'var(--acc-red)', normal: 'var(--brand-1)', low: 'var(--tx-4)' }[i.priority] || 'var(--brand-1)';
        card.appendChild(h('div.inbox-item' + (i.read ? '' : '.unread'), {
          onclick: () => { store().inbox.update(i.id, { read: true }, true); store().touch(); store().emit('inbox'); if (i.deepLink) NX.router.navigate(i.deepLink); else NX.router.render(); }
        }, [
          h('div.ib-dot', { style: { background: i.read ? 'transparent' : color } }),
          h('div', { style: { width: '30px', height: '30px', borderRadius: '9px', display: 'grid', placeItems: 'center', background: 'var(--bg-active)', color, flex: '0 0 auto' }, html: iconHTML(i.icon || 'bell', 15) }),
          h('div.grow', { style: { minWidth: '0' } }, [
            h('div', { style: { fontSize: '13.2px', fontWeight: i.read ? '500' : '650' } }, i.title),
            i.body ? h('div.small.muted', { style: { marginTop: '2px', lineHeight: '1.5' } }, i.body) : null
          ]),
          h('span.tiny.muted.nowrap', { style: { flex: '0 0 auto' } }, NX.relTime(i.created)),
          h('button.icon-btn', { html: iconHTML('x', 14), title: 'Dismiss', onclick: e => { e.stopPropagation(); store().inbox.remove(i.id, true); store().touch(); store().emit('inbox'); NX.router.render(); } })
        ]));
      });
      page.appendChild(card);
      return page;
    }

    NX.router.register({
      id: 'inbox', name: 'Inbox', icon: 'inbox', group: 'system', order: 70,
      badge: () => sel().unreadInbox().length,
      badgeCount: 'unreadInbox',
      render,
      commands: () => [{ label: 'Inbox: mark all read', icon: 'check', run: () => { store().inbox.all().forEach(i => store().inbox.update(i.id, { read: true }, true)); store().touch(); store().emit('inbox'); NX.router.render(); } }]
    });
  })();
})(window.NX);
