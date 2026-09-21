/* ============================================================
   Pebble — mod-wiki.js : knowledge base + interactive graph
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, esc, iconHTML } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  let currentId = null;
  let view = NX.localStore.get('nexadesk.wikiView', 'page');  // page | graph | index | orphan

  function render(params) {
    if (params && params.id) currentId = params.id;
    if (params && params.view) view = params.view;
    else view = NX.localStore.get('nexadesk.wikiView', view) || 'page';
    if (!currentId || !store().wiki.find(currentId)) currentId = (store().wiki.all()[0] || {}).id || null;

    const page = h('div.page.wide', { style: { padding: '18px 24px 60px' } });
    page.appendChild(NX.components.pageHead({
      icon: 'wiki', title: 'Wiki',
      sub: `${store().wiki.count()} pages · ${sel().noteLinks().filter(l => l.kind === 'wiki').length} internal links · ${orphanCount()} orphaned`,
      actions: [
        h('button.btn.sm.primary', { html: iconHTML('plus', 13) + ' New page', onclick: () => NX.actions.newWikiPage() }),
        h('div.seg', ['page', 'graph', 'index', 'orphan'].map(v =>
          h('button' + (view === v ? '.on' : ''), { onclick: () => { view = v; NX.localStore.set('nexadesk.wikiView', v); NX.router.render(); } },
            v === 'page' ? 'Reader' : v === 'graph' ? 'Graph' : v === 'index' ? 'Index' : 'Orphans')))
      ]
    }));
    if (view === 'graph') { page.appendChild(graphView()); return page; }
    if (view === 'index') { page.appendChild(indexView()); return page; }
    if (view === 'orphan') { page.appendChild(orphanView()); return page; }
    const layout = h('div.wiki-layout', { style: { height: 'auto', minHeight: '560px' } });
    layout.appendChild(sideNav());
    layout.appendChild(h('div.wiki-content', currentId ? reader(currentId) : NX.ui.emptyState('book', 'No page selected', 'Pick a page from the left, or create one.')));
    page.appendChild(layout);
    return page;
  }

  function orphanCount() {
    const linked = new Set();
    sel().noteLinks().forEach(l => { if (l.toId) linked.add(l.toId); });
    return store().wiki.all().filter(p => !linked.has(p.id) && !(p.links || []).length).length;
  }

  /* ---------------- side nav ---------------- */
  function sideNav() {
    const side = h('div.wiki-side');
    side.appendChild(h('div', { style: { marginBottom: '9px' } }, h('input.input.sm', { id: 'wikiSearch', placeholder: 'Filter pages…', oninput: NX.debounce(e => {
      const q = e.target.value.toLowerCase();
      NX.$$('#wikiList .sb-item').forEach(el => { el.style.display = !q || el.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    }, 140) })));
    const list = h('div', { id: 'wikiList' });
    const pages = store().wiki.all().slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    // group by first tag
    const byTag = new Map();
    pages.forEach(p => { const k = (p.tags || [])[0] || 'Ungrouped'; if (!byTag.has(k)) byTag.set(k, []); byTag.get(k).push(p); });
    Array.from(byTag.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([tag, items]) => {
      list.appendChild(h('div.sb-group-head', { style: { marginTop: '8px' } }, [h('span', { html: iconHTML('tag', 11), style: { display: 'flex' } }), h('span', '#' + tag), h('span.count', String(items.length))]));
      items.forEach(p => {
        const backlinks = sel().noteLinks().filter(l => l.toId === p.id).length;
        list.appendChild(h('button.sb-item' + (p.id === currentId ? '.active' : ''), {
          onclick: () => { currentId = p.id; NX.router.go('wiki', { id: p.id }); }
        }, [
          h('span.ico', { html: iconHTML('book', 14) }),
          h('span.lbl', p.title),
          backlinks ? h('span.meta', '↰' + backlinks) : null
        ]));
      });
    });
    side.appendChild(list);
    side.appendChild(h('div.divider', { style: { margin: '12px 0' } }));
    side.appendChild(h('button.btn.sm.subtle', { style: { width: '100%' }, onclick: () => { view = 'graph'; NX.localStore.set('nexadesk.wikiView', 'graph'); NX.router.render(); } }, '🕸️ Knowledge graph'));
    return side;
  }

  /* ---------------- reader ---------------- */
  function reader(id) {
    const p = store().wiki.find(id);
    if (!p) return NX.ui.emptyState('book', 'Page not found');
    store().wiki.patchSilent(id, { views: (p.views || 0) + 1 });
    const body = h('div.wiki-body');

    body.appendChild(h('div.row-wrap', { style: { gap: '6px', marginBottom: '10px' } }, [
      h('h1', { style: { fontSize: '28px', letterSpacing: '-.7px', flex: '1 1 auto' } }, p.title),
      h('button.btn.sm.ghost', { html: iconHTML('edit', 13) + ' Edit', onclick: () => editPage(p.id) }),
      h('button.btn.sm.ghost', { html: iconHTML('more', 13), onclick: e => NX.ui.dropdown(e.currentTarget, menu(p), { right: true }) })
    ]));
    body.appendChild(h('div.note-meta', [
      h('span.nm-item', `Edited ${NX.relTime(p.updated)}`),
      h('span.nm-item', `${String(p.body || '').split(/\s+/).filter(Boolean).length} words`),
      h('span.nm-item', `${p.views || 0} views`),
      (p.tags || []).map(t => h('span.nm-item.clickable', { onclick: () => { const inp = document.getElementById('wikiSearch'); if (inp) { inp.value = t; inp.dispatchEvent(new Event('input')); } } }, '#' + t))
    ]));

    // rendered markdown with working [[links]]
    const rendered = h('div.md-preview', { html: renderWikiBody(p.body) });
    body.appendChild(rendered);
    rendered.addEventListener('click', e => {
      const wl = e.target.closest('.wikilink');
      if (wl) {
        const title = wl.dataset.title;
        const target = store().wiki.all().find(x => (x.title || '').toLowerCase() === String(title).toLowerCase()) ||
                       store().notes.all().find(x => (x.title || '').toLowerCase() === String(title).toLowerCase());
        if (target) {
          if (store().wiki.find(target.id)) { currentId = target.id; NX.router.go('wiki', { id: target.id }); }
          else NX.router.go('notes', { id: target.id });
        } else {
          NX.ui.confirm({ title: 'Page does not exist', message: `Create “${title}”?`, confirmLabel: 'Create', danger: false }).then(ok => {
            if (!ok) return;
            const np = store().wiki.create({ title, slug: NX.slug(title), body: `# ${title}\n\n`, tags: [], parentId: null, order: store().wiki.count(), views: 0, links: [], public: false, archived: false });
            recomputeLinks();
            currentId = np.id; NX.router.go('wiki', { id: np.id });
          });
        }
      }
    });

    // outgoing links
    const outgoing = extractWikiLinks(p.body);
    if (outgoing.length) {
      body.appendChild(h('div.backlinks', [
        h('h4', `Links to ${outgoing.length} page${outgoing.length === 1 ? '' : 's'}`),
        h('div', outgoing.map(t => {
          const target = store().wiki.all().find(x => (x.title || '').toLowerCase() === t.toLowerCase());
          return h('div.bl-item', { onclick: () => target && (currentId = target.id, NX.router.go('wiki', { id: target.id })) }, [
            h('span', { html: iconHTML(target ? 'link' : 'plus', 13), style: { color: target ? 'var(--brand-1)' : 'var(--acc-org)', marginTop: '2px', display: 'flex' } }),
            h('div.grow', [h('div.bl-t', t), h('div.bl-c', target ? 'Wiki page' : 'Does not exist yet — click to create')])
          ]);
        }))
      ]));
    }

    // backlinks
    const bl = sel().noteLinks().filter(l => l.toId === p.id);
    if (bl.length) {
      body.appendChild(h('div.backlinks', [
        h('h4', `${bl.length} page${bl.length === 1 ? '' : 's'} link here`),
        h('div', bl.map(l => h('div.bl-item', {
          onclick: () => l.kind === 'wiki' ? (currentId = l.fromId, NX.router.go('wiki', { id: l.fromId })) : NX.router.go('notes', { id: l.fromId })
        }, [
          h('span', { html: iconHTML(l.kind === 'wiki' ? 'book' : 'note', 13), style: { color: 'var(--tx-4)', marginTop: '2px', display: 'flex' } }),
          h('div.grow', [h('div.bl-t', l.fromTitle || 'Untitled'), h('div.bl-c', l.kind === 'wiki' ? 'Wiki page' : 'Note')])
        ])))
      ]));
    }

    // AI tools
    body.appendChild(h('div.card', { style: { marginTop: '26px', background: 'var(--bg-sunken)' } }, [
      h('div.card-head', [h('span', { html: iconHTML('sparkle', 16), style: { display: 'flex', color: 'var(--acc-pur)' } }), h('h3', 'AI tools for this page')]),
      h('div.row-wrap', { style: { gap: '6px' } }, [
        h('button.btn.sm.subtle', { onclick: async () => { const t = NX.ui.toast({ type: 'info', message: 'Summarising…', duration: 0 }); const r = await NX.ai.features.summarize(p.body); t.close(); NX.ui.modal({ title: 'Summary', size: 'wide', body: h('div.md-preview', { html: NX.ai.renderMarkdown(r.text) }), footer: [h('div.grow'), h('button.btn.primary', { onclick: () => { store().wiki.update(p.id, { body: '> **TL;DR** ' + r.text.replace(/\n+/g, ' ') + '\n\n' + p.body }); NX.ui.closeTopModal(); NX.router.render(); } }, 'Prepend to page')] }); } }, '✨ Summarise'),
        h('button.btn.sm.subtle', { onclick: suggestTagsForPage }, '🏷️ Suggest tags'),
        h('button.btn.sm.subtle', { onclick: async () => { const t = NX.ui.toast({ type: 'info', message: 'Expanding…', duration: 0 }); const r = await NX.ai.features.expand(p.body); t.close(); showDiff(p.body, r.text, txt => { store().wiki.update(p.id, { body: txt }); NX.router.render(); }); } }, '📈 Expand'),
        h('button.btn.sm.subtle', { onclick: () => checkBrokenLinks(p) }, '🔗 Check links'),
        h('button.btn.sm.subtle', { onclick: () => { const r = NX.aiEngine.readability(p.body); const s = NX.aiEngine.sentiment(p.body); NX.ui.modal({ title: 'Page analysis', body: h('div.card.pad-sm', { style: { background: 'var(--bg-sunken)' } }, [NX.ui.kv('Words', String(r.words)), NX.ui.kv('Read time', r.readMinutes + ' min'), NX.ui.kv('Readability', `${r.flesch} · ${r.level}`), NX.ui.kv('Grade level', String(r.grade)), NX.ui.kv('Avg sentence', r.avgSentence + ' words'), NX.ui.kv('Tone', s.emoji + ' ' + s.label), NX.ui.kv('Long sentences', String(r.longSentences))]) }); } }, '📊 Analyse')
      ])
    ]));

    return body;
  }

  function renderWikiBody(md) {
    let s = NX.ai.renderMarkdown(md || '');
    // tables
    s = s.replace(/((?:^\|.*\|\s*\n)+)/gm, (block) => {
      const lines = block.trim().split('\n').filter(l => /^\|/.test(l));
      if (lines.length < 2) return block;
      const rows = lines.filter(l => !/^\|[\s:|-]+\|$/.test(l)).map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      if (!rows.length) return block;
      const head = rows[0], body = rows.slice(1);
      return '<table><thead><tr>' + head.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>' +
        body.map(r => '<tr>' + head.map((_, i) => `<td>${r[i] || ''}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
    });
    // task lists
    s = s.replace(/<li class="todo done">(.*?)<\/li>/g, '<li style="list-style:none;margin-left:-18px">☑ <s style="opacity:.65">$1</s></li>');
    s = s.replace(/<li class="todo">(.*?)<\/li>/g, '<li style="list-style:none;margin-left:-18px">☐ $1</li>');
    return s;
  }

  function extractWikiLinks(body) {
    const out = [];
    const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    let m;
    while ((m = re.exec(body || ''))) if (!out.includes(m[1].trim())) out.push(m[1].trim());
    return out;
  }

  function recomputeLinks() {
    store().wiki.all().forEach(p => store().wiki.patchSilent(p.id, {
      links: sel().noteLinks().filter(l => l.fromId === p.id && l.toId).map(l => l.toId)
    }));
  }

  async function suggestTagsForPage() {
    const p = store().wiki.find(currentId);
    if (!p) return;
    const r = await NX.ai.features.suggestTags(p.body || p.title);
    if (!r.tags.length) { NX.ui.toast({ type: 'info', message: 'No tag suggestions' }); return; }
    NX.ui.modal({
      title: 'Suggested tags', subtitle: r.source === 'api' ? 'via AI' : 'via offline analysis', size: 'narrow', hideFooter: true,
      body: h('div.row-wrap', { style: { gap: '7px' } }, r.tags.map(t => h('button.chip.clickable', {
        style: { fontSize: '12.5px', padding: '4px 12px' },
        onclick: e => {
          const tags = NX.unique((p.tags || []).concat([t.name]));
          store().wiki.update(p.id, { tags });
          e.currentTarget.classList.add('on');
          NX.ui.toast({ message: 'Tagged #' + t.name, duration: 1500 });
          NX.router.render();
        }
      }, t.name)))
    });
  }

  /** Side-by-side before/after preview used by the AI writing tools */
  function showDiff(before, after, onApply) {
    NX.ui.modal({
      title: 'Review the change', size: 'wide',
      body: h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' } }, [
        h('div', [
          h('div.small.muted', { style: { marginBottom: '6px', fontWeight: '600' } }, 'BEFORE'),
          h('div.md-preview', { style: { maxHeight: '46vh', overflow: 'auto', background: 'var(--bg-sunken)', padding: '12px', borderRadius: '8px', border: '1px solid var(--bd)', fontSize: '12.5px' }, html: renderWikiBody(before) })
        ]),
        h('div', [
          h('div.small.muted', { style: { marginBottom: '6px', fontWeight: '600' } }, 'AFTER'),
          h('div.md-preview', { style: { maxHeight: '46vh', overflow: 'auto', background: 'var(--sel)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(124,108,255,.3)', fontSize: '12.5px' }, html: renderWikiBody(after) })
        ])
      ]),
      footer: [
        h('span.small.muted.grow', `${before.split(/\s+/).filter(Boolean).length} → ${after.split(/\s+/).filter(Boolean).length} words`),
        h('button.btn.ghost', { onclick: () => NX.copyText(after).then(() => NX.ui.toast({ message: 'Copied', duration: 1400 })) }, 'Copy'),
        h('button.btn.primary', { onclick: () => { NX.ui.closeTopModal(); onApply(after); } }, 'Replace page')
      ]
    });
  }

  function checkBrokenLinks(p) {
    const links = extractWikiLinks(p.body);
    const broken = links.filter(t => !store().wiki.all().some(x => (x.title || '').toLowerCase() === t.toLowerCase()) &&
                                     !store().notes.all().some(x => (x.title || '').toLowerCase() === t.toLowerCase()));
    NX.ui.modal({
      title: 'Link check — ' + p.title, size: '', hideFooter: true,
      body: h('div', [
        h('p.small.muted', { style: { marginBottom: '10px' } }, `${links.length} link${links.length === 1 ? '' : 's'} · ${broken.length} broken`),
        links.length ? h('div.list', links.map(t => {
          const ok = !broken.includes(t);
          return h('div.list-row', [
            h('span', { html: iconHTML(ok ? 'check' : 'warn', 14), style: { color: ok ? 'var(--acc-grn)' : 'var(--acc-red)', display: 'flex' } }),
            h('div.lr-main', [h('div.lr-title', t), h('div.lr-sub', ok ? 'Resolves' : 'No page with this title')]),
            !ok ? h('button.btn.xs.primary', { onclick: () => { const np = store().wiki.create({ title: t, slug: NX.slug(t), body: `# ${t}\n\n`, tags: [], parentId: null, order: store().wiki.count(), views: 0, links: [], public: false, archived: false }); recomputeLinks(); NX.ui.closeTopModal(); currentId = np.id; NX.router.go('wiki', { id: np.id }); } }, 'Create') : null
          ]);
        })) : h('p.small.muted', 'This page has no internal links. Linking pages is what makes a wiki a wiki.')
      ])
    });
  }

  async function editPage(id) {
    const p = store().wiki.find(id);
    const ta = h('textarea.textarea', { rows: 26, spellcheck: 'false', style: { fontFamily: 'var(--font-mono)', fontSize: '12.8px', lineHeight: '1.7' } });
    ta.value = p.body || '';
    const titleInp = h('input.input', { value: p.title, style: { fontSize: '16px', fontWeight: '600' } });
    const tagsInp = h('input.input', { value: (p.tags || []).join(', '), placeholder: 'comma separated' });
    const preview = h('div.md-preview', { html: renderWikiBody(p.body) });
    const m = NX.ui.modal({
      title: 'Edit page', size: 'xwide',
      body: h('div', [
        h('div.field', { style: { marginBottom: '10px' } }, [h('label', 'Title'), titleInp]),
        h('div.field', { style: { marginBottom: '10px' } }, [h('label', 'Tags'), tagsInp]),
        h('div.row', { style: { marginBottom: '6px', gap: '6px' } }, [
          h('span.small.muted.grow', 'Markdown. Link other pages with [[Page Title]].'),
          h('button.btn.xs.ghost', { onclick: () => { ta.value = ta.value.slice(0, ta.selectionStart) + '[[' + ta.value.slice(ta.selectionStart, ta.selectionEnd) + ']]' + ta.value.slice(ta.selectionEnd); ta.focus(); } }, '[[link]]'),
          h('button.btn.xs.ghost', { onclick: () => { const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + '\n## \n' + ta.value.slice(s); ta.focus(); } }, '## heading'),
          h('button.btn.xs.ghost', { onclick: () => { const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + '\n- \n' + ta.value.slice(s); ta.focus(); } }, '- bullet'),
          h('button.btn.xs.ghost', { onclick: () => { const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + '\n| a | b |\n|---|---|\n| 1 | 2 |\n' + ta.value.slice(s); ta.focus(); } }, 'table'),
          h('button.btn.xs.ghost', { onclick: async () => { const t = NX.ui.toast({ type: 'info', message: 'AI improving…', duration: 0 }); const r = await NX.ai.features.improve(ta.value); t.close(); ta.value = r.text; preview.innerHTML = renderWikiBody(r.text); } }, '✨ Improve')
        ]),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' } }, [ta, h('div', { style: { maxHeight: '52vh', overflow: 'auto', border: '1px solid var(--bd)', borderRadius: '9px', padding: '14px', background: 'var(--bg-sunken)' } }, preview)])
      ]),
      footer: [
        h('span.small.muted.grow', { id: 'wikiWordCount' }),
        h('button.btn.ghost', { onclick: () => NX.copyText(ta.value) }, 'Copy'),
        h('button.btn.primary', { onclick: () => {
          store().wiki.update(id, {
            title: titleInp.value.trim() || p.title,
            slug: NX.slug(titleInp.value.trim() || p.title),
            body: ta.value,
            tags: tagsInp.value.split(',').map(x => x.trim()).filter(Boolean)
          });
          recomputeLinks();
          NX.ui.closeTopModal(); NX.router.render();
          NX.ui.toast({ type: 'success', message: 'Page saved' });
        } }, 'Save page')
      ]
    });
    const updateCount = () => { const el = document.getElementById('wikiWordCount'); if (el) el.textContent = ta.value.trim().split(/\s+/).filter(Boolean).length + ' words'; };
    ta.addEventListener('input', NX.debounce(() => { preview.innerHTML = renderWikiBody(ta.value); updateCount(); }, 300));
    updateCount();
    setTimeout(() => ta.focus(), 50);
  }

  function menu(p) {
    return [
      { icon: 'edit', label: 'Edit page', onClick: () => editPage(p.id) },
      { icon: 'copy', label: 'Duplicate', onClick: () => { const c = NX.deepClone(p); delete c.id; c.title = p.title + ' (copy)'; c.slug = NX.slug(c.title); const np = store().wiki.create(c); currentId = np.id; NX.router.go('wiki', { id: np.id }); } },
      { icon: 'note', label: 'Convert to a note', onClick: () => {
          const n = store().notes.create({ title: p.title, icon: '📖', emoji: '📖', tags: [], parentId: null, order: 0, favorite: false, archived: false, properties: [], blocks: NX.md.markdownToBlocks(p.body) });
          NX.ui.toast({ type: 'success', message: 'Converted to a note', duration: 4000, actions: [{ label: 'Open', onClick: () => NX.router.go('notes', { id: n.id }) }] });
        } },
      { icon: 'download', label: 'Export as Markdown', onClick: () => { NX.download(NX.slug(p.title) + '.md', `# ${p.title}\n\n${p.body}`, 'text/markdown'); } },
      { icon: 'link', label: 'Copy wiki link', onClick: () => NX.copyText(`[[${p.title}]]`).then(() => NX.ui.toast({ message: 'Copied [[' + p.title + ']]', duration: 1600 })) },
      { icon: 'link', label: 'Check links', onClick: () => checkBrokenLinks(p) },
      '-',
      { icon: 'trash', label: 'Delete page', danger: true, onClick: async () => { if (await NX.ui.confirmDelete(`“${p.title}”`)) { store().wiki.remove(p.id); recomputeLinks(); currentId = null; NX.router.render(); } } }
    ];
  }

  /* =====================================================================
     KNOWLEDGE GRAPH — force-directed, rendered in SVG
     ===================================================================== */
  function graphView() {
    const wrap = h('div');
    wrap.appendChild(h('div.card.pad-sm', { style: { background: 'var(--sel)', marginBottom: '12px' } }, [
      h('div.row-wrap', { style: { gap: '10px' } }, [
        h('b.small', 'Knowledge graph'),
        h('span.small.muted', 'Nodes are wiki pages and notes. Edges are [[links]] and note nesting. Drag to rearrange, click to open, scroll to zoom.'),
        h('div.grow'),
        h('label.checkbox', [h('input', { type: 'checkbox', id: 'gNotes', checked: true, onchange: () => build() }), h('span', 'Include notes')]),
        h('label.checkbox', [h('input', { type: 'checkbox', id: 'gOrphans', onchange: () => build() }), h('span', 'Hide orphans')]),
        h('button.btn.xs.ghost', { onclick: () => build() }, 'Re-run layout')
      ])
    ]));
    const container = h('div.graph-wrap', { id: 'graphWrap' });
    wrap.appendChild(container);
    setTimeout(() => build(), 30);

    let transform = { x: 0, y: 0, k: 1 };
    let sim = null;

    function build() {
      const includeNotes = document.getElementById('gNotes') ? document.getElementById('gNotes').checked : true;
      const hideOrphans = document.getElementById('gOrphans') ? document.getElementById('gOrphans').checked : false;
      const W = container.clientWidth || 900, H = container.clientHeight || 460;
      NX.clear(container);

      // nodes
      const nodes = [];
      const idMap = new Map();
      store().wiki.all().forEach(p => { const n = { id: p.id, label: p.title, kind: 'wiki', size: 6 + Math.min(8, (p.views || 0) / 3), color: '#7c6cff', x: W / 2 + (Math.random() - .5) * W * .6, y: H / 2 + (Math.random() - .5) * H * .6, vx: 0, vy: 0 }; nodes.push(n); idMap.set(p.id, n); });
      if (includeNotes) store().notes.all().filter(x => !x.archived).forEach(nt => { const n = { id: nt.id, label: nt.title || 'Untitled', kind: 'note', size: 4 + Math.min(6, sel().noteWordCount(nt) / 260), color: nt.favorite ? '#e3c14a' : '#4aa8e8', x: W / 2 + (Math.random() - .5) * W * .6, y: H / 2 + (Math.random() - .5) * H * .6, vx: 0, vy: 0 }; nodes.push(n); idMap.set(nt.id, n); });

      // edges
      const links = [];
      sel().noteLinks().forEach(l => {
        const a = idMap.get(l.fromId), b = l.toId ? idMap.get(l.toId) : null;
        if (a && b) links.push({ s: a, t: b, kind: 'link' });
        else if (a && !b && l.toTitle) links.push({ s: a, t: null, missing: l.toTitle });
      });
      if (includeNotes) store().notes.all().forEach(nt => {
        if (nt.parentId && idMap.has(nt.parentId) && idMap.has(nt.id)) links.push({ s: idMap.get(nt.parentId), t: idMap.get(nt.id), kind: 'parent' });
      });
      // shared tags create soft edges
      const byTag = new Map();
      if (includeNotes) store().notes.all().forEach(nt => (nt.tags || []).forEach(t => { if (!byTag.has(t)) byTag.set(t, []); byTag.get(t).push(nt.id); }));
      byTag.forEach(ids => { if (ids.length > 1 && ids.length <= 8) for (let i = 1; i < ids.length; i++) { const a = idMap.get(ids[0]), b = idMap.get(ids[i]); if (a && b) links.push({ s: a, t: b, kind: 'tag', weak: true }); } });

      const connected = new Set();
      links.forEach(l => { if (l.s && l.t) { connected.add(l.s.id); connected.add(l.t.id); } });
      const finalNodes = hideOrphans ? nodes.filter(n => connected.has(n.id)) : nodes;
      const finalSet = new Set(finalNodes.map(n => n.id));
      const finalLinks = links.filter(l => l.s && l.t && finalSet.has(l.s.id) && finalSet.has(l.t.id));

      const degree = new Map();
      finalLinks.forEach(l => { degree.set(l.s.id, (degree.get(l.s.id) || 0) + 1); degree.set(l.t.id, (degree.get(l.t.id) || 0) + 1); });
      finalNodes.forEach(n => n.size = n.size + Math.min(7, (degree.get(n.id) || 0) * 1.3));

      if (!finalNodes.length) { container.appendChild(NX.ui.emptyState('wiki', 'Nothing to graph', 'Create some pages and link them with [[double brackets]].')); return; }

      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const gRoot = document.createElementNS(NS, 'g');
      svg.appendChild(gRoot);
      const gLinks = document.createElementNS(NS, 'g'), gNodes = document.createElementNS(NS, 'g');
      gRoot.append(gLinks, gNodes);
      container.appendChild(svg);

      const linkEls = finalLinks.map(l => {
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('class', 'g-link');
        line.setAttribute('stroke', l.kind === 'parent' ? 'var(--acc-yel)' : l.weak ? 'var(--bd)' : 'var(--bd-strong)');
        line.setAttribute('stroke-opacity', l.weak ? '.28' : '.6');
        line.setAttribute('stroke-dasharray', l.weak ? '2 3' : 'none');
        gLinks.appendChild(line);
        return { l, el: line };
      });

      const nodeEls = finalNodes.map(n => {
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'g-node');
        g.style.cursor = 'pointer';
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('r', n.size);
        c.setAttribute('fill', n.color);
        c.setAttribute('fill-opacity', n.kind === 'wiki' ? '.92' : '.68');
        c.setAttribute('stroke', 'var(--bg)');
        c.setAttribute('stroke-width', '1.5');
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dy', -n.size - 5);
        t.textContent = n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label;
        t.style.opacity = n.size > 8 ? '1' : '.55';
        g.append(c, t);
        gNodes.appendChild(g);
        g.addEventListener('click', () => {
          if (n.kind === 'wiki') { currentId = n.id; view = 'page'; NX.localStore.set('nexadesk.wikiView', 'page'); NX.router.go('wiki', { id: n.id }); }
          else NX.router.go('notes', { id: n.id });
        });
        g.addEventListener('mouseenter', () => {
          c.setAttribute('stroke', 'var(--brand-1)'); c.setAttribute('stroke-width', '3');
          t.style.opacity = '1'; t.style.fontWeight = '700';
          linkEls.forEach(({ l, el }) => { if (l.s === n || l.t === n) { el.setAttribute('stroke', 'var(--brand-1)'); el.setAttribute('stroke-opacity', '.95'); } });
        });
        g.addEventListener('mouseleave', () => {
          c.setAttribute('stroke', 'var(--bg)'); c.setAttribute('stroke-width', '1.5');
          t.style.opacity = n.size > 8 ? '1' : '.55'; t.style.fontWeight = '';
          linkEls.forEach(({ l, el }) => { el.setAttribute('stroke', l.kind === 'parent' ? 'var(--acc-yel)' : l.weak ? 'var(--bd)' : 'var(--bd-strong)'); el.setAttribute('stroke-opacity', l.weak ? '.28' : '.6'); });
        });
        // drag
        let dragging = false;
        g.addEventListener('mousedown', e => {
          dragging = true; e.stopPropagation();
          const move = ev => {
            const r = svg.getBoundingClientRect();
            n.x = (ev.clientX - r.left - transform.x) / transform.k;
            n.y = (ev.clientY - r.top - transform.y) / transform.k;
            n.vx = n.vy = 0;
            draw();
          };
          const up = () => { dragging = false; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
          document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
        });
        return { n, g, c, t, dragging: () => dragging };
      });

      // zoom & pan
      svg.addEventListener('wheel', e => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const r = svg.getBoundingClientRect();
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        transform.x = mx - (mx - transform.x) * factor;
        transform.y = my - (my - transform.y) * factor;
        transform.k = NX.clamp(transform.k * factor, 0.25, 4);
        applyTransform();
      }, { passive: false });
      let panning = false, px = 0, py = 0;
      svg.addEventListener('mousedown', e => { panning = true; px = e.clientX - transform.x; py = e.clientY - transform.y; });
      svg.addEventListener('mousemove', e => { if (!panning) return; transform.x = e.clientX - px; transform.y = e.clientY - py; applyTransform(); });
      document.addEventListener('mouseup', () => panning = false);
      function applyTransform() { gRoot.setAttribute('transform', `translate(${transform.x},${transform.y}) scale(${transform.k})`); }

      // force simulation
      let iter = 0;
      const LINK_DIST = 92, REPULSE = 2600;
      function step() {
        // repulsion
        for (let i = 0; i < finalNodes.length; i++) {
          const a = finalNodes[i];
          for (let j = i + 1; j < finalNodes.length; j++) {
            const b = finalNodes[j];
            let dx = b.x - a.x, dy = b.y - a.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) { dx = (Math.random() - .5); dy = (Math.random() - .5); d2 = 1; }
            const d = Math.sqrt(d2);
            if (d > 420) continue;
            const f = REPULSE / d2;
            const fx = (dx / d) * f, fy = (dy / d) * f;
            a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
          }
        }
        // springs
        finalLinks.forEach(l => {
          const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y;
          const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const target = l.weak ? LINK_DIST * 1.6 : LINK_DIST;
          const f = (d - target) * (l.weak ? 0.008 : 0.022);
          const fx = (dx / d) * f, fy = (dy / d) * f;
          l.s.vx += fx; l.s.vy += fy; l.t.vx -= fx; l.t.vy -= fy;
        });
        // gravity to centre
        finalNodes.forEach(n => {
          n.vx += (W / 2 - n.x) * 0.0042;
          n.vy += (H / 2 - n.y) * 0.0042;
          n.vx *= 0.86; n.vy *= 0.86;
          n.x = NX.clamp(n.x + n.vx, 24, W - 24);
          n.y = NX.clamp(n.y + n.vy, 24, H - 24);
        });
      }
      function draw() {
        linkEls.forEach(({ l, el }) => { el.setAttribute('x1', l.s.x); el.setAttribute('y1', l.s.y); el.setAttribute('x2', l.t.x); el.setAttribute('y2', l.t.y); });
        nodeEls.forEach(({ n, g }) => g.setAttribute('transform', `translate(${n.x},${n.y})`));
      }
      if (sim) clearInterval(sim);
      let frames = 0;
      sim = setInterval(() => {
        if (NX.router.currentId() !== 'wiki' || view !== 'graph') { clearInterval(sim); sim = null; return; }
        step(); draw();
        if (++frames > 320) { clearInterval(sim); sim = null; }
      }, 26);
      draw();

      // legend
      container.appendChild(h('div', { style: { position: 'absolute', left: '12px', bottom: '12px', background: 'var(--bg-card)', border: '1px solid var(--bd)', borderRadius: '9px', padding: '8px 11px', fontSize: '11px' } }, [
        h('div.row', { style: { gap: '6px', marginBottom: '3px' } }, [h('span', { style: { width: '9px', height: '9px', borderRadius: '99px', background: '#7c6cff', display: 'inline-block' } }), 'Wiki page']),
        h('div.row', { style: { gap: '6px', marginBottom: '3px' } }, [h('span', { style: { width: '9px', height: '9px', borderRadius: '99px', background: '#4aa8e8', display: 'inline-block' } }), 'Note']),
        h('div.row', { style: { gap: '6px', marginBottom: '3px' } }, [h('span', { style: { width: '9px', height: '9px', borderRadius: '99px', background: '#e3c14a', display: 'inline-block' } }), 'Favourite note']),
        h('div.tiny.muted', { style: { marginTop: '5px' } }, `${finalNodes.length} nodes · ${finalLinks.length} edges`)
      ]));
    }
    return wrap;
  }

  /* ---------------- index ---------------- */
  function indexView() {
    const pages = store().wiki.all().slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    const wrap = h('div');
    const alpha = new Map();
    pages.forEach(p => { const k = (p.title || '?')[0].toUpperCase(); if (!alpha.has(k)) alpha.set(k, []); alpha.get(k).push(p); });
    Array.from(alpha.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([letter, items]) => {
      wrap.appendChild(h('div.task-group-head', [h('span', letter), h('span.tgh-count', String(items.length))]));
      wrap.appendChild(h('div.grid.grid-auto', items.map(p => {
        const bl = sel().noteLinks().filter(l => l.toId === p.id).length;
        const out = extractWikiLinks(p.body).length;
        return h('button.card.hoverable.pad-sm', { style: { textAlign: 'left', cursor: 'pointer' }, onclick: () => { currentId = p.id; view = 'page'; NX.localStore.set('nexadesk.wikiView', 'page'); NX.router.go('wiki', { id: p.id }); } }, [
          h('div.row', [h('span', { html: iconHTML('book', 15), style: { color: 'var(--brand-1)', display: 'flex' } }), h('b.small.grow.nowrap', p.title)]),
          h('div.small.muted', { style: { marginTop: '5px', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, NX.md.stripInline(String(p.body || '')).slice(0, 140)),
          h('div.row-wrap', { style: { gap: '5px', marginTop: '8px' } }, [
            h('span.chip', '↰ ' + bl + ' in'), h('span.chip', '→ ' + out + ' out'),
            h('span.chip', String(p.body || '').split(/\s+/).filter(Boolean).length + ' words'),
            ...(p.tags || []).slice(0, 2).map(t => h('span.tag', '#' + t))
          ])
        ]);
      })));
    });
    return wrap;
  }

  /* ---------------- orphans ---------------- */
  function orphanView() {
    const linked = new Set();
    sel().noteLinks().forEach(l => { if (l.toId) linked.add(l.toId); });
    const orphans = store().wiki.all().filter(p => !linked.has(p.id) && !(p.links || []).length);
    const wrap = h('div');
    wrap.appendChild(h('div.card.pad-sm', { style: { background: orphans.length ? 'var(--acc-org-bg)' : 'var(--acc-grn-bg)', marginBottom: '14px' } },
      h('div.small', orphans.length
        ? `${orphans.length} page${orphans.length === 1 ? '' : 's'} nothing links to. Orphaned pages are how institutional knowledge gets lost — link them from somewhere, or delete them.`
        : 'Every page is connected. Nothing is orphaned.')));
    if (!orphans.length) return wrap;
    wrap.appendChild(h('div.grid.grid-auto', orphans.map(p => h('div.card.pad-sm', [
      h('div.row', [h('b.small.grow.nowrap', p.title), h('button.btn.xs.ghost', { onclick: () => { currentId = p.id; view = 'page'; NX.localStore.set('nexadesk.wikiView', 'page'); NX.router.go('wiki', { id: p.id }); } }, 'Open')]),
      h('div.small.muted', { style: { marginTop: '5px' } }, NX.md.stripInline(String(p.body || '')).slice(0, 110)),
      h('div.row-wrap', { style: { gap: '5px', marginTop: '9px' } }, [
        h('button.btn.xs.subtle', { onclick: () => linkSuggestion(p) }, '🔗 Find a home'),
        h('button.btn.xs.ghost', { onclick: () => editPage(p.id) }, 'Edit')
      ])
    ]))));
    return wrap;
  }

  function linkSuggestion(p) {
    // find pages whose content mentions this title, or that share vocabulary
    const candidates = store().wiki.all().filter(x => x.id !== p.id).map(x => {
      let score = 0;
      if ((x.body || '').includes(p.title)) score += 6;
      const a = new Set(NX.aiEngine.keywords(p.body, 14).map(k => k.word));
      const b = new Set(NX.aiEngine.keywords(x.body, 14).map(k => k.word));
      let shared = 0; a.forEach(w => { if (b.has(w)) shared++; });
      score += shared * 0.7;
      (p.tags || []).forEach(t => { if ((x.tags || []).includes(t)) score += 2.5; });
      return { page: x, score: Math.round(score * 10) / 10, shared };
    }).filter(x => x.score > 1).sort((a, b) => b.score - a.score).slice(0, 6);

    NX.ui.modal({
      title: `Where should “${p.title}” live?`, size: '',
      body: candidates.length ? h('div.list', candidates.map(c => h('div.list-row', [
        h('div.lr-main', [h('div.lr-title', c.page.title), h('div.lr-sub', `${c.shared} shared terms · score ${c.score}`)]),
        h('button.btn.xs.primary', { onclick: () => {
          store().wiki.update(c.page.id, { body: (c.page.body || '') + `\n\nSee also: [[${p.title}]].` });
          recomputeLinks(); NX.ui.closeTopModal(); NX.router.render();
          NX.ui.toast({ type: 'success', message: `Linked from “${c.page.title}”` });
        } }, 'Link from here')
      ]))) : h('p.small.muted', 'No good candidates found. Consider whether this page is still needed.'),
      hideFooter: true
    });
  }

  NX.router.register({
    id: 'wiki', name: 'Wiki', icon: 'wiki', group: 'knowledge', order: 24,
    render,
    sidebarItems: () => [
      { label: 'Knowledge graph', icon: 'globe', count: null, go: () => { view = 'graph'; NX.localStore.set('nexadesk.wikiView', 'graph'); NX.router.navigate('#/wiki'); } },
      { label: 'Page index', icon: 'list', count: store().wiki.count(), go: () => { view = 'index'; NX.localStore.set('nexadesk.wikiView', 'index'); NX.router.navigate('#/wiki'); } },
      { label: 'Orphaned pages', icon: 'link', count: orphanCount(), go: () => { view = 'orphan'; NX.localStore.set('nexadesk.wikiView', 'orphan'); NX.router.navigate('#/wiki'); } }
    ],
    commands: () => [
      { label: 'Wiki: new page', icon: 'plus', run: () => NX.actions.newWikiPage() },
      { label: 'Wiki: knowledge graph', icon: 'globe', run: () => { view = 'graph'; NX.localStore.set('nexadesk.wikiView', 'graph'); NX.router.render(); } },
      { label: 'Wiki: find orphaned pages', icon: 'link', run: () => { view = 'orphan'; NX.localStore.set('nexadesk.wikiView', 'orphan'); NX.router.render(); } },
      { label: 'Wiki: export all pages as Markdown', icon: 'download', run: () => {
          const txt = store().wiki.all().map(p => `\n\n<!-- ${p.title} -->\n\n# ${p.title}\n\n${p.body}`).join('\n');
          NX.download(`nexadesk-wiki-${NX.todayStr()}.md`, txt, 'text/markdown');
          NX.ui.toast({ type: 'success', message: `${store().wiki.count()} pages exported` });
        } }
    ]
  });
})(window.NX);
