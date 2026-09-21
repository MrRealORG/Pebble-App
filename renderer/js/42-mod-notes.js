/* ============================================================
   Pebble — mod-notes.js : block editor, tree, database view,
   properties, backlinks, version history, AI tools
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, esc, iconHTML, icon } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  let openNoteId = null;
  let viewMode = NX.localStore.get('nexadesk.notesView', 'doc');   // doc | db | md
  let showTree = NX.localStore.get('nexadesk.notesTree', true);
  let expanded = new Set(NX.localStore.get('nexadesk.notesExpanded', []));
  let editorCleanup = null;
  let versions = [];
  let sortState = NX.localStore.get('nexadesk.notesSort', { key: 'updated', dir: -1 });
  let dbFilter = '';

  /* =====================================================================
     MODULE RENDER
     ===================================================================== */
  function render(params) {
    if (params && params.id) openNoteId = params.id;
    // re-read the view mode each render so it stays in sync after a reload/import
    viewMode = NX.localStore.get('nexadesk.notesView', viewMode) || 'doc';
    if (!openNoteId || !store().notes.find(openNoteId)) {
      const first = sel().recentNotes(1)[0];
      openNoteId = first ? first.id : null;
    }

    if (viewMode === 'db') return renderDatabase();

    const wrap = h('div.notes-layout' + (showTree ? '' : '.no-tree'));
    wrap.appendChild(showTree ? renderTree() : h('div'));
    const mainCol = h('div.note-main-col');
    mainCol.appendChild(renderToolbar());
    const bodyRow = h('div.note-body-row');
    bodyRow.appendChild(h('div.note-scroll', { id: 'noteScroll' }, openNoteId ? renderEditor(openNoteId) : emptyState()));
    if (openNoteId && innerWidth > 1280) bodyRow.appendChild(renderSidePanel(openNoteId));
    mainCol.appendChild(bodyRow);
    wrap.appendChild(mainCol);
    return wrap;
  }

  function emptyState() {
    return h('div.page', NX.ui.emptyState('note', 'No note selected',
      'Create a note, or pick one from the tree on the left. Notes support blocks, nesting, backlinks, templates and a full markdown round-trip.',
      'New note', () => NX.actions.newNote()));
  }

  /* =====================================================================
     TREE
     ===================================================================== */
  function renderTree() {
    const tree = h('div.notes-tree');
    tree.appendChild(h('div.nt-head', [
      h('span.small.strong', 'Notes'),
      h('span.badge-count', String(store().notes.all().filter(n => !n.archived).length)),
      h('div.grow'),
      h('button.icon-btn', { html: iconHTML('plus', 15), title: 'New note', onclick: () => NX.actions.newNote() }),
      h('button.icon-btn', { html: iconHTML('more', 15), title: 'More', onclick: e => NX.ui.dropdown(e.currentTarget, [
        { icon: 'table', label: 'Database view', onClick: () => { viewMode = 'db'; persistView(); } },
        { icon: 'note', label: 'Document view', onClick: () => { viewMode = 'doc'; persistView(); } },
        '-',
        { icon: 'star', label: 'Favourites only', onClick: () => { viewMode = 'db'; dbFilter = 'fav'; persistView(); } },
        { icon: 'archive', label: 'Archived notes', onClick: () => { viewMode = 'db'; dbFilter = 'archived'; persistView(); } },
        '-',
        { icon: 'download', label: 'Export all as Markdown', onClick: () => NX.actions.exportMarkdown() },
        { icon: 'upload', label: 'Import Markdown file…', onClick: () => NX.actions.importData() },
        { icon: 'sparkle', label: 'Suggest tags for open note', onClick: () => suggestTagsForOpen() }
      ], { right: true }) })
    ]));
    tree.appendChild(h('div.nt-filter', [
      h('input.input.sm', { id: 'noteTreeSearch', placeholder: 'Filter notes…', oninput: NX.debounce(e => filterTree(e.target.value), 160) }),
      h('div.row', { style: { gap: '4px' } }, [
        h('button.btn.xs.subtle', { onclick: () => expandAll(true) }, 'Expand all'),
        h('button.btn.xs.subtle', { onclick: () => expandAll(false) }, 'Collapse all'),
        h('div.grow'),
        h('button.btn.xs.ghost', { title: 'Sort tree', onclick: e => NX.ui.dropdown(e.currentTarget, [
          { label: 'Manual order', checked: treeSort === 'manual', onClick: () => { treeSort = 'manual'; NX.localStore.set('nexadesk.treeSort', treeSort); NX.router.render(); } },
          { label: 'Recently edited', checked: treeSort === 'updated', onClick: () => { treeSort = 'updated'; NX.localStore.set('nexadesk.treeSort', treeSort); NX.router.render(); } },
          { label: 'A → Z', checked: treeSort === 'alpha', onClick: () => { treeSort = 'alpha'; NX.localStore.set('nexadesk.treeSort', treeSort); NX.router.render(); } },
          { label: 'Created', checked: treeSort === 'created', onClick: () => { treeSort = 'created'; NX.localStore.set('nexadesk.treeSort', treeSort); NX.router.render(); } }
        ], { right: true }) }, 'Sort')
      ])
    ]));
    const body = h('div.nt-body', { id: 'noteTreeBody' });
    body.appendChild(renderNodes(null, 0));
    tree.appendChild(body);
    return tree;
  }

  let treeSort = NX.localStore.get('nexadesk.treeSort', 'manual');
  let treeQuery = '';

  function filterTree(q) {
    treeQuery = q.trim().toLowerCase();
    const body = document.getElementById('noteTreeBody');
    if (!body) return;
    NX.clear(body);
    if (treeQuery) {
      const matches = store().notes.all().filter(n => !n.archived &&
        (n.title || '').toLowerCase().includes(treeQuery) || sel().notePlain(n).toLowerCase().includes(treeQuery));
      if (!matches.length) { body.appendChild(h('p.small.muted', { style: { padding: '12px' } }, 'No matches')); return; }
      matches.slice(0, 60).forEach(n => body.appendChild(treeRow(n, 0, true)));
      return;
    }
    body.appendChild(renderNodes(null, 0));
  }

  function expandAll(open) {
    if (open) store().notes.all().forEach(n => expanded.add(n.id));
    else expanded.clear();
    NX.localStore.set('nexadesk.notesExpanded', Array.from(expanded));
    NX.router.render();
  }

  function renderNodes(parentId, depth) {
    const frag = h('div');
    let kids = sel().childNotes(parentId);
    if (treeSort === 'alpha') kids = kids.slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else if (treeSort === 'updated') kids = kids.slice().sort((a, b) => new Date(b.updated) - new Date(a.updated));
    else if (treeSort === 'created') kids = kids.slice().sort((a, b) => new Date(b.created) - new Date(a.created));
    else if (parentId === null) kids = kids.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.order || 0) - (b.order || 0));

    if (!kids.length && depth === 0) {
      frag.appendChild(h('div', { style: { padding: '14px 10px' } }, [
        h('p.small.muted', 'No notes yet.'),
        h('button.btn.sm.primary', { style: { marginTop: '8px' }, onclick: () => NX.actions.newNote() }, 'Create your first note')
      ]));
      return frag;
    }
    kids.forEach(n => frag.appendChild(renderNode(n, depth)));
    if (depth === 0) {
      frag.appendChild(h('button.sb-item', { style: { marginTop: '6px', color: 'var(--tx-4)' }, onclick: () => NX.actions.newNote() }, [
        h('span.ico', { html: iconHTML('plus', 14) }), h('span.lbl', 'New note')
      ]));
    }
    return frag;
  }

  function renderNode(n, depth) {
    const wrap = h('div.nt-node', { dataset: { note: n.id } });
    const kids = sel().childNotes(n.id);
    const isOpen = expanded.has(n.id);
    wrap.appendChild(treeRow(n, depth, false, kids.length > 0, isOpen));
    if (kids.length && isOpen) {
      const childWrap = h('div.nt-children');
      kids.forEach(k => childWrap.appendChild(renderNode(k, depth + 1)));
      wrap.appendChild(childWrap);
    }
    return wrap;
  }

  function treeRow(n, depth, flat, hasKids, isOpen) {
    const row = h('div.nt-row' + (openNoteId === n.id ? '.active' : ''), {
      draggable: 'true',
      style: flat ? null : { paddingLeft: (5 + depth * 2) + 'px' },
      onclick: e => { if (!e.target.closest('.nt-twisty') && !e.target.closest('button')) openNote(n.id); }
    });
    row.appendChild(h('button.nt-twisty' + (hasKids ? (isOpen ? '.open' : '') : '.leaf'), {
      html: iconHTML('chevR', 13),
      onclick: e => { e.stopPropagation(); if (expanded.has(n.id)) expanded.delete(n.id); else expanded.add(n.id); NX.localStore.set('nexadesk.notesExpanded', Array.from(expanded)); NX.router.render(); }
    }));
    row.appendChild(h('span.nt-emoji', n.icon || '📄'));
    row.appendChild(h('span.nt-title', n.title || 'Untitled'));
    if (n.pinned) row.appendChild(h('span.nt-fav', { html: iconHTML('pin', 11) }));
    if (n.favorite) row.appendChild(h('span.nt-fav', { html: iconHTML('star', 11) }));
    const kids = sel().childNotes(n.id).length;
    if (kids) row.appendChild(h('span.nt-count', String(kids)));
    row.appendChild(h('span.row-actions', [
      h('button', { html: iconHTML('plus', 13), title: 'Add sub-note', onclick: e => { e.stopPropagation(); NX.actions.newNote(n.id); } }),
      h('button', { html: iconHTML('more', 13), title: 'More', onclick: e => { e.stopPropagation(); NX.ui.dropdown(e.currentTarget, noteMenu(n), { right: true }); } })
    ]));
    NX.ui.bindMenu(row, () => noteMenu(n));

    // drag & drop to re-parent
    row.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/nexadesk-note', n.id);
      e.dataTransfer.effectAllowed = 'move';
      row.style.opacity = '.4';
    });
    row.addEventListener('dragend', () => { row.style.opacity = ''; NX.$$('.nt-drop').forEach(x => x.classList.remove('nt-drop')); });
    row.addEventListener('dragover', e => {
      if (!e.dataTransfer.types.includes('text/nexadesk-note')) return;
      e.preventDefault(); row.classList.add('nt-drop');
    });
    row.addEventListener('dragleave', () => row.classList.remove('nt-drop'));
    row.addEventListener('drop', e => {
      const id = e.dataTransfer.getData('text/nexadesk-note');
      row.classList.remove('nt-drop');
      if (!id || id === n.id) return;
      e.preventDefault(); e.stopPropagation();
      const moving = store().notes.find(id);
      if (!moving) return;
      // prevent cycles
      let p = n;
      while (p) { if (p.id === id) { NX.ui.toast({ type: 'error', message: 'Cannot move a note into its own descendant' }); return; } p = p.parentId ? store().notes.find(p.parentId) : null; }
      store().notes.update(id, { parentId: n.id, order: sel().childNotes(n.id).length });
      expanded.add(n.id);
      NX.localStore.set('nexadesk.notesExpanded', Array.from(expanded));
      NX.ui.toast({ type: 'success', message: `Moved “${moving.title || 'Untitled'}” into “${n.title || 'Untitled'}”` });
      NX.router.render();
    });
    return row;
  }

  function noteMenu(n) {
    return [
      { icon: 'eye', label: 'Open', onClick: () => openNote(n.id) },
      { icon: n.favorite ? 'starO' : 'star', label: n.favorite ? 'Remove from favourites' : 'Add to favourites', onClick: () => { store().notes.update(n.id, { favorite: !n.favorite }); NX.router.render(); } },
      { icon: 'pin', label: n.pinned ? 'Unpin' : 'Pin to top', onClick: () => { store().notes.update(n.id, { pinned: !n.pinned }); NX.router.render(); } },
      '-',
      { icon: 'plus', label: 'New sub-note', onClick: () => NX.actions.newNote(n.id) },
      { icon: 'copy', label: 'Duplicate', onClick: () => duplicateNote(n.id) },
      { icon: 'link', label: 'Copy link', onClick: () => NX.copyText(`[[${n.title}]]`).then(() => NX.ui.toast({ message: 'Copied [[' + n.title + ']]', duration: 1800 })) },
      { icon: 'download', label: 'Export as Markdown', onClick: () => {
          NX.download((NX.slug(n.title) || 'note') + '.md', NX.md.noteToMarkdown(n, { includeMeta: true, includeBacklinks: true }), 'text/markdown');
          NX.ui.toast({ type: 'success', message: 'Markdown downloaded' });
        } },
      { icon: 'sparkle', label: 'AI: suggest tags', onClick: async () => { const r = await NX.ai.features.suggestTags(sel().notePlain(n)); applySuggestedTags(n.id, r.tags, r.source); } },
      { icon: 'brain', label: 'AI: summarise', onClick: () => summarizeNote(n.id) },
      { icon: 'zap', label: 'AI: extract action items', onClick: () => extractActionsFromNote(n.id) },
      { icon: 'task', label: 'Create task from note', onClick: () => { store().tasks.create({ title: n.title, description: sel().notePlain(n).slice(0, 400), projectId: null, status: 'To Do', priority: 'Medium', due: null, repeat: null, tags: n.tags || [], checklist: [], estimate: 0, order: 0, done: false, archived: false }); NX.ui.toast({ type: 'success', message: 'Task created' }); } },
      '-',
      { header: 'Move to' },
      { icon: 'folder', label: 'Top level', onClick: () => { store().notes.update(n.id, { parentId: null }); NX.router.render(); } },
      ...store().notes.all().filter(x => x.id !== n.id && !x.archived).slice(0, 12).map(x => ({
        emoji: x.icon || '📄', label: x.title || 'Untitled',
        onClick: () => { store().notes.update(n.id, { parentId: x.id }); NX.ui.toast({ message: 'Moved', duration: 1500 }); NX.router.render(); }
      })),
      '-',
      { icon: 'archive', label: n.archived ? 'Unarchive' : 'Archive', onClick: () => { store().notes.update(n.id, { archived: !n.archived }); NX.ui.toast({ message: n.archived ? 'Restored' : 'Archived' }); NX.router.render(); } },
      { icon: 'trash', label: 'Delete note', danger: true, onClick: async () => {
          if (await NX.ui.confirmDelete('this note', `“${n.title || 'Untitled'}” and its ${sel().childNotes(n.id).length} sub-notes will move to the trash.`)) {
            deleteNoteTree(n.id);
            NX.ui.toast({ type: 'success', message: 'Moved to trash' });
            openNoteId = null;
            NX.router.render();
          }
        } }
    ];
  }

  function deleteNoteTree(id) {
    sel().childNotes(id).forEach(c => deleteNoteTree(c.id));
    store().notes.remove(id);
  }

  function duplicateNote(id) {
    const n = store().notes.find(id);
    if (!n) return;
    const copy = NX.deepClone(n);
    delete copy.id; delete copy.created; delete copy.updated;
    copy.title = (n.title || 'Untitled') + ' (copy)';
    const reId = (blocks) => (blocks || []).forEach(b => { b.id = NX.uid('b'); if (b.children) reId(b.children); });
    reId(copy.blocks);
    const created = store().notes.create(copy);
    NX.ui.toast({ type: 'success', message: 'Duplicated', duration: 2400, actions: [{ label: 'Open', onClick: () => openNote(created.id) }] });
  }

  function openNote(id) {
    openNoteId = id;
    NX.router.go('notes', { id });
  }

  /* =====================================================================
     TOOLBAR
     ===================================================================== */
  function renderToolbar() {
    const n = store().notes.find(openNoteId);
    const bar = h('div.note-toolbar');
    bar.appendChild(h('button.icon-btn', { html: iconHTML(showTree ? 'chevL' : 'chevR', 15), title: 'Toggle note tree', onclick: () => { showTree = !showTree; NX.localStore.set('nexadesk.notesTree', showTree); NX.router.render(); } }));
    bar.appendChild(h('div.tb-sep'));

    const fmt = (label, title, fn, check) => h('button.tb-btn' + (check && check() ? '.on' : ''), { title, onclick: fn, html: label });
    const wrapSel = (before, after) => () => withSelection(sel => before + sel + after);
    const linePrefix = p => () => withSelection(s => s.split('\n').map(l => p + l).join('\n'), true);

    bar.appendChild(fmt('<b>B</b>', 'Bold (Ctrl+B)', wrapSel('**', '**')));
    bar.appendChild(fmt('<i>I</i>', 'Italic (Ctrl+I)', wrapSel('*', '*')));
    bar.appendChild(fmt('<s>S</s>', 'Strikethrough', wrapSel('~~', '~~')));
    bar.appendChild(fmt('<u>U</u>', 'Underline-ish (highlight)', wrapSel('==', '==')));
    bar.appendChild(fmt('&lt;/&gt;', 'Inline code (Ctrl+E)', wrapSel('`', '`')));
    bar.appendChild(h('div.tb-sep'));
    bar.appendChild(fmt('H1', 'Heading 1 (Ctrl+Shift+1)', () => setFocusedBlockType('h1')));
    bar.appendChild(fmt('H2', 'Heading 2 (Ctrl+Shift+2)', () => setFocusedBlockType('h2')));
    bar.appendChild(fmt('H3', 'Heading 3 (Ctrl+Shift+3)', () => setFocusedBlockType('h3')));
    bar.appendChild(h('div.tb-sep'));
    bar.appendChild(fmt('•', 'Bullet list (Ctrl+Shift+8)', () => setFocusedBlockType('bullet')));
    bar.appendChild(fmt('1.', 'Numbered list (Ctrl+Shift+7)', () => setFocusedBlockType('number')));
    bar.appendChild(fmt('☑', 'To-do (Ctrl+Shift+9)', () => setFocusedBlockType('todo')));
    bar.appendChild(fmt('❝', 'Quote', () => setFocusedBlockType('quote')));
    bar.appendChild(fmt('💡', 'Callout', () => convertToCallout()));
    bar.appendChild(fmt('</>', 'Code block', () => setFocusedBlockType('code')));
    bar.appendChild(fmt('—', 'Divider', () => insertBlockAfterFocus(NX.md.newBlock('divider'))));
    bar.appendChild(h('div.tb-sep'));
    bar.appendChild(h('button.tb-btn', { title: 'Insert block (/)', html: iconHTML('plus', 15), onclick: e => openSlashMenu(e.currentTarget, null) }));
    bar.appendChild(h('button.tb-btn', { title: 'Link to note [[', html: iconHTML('link', 15), onclick: () => showLinkPicker() }));
    bar.appendChild(h('button.tb-btn', { title: 'Add emoji', html: iconHTML('smile', 15), onclick: e => NX.ui.emojiPicker(e.currentTarget, em => withSelection(s => s + em)) }));
    bar.appendChild(h('div.grow'));

    if (n) {
      bar.appendChild(h('button.tb-btn', { title: 'AI tools', html: iconHTML('sparkle', 15), onclick: e => aiMenu(e.currentTarget, n) }));
      bar.appendChild(h('button.tb-btn', { title: 'Version history', html: iconHTML('history', 15), onclick: () => showVersions(n.id) }));
      bar.appendChild(h('button.tb-btn', { title: 'More', html: iconHTML('more', 15), onclick: e => NX.ui.dropdown(e.currentTarget, noteMenu(n), { right: true }) }));
    }
    bar.appendChild(h('div.tb-sep'));
    bar.appendChild(h('div.seg', [
      h('button' + (viewMode === 'doc' ? '.on' : ''), { title: 'Document', onclick: () => { viewMode = 'doc'; persistView(); } }, 'Doc'),
      h('button' + (viewMode === 'db' ? '.on' : ''), { title: 'Database / table view', onclick: () => { viewMode = 'db'; persistView(); } }, 'Table'),
      h('button' + (viewMode === 'md' ? '.on' : ''), { title: 'Markdown source', onclick: () => { viewMode = 'md'; persistView(); } }, 'MD')
    ]));
    return bar;
  }

  function persistView() { NX.localStore.set('nexadesk.notesView', viewMode); NX.router.render(); }

  function aiMenu(anchor, n) {
    const text = sel().notePlain(n);
    NX.ui.dropdown(anchor, [
      { header: 'Transform selection or whole note' },
      { icon: 'sparkle', label: 'Summarise', onClick: () => summarizeNote(n.id) },
      { icon: 'edit', label: 'Improve writing', onClick: () => transformSelectionOrNote(n, 'improve') },
      { icon: 'minus', label: 'Make shorter', onClick: () => transformSelectionOrNote(n, 'shorten') },
      { icon: 'plus', label: 'Expand / elaborate', onClick: () => transformSelectionOrNote(n, 'expand') },
      { icon: 'task', label: 'Extract action items → tasks', onClick: () => extractActionsFromNote(n.id) },
      { icon: 'tag', label: 'Suggest tags', onClick: async () => { const r = await NX.ai.features.suggestTags(text); applySuggestedTags(n.id, r.tags, r.source); } },
      '-',
      { header: 'Change tone' },
      ...['professional', 'casual', 'concise', 'persuasive', 'friendly', 'formal'].map(t => ({
        label: t[0].toUpperCase() + t.slice(1), onClick: () => transformSelectionOrNote(n, 'tone', t)
      })),
      '-',
      { header: 'Translate' },
      ...['Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Portuguese', 'Hindi', 'Arabic'].map(l => ({
        label: l, onClick: () => transformSelectionOrNote(n, 'translate', l)
      })),
      '-',
      { icon: 'brain', label: 'Ask AI about this note…', onClick: () => askAboutNote(n.id) },
      { icon: 'wand', label: 'Generate title', onClick: async () => {
          const t = NX.aiEngine.suggestTitle(text);
          if (await NX.ui.confirm({ title: 'Suggested title', message: `“${t}”\n\nUse this as the note title?`, confirmLabel: 'Use it', danger: false })) { store().notes.update(n.id, { title: t }); NX.router.render(); }
        } },
      { icon: 'link', label: 'Find related notes', onClick: () => showRelated(n.id) }
    ], { right: true });
  }

  async function transformSelectionOrNote(n, kind, arg) {
    const ta = document.getElementById('noteTextareaSel');
    const selText = getEditorSelection();
    const source = selText.text || sel().notePlain(n);
    if (!source.trim()) { NX.ui.toast({ type: 'warn', message: 'Nothing to transform' }); return; }
    const toast = NX.ui.toast({ type: 'info', title: 'Working…', message: kind + (arg ? ' → ' + arg : ''), duration: 0 });
    try {
      let res;
      if (kind === 'improve') res = await NX.ai.features.improve(source);
      else if (kind === 'shorten') res = await NX.ai.features.shorten(source);
      else if (kind === 'expand') res = await NX.ai.features.expand(source);
      else if (kind === 'tone') res = await NX.ai.features.tone(source, arg);
      else if (kind === 'translate') res = await NX.ai.features.translate(source, arg);
      toast.close();
      showTransformPreview(source, res.text, res.source, (useText) => {
        if (selText.apply) selText.apply(useText);
        else {
          const blocks = NX.md.markdownToBlocks(useText);
          store().notes.update(n.id, { blocks });
          NX.router.render();
        }
        NX.ui.toast({ type: 'success', message: 'Applied' });
      }, res.note);
    } catch (e) {
      toast.close();
      NX.ui.toast({ type: 'error', message: String(e.message || e) });
    }
  }

  function showTransformPreview(before, after, source, onApply, note) {
    NX.ui.modal({
      title: (source === 'api' ? '✨ AI' : '⚙️ Offline engine') + ' result', size: 'wide',
      body: h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' } }, [
        h('div', [h('div.small.muted', { style: { marginBottom: '6px', fontWeight: '600' } }, 'BEFORE'),
          h('pre', { style: { whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '12.5px', background: 'var(--bg-sunken)', padding: '12px', borderRadius: '8px', border: '1px solid var(--bd)', maxHeight: '46vh', overflow: 'auto' } }, before)]),
        h('div', [h('div.small.muted', { style: { marginBottom: '6px', fontWeight: '600' } }, 'AFTER'),
          h('pre', { style: { whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '12.5px', background: 'var(--sel)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(124,108,255,.3)', maxHeight: '46vh', overflow: 'auto' } }, after)])
      ]),
      footer: [
        note ? h('span.small.muted.grow', note) : h('div.grow'),
        h('button.btn.ghost', { onclick: () => NX.copyText(after).then(() => NX.ui.toast({ message: 'Copied', duration: 1400 })) }, 'Copy'),
        h('button.btn.primary', { onclick: () => { NX.ui.closeTopModal(); onApply(after); } }, 'Replace')
      ]
    });
  }

  function getEditorSelection() {
    const blocks = NX.$$('.block-el[contenteditable]');
    for (const b of blocks) {
      const s = window.getSelection();
      if (s && s.rangeCount && b.contains(s.anchorNode)) {
        const text = String(s).trim();
        const blockId = b.closest('.block').dataset.block;
        if (text) return { text, apply: (newText) => replaceBlockText(blockId, newText) };
      }
    }
    return { text: '', apply: null };
  }

  function replaceBlockText(blockId, newText) {
    const n = store().notes.find(openNoteId);
    if (!n) return;
    const blocks = NX.deepClone(n.blocks);
    const walk = (list) => list.some(b => {
      if (b.id === blockId) { b.text = newText.replace(/\n/g, ' '); return true; }
      return b.children ? walk(b.children) : false;
    });
    walk(blocks);
    store().notes.update(n.id, { blocks });
    NX.router.render();
  }

  async function summarizeNote(id) {
    const n = store().notes.find(id);
    if (!n) return;
    const text = sel().notePlain(n);
    const t = NX.ui.toast({ type: 'info', message: 'Summarising…', duration: 0 });
    const r = await NX.ai.features.summarize(text);
    t.close();
    NX.ui.modal({
      title: 'Summary — ' + (n.title || 'Untitled'), size: 'wide',
      body: h('div', [
        h('div.small.muted', { style: { marginBottom: '8px' } }, (r.source === 'api' ? '✨ Generated by ' + NX.ai.providerInfo().name : '⚙️ Generated offline by the built-in engine')),
        h('div.md-preview', { html: NX.ai.renderMarkdown(r.text) })
      ]),
      footer: [
        h('div.grow'),
        h('button.btn.ghost', { onclick: () => NX.copyText(r.text).then(() => NX.ui.toast({ message: 'Copied', duration: 1400 })) }, 'Copy'),
        h('button.btn.primary', { onclick: () => {
            const blocks = NX.deepClone(n.blocks) || [];
            blocks.unshift(NX.md.newBlock('callout', { emoji: '🤖', variant: 'info', text: '**Summary** — ' + r.text.replace(/\n+/g, ' ') }));
            store().notes.update(n.id, { blocks });
            NX.ui.closeTopModal(); NX.router.render();
            NX.ui.toast({ type: 'success', message: 'Summary added to the top of the note' });
          } }, 'Insert at top')
      ]
    });
  }

  async function extractActionsFromNote(id) {
    const n = store().notes.find(id);
    if (!n) return;
    const t = NX.ui.toast({ type: 'info', message: 'Scanning for action items…', duration: 0 });
    const r = await NX.ai.features.extractTasks(sel().notePlain(n));
    t.close();
    if (!r.tasks.length) { NX.ui.toast({ type: 'warn', message: 'No action items found' }); return; }
    const chosen = new Set(r.tasks.map((_, i) => i));
    NX.ui.modal({
      title: `Found ${r.tasks.length} action item${r.tasks.length > 1 ? 's' : ''}`, subtitle: r.source === 'api' ? 'via AI' : 'via offline engine', size: 'wide',
      body: h('div', [
        h('p.small.muted', { style: { marginBottom: '10px' } }, 'Uncheck anything you do not want to turn into a task.'),
        h('div', r.tasks.map((a, i) => h('label.checkbox', { style: { display: 'flex', padding: '7px 0', borderBottom: '1px solid var(--bd)', alignItems: 'flex-start' } }, [
          h('input', { type: 'checkbox', checked: true, onchange: e => e.target.checked ? chosen.add(i) : chosen.delete(i), style: { marginTop: '2px' } }),
          h('div.grow', [
            h('div', { style: { fontSize: '13px' } }, a.title),
            h('div.small.muted', [a.priority !== 'Medium' ? a.priority + ' · ' : '', a.due ? 'due ' + NX.fmtDate(a.due, 'medium') : '', a.assignee ? ' · ' + a.assignee : ''].join(''))
          ])
        ])))
      ]),
      footer: [
        h('div.grow'),
        h('button.btn.primary', { onclick: () => {
            let count = 0;
            r.tasks.forEach((a, i) => {
              if (!chosen.has(i)) return;
              store().tasks.create({
                title: a.title, description: `From note: ${n.title}`, projectId: null, status: 'To Do',
                priority: a.priority || 'Medium', due: a.due ? new Date(a.due).toISOString() : null,
                repeat: null, tags: n.tags || [], checklist: [], estimate: 0, order: 0, done: false, archived: false
              }, true);
              count++;
            });
            store().touch(); store().emit('tasks');
            NX.ui.closeTopModal();
            NX.ui.toast({ type: 'success', title: `${count} task${count > 1 ? 's' : ''} created`, message: 'Added to your task list', duration: 4000,
              actions: [{ label: 'View tasks', onClick: () => NX.router.navigate('#/tasks') }] });
          } }, 'Create tasks')
      ]
    });
  }

  async function applySuggestedTags(noteId, tags, source) {
    if (!tags.length) { NX.ui.toast({ type: 'warn', message: 'No tag suggestions' }); return; }
    const chosen = new Set();
    NX.ui.modal({
      title: 'Suggested tags', subtitle: source === 'api' ? 'via AI' : 'via offline analysis', size: 'narrow',
      body: h('div', tags.map(t => h('label.checkbox', { style: { display: 'flex', padding: '6px 0' } }, [
        h('input', { type: 'checkbox', onchange: e => e.target.checked ? chosen.add(t.name) : chosen.delete(t.name) }),
        h('span.color-dot', { style: { background: t.color || '#8b8f98', width: '14px', height: '14px', pointerEvents: 'none' } }),
        h('span', t.name)
      ]))),
      footer: [h('div.grow'), h('button.btn.primary', { onclick: () => {
        const n = store().notes.find(noteId);
        const cur = new Set(n.tags || []);
        chosen.forEach(name => {
          let tag = store().tags.all().find(x => x.name === name);
          if (!tag) tag = store().tags.create({ name, color: NX.colorFromString(name) }, true);
          cur.add(tag.id);
        });
        store().notes.update(noteId, { tags: Array.from(cur) });
        NX.ui.closeTopModal(); NX.router.render();
        NX.ui.toast({ type: 'success', message: `${chosen.size} tag${chosen.size === 1 ? '' : 's'} added` });
      } }, 'Add selected')]
    });
  }

  async function askAboutNote(id) {
    const n = store().notes.find(id);
    const q = await NX.ui.prompt({ title: 'Ask about “' + (n.title || 'this note') + '”', message: 'The whole note is sent as context.', placeholder: 'e.g. What are the key risks?', multiline: true });
    if (!q) return;
    const t = NX.ui.toast({ type: 'info', message: NX.ai.mode === 'api' ? 'Asking ' + NX.ai.providerInfo().name + '…' : 'Searching your workspace offline…', duration: 0 });
    const r = await NX.ai.features.askAboutNote(id, q);
    t.close();
    NX.ui.modal({
      title: 'Answer', size: 'wide',
      body: h('div.md-preview', { html: NX.ai.renderMarkdown(r.text) }),
      footer: [h('div.grow'), h('button.btn.ghost', { onclick: () => NX.copyText(r.text) }, 'Copy'),
        h('button.btn.primary', { onclick: () => {
          const blocks = NX.deepClone(n.blocks) || [];
          blocks.push(NX.md.newBlock('h3', { text: 'Q: ' + q }));
          blocks.push(NX.md.newBlock('callout', { emoji: '🤖', variant: 'info', text: r.text.replace(/\n+/g, ' ').slice(0, 900) }));
          store().notes.update(n.id, { blocks });
          NX.ui.closeTopModal(); NX.router.render();
        } }, 'Append to note')]
    });
  }

  function showRelated(id) {
    const rel = sel().relatedNotes(id, 12);
    NX.ui.modal({
      title: 'Related notes', size: '', hideFooter: true,
      body: rel.length ? h('div.list', rel.map(r => h('button.list-row.selectable', { style: { width: '100%' }, onclick: () => { NX.ui.closeTopModal(); openNote(r.note.id); } }, [
        h('span.ico', { style: { fontSize: '16px' } }, r.note.icon || '📄'),
        h('div.lr-main', [
          h('div.lr-title', r.note.title || 'Untitled'),
          h('div.lr-sub', `${r.sharedTerms} shared terms${r.sharedTags ? ' · ' + r.sharedTags + ' shared tags' : ''} · score ${r.score}`)
        ])
      ]))) : NX.ui.emptyState('link', 'Nothing related found', 'This note does not share vocabulary with any other note yet.')
    });
  }

  async function suggestTagsForOpen() { if (openNoteId) { const r = await NX.ai.features.suggestTags(sel().notePlain(store().notes.find(openNoteId))); applySuggestedTags(openNoteId, r.tags, r.source); } }

  /* =====================================================================
     VERSION HISTORY (snapshot-based)
     ===================================================================== */
  function snapshot() {
    if (!openNoteId) return;
    const n = store().notes.find(openNoteId);
    if (!n) return;
    const key = 'nexadesk.versions.' + openNoteId;
    const list = NX.localStore.get(key, []);
    const content = JSON.stringify(n.blocks);
    if (list.length && list[0].content === content) return;
    list.unshift({ id: NX.uid('v'), at: new Date().toISOString(), content, title: n.title, words: sel().noteWordCount(n) });
    if (list.length > 25) list.length = 25;
    NX.localStore.set(key, list);
    versions = list;
  }

  function showVersions(id) {
    const key = 'nexadesk.versions.' + id;
    const list = NX.localStore.get(key, []);
    if (!list.length) { NX.ui.toast({ type: 'info', message: 'No history yet — versions are captured as you edit.' }); return; }
    const body = h('div');
    list.forEach((v, i) => {
      body.appendChild(h('div.vh-item', { onclick: () => {
        NX.ui.modal({
          title: 'Version · ' + NX.fmtDateTime(v.at, 'medium'), size: 'wide',
          body: h('div', [
            h('div.small.muted', { style: { marginBottom: '8px' } }, `${v.words} words · ${NX.relTime(v.at)}`),
            h('div.md-preview', { html: NX.ai.renderMarkdown(NX.md.blocksToMarkdown(JSON.parse(v.content))) })
          ]),
          footer: [h('div.grow'),
            h('button.btn.ghost', { onclick: () => NX.copyText(NX.md.blocksToMarkdown(JSON.parse(v.content))) }, 'Copy'),
            h('button.btn.primary', { onclick: async () => {
              if (!await NX.ui.confirm({ title: 'Restore this version?', message: 'Your current content will be replaced. A snapshot of it is taken first.', confirmLabel: 'Restore', danger: true })) return;
              snapshot();
              store().notes.update(id, { blocks: JSON.parse(v.content) });
              NX.ui.closeAllModals(); NX.router.render();
              NX.ui.toast({ type: 'success', message: 'Version restored' });
            } }, 'Restore')]
        });
      } }, [
        h('div.vh-dot', { style: i === 0 ? null : { background: 'var(--tx-4)' } }),
        h('div.grow', [
          h('div', { style: { fontSize: '12.8px', fontWeight: i === 0 ? '600' : '500' } }, i === 0 ? 'Latest snapshot' : NX.fmtDateTime(v.at, 'medium')),
          h('div.small.muted', `${v.words} words · ${NX.relTime(v.at)}`)
        ]),
        h('button.btn.xs.ghost', { onclick: e => { e.stopPropagation(); NX.copyText(NX.md.blocksToMarkdown(JSON.parse(v.content))).then(() => NX.ui.toast({ message: 'Copied', duration: 1400 })); } }, 'Copy')
      ]));
    });
    NX.ui.modal({ title: 'Version history', size: '', hideFooter: true, body });
  }

  /* =====================================================================
     EDITOR
     ===================================================================== */
  function renderEditor(id) {
    const n = store().notes.find(id);
    if (!n) return emptyState();
    snapshotIfNeeded(n);

    const body = h('div.note-body');
    if (n.cover || n.coverColor) {
      body.appendChild(h('div.note-cover', {
        style: n.cover ? { backgroundImage: `url(${n.cover})` } : { background: `linear-gradient(120deg, ${n.coverColor || '#7c6cff'}, ${NX.colorFromString(n.title || 'x')})` }
      }, h('button.cv-edit', { onclick: () => editCover(n.id) }, 'Change cover')));
    }

    // icon + title
    const iconWrap = h('div.note-icon-wrap');
    const iconBtn = h('button.note-icon', { title: 'Change icon', onclick: e => NX.ui.emojiPicker(e.currentTarget, em => { store().notes.update(n.id, { icon: em, emoji: em }); NX.router.render(); }) }, n.icon || '📄');
    iconWrap.appendChild(h('div.row', { style: { gap: '8px' } }, [
      iconBtn,
      !n.cover && !n.coverColor ? h('button.btn.xs.ghost', { onclick: () => editCover(n.id) }, 'Add cover') : null,
      h('button.btn.xs.ghost', { onclick: () => { store().notes.update(n.id, { favorite: !n.favorite }); NX.router.render(); } }, n.favorite ? '★ Favourite' : '☆ Favourite'),
      h('div.grow'),
      h('span.small.muted', `${sel().noteWordCount(n)} words · ${sel().noteReadMinutes(n)} min`)
    ]));
    body.appendChild(iconWrap);

    const title = h('textarea.note-title-input', {
      rows: 1, placeholder: 'Untitled', spellcheck: 'false',
      oninput: e => { autoGrow(e.target); debounceTitle(n.id, e.target.value); },
      onkeydown: e => {
        if (e.key === 'Enter') { e.preventDefault(); const first = document.querySelector('.block-el'); if (first) first.focus(); }
      }
    });
    title.value = n.title || '';
    body.appendChild(title);
    setTimeout(() => autoGrow(title), 0);

    // meta line
    body.appendChild(h('div.note-meta', [
      h('span.nm-item', { html: iconHTML('history', 12) + ' Edited ' + NX.relTime(n.updated) }),
      h('span.nm-item', { html: iconHTML('note', 12) + ' Created ' + NX.fmtDate(n.created, 'medium') }),
      n.parentId ? h('span.nm-item.clickable', { onclick: () => openNote(n.parentId) }, '↰ ' + (store().notes.find(n.parentId) || {}).title) : null,
      sel().childNotes(n.id).length ? h('span.nm-item.clickable', { onclick: () => { expanded.add(n.id); NX.localStore.set('nexadesk.notesExpanded', Array.from(expanded)); NX.router.render(); } }, `${sel().childNotes(n.id).length} sub-notes`) : null,
      h('div.grow'),
      h('span.nm-item.clickable', { onclick: () => showVersions(n.id) }, 'History')
    ]));

    // properties
    body.appendChild(renderProperties(n));

    if (viewMode === 'md') body.appendChild(renderMarkdownEditor(n));
    else body.appendChild(renderBlocks(n));

    // sub-notes
    const kids = sel().childNotes(n.id);
    if (kids.length) {
      body.appendChild(h('div', { style: { marginTop: '26px' } }, [
        h('div.section-head', [h('h2', { style: { fontSize: '13px' } }, 'Sub-notes'), h('span.sh-sub', String(kids.length))]),
        h('div.grid.grid-auto-sm', kids.map(k => h('button.card.hoverable.pad-sm', { style: { textAlign: 'left', cursor: 'pointer' }, onclick: () => openNote(k.id) }, [
          h('div.row', { style: { gap: '7px' } }, [h('span', { style: { fontSize: '17px' } }, k.icon || '📄'), h('span.strong.nowrap', { style: { fontSize: '12.8px' } }, k.title || 'Untitled')]),
          h('div.small.muted', { style: { marginTop: '4px' } }, `${sel().noteWordCount(k)} words · ${NX.relTime(k.updated)}`)
        ])))
      ]));
    }
    body.appendChild(h('button.task-add', { style: { marginTop: '10px' }, onclick: () => NX.actions.newNote(n.id) }, [h('span', { html: iconHTML('plus', 14) }), 'Add a sub-note']));

    // backlinks
    body.appendChild(renderBacklinks(n));

    return body;
  }

  let snapshotTimer = null;
  function snapshotIfNeeded(n) {
    clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => snapshot(), 1500);
  }

  function autoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  const debounceTitle = NX.debounce((id, v) => { store().notes.update(id, { title: v }, true); refreshTreeTitle(id, v); }, 400);
  function refreshTreeTitle(id, title) {
    const row = NX.$(`.nt-node[data-note="${id}"] .nt-title`);
    if (row) row.textContent = title || 'Untitled';
    document.dispatchEvent(new CustomEvent('nx:titlechanged'));
  }

  /* ---------------- properties ---------------- */
  function renderProperties(n) {
    const props = n.properties || [];
    const wrap = h('div.props');
    props.forEach((p, i) => {
      const row = h('div.prop-row');
      row.appendChild(h('div.prop-key', [
        h('span', { html: iconHTML(propIcon(p.type), 12), style: { display: 'flex' } }),
        h('span.grow', p.name)
      ]));
      const val = h('div.prop-val');
      switch (p.type) {
        case 'select': {
          const s = h('select.select.sm', { style: { width: 'auto' }, onchange: e => { p.value = e.target.value; commitProps(n, props); } },
            (p.options || []).concat(p.value && !(p.options || []).includes(p.value) ? [p.value] : ['']).map(o => h('option', { value: o, selected: o === p.value }, o || '—')));
          val.appendChild(s);
          val.appendChild(h('button.btn.xs.ghost', { title: 'Add option', onclick: async () => { const v = await NX.ui.prompt({ title: 'New option' }); if (v) { p.options = NX.unique((p.options || []).concat([v])); p.value = v; commitProps(n, props); NX.router.render(); } } }, '+'));
          break;
        }
        case 'multiselect': {
          (p.value || []).forEach(v => val.appendChild(h('span.chip.x', [h('span', v), h('button.chip-x', { html: iconHTML('x', 10), onclick: () => { p.value = p.value.filter(x => x !== v); commitProps(n, props); NX.router.render(); } })])));
          val.appendChild(h('button.btn.xs.ghost', { onclick: async () => { const v = await NX.ui.prompt({ title: 'Add value' }); if (v) { p.value = (p.value || []).concat([v]); commitProps(n, props); NX.router.render(); } } }, '+ add'));
          break;
        }
        case 'checkbox': {
          val.appendChild(h('label.switch', [h('input', { type: 'checkbox', checked: !!p.value, onchange: e => { p.value = e.target.checked; commitProps(n, props); } }), h('span.track')]));
          break;
        }
        case 'number': {
          const inp = h('input', { type: 'number', value: p.value === '' || p.value === undefined ? '' : p.value, oninput: NX.debounce(e => { p.value = e.target.value === '' ? '' : Number(e.target.value); commitProps(n, props, true); }, 500) });
          val.appendChild(inp); break;
        }
        case 'date': {
          val.appendChild(h('input', { type: 'date', value: p.value || '', onchange: e => { p.value = e.target.value; commitProps(n, props); } })); break;
        }
        case 'url': {
          val.appendChild(h('input', { type: 'url', placeholder: 'https://…', value: p.value || '', oninput: NX.debounce(e => { p.value = e.target.value; commitProps(n, props, true); }, 600) }));
          if (p.value) val.appendChild(h('a', { href: p.value, target: '_blank', rel: 'noopener', title: 'Open' }, h('span', { html: iconHTML('link', 12) })));
          break;
        }
        case 'rating': {
          for (let s = 1; s <= 5; s++) val.appendChild(h('button', {
            style: { fontSize: '15px', color: s <= (p.value || 0) ? 'var(--acc-yel)' : 'var(--tx-4)' },
            onclick: () => { p.value = s; commitProps(n, props); NX.router.render(); }
          }, '★'));
          break;
        }
        case 'tags': {
          (p.value || []).forEach(id => val.appendChild(h('span.tag', { style: { background: sel().tagColor(id) + '22', color: sel().tagColor(id) } }, sel().tagName(id))));
          val.appendChild(h('button.btn.xs.ghost', { onclick: () => NX.ui.pickTag(id => { const cur = p.value || []; if (!cur.includes(id)) { p.value = cur.concat([id]); commitProps(n, props); NX.router.render(); } }) }, '+ tag'));
          break;
        }
        default: {
          const inp = h('input', { type: 'text', value: p.value || '', placeholder: 'Empty', oninput: NX.debounce(e => { p.value = e.target.value; commitProps(n, props, true); }, 500) });
          val.appendChild(inp);
        }
      }
      row.appendChild(val);
      NX.ui.bindMenu(row, () => [
        { icon: 'edit', label: 'Rename property', onClick: async () => { const v = await NX.ui.prompt({ title: 'Rename', value: p.name }); if (v) { p.name = v; commitProps(n, props); NX.router.render(); } } },
        { header: 'Change type' },
        ...['text', 'number', 'select', 'multiselect', 'checkbox', 'date', 'url', 'rating', 'tags'].map(t => ({ label: t, checked: p.type === t, onClick: () => { p.type = t; if (t === 'select' && !p.options) p.options = ['Option 1', 'Option 2']; commitProps(n, props); NX.router.render(); } })),
        '-',
        { icon: 'arrowUp', label: 'Move up', onClick: () => { if (i > 0) { props.splice(i - 1, 0, props.splice(i, 1)[0]); commitProps(n, props); NX.router.render(); } } },
        { icon: 'trash', label: 'Remove property', danger: true, onClick: () => { props.splice(i, 1); commitProps(n, props); NX.router.render(); } }
      ]);
      wrap.appendChild(row);
    });
    wrap.appendChild(h('button.task-add', { onclick: e => NX.ui.dropdown(e.currentTarget, [
      { header: 'Add a property' },
      ...[{ t: 'text', l: 'Text', i: 'edit' }, { t: 'number', l: 'Number', i: 'chart' }, { t: 'select', l: 'Select', i: 'filter' },
          { t: 'multiselect', l: 'Multi-select', i: 'tag' }, { t: 'checkbox', l: 'Checkbox', i: 'check' }, { t: 'date', l: 'Date', i: 'calendar' },
          { t: 'url', l: 'URL', i: 'link' }, { t: 'rating', l: 'Rating', i: 'star' }, { t: 'tags', l: 'Tags', i: 'tag' }]
        .map(o => ({ icon: o.i, label: o.l, onClick: () => {
            const name = 'Property ' + (props.length + 1);
            const p = { id: NX.uid('p'), name, type: o.t, value: o.t === 'checkbox' ? false : o.t === 'number' ? 0 : o.t === 'rating' ? 0 : o.t === 'multiselect' || o.t === 'tags' ? [] : '' };
            if (o.t === 'select') p.options = ['Option 1', 'Option 2'];
            props.push(p); commitProps(n, props); NX.router.render();
          } }))
    ]) }, [h('span', { html: iconHTML('plus', 14) }), 'Add a property']));
    return wrap;
  }
  function propIcon(t) { return { text: 'edit', number: 'chart', select: 'filter', multiselect: 'tag', checkbox: 'check', date: 'calendar', url: 'link', rating: 'star', tags: 'tag' }[t] || 'edit'; }
  function commitProps(n, props, silent) { store().notes.update(n.id, { properties: props }, silent); }

  /* ---------------- backlinks ---------------- */
  function renderBacklinks(n) {
    const bl = sel().backlinksTo(n.id);
    const unlinked = sel().unlinkedMentions(n.id);
    if (!bl.length && !unlinked.length) return h('div');
    const wrap = h('div.backlinks');
    wrap.appendChild(h('h4', `${bl.length} backlink${bl.length === 1 ? '' : 's'}${unlinked.length ? ` · ${unlinked.length} unlinked mention${unlinked.length === 1 ? '' : 's'}` : ''}`));
    bl.forEach(l => wrap.appendChild(h('div.bl-item', { onclick: () => (l.kind === 'wiki' ? NX.router.go('wiki', { id: l.fromId }) : openNote(l.fromId)) }, [
      h('span', { html: iconHTML(l.kind === 'wiki' ? 'book' : 'note', 13), style: { color: 'var(--tx-4)', marginTop: '2px', display: 'flex' } }),
      h('div.grow', [h('div.bl-t', l.fromTitle || 'Untitled'), h('div.bl-c', (l.kind === 'wiki' ? 'Wiki page' : 'Note') + ' · mentions “' + l.toTitle + '”')])
    ])));
    if (unlinked.length) {
      unlinked.slice(0, 5).forEach(o => wrap.appendChild(h('div.bl-item', { style: { opacity: .72 }, onclick: () => openNote(o.id) }, [
        h('span', { html: iconHTML('link', 13), style: { color: 'var(--tx-4)', marginTop: '2px', display: 'flex' } }),
        h('div.grow', [h('div.bl-t', o.title || 'Untitled'), h('div.bl-c', 'Mentions this note without a link')])
      ])));
    }
    return wrap;
  }

  /* ---------------- side panel ---------------- */
  function renderSidePanel(id) {
    const n = store().notes.find(id);
    const side = h('div.note-side');
    // outline
    const heads = [];
    (n.blocks || []).forEach(b => { if (/^h[123]$/.test(b.type) && b.text) heads.push({ type: b.type, text: NX.md.stripInline(b.text), id: b.id }); });
    if (heads.length) {
      side.appendChild(h('div.small.muted', { style: { fontWeight: '650', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '.6px', marginBottom: '7px' } }, 'On this page'));
      side.appendChild(h('div.note-outline', heads.map(hd => h('div.outline-item.lvl-' + hd.type[1], {
        onclick: () => { const el = document.querySelector(`[data-block="${hd.id}"]`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }, hd.text))));
      side.appendChild(h('div.divider', { style: { margin: '14px 0' } }));
    }
    // stats
    const r = NX.aiEngine.readability(sel().notePlain(n));
    const s = NX.aiEngine.sentiment(sel().notePlain(n));
    side.appendChild(h('div.small.muted', { style: { fontWeight: '650', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '.6px', marginBottom: '7px' } }, 'Analysis'));
    side.appendChild(h('div.card.pad-sm', { style: { background: 'var(--bg-sunken)', marginBottom: '12px' } }, [
      NX.ui.kv('Words', NX.fmtNum(r.words)),
      NX.ui.kv('Characters', NX.fmtNum(r.characters)),
      NX.ui.kv('Sentences', String(r.sentences)),
      NX.ui.kv('Read time', r.readMinutes + ' min'),
      NX.ui.kv('Readability', `${r.flesch} · ${r.level}`),
      NX.ui.kv('Grade level', String(r.grade)),
      NX.ui.kv('Tone', `${s.emoji} ${s.label}`),
      NX.ui.kv('Unique words', String(r.uniqueWords || 0))
    ]));
    // keywords
    const kw = NX.aiEngine.keywords(sel().notePlain(n), 10);
    if (kw.length) {
      side.appendChild(h('div.small.muted', { style: { fontWeight: '650', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '.6px', marginBottom: '7px' } }, 'Key terms'));
      side.appendChild(h('div.row-wrap', { style: { gap: '4px', marginBottom: '12px' } }, kw.map(k => h('span.chip', { title: `${k.count}× · score ${k.score.toFixed(2)}` }, k.word))));
    }
    // related
    const rel = sel().relatedNotes(id, 5);
    if (rel.length) {
      side.appendChild(h('div.small.muted', { style: { fontWeight: '650', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '.6px', marginBottom: '7px' } }, 'Related'));
      rel.forEach(r2 => side.appendChild(h('div.bl-item', { style: { padding: '4px 6px' }, onclick: () => openNote(r2.note.id) }, [
        h('span', { style: { fontSize: '13px' } }, r2.note.icon || '📄'),
        h('div.grow', [h('div.bl-t', { style: { fontSize: '11.8px' } }, r2.note.title), h('div.bl-c', { style: { fontSize: '10px' } }, r2.sharedTerms + ' shared terms')])
      ])));
    }
    return side;
  }

  /* =====================================================================
     BLOCK RENDERING
     ===================================================================== */
  let focusedBlockId = null;

  /**
   * Apply an inline transform to the current selection inside the focused
   * block. `after` may be a string (wrap the selection) or a function that
   * receives the selected text and returns the replacement.
   * With no selection it wraps at the caret; with no focused block it falls
   * back to transforming the first block of the note.
   */
  function withSelection(after, replaceWholeBlock) {
    const n = store().notes.find(openNoteId);
    if (!n) return;
    const blocks = n.blocks || [];
    const b = blocks.find(x => x.id === focusedBlockId) || blocks[0];
    if (!b) return;
    const el = document.querySelector(`.block-el[data-block-id="${b.id}"]`);

    const selObj = window.getSelection ? window.getSelection() : null;
    const selText = selObj && selObj.rangeCount && el && el.contains(selObj.anchorNode) ? String(selObj) : '';

    const before = typeof after === 'function' ? '' : after;
    const tail = typeof after === 'function' ? '' : after;

    if (el && (selText || document.activeElement === el)) {
      el.focus();
      if (typeof after === 'function') {
        const input = selText || b.text || '';
        document.execCommand('insertText', false, String(after(input)));
      } else if (selText) {
        document.execCommand('insertText', false, before + selText + tail);
      } else {
        document.execCommand('insertText', false, before + tail);
        // place the caret between the markers
        try {
          const range = document.createRange();
          const s = window.getSelection();
          if (s && s.rangeCount) {
            range.setStart(s.getRangeAt(0).startContainer, Math.max(0, s.getRangeAt(0).startOffset - tail.length));
            range.collapse(true);
            s.removeAllRanges(); s.addRange(range);
          }
        } catch (e) {}
      }
      b.text = el.innerText;
      autoGrowCE(el);
      store().notes.update(n.id, { blocks }, true);
      store().touch();
      return;
    }

    // no usable caret: operate on the whole block text
    const src = b.text || '';
    b.text = typeof after === 'function'
      ? (replaceWholeBlock ? String(after(src)) : before + src + tail)
      : before + src + tail;
    store().notes.update(n.id, { blocks });
    NX.router.render();
    setTimeout(() => focusBlock(b.id, true), 40);
  }

  function renderBlocks(n) {
    const wrap = h('div.blocks', { id: 'blocksRoot' });
    const blocks = n.blocks && n.blocks.length ? n.blocks : [NX.md.newBlock('text')];
    if (!n.blocks || !n.blocks.length) store().notes.patchSilent(n.id, { blocks });
    let numCounter = 0;
    blocks.forEach((b, i) => {
      if (b.type === 'number') numCounter++; else numCounter = 0;
      wrap.appendChild(renderBlock(n, b, i, numCounter, blocks.length));
    });
    // trailing add button
    wrap.appendChild(h('div.block', { style: { minHeight: '38px' } }, [
      h('div.block-gutter', h('button', { html: iconHTML('plus', 15), title: 'Add a block', onclick: e => openSlashMenu(e.currentTarget, null) })),
      h('div.block-content', h('button.task-add', { onclick: e => { const nb = addBlockAt(n, blocks.length, 'text'); focusBlock(nb.id); } }, [
        h('span.muted.small', 'Click here, or press / for the block menu')
      ]))
    ]));
    return wrap;
  }

  function renderBlock(n, b, index, num, total) {
    const row = h('div.block.t-' + b.type, { dataset: { block: b.id, index, type: b.type }, draggable: 'true' });
    if (b.type === 'number') row.dataset.num = num;
    if (b.type === 'todo' && b.done) row.classList.add('done');

    const gutter = h('div.block-gutter', [
      h('button', { html: iconHTML('drag', 14), title: 'Drag to move · click for menu',
        onclick: e => NX.ui.dropdown(e.currentTarget, blockMenu(n, b, index, total), { right: true }) }),
      h('button', { html: iconHTML('plus', 14), title: 'Insert below',
        onclick: e => openSlashMenu(e.currentTarget, b.id) })
    ]);
    row.appendChild(gutter);

    const content = h('div.block-content');
    row.appendChild(content);

    switch (b.type) {
      case 'divider': break;
      case 'toggle': {
        const head = h('div.tg-head');
        head.appendChild(h('button.tg-caret', { html: iconHTML('chevR', 15), onclick: () => { b.open = !b.open; commit(n); row.classList.toggle('open', b.open); } }));
        head.appendChild(editable(n, b, { ph: 'Toggle heading' }));
        content.appendChild(head);
        const body = h('div.tg-body');
        (b.children || []).forEach((c, ci) => body.appendChild(renderBlock(n, c, ci, 0, (b.children || []).length)));
        body.appendChild(h('button.task-add', { onclick: () => { const nb = NX.md.newBlock('text'); (b.children = b.children || []).push(nb); commit(n); focusBlock(nb.id); } }, [h('span', { html: iconHTML('plus', 13) }), 'Add inside']));
        content.appendChild(body);
        if (b.open) row.classList.add('open');
        break;
      }
      case 'todo': case 'check': {
        content.appendChild(h('input', { type: 'checkbox', checked: !!b.done, onchange: e => { b.done = e.target.checked; commit(n); row.classList.toggle('done', b.done); } }));
        content.appendChild(editable(n, b, { ph: b.type === 'todo' ? 'To-do' : 'Item' }));
        row.style.display = 'flex';
        break;
      }
      case 'callout': {
        const box = h('div.block-content');
        const inner = h('div', { style: { display: 'flex', gap: '10px', width: '100%' } });
        inner.appendChild(h('button.co-emoji', { title: 'Change icon', onclick: e => NX.ui.emojiPicker(e.currentTarget, em => { b.emoji = em; commit(n); NX.router.render(); }) }, b.emoji || '💡'));
        inner.appendChild(h('div.grow', editable(n, b, { ph: 'Write something…' })));
        box.appendChild(inner);
        content.appendChild(box);
        row.classList.add('c-' + (b.variant || 'info'));
        row.querySelector('.block-content').replaceWith(box);
        break;
      }
      case 'table': content.appendChild(renderTable(n, b)); break;
      case 'image': content.appendChild(renderImage(n, b)); break;
      case 'file': content.appendChild(renderFile(n, b)); break;
      case 'bookmark': content.appendChild(renderBookmark(n, b)); break;
      case 'embed': content.appendChild(renderEmbed(n, b)); break;
      case 'noteRef': content.appendChild(renderNoteRef(n, b)); break;
      case 'taskRef': content.appendChild(renderTaskRef(n, b)); break;
      case 'progress': content.appendChild(renderProgressBlock(n, b)); break;
      case 'stats': content.appendChild(renderStatsBlock(n, b)); break;
      default: content.appendChild(editable(n, b, { ph: b.type === 'code' ? 'Code' : b.type === 'math' ? 'E = mc^2' : "Type '/' for commands" }));
    }

    /* drag & drop reorder */
    row.addEventListener('dragstart', e => {
      if (e.target.closest('[contenteditable]')) { e.preventDefault(); return; }
      e.dataTransfer.setData('text/nexadesk-block', b.id);
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => { row.classList.remove('dragging'); NX.$$('.drop-above,.drop-below').forEach(x => x.classList.remove('drop-above', 'drop-below')); });
    row.addEventListener('dragover', e => {
      if (!e.dataTransfer.types.includes('text/nexadesk-block')) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const below = e.clientY > r.top + r.height / 2;
      NX.$$('.drop-above,.drop-below').forEach(x => x.classList.remove('drop-above', 'drop-below'));
      row.classList.add(below ? 'drop-below' : 'drop-above');
    });
    row.addEventListener('drop', e => {
      const id = e.dataTransfer.getData('text/nexadesk-block');
      if (!id || id === b.id) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const below = e.clientY > r.top + r.height / 2;
      const blocks = n.blocks.slice();
      const from = blocks.findIndex(x => x.id === id);
      if (from < 0) return;
      const [moved] = blocks.splice(from, 1);
      let to = blocks.findIndex(x => x.id === b.id);
      if (to < 0) to = blocks.length;
      blocks.splice(below ? to + 1 : to, 0, moved);
      store().notes.update(n.id, { blocks });
      NX.router.render();
    });

    NX.ui.bindMenu(row, () => blockMenu(n, b, index, total));
    return row;
  }

  function editable(n, b, opts) {
    const el = h('div.block-el', {
      contenteditable: 'true', spellcheck: 'true', role: 'textbox',
      'data-ph': opts.ph || '', dataset: { blockId: b.id }
    });
    el.innerHTML = b.type === 'code' || b.type === 'math' ? esc(b.text || '') : NX.md.inline(b.text || '');
    el.addEventListener('focus', () => { focusedBlockId = b.id; el.closest('.block')?.classList.add('focused'); });
    el.addEventListener('blur', () => { el.closest('.block')?.classList.remove('focused'); syncText(n, b, el); });
    el.addEventListener('input', () => { autoGrowCE(el); debouncedSync(n, b, el); handleSlashTrigger(el, n, b); handleWikiTrigger(el, n, b); });
    el.addEventListener('keydown', e => blockKeydown(e, n, b, el));
    el.addEventListener('paste', e => {
      const html = e.clipboardData.getData('text/html');
      const text = e.clipboardData.getData('text/plain');
      if (b.type === 'code' || b.type === 'math') return;               // keep raw
      if (html && /<(p|div|h\d|li|table|pre|br)/i.test(html)) {
        e.preventDefault();
        const mdText = NX.md.htmlToMarkdown(html);
        const newBlocks = NX.md.markdownToBlocks(mdText);
        const idx = (n.blocks || []).findIndex(x => x.id === b.id);
        const before = (n.blocks || []).slice(0, idx + 1);
        const after = (n.blocks || []).slice(idx + 1);
        // merge the first pasted block into the current one if both are plain text
        if (newBlocks.length && before.length && before[before.length - 1].type === 'text' && newBlocks[0].type === 'text' && !el.textContent.trim()) {
          before[before.length - 1] = newBlocks.shift();
        }
        store().notes.update(n.id, { blocks: before.concat(newBlocks, after) });
        NX.router.render();
        setTimeout(() => focusBlock((newBlocks[newBlocks.length - 1] || before[before.length - 1]).id, true), 60);
        NX.ui.toast({ message: 'Pasted with formatting', duration: 1600 });
        return;
      }
      if (text && text.includes('\n')) {
        e.preventDefault();
        const lines = text.split('\n').filter(x => x.trim() !== '');
        const idx = (n.blocks || []).findIndex(x => x.id === b.id);
        const blocks = (n.blocks || []).slice();
        const first = blocks[idx];
        first.text = (first.text || '') + lines[0];
        const rest = lines.slice(1).map(l => NX.md.newBlock(/^[-*•]\s/.test(l) ? 'bullet' : /^\d+[.)]\s/.test(l) ? 'number' : 'text', { text: l.replace(/^([-*•]|\d+[.)])\s+/, '') }));
        blocks.splice(idx + 1, 0, ...rest);
        store().notes.update(n.id, { blocks });
        NX.router.render();
        setTimeout(() => focusBlock(rest.length ? rest[rest.length - 1].id : first.id, true), 60);
      }
    });
    setTimeout(() => autoGrowCE(el), 0);
    return el;
  }

  function autoGrowCE(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  const debouncedSync = NX.debounce((n, b, el) => syncText(n, b, el), 500);
  function syncText(n, b, el) {
    const txt = b.type === 'code' || b.type === 'math' ? el.innerText : el.innerText.replace(/\n$/, '');
    if (txt !== b.text) { b.text = txt; store().notes.update(n.id, { blocks: n.blocks }, true); store().touch(); }
  }

  /* ---------------- block keyboard ---------------- */
  function blockKeydown(e, n, b, el) {
    const mod = e.metaKey || e.ctrlKey;
    const blocks = n.blocks || [];
    const idx = blocks.findIndex(x => x.id === b.id);

    // slash menu navigation is handled by its own listener
    if (slashOpen && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(e.key)) {
      if (slashHandleKey(e)) return;
    }
    if (wikiOpen && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
      if (wikiHandleKey(e)) return;
    }

    if (e.key === 'Enter' && !e.shiftKey && b.type !== 'code') {
      e.preventDefault();
      // split at caret
      const s = window.getSelection();
      let caret = (b.text || '').length;
      if (s && s.rangeCount && el.contains(s.anchorNode)) {
        const range = s.getRangeAt(0).cloneRange();
        range.selectNodeContents(el); range.setEnd(s.getRangeAt(0).endContainer, s.getRangeAt(0).endOffset);
        caret = range.toString().length;
      }
      const before = (b.text || '').slice(0, caret), after = (b.text || '').slice(caret);
      b.text = before;
      let newType = 'text';
      if (['bullet', 'number', 'todo', 'check'].includes(b.type)) {
        // empty list item -> exit the list
        if (!before.trim() && !after.trim()) {
          blocks.splice(idx, 1);
          const nb = NX.md.newBlock('text');
          blocks.splice(idx, 0, nb);
          store().notes.update(n.id, { blocks }); NX.router.render(); setTimeout(() => focusBlock(nb.id), 40);
          return;
        }
        newType = b.type;
      }
      if (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') newType = 'text';
      const nb = NX.md.newBlock(newType, { text: after });
      if (b.type === 'toggle') nb.type = 'text';
      blocks.splice(idx + 1, 0, nb);
      syncElFromBlock(el, b);
      store().notes.update(n.id, { blocks });
      NX.router.render();
      setTimeout(() => focusBlock(nb.id), 40);
      return;
    }

    if (e.key === 'Backspace' && !(b.text || '') && b.type !== 'text') {
      e.preventDefault();
      b.type = 'text'; store().notes.update(n.id, { blocks }); NX.router.render(); setTimeout(() => focusBlock(b.id, true), 40);
      return;
    }
    if (e.key === 'Backspace' && getCaretAtStart(el) && idx > 0) {
      e.preventDefault();
      const prev = blocks[idx - 1];
      const cur = b.text || '';
      const prevLen = (prev.text || '').length;
      if (prev.type === 'divider') { blocks.splice(idx - 1, 1); store().notes.update(n.id, { blocks }); NX.router.render(); setTimeout(() => focusBlock(b.id, true), 40); return; }
      prev.text = (prev.text || '') + cur;
      blocks.splice(idx, 1);
      store().notes.update(n.id, { blocks });
      NX.router.render();
      setTimeout(() => focusBlock(prev.id, prevLen), 40);
      return;
    }
    if (e.key === 'ArrowUp' && getCaretAtStart(el) && idx > 0) { e.preventDefault(); focusBlock(blocks[idx - 1].id, true); return; }
    if (e.key === 'ArrowDown' && getCaretAtEnd(el) && idx < blocks.length - 1) { e.preventDefault(); focusBlock(blocks[idx + 1].id); return; }

    if (e.altKey && e.key === 'ArrowUp' && idx > 0) {
      e.preventDefault();
      blocks.splice(idx - 1, 0, blocks.splice(idx, 1)[0]);
      store().notes.update(n.id, { blocks }); NX.router.render(); setTimeout(() => focusBlock(b.id, true), 40); return;
    }
    if (e.altKey && e.key === 'ArrowDown' && idx < blocks.length - 1) {
      e.preventDefault();
      blocks.splice(idx + 1, 0, blocks.splice(idx, 1)[0]);
      store().notes.update(n.id, { blocks }); NX.router.render(); setTimeout(() => focusBlock(b.id, true), 40); return;
    }

    if (mod && e.shiftKey && ['1', '2', '3'].includes(e.key)) { e.preventDefault(); setBlockType(n, b, 'h' + e.key); return; }
    if (mod && e.shiftKey && e.key === '7') { e.preventDefault(); setBlockType(n, b, 'number'); return; }
    if (mod && e.shiftKey && e.key === '8') { e.preventDefault(); setBlockType(n, b, 'bullet'); return; }
    if (mod && e.shiftKey && e.key === '9') { e.preventDefault(); setBlockType(n, b, 'todo'); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateBlock(n, b); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'm') { e.preventDefault(); setBlockType(n, b, 'math'); return; }
    if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); wrapCaret(el, '`', '`', n, b); return; }
    if (mod && e.key.toLowerCase() === 'b' && !e.shiftKey) { e.preventDefault(); wrapCaret(el, '**', '**', n, b); return; }
    if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); wrapCaret(el, '*', '*', n, b); return; }
    if (mod && e.key === '/') { e.preventDefault(); openSlashMenuAtCaret(el, b); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (b.type === 'code' || b.type === 'math') { document.execCommand('insertText', false, '  '); return; }
      indentBlock(n, b, e.shiftKey);
      return;
    }
  }

  function getCaretAtStart(el) {
    const s = window.getSelection();
    if (!s || !s.rangeCount) return true;
    const r = s.getRangeAt(0);
    if (!r.collapsed) return false;
    const pre = r.cloneRange(); pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().length === 0;
  }
  function getCaretAtEnd(el) {
    const s = window.getSelection();
    if (!s || !s.rangeCount) return true;
    const r = s.getRangeAt(0);
    const post = r.cloneRange(); post.selectNodeContents(el); post.setStart(r.endContainer, r.endOffset);
    return post.toString().length === 0;
  }
  function syncElFromBlock(el, b) { el.innerHTML = NX.md.inline(b.text || ''); autoGrowCE(el); }

  function wrapCaret(el, before, after, n, b) {
    const s = window.getSelection();
    if (!s || !s.rangeCount) return;
    const text = String(s);
    document.execCommand('insertText', false, before + (text || '') + after);
    b.text = el.innerText;
    store().notes.update(n.id, { blocks: n.blocks }, true);
  }

  /* ---------------- block ops ---------------- */
  function commit(n) { store().notes.update(n.id, { blocks: n.blocks }, true); store().touch(); }
  function setBlockType(n, b, type) {
    const was = b.type;
    b.type = type;
    if (type === 'todo' || type === 'check') b.done = b.done || false;
    if (type === 'toggle' && !b.children) b.children = [];
    if (type === 'callout' && !b.emoji) { b.emoji = '💡'; b.variant = 'info'; }
    if (type === 'table' && !b.rows) b.rows = [['', '', ''], ['', '', ''], ['', '', '']];
    store().notes.update(n.id, { blocks: n.blocks });
    NX.router.render();
    setTimeout(() => focusBlock(b.id, true), 40);
  }
  function setFocusedBlockType(type) {
    const n = store().notes.find(openNoteId);
    if (!n) return;
    const b = (n.blocks || []).find(x => x.id === focusedBlockId) || n.blocks[0];
    if (b) setBlockType(n, b, type);
  }
  function addBlockAt(n, index, type, extra) {
    const nb = NX.md.newBlock(type, extra);
    const blocks = (n.blocks || []).slice();
    blocks.splice(index, 0, nb);
    store().notes.update(n.id, { blocks });
    return nb;
  }
  function insertBlockAfterFocus(nb) {
    const n = store().notes.find(openNoteId);
    if (!n) return;
    const blocks = (n.blocks || []).slice();
    const i = blocks.findIndex(x => x.id === focusedBlockId);
    blocks.splice(i < 0 ? blocks.length : i + 1, 0, nb);
    store().notes.update(n.id, { blocks });
    NX.router.render();
    setTimeout(() => focusBlock(nb.id, true), 40);
  }
  function duplicateBlock(n, b) {
    const copy = NX.deepClone(b); copy.id = NX.uid('b');
    const blocks = n.blocks.slice();
    const i = blocks.findIndex(x => x.id === b.id);
    blocks.splice(i + 1, 0, copy);
    store().notes.update(n.id, { blocks }); NX.router.render();
    setTimeout(() => focusBlock(copy.id, true), 40);
  }
  function indentBlock(n, b, out) {
    const blocks = n.blocks;
    const i = blocks.findIndex(x => x.id === b.id);
    if (out) {
      // find the enclosing toggle above
      for (let j = i - 1; j >= 0; j--) if (blocks[j].type === 'toggle') {
        const t = blocks[j];
        blocks.splice(i, 1);
        const at = blocks.findIndex(x => x.id === t.id);
        blocks.splice(at + 1, 0, b);
        store().notes.update(n.id, { blocks }); NX.router.render(); setTimeout(() => focusBlock(b.id, true), 40);
        return;
      }
      return;
    }
    for (let j = i - 1; j >= 0; j--) {
      if (blocks[j].type === 'toggle') {
        blocks.splice(i, 1);
        (blocks[j].children = blocks[j].children || []).push(b);
        blocks[j].open = true;
        store().notes.update(n.id, { blocks }); NX.router.render(); setTimeout(() => focusBlock(b.id, true), 40);
        return;
      }
      if (blocks[j].type !== 'text') break;
    }
  }
  function convertToCallout() {
    const n = store().notes.find(openNoteId);
    if (!n) return;
    const b = (n.blocks || []).find(x => x.id === focusedBlockId) || n.blocks[0];
    if (!b) return;
    b.type = 'callout'; b.emoji = b.emoji || '💡'; b.variant = b.variant || 'info';
    store().notes.update(n.id, { blocks: n.blocks }); NX.router.render();
    setTimeout(() => focusBlock(b.id, true), 40);
  }

  function focusBlock(id, atEnd) {
    if (!id) return;
    const el = document.querySelector(`.block-el[data-block-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
    el.focus();
    try {
      const r = document.createRange();
      r.selectNodeContents(el);
      if (!atEnd) r.collapse(true); else r.collapse(false);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    } catch (e) {}
    focusedBlockId = id;
  }

  function blockMenu(n, b, index, total) {
    return [
      { header: 'Turn into' },
      ...NX.md.BLOCK_TYPES.slice(0, 12).map(t => ({
        emoji: t.icon, label: t.name, checked: b.type === t.type,
        onClick: () => setBlockType(n, b, t.type)
      })),
      '-',
      { icon: 'copy', label: 'Duplicate', key: '⌘⇧D', onClick: () => duplicateBlock(n, b) },
      { icon: 'arrowUp', label: 'Move up', key: '⌥↑', onClick: () => { const blocks = n.blocks; const i = blocks.findIndex(x => x.id === b.id); if (i > 0) { blocks.splice(i - 1, 0, blocks.splice(i, 1)[0]); store().notes.update(n.id, { blocks }); NX.router.render(); setTimeout(() => focusBlock(b.id, true), 40); } } },
      { icon: 'arrowDown', label: 'Move down', key: '⌥↓', onClick: () => { const blocks = n.blocks; const i = blocks.findIndex(x => x.id === b.id); if (i < blocks.length - 1) { blocks.splice(i + 1, 0, blocks.splice(i, 1)[0]); store().notes.update(n.id, { blocks }); NX.router.render(); setTimeout(() => focusBlock(b.id, true), 40); } } },
      { icon: 'text', label: 'Copy as text', onClick: () => NX.copyText(b.text || '').then(() => NX.ui.toast({ message: 'Copied', duration: 1400 })) },
      { icon: 'code', label: 'Copy as Markdown', onClick: () => NX.copyText(NX.md.blocksToMarkdown([b])).then(() => NX.ui.toast({ message: 'Markdown copied', duration: 1600 })) },
      '-',
      ...(b.type === 'callout' ? [
        { header: 'Callout style' },
        ...['info', 'success', 'warn', 'danger'].map(v => ({ emoji: { info: '💡', success: '✅', warn: '⚠️', danger: '⛔' }[v], label: v, checked: b.variant === v, onClick: () => { b.variant = v; b.emoji = { info: '💡', success: '✅', warn: '⚠️', danger: '⛔' }[v]; store().notes.update(n.id, { blocks: n.blocks }); NX.router.render(); } })),
        '-'
      ] : []),
      { icon: 'trash', label: 'Delete block', danger: true, onClick: () => {
          const blocks = n.blocks.filter(x => x.id !== b.id);
          store().notes.update(n.id, { blocks: blocks.length ? blocks : [NX.md.newBlock('text')] });
          NX.router.render();
        } }
    ];
  }

  /* ---------------- slash menu ---------------- */
  let slashOpen = false, slashItems = [], slashIdx = 0, slashEl = null, slashAnchor = null;
  function openSlashMenu(anchorBtn, afterBlockId) {
    const n = store().notes.find(openNoteId);
    if (!n) return;
    let targetId = afterBlockId;
    if (!targetId) {
      const nb = addBlockAt(n, (n.blocks || []).length, 'text');
      targetId = nb.id;
      NX.router.render();
      setTimeout(() => { focusBlock(targetId); openSlashMenuAtBlock(targetId); }, 60);
      return;
    }
    focusBlock(targetId, true);
    openSlashMenuAtBlock(targetId);
  }
  function openSlashMenuAtCaret(el, b) { openSlashMenuAtBlock(b.id, el); }
  function openSlashMenuAtBlock(blockId, el) {
    slashAnchor = blockId;
    const target = el || document.querySelector(`.block-el[data-block-id="${blockId}"]`);
    if (!target) return;
    showSlash(target, '');
  }
  function handleSlashTrigger(el, n, b) {
    const text = el.innerText || '';
    const m = text.match(/(?:^|\s)\/([\w-]*)$/);
    if (m) {
      if (!slashOpen || slashAnchor !== b.id) showSlash(el, m[1]);
      else filterSlash(m[1], el);
    } else if (slashOpen) closeSlash();
  }
  function showSlash(el, query) {
    slashOpen = true; slashIdx = 0;
    if (!slashEl) { slashEl = h('div.slash-menu'); document.body.appendChild(slashEl); }
    slashEl.hidden = false;
    positionAtCaret(slashEl, el);
    filterSlash(query, el);
  }
  function filterSlash(query, el) {
    if (!slashEl) return;
    if (el) positionAtCaret(slashEl, el);
    const q = String(query || '').toLowerCase();
    const groups = ['Basic', 'Media', 'Advanced'];
    NX.clear(slashEl);
    slashItems = [];
    groups.forEach(g => {
      const items = NX.md.BLOCK_TYPES.filter(t => t.group === g && (!q || t.name.toLowerCase().includes(q) || t.type.toLowerCase().includes(q) || (t.desc || '').toLowerCase().includes(q)));
      if (!items.length) return;
      slashEl.appendChild(h('div.slash-group', g));
      items.forEach(t => {
        const it = { type: t.type, name: t.name };
        slashItems.push(it);
        const i = slashItems.length - 1;
        slashEl.appendChild(h('button.slash-item' + (i === slashIdx ? '.sel' : ''), {
          onmousemove: () => { slashIdx = i; markSlash(); },
          onclick: () => chooseSlash(t.type)
        }, [
          h('span.si-ico', t.icon),
          h('span.grow', [h('div.si-name', t.name), h('div.si-desc', t.desc || '')])
        ]));
      });
    });
    // extra commands
    const extras = [
      { type: '__template', name: 'Insert template', icon: '📋', desc: 'From your template library' },
      { type: '__date', name: 'Today\'s date', icon: '📅', desc: 'Insert the current date' },
      { type: '__time', name: 'Current time', icon: '🕐', desc: 'Insert the time' },
      { type: '__link', name: 'Link to note', icon: '🔗', desc: '[[Wiki-style link]]' },
      { type: '__note', name: 'New sub-note', icon: '📄', desc: 'Create and link a child note' },
      { type: '__ai', name: 'AI: continue writing', icon: '✨', desc: 'Draft the next section for you' }
    ].filter(x => !q || x.name.toLowerCase().includes(q));
    if (extras.length) {
      slashEl.appendChild(h('div.slash-group', 'Insert'));
      extras.forEach(x => {
        slashItems.push(x);
        const i = slashItems.length - 1;
        slashEl.appendChild(h('button.slash-item' + (i === slashIdx ? '.sel' : ''), {
          onmousemove: () => { slashIdx = i; markSlash(); },
          onclick: () => chooseSlash(x.type)
        }, [h('span.si-ico', x.icon), h('span.grow', [h('div.si-name', x.name), h('div.si-desc', x.desc)])]));
      });
    }
    if (!slashItems.length) slashEl.appendChild(h('div.slash-group', 'No matching blocks'));
    markSlash();
  }
  function markSlash() { NX.$$('.slash-item', slashEl).forEach((n, i) => n.classList.toggle('sel', i === slashIdx)); const a = slashEl.querySelector('.slash-item.sel'); if (a) a.scrollIntoView({ block: 'nearest' }); }
  function positionAtCaret(menu, el) {
    const s = window.getSelection();
    let x = 0, y = 0;
    if (s && s.rangeCount) {
      const r = s.getRangeAt(0).cloneRange();
      r.collapse(true);
      const rect = r.getBoundingClientRect();
      if (rect && (rect.top || rect.left)) { x = rect.left; y = rect.bottom + 6; }
    }
    if (!x && el) { const r = el.getBoundingClientRect(); x = r.left; y = r.bottom + 6; }
    const mw = 300, mh = 330;
    if (x + mw > innerWidth - 10) x = innerWidth - mw - 10;
    if (y + mh > innerHeight - 10) y = Math.max(10, y - mh - 24);
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
  }
  function slashHandleKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeSlash(); return true; }
    if (e.key === 'ArrowDown') { e.preventDefault(); slashIdx = Math.min(slashItems.length - 1, slashIdx + 1); markSlash(); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); slashIdx = Math.max(0, slashIdx - 1); markSlash(); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (!slashItems.length) return false;
      e.preventDefault(); chooseSlash(slashItems[slashIdx].type); return true;
    }
    return false;
  }
  function closeSlash() { slashOpen = false; if (slashEl) slashEl.hidden = true; }

  async function chooseSlash(type) {
    const n = store().notes.find(openNoteId);
    if (!n) return;
    const el = document.querySelector(`.block-el[data-block-id="${slashAnchor}"]`);
    // strip the "/query" text that triggered the menu
    const b = (n.blocks || []).find(x => x.id === slashAnchor);
    if (b) b.text = (b.text || '').replace(/(?:^|\s)\/[\w-]*$/, '');
    closeSlash();

    if (type.startsWith('__')) {
      if (type === '__date') { if (b) b.text += NX.fmtDate(new Date(), 'long'); store().notes.update(n.id, { blocks: n.blocks }); NX.router.render(); setTimeout(() => focusBlock(b.id, true), 40); return; }
      if (type === '__time') { if (b) b.text += NX.fmtTime(new Date()); store().notes.update(n.id, { blocks: n.blocks }); NX.router.render(); setTimeout(() => focusBlock(b.id, true), 40); return; }
      if (type === '__link') { showLinkPicker(b); return; }
      if (type === '__note') { const sub = await NX.actions.newNote(n.id); if (b) b.text += `[[${(store().notes.find(sub.id) || {}).title || 'Untitled'}]]`; store().notes.update(n.id, { blocks: n.blocks }); return; }
      if (type === '__template') { showTemplatePicker(n, b); return; }
      if (type === '__ai') {
        const t = NX.ui.toast({ type: 'info', message: 'AI is writing…', duration: 0 });
        const r = await NX.ai.features.draftNote(b ? b.text || 'continue this section' : 'continue this note');
        t.close();
        const newBlocks = NX.md.markdownToBlocks(r.text);
        const idx = (n.blocks || []).findIndex(x => x.id === b.id);
        const blocks = n.blocks.slice();
        blocks.splice(idx + 1, 0, ...newBlocks);
        store().notes.update(n.id, { blocks });
        NX.router.render();
        NX.ui.toast({ type: 'success', message: `AI added ${newBlocks.length} blocks (${r.source === 'api' ? 'online' : 'offline'})` });
        return;
      }
    }
    if (b) b.type = type;
    else { const nb = NX.md.newBlock(type); n.blocks.push(nb); }
    if (type === 'table' && b && !b.rows) b.rows = [['', '', ''], ['', '', ''], ['', '', '']];
    if (type === 'callout' && b) { b.emoji = b.emoji || '💡'; b.variant = b.variant || 'info'; }
    if (type === 'toggle' && b && !b.children) b.children = [];
    if (type === 'image' && b) { b.src = b.src || ''; editBlockImage(n, b); return; }
    if (type === 'bookmark' && b) { editBlockBookmark(n, b); return; }
    if (type === 'embed' && b) { const url = await NX.ui.prompt({ title: 'Embed URL', placeholder: 'https://…' }); if (url) { b.src = url; b.text = url; } else { b.type = 'text'; } }
    if (type === 'file' && b) { await attachFileToBlock(n, b); return; }
    if (type === 'noteRef' && b) { const pick = await pickNote(); if (pick) { b.refId = pick.id; b.refTitle = pick.title; } else b.type = 'text'; }
    if (type === 'taskRef' && b) { b.filter = 'open'; }
    if (type === 'progress' && b) { b.value = 50; }
    store().notes.update(n.id, { blocks: n.blocks });
    NX.router.render();
    setTimeout(() => focusBlock(b ? b.id : null, true), 50);
  }

  async function pickNote() {
    return new Promise(resolve => {
      const inp = h('input.input', { placeholder: 'Search notes…', autofocus: true });
      const list = h('div.list', { style: { maxHeight: '300px', overflow: 'auto' } });
      const draw = q => {
        NX.clear(list);
        const notes = q ? NX.aiEngine.search(q, { kinds: ['note'], limit: 15 }).map(r => store().notes.find(r.doc.id)).filter(Boolean) : sel().recentNotes(15);
        notes.forEach(n2 => list.appendChild(h('button.list-row.selectable', { style: { width: '100%' }, onclick: () => { m.close(); resolve(n2); } }, [
          h('span', { style: { fontSize: '15px' } }, n2.icon || '📄'),
          h('div.lr-main', [h('div.lr-title', n2.title || 'Untitled'), h('div.lr-sub', NX.relTime(n2.updated))])
        ])));
        if (!notes.length) list.appendChild(h('p.small.muted', { style: { padding: '12px' } }, 'No notes found'));
      };
      inp.addEventListener('input', NX.debounce(() => draw(inp.value.trim()), 150));
      const m = NX.ui.modal({ title: 'Choose a note', size: '', body: h('div', [inp, h('div', { style: { height: '10px' } }), list]), hideFooter: true, onClose: () => resolve(null) });
      draw(''); setTimeout(() => inp.focus(), 40);
    });
  }

  function showLinkPicker(block) {
    pickNote().then(n2 => {
      if (!n2) return;
      const nn = store().notes.find(openNoteId);
      if (!nn) return;
      if (block) { block.text = (block.text || '') + `[[${n2.title || 'Untitled'}]]`; }
      else {
        const nb = NX.md.newBlock('text', { text: `[[${n2.title || 'Untitled'}]]` });
        const idx = (nn.blocks || []).findIndex(x => x.id === focusedBlockId);
        nn.blocks.splice(idx < 0 ? nn.blocks.length : idx + 1, 0, nb);
      }
      store().notes.update(nn.id, { blocks: nn.blocks });
      NX.router.render();
    });
  }

  /* ---------------- wiki-link autocomplete ---------------- */
  let wikiOpen = false, wikiItems = [], wikiIdx = 0, wikiEl = null, wikiBlockId = null;
  function handleWikiTrigger(el, n, b) {
    const text = el.innerText || '';
    const m = text.match(/\[\[([^\]]*)$/);
    if (m) {
      wikiBlockId = b.id;
      const q = m[1].toLowerCase();
      const titles = NX.unique(store().notes.all().concat(store().wiki.all()).map(x => x.title).filter(Boolean));
      wikiItems = titles.filter(t => t.toLowerCase().includes(q)).slice(0, 10);
      wikiIdx = 0;
      if (!wikiEl) { wikiEl = h('div.slash-menu', { style: { width: '280px' } }); document.body.appendChild(wikiEl); }
      wikiEl.hidden = false; positionAtCaret(wikiEl, el);
      NX.clear(wikiEl);
      if (!wikiItems.length) { wikiEl.appendChild(h('div.slash-group', 'No page yet — Enter creates it')); wikiOpen = true; return; }
      wikiItems.forEach((t, i) => wikiEl.appendChild(h('button.slash-item' + (i === wikiIdx ? '.sel' : ''), {
        onmousemove: () => { wikiIdx = i; NX.$$('.slash-item', wikiEl).forEach((x, j) => x.classList.toggle('sel', j === i)); },
        onclick: () => completeWiki(t, el, n, b)
      }, [h('span.si-ico', '📄'), h('span.si-name', t)])));
      wikiOpen = true;
    } else if (wikiOpen) { wikiOpen = false; if (wikiEl) wikiEl.hidden = true; }
  }
  function wikiHandleKey(e) {
    if (e.key === 'Escape') { wikiOpen = false; wikiEl.hidden = true; return true; }
    if (!wikiItems.length && e.key === 'Enter') {
      const el = document.querySelector(`.block-el[data-block-id="${wikiBlockId}"]`);
      const m = (el ? el.innerText : '').match(/\[\[([^\]]*)$/);
      if (m && m[1].trim()) {
        e.preventDefault();
        const nn = store().notes.find(openNoteId);
        const title = m[1].trim();
        const created = store().notes.create({ title, icon: '📄', emoji: '📄', tags: [], parentId: null, order: 0, favorite: false, archived: false, properties: [], blocks: [NX.md.newBlock('h1', { text: title }), NX.md.newBlock('text')] });
        completeWiki(title, el, nn, (nn.blocks || []).find(x => x.id === wikiBlockId));
        NX.ui.toast({ type: 'success', title: 'Created ' + title, duration: 3600, actions: [{ label: 'Open', primary: true, onClick: () => openNote(created.id) }] });
        return true;
      }
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); wikiIdx = Math.min(wikiItems.length - 1, wikiIdx + 1); NX.$$('.slash-item', wikiEl).forEach((x, j) => x.classList.toggle('sel', j === wikiIdx)); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); wikiIdx = Math.max(0, wikiIdx - 1); NX.$$('.slash-item', wikiEl).forEach((x, j) => x.classList.toggle('sel', j === wikiIdx)); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (!wikiItems.length) return false;
      e.preventDefault();
      const el = document.querySelector(`.block-el[data-block-id="${wikiBlockId}"]`);
      completeWiki(wikiItems[wikiIdx], el, store().notes.find(openNoteId), (store().notes.find(openNoteId).blocks || []).find(x => x.id === wikiBlockId));
      return true;
    }
    return false;
  }
  function completeWiki(title, el, n, b) {
    wikiOpen = false; if (wikiEl) wikiEl.hidden = true;
    if (!b || !el) return;
    b.text = (el.innerText || '').replace(/\[\[([^\]]*)$/, `[[${title}]]`);
    store().notes.update(n.id, { blocks: n.blocks });
    NX.router.render();
    setTimeout(() => focusBlock(b.id, true), 40);
  }

  /* ---------------- special block renderers ---------------- */
  function renderTable(n, b) {
    const rows = b.rows || [];
    const wrap = h('div.block-content.t-table-inner');
    const table = h('table.db', { style: { minWidth: '100%' } });
    const thead = h('thead'); const headRow = h('tr');
    (rows[0] || []).forEach((c, ci) => headRow.appendChild(h('th', {
      contenteditable: 'true', spellcheck: 'false',
      onblur: e => { rows[0][ci] = e.target.innerText; commit(n); },
      onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } if (e.key === 'Tab') { e.preventDefault(); const nx = e.target.nextElementSibling || addColumn(n, b); if (nx) nx.focus(); } }
    }, c)));
    headRow.appendChild(h('th', { style: { width: '30px' } }, h('button.btn.xs.ghost', { title: 'Add column', onclick: () => addColumn(n, b) }, '+')));
    thead.appendChild(headRow); table.appendChild(thead);
    const tbody = h('tbody');
    rows.slice(1).forEach((r, ri) => {
      const tr = h('tr');
      (rows[0] || []).forEach((_, ci) => tr.appendChild(h('td', {
        contenteditable: 'true', spellcheck: 'false',
        onblur: e => { rows[ri + 1][ci] = e.target.innerText; commit(n); },
        onkeydown: e => {
          if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
          if (e.key === 'Tab') { e.preventDefault(); const nx = e.target.nextElementSibling; if (nx) nx.focus(); else { addRow(n, b); } }
        }
      }, r[ci] === undefined ? '' : r[ci])));
      tr.appendChild(h('td', h('button.btn.xs.ghost', { title: 'Delete row', onclick: () => { rows.splice(ri + 1, 1); store().notes.update(n.id, { blocks: n.blocks }); NX.router.render(); } }, '×')));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(h('div.db-wrap', [h('div.db-scroll', table),
      h('div.db-foot', [
        h('button.btn.xs.ghost', { onclick: () => addRow(n, b) }, '+ Row'),
        h('button.btn.xs.ghost', { onclick: () => addColumn(n, b) }, '+ Column'),
        h('div.grow'),
        h('span', `${rows.length - 1} rows × ${(rows[0] || []).length} cols`),
        h('button.btn.xs.ghost', { onclick: () => NX.copyText(NX.md.toCSV(rows)).then(() => NX.ui.toast({ message: 'Copied as CSV', duration: 1600 })) }, 'Copy CSV'),
        h('button.btn.xs.ghost', { onclick: () => tableToNote(n, b) }, '→ Database')
      ])]));
    return wrap;
  }
  function addRow(n, b) { const cols = (b.rows[0] || []).length; b.rows.push(new Array(cols).fill('')); store().notes.update(n.id, { blocks: n.blocks }); NX.router.render(); }
  function addColumn(n, b) { b.rows.forEach(r => r.push('')); store().notes.update(n.id, { blocks: n.blocks }); NX.router.render(); }
  function tableToNote(n, b) {
    const rows = b.rows;
    const heads = rows[0] || [];
    rows.slice(1).forEach(r => {
      const props = heads.map((hd, i) => ({ id: NX.uid('p'), name: hd || 'Field', type: 'text', value: r[i] || '' }));
      store().notes.create({ title: r[0] || 'Untitled', icon: '📄', emoji: '📄', tags: [], parentId: n.id, order: 0, favorite: false, archived: false, properties: props, blocks: [NX.md.newBlock('text')] }, true);
    });
    store().touch(); store().emit('notes');
    NX.ui.toast({ type: 'success', message: `${rows.length - 1} rows became sub-notes` });
  }

  function renderImage(n, b) {
    const wrap = h('div.block-content');
    if (!b.src) {
      wrap.appendChild(h('button.btn.sm.subtle', { onclick: () => editBlockImage(n, b) }, '🖼️ Add an image'));
      return wrap;
    }
    wrap.appendChild(h('img', { src: b.src, alt: b.caption || '', onclick: () => NX.ui.viewImage(b.src, b.caption), style: { cursor: 'zoom-in' } }));
    if (b.caption !== undefined) {
      const cap = h('div.img-cap', { contenteditable: 'true', 'data-ph': 'Caption', onblur: e => { b.caption = e.target.innerText; commit(n); } }, b.caption || '');
      cap.innerHTML = esc(b.caption || '');
      wrap.appendChild(cap);
    }
    wrap.appendChild(h('div.row', { style: { gap: '4px', marginTop: '5px' } }, [
      h('button.btn.xs.ghost', { onclick: () => editBlockImage(n, b) }, 'Replace'),
      h('button.btn.xs.ghost', { onclick: () => { b.src = ''; store().notes.update(n.id, { blocks: n.blocks }); NX.router.render(); } }, 'Remove')
    ]));
    return wrap;
  }

  function editBlockImage(n, b) {
    const wrap = h('div');
    const urlInput = h('input.input', { placeholder: 'Image URL (https://…)', value: /^https?:/.test(b.src || '') ? b.src : '' });
    wrap.appendChild(h('div.field', [h('label', 'From a URL'), urlInput]));
    wrap.appendChild(h('div.divider'));
    const fileInput = h('input', { type: 'file', accept: 'image/*' });
    wrap.appendChild(h('div.field', [h('label', 'Or upload from this device'), fileInput,
      h('div.hint', 'Images are embedded as data URLs so the note stays self-contained. Large images increase your workspace file size.')]));
    const preview = h('div', { style: { marginTop: '10px', textAlign: 'center' } });
    if (b.src) preview.appendChild(h('img', { src: b.src, style: { maxWidth: '100%', maxHeight: '220px', borderRadius: '8px' } }));
    wrap.appendChild(preview);
    const captionInput = h('input.input', { placeholder: 'Caption (optional)', value: b.caption || '' });
    wrap.appendChild(h('div.field', { style: { marginTop: '10px' } }, [h('label', 'Caption'), captionInput]));

    fileInput.onchange = () => {
      const f = fileInput.files[0]; if (!f) return;
      if (f.size > 6 * 1024 * 1024) { NX.ui.toast({ type: 'warn', message: 'That image is over 6MB — it will bloat your workspace. Consider a smaller one.' }); }
      const rd = new FileReader();
      rd.onload = () => { b.src = String(rd.result); NX.clear(preview); preview.appendChild(h('img', { src: b.src, style: { maxWidth: '100%', maxHeight: '220px', borderRadius: '8px' } })); };
      rd.readAsDataURL(f);
    };
    NX.ui.modal({
      title: 'Image', body: wrap,
      footer: [h('div.grow'), h('button.btn.primary', { onclick: () => {
        if (urlInput.value.trim()) b.src = urlInput.value.trim();
        b.caption = captionInput.value;
        store().notes.update(n.id, { blocks: n.blocks });
        NX.ui.closeTopModal(); NX.router.render();
      } }, 'Save')]
    });
  }

  function renderFile(n, b) {
    const wrap = h('div.block-content');
    wrap.appendChild(h('div.block.t-file', [
      h('span', { style: { fontSize: '19px' } }, mimeEmoji(b.mime)),
      h('div.grow', [h('div', { style: { fontSize: '12.8px', fontWeight: '550' } }, b.name || 'File'), h('div.small.muted', NX.fmtBytes(b.size || 0))]),
      b.src ? h('a.btn.sm.subtle', { href: b.src, download: b.name || 'file' }, 'Download') : null,
      h('button.btn.sm.ghost', { onclick: () => { n.blocks = n.blocks.filter(x => x.id !== b.id); store().notes.update(n.id, { blocks: n.blocks }); NX.router.render(); } }, 'Remove')
    ]));
    return wrap;
  }
  function mimeEmoji(m) {
    m = m || '';
    if (m.startsWith('image/')) return '🖼️'; if (m.startsWith('video/')) return '🎬'; if (m.startsWith('audio/')) return '🎵';
    if (m.includes('pdf')) return '📕'; if (m.includes('zip') || m.includes('compressed')) return '🗜️';
    if (m.includes('json') || m.includes('javascript') || m.includes('text')) return '📄';
    if (m.includes('sheet') || m.includes('excel') || m.includes('csv')) return '📊';
    return '📎';
  }
  async function attachFileToBlock(n, b) {
    if (store().desktop && window.nex.openDialog) {
      const r = await window.nex.openDialog({});
      if (r.ok && r.files[0]) {
        const f = r.files[0];
        b.name = f.name; b.size = f.size; b.src = 'data:application/octet-stream;base64,' + f.data;
        store().notes.update(n.id, { blocks: n.blocks }); NX.router.render(); return;
      }
    }
    const inp = h('input', { type: 'file' });
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { b.name = f.name; b.size = f.size; b.mime = f.type; b.src = String(rd.result); store().notes.update(n.id, { blocks: n.blocks }); NX.router.render(); };
      rd.readAsDataURL(f);
    };
    document.body.appendChild(inp); inp.click(); setTimeout(() => inp.remove(), 4000);
  }

  function renderBookmark(n, b) {
    const wrap = h('div.block-content');
    if (!b.src) { editBlockBookmark(n, b); wrap.appendChild(h('button.btn.sm.subtle', { onclick: () => editBlockBookmark(n, b) }, '🔖 Add a link')); return wrap; }
    let host = b.src; try { host = new URL(b.src).hostname.replace(/^www\./, ''); } catch (e) {}
    wrap.appendChild(h('a.block.t-bookmark', { href: b.src, target: '_blank', rel: 'noopener', style: { textDecoration: 'none', color: 'inherit' } }, [
      h('div.bm-ico', { style: { background: NX.colorFromString(host) + '22', color: NX.colorFromString(host) } }, (host[0] || '🔗').toUpperCase()),
      h('div.grow', [
        h('div.bm-title', b.title || b.src),
        h('div.bm-url', host),
        b.description ? h('div.small.muted', { style: { marginTop: '3px' } }, b.description) : null
      ]),
      h('button.btn.xs.ghost', { onclick: e => { e.preventDefault(); e.stopPropagation(); editBlockBookmark(n, b); } }, 'Edit')
    ]));
    return wrap;
  }
  async function editBlockBookmark(n, b) {
    const url = await NX.ui.prompt({ title: 'Bookmark URL', value: b.src || '', placeholder: 'https://example.com' });
    if (url === null) { if (!b.src) { n.blocks = n.blocks.filter(x => x.id !== b.id); } store().notes.update(n.id, { blocks: n.blocks }); NX.router.render(); return; }
    if (!url) return;
    b.src = url;
    let host = url; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}
    b.title = b.title || host;
    b.description = b.description || '';
    store().notes.update(n.id, { blocks: n.blocks });
    // also offer to save it to the bookmark library
    if (!store().bookmarks.all().some(x => x.url === url)) {
      store().bookmarks.create({ url, title: b.title, description: '', tags: [], folder: '', status: 'unread', rating: 0, note: '' }, true);
      store().touch();
    }
    NX.router.render();
  }

  function renderEmbed(n, b) {
    const wrap = h('div.block-content');
    if (!b.src) { wrap.appendChild(h('button.btn.sm.subtle', { onclick: async () => { const u = await NX.ui.prompt({ title: 'Embed URL', placeholder: 'https://…' }); if (u) { b.src = u; store().notes.update(n.id, { blocks: n.blocks }); NX.router.render(); } } }, '🔗 Add an embed')); return wrap; }
    wrap.appendChild(h('div.block.t-embed', [
      h('iframe', { src: b.src, loading: 'lazy', sandbox: 'allow-scripts allow-same-origin allow-popups', title: b.src }),
      h('div.row', { style: { padding: '5px 9px', gap: '6px', borderTop: '1px solid var(--bd)' } }, [
        h('a.small.grow.nowrap', { href: b.src, target: '_blank', rel: 'noopener' }, b.src),
        h('button.btn.xs.ghost', { onclick: () => { b.src = ''; store().notes.update(n.id, { blocks: n.blocks }); NX.router.render(); } }, 'Remove')
      ])
    ]));
    return wrap;
  }

  function renderNoteRef(n, b) {
    const wrap = h('div.block-content');
    const ref = b.refId ? store().notes.find(b.refId) : store().notes.all().find(x => (x.title || '') === b.refTitle);
    if (!ref) { wrap.appendChild(h('div.card.pad-sm', { style: { borderStyle: 'dashed' } }, [h('span.small.muted', 'Missing note: ' + (b.refTitle || '?'))])); return wrap; }
    wrap.appendChild(h('div.card.hoverable.pad-sm', { style: { cursor: 'pointer', borderLeft: '3px solid var(--brand-1)' }, onclick: () => openNote(ref.id) }, [
      h('div.row', [h('span', { style: { fontSize: '17px' } }, ref.icon || '📄'), h('b.small.grow.nowrap', ref.title || 'Untitled'), h('span.tiny.muted', NX.relTime(ref.updated))]),
      h('div.small.muted', { style: { marginTop: '5px', display: '-webkit-box', WebkitLineClamp: '3', WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, sel().notePlain(ref).replace(/\s+/g, ' ').slice(0, 320))
    ]));
    return wrap;
  }

  function renderTaskRef(n, b) {
    const wrap = h('div.block-content');
    const filter = b.filter || 'open';
    let list = store().tasks.all().filter(t => !t.archived);
    if (b.projectId) list = list.filter(t => t.projectId === b.projectId);
    if (filter === 'open') list = list.filter(t => !t.done);
    else if (filter === 'done') list = list.filter(t => t.done);
    else if (filter === 'today') list = list.filter(t => t.due && NX.isToday(t.due));
    else if (filter === 'overdue') list = list.filter(t => !t.done && t.due && new Date(t.due) < NX.startOfDay(new Date()));
    list = list.slice(0, b.limit || 12);
    const head = h('div.row', { style: { marginBottom: '6px' } }, [
      h('span.small.strong', `📋 Tasks · ${filter}`),
      h('span.badge-count', String(list.length)),
      h('div.grow'),
      h('select.select.sm', { style: { width: 'auto' }, onchange: e => { b.filter = e.target.value; store().notes.update(n.id, { blocks: n.blocks }); NX.router.render(); } },
        ['open', 'done', 'today', 'overdue', 'all'].map(f => h('option', { value: f, selected: f === filter }, f)))
    ]);
    wrap.appendChild(h('div.card.pad-sm', [head, list.length ? h('div', list.map(t => NX.components.taskRow(t, { showStatus: false }))) : h('p.small.muted', 'No matching tasks.')]));
    return wrap;
  }

  function renderProgressBlock(n, b) {
    const wrap = h('div.block-content');
    wrap.appendChild(h('div.card.pad-sm', [
      h('div.row', { style: { justifyContent: 'space-between', marginBottom: '5px' } }, [
        h('span.small.muted', b.label || 'Progress'),
        h('input', { type: 'number', min: 0, max: 100, value: b.value || 0, style: { width: '62px', background: 'transparent', border: '0', textAlign: 'right', fontWeight: '700', color: 'var(--brand-1)' },
          onchange: e => { b.value = NX.clamp(Number(e.target.value) || 0, 0, 100); store().notes.update(n.id, { blocks: n.blocks }); NX.router.render(); } })
      ]),
      h('div.progress.thick', h('i', { style: { width: (b.value || 0) + '%' } }))
    ]));
    return wrap;
  }

  function renderStatsBlock(n, b) {
    const wrap = h('div.block-content');
    const ts = NX.aiEngine.taskSummary();
    const stats = {
      openTasks: { l: 'Open tasks', v: ts.open }, doneTasks: { l: 'Completed', v: ts.done },
      overdue: { l: 'Overdue', v: ts.overdue }, notes: { l: 'Notes', v: store().notes.count() },
      wikiPages: { l: 'Wiki pages', v: store().wiki.count() }, habitsToday: { l: 'Habits today', v: (() => { const x = sel().habitsCompletedToday(); return x.done + '/' + x.total; })() },
      focusToday: { l: 'Focus today', v: NX.fmtDuration(sel().focusMinutesToday()) },
      netWorth: { l: 'Net worth', v: store().getSetting('currencySymbol', '$') + NX.compactNum(sel().netWorth()) },
      unread: { l: 'Unread inbox', v: sel().unreadInbox().length },
      messages: { l: 'Messages', v: store().messages.count() }
    };
    const keys = (b.items && b.items.length) ? b.items : Object.keys(stats).slice(0, 4);
    wrap.appendChild(h('div.grid.grid-auto-sm', keys.map(k => {
      const s = stats[k] || { l: k, v: '—' };
      return h('div.stat', [h('div.st-label', s.l), h('div.st-value', String(s.v))]);
    })));
    wrap.appendChild(h('button.btn.xs.ghost', { style: { marginTop: '6px' }, onclick: e => NX.ui.dropdown(e.currentTarget, Object.keys(stats).map(k => ({
      label: stats[k].l, checked: keys.includes(k), keepOpen: true,
      onClick: () => { b.items = keys.includes(k) ? keys.filter(x => x !== k) : keys.concat([k]); store().notes.update(n.id, { blocks: n.blocks }); NX.router.render(); }
    })), { right: true }) }, 'Choose stats'));
    return wrap;
  }

  /* ---------------- templates ---------------- */
  function showTemplatePicker(n, afterBlock) {
    const tpls = store().templates.all().concat(sel().noteTemplates().map(x => ({ id: x.id, name: x.title, icon: x.icon, category: 'Your notes', blocks: x.blocks })));
    const cats = NX.unique(tpls.map(t => t.category || 'Other'));
    const body = h('div');
    cats.forEach(c => {
      body.appendChild(h('div.pal-group', c));
      tpls.filter(t => (t.category || 'Other') === c).forEach(t => body.appendChild(h('button.pal-item', { style: { width: '100%' }, onclick: () => {
        let blocks = NX.deepClone(t.blocks || [NX.md.newBlock('text')]);
        blocks.forEach(b => { b.id = NX.uid('b'); if (b.children) b.children.forEach(cc => cc.id = NX.uid('b')); });
        const nb = n.blocks.slice();
        const idx = afterBlock ? nb.findIndex(x => x.id === afterBlock.id) : nb.length - 1;
        nb.splice(idx + 1, 0, ...blocks);
        store().notes.update(n.id, { blocks: nb });
        NX.ui.closeTopModal(); NX.router.render();
        NX.ui.toast({ type: 'success', message: `Inserted “${t.name}” (${blocks.length} blocks)` });
      } }, [h('span.pi-ico', t.icon || '📄'), h('span.pi-main', [h('span.pi-title', t.name), t.description ? h('span.pi-sub', t.description) : null])])));
    });
    body.appendChild(h('div.divider'));
    body.appendChild(h('button.btn.sm.subtle', { onclick: () => { NX.ui.closeTopModal(); saveAsTemplate(n); } }, '💾 Save this note as a template'));
    NX.ui.modal({ title: 'Insert a template', size: 'wide', hideFooter: true, body });
  }

  async function saveAsTemplate(n) {
    const name = await NX.ui.prompt({ title: 'Save as template', value: (n.title || 'Untitled') + ' template', message: 'Templates appear in the / menu for every note.' });
    if (!name) return;
    store().templates.create({ name, icon: n.icon || '📄', category: 'My templates', description: 'Saved from “' + (n.title || 'Untitled') + '”', blocks: NX.deepClone(n.blocks || []) });
    NX.ui.toast({ type: 'success', message: 'Template saved — type / in any note to use it' });
  }

  /* ---------------- markdown source view ---------------- */
  function renderMarkdownEditor(n) {
    const wrap = h('div');
    const ta = h('textarea.textarea', {
      rows: 30, spellcheck: 'false',
      style: { fontFamily: 'var(--font-mono)', fontSize: '12.8px', lineHeight: '1.7', whiteSpace: 'pre' }
    });
    ta.value = NX.md.blocksToMarkdown(n.blocks);
    let dirty = false;
    ta.addEventListener('input', () => dirty = true);
    wrap.appendChild(h('div.row', { style: { marginBottom: '8px', gap: '7px' } }, [
      h('span.small.muted', 'Edit the raw markdown. Click “Apply” to convert it back into blocks.'),
      h('div.grow'),
      h('button.btn.sm.ghost', { onclick: () => { ta.value = NX.md.blocksToMarkdown(store().notes.find(n.id).blocks); dirty = false; } }, 'Reset'),
      h('button.btn.sm.ghost', { onclick: () => NX.copyText(ta.value).then(() => NX.ui.toast({ message: 'Copied', duration: 1400 })) }, 'Copy'),
      h('button.btn.sm.primary', { onclick: () => {
          const blocks = NX.md.markdownToBlocks(ta.value);
          store().notes.update(n.id, { blocks });
          dirty = false;
          viewMode = 'doc'; persistView();
          NX.ui.toast({ type: 'success', message: `${blocks.length} blocks created` });
        } }, 'Apply → blocks')
    ]));
    wrap.appendChild(ta);
    wrap.appendChild(h('div.divider'));
    wrap.appendChild(h('div.small.muted', { style: { marginBottom: '6px', fontWeight: '600' } }, 'Live preview'));
    wrap.appendChild(h('div.md-preview.card.pad-sm', { id: 'mdPreview', html: NX.ai.renderMarkdown(ta.value) }));
    ta.addEventListener('input', NX.debounce(() => { const p = document.getElementById('mdPreview'); if (p) p.innerHTML = NX.ai.renderMarkdown(ta.value); }, 250));
    return wrap;
  }

  /* =====================================================================
     DATABASE VIEW
     ===================================================================== */
  function renderDatabase() {
    const page = h('div.page.wide');
    page.appendChild(NX.components.pageHead({
      icon: 'database', title: 'Notes database',
      sub: `${store().notes.all().length} notes · every property is a column · sort, filter and export`,
      actions: [
        h('button.btn.sm.primary', { html: iconHTML('plus', 13) + ' New note', onclick: () => NX.actions.newNote() }),
        h('button.btn.sm.subtle', { html: iconHTML('note', 13) + ' Document view', onclick: () => { viewMode = 'doc'; persistView(); } }),
        h('button.btn.sm.ghost', { onclick: e => NX.ui.dropdown(e.currentTarget, [
          { icon: 'download', label: 'Export as CSV', onClick: exportDbCSV },
          { icon: 'download', label: 'Export as Markdown', onClick: () => NX.actions.exportMarkdown() },
          { icon: 'archive', label: 'Show archived', checked: dbFilter === 'archived', onClick: () => { dbFilter = dbFilter === 'archived' ? '' : 'archived'; NX.router.render(); } },
          { icon: 'star', label: 'Favourites only', checked: dbFilter === 'fav', onClick: () => { dbFilter = dbFilter === 'fav' ? '' : 'fav'; NX.router.render(); } },
          { icon: 'sparkle', label: 'Auto-tag all notes', onClick: autoTagAll },
          { icon: 'layers', label: 'Cluster notes by topic', onClick: showClusters }
        ], { right: true }) }, 'More')
      ]
    }));

    // collect all property names across notes
    const propNames = NX.unique(store().notes.all().flatMap(n => (n.properties || []).map(p => p.name)));
    const cols = [
      { key: 'title', label: 'Name', sort: n => (n.title || '').toLowerCase() },
      { key: 'icon', label: '', sort: () => 0, render: n => h('span', { style: { fontSize: '15px' } }, n.icon || '📄') },
      { key: 'tags', label: 'Tags', sort: n => (n.tags || []).length, render: n => h('div.cell-tags', (n.tags || []).map(t => h('span.tag', { style: { background: sel().tagColor(t) + '22', color: sel().tagColor(t) } }, sel().tagName(t)))) },
      ...propNames.map(pn => ({ key: 'prop:' + pn, label: pn, sort: n => { const p = (n.properties || []).find(x => x.name === pn); return p ? String(p.value ?? '') : ''; }, render: n => { const p = (n.properties || []).find(x => x.name === pn); return h('span', p ? formatPropVal(p) : ''); } })),
      { key: 'words', label: 'Words', sort: n => sel().noteWordCount(n), render: n => h('span', NX.fmtNum(sel().noteWordCount(n))) },
      { key: 'children', label: 'Sub-notes', sort: n => sel().childNotes(n.id).length, render: n => h('span', String(sel().childNotes(n.id).length)) },
      { key: 'links', label: 'Links', sort: n => sel().backlinksTo(n.id).length, render: n => h('span', String(sel().backlinksTo(n.id).length)) },
      { key: 'updated', label: 'Edited', sort: n => new Date(n.updated).getTime(), render: n => h('span', NX.relTime(n.updated)) },
      { key: 'created', label: 'Created', sort: n => new Date(n.created).getTime(), render: n => h('span', NX.fmtDate(n.created, 'medium')) }
    ];

    let notes = store().notes.all().slice();
    if (dbFilter === 'archived') notes = notes.filter(n => n.archived);
    else if (dbFilter === 'fav') notes = notes.filter(n => n.favorite);
    else notes = notes.filter(n => !n.archived);

    const bar = NX.components.filterBar([
      { type: 'search', placeholder: 'Filter notes…', value: dbFilterQuery, onInput: v => { dbFilterQuery = v; const body = document.getElementById('dbBody'); if (body) { NX.clear(body); renderRows(body); } } },
      { type: 'select', label: 'Group', options: [{ value: '', label: 'No grouping' }, { value: 'tag', label: 'By first tag' }, { value: 'parent', label: 'By parent note' }, { value: 'month', label: 'By month created' }, { value: 'fav', label: 'Favourites' }], value: groupBy, onChange: v => { groupBy = v; NX.router.render(); } },
      { type: 'sep' },
      { type: 'chip', label: '📌 Pinned', active: onlyPinned, onClick: () => { onlyPinned = !onlyPinned; NX.router.render(); } },
      { type: 'chip', label: '★ Favourites', active: onlyFav, onClick: () => { onlyFav = !onlyFav; NX.router.render(); } },
      { type: 'chip', label: 'Has links', active: onlyLinked, onClick: () => { onlyLinked = !onlyLinked; NX.router.render(); } },
      { type: 'spacer' },
      { type: 'text', text: '' }
    ]);
    page.appendChild(bar);

    if (onlyPinned) notes = notes.filter(n => n.pinned);
    if (onlyFav) notes = notes.filter(n => n.favorite);
    if (onlyLinked) notes = notes.filter(n => sel().backlinksTo(n.id).length > 0);

    const sortCol = cols.find(c => c.key === sortState.key) || cols[0];
    notes.sort((a, b) => {
      const va = sortCol.sort(a), vb = sortCol.sort(b);
      if (va === vb) return (a.title || '').localeCompare(b.title || '');
      return (va < vb ? -1 : 1) * sortState.dir;
    });

    const table = h('table.db');
    const thead = h('thead', h('tr', cols.map(c => h('th', {
      onclick: () => { sortState = { key: c.key, dir: sortState.key === c.key ? -sortState.dir : 1 }; NX.localStore.set('nexadesk.notesSort', sortState); NX.router.render(); }
    }, [c.label, sortState.key === c.key ? h('span.sort-ind', sortState.dir === 1 ? '↑' : '↓') : null]))));
    table.appendChild(thead);
    const tbody = h('tbody', { id: 'dbBody' });
    renderRows(tbody);
    table.appendChild(tbody);

    function renderRows(body) {
      let list = notes;
      if (dbFilterQuery) {
        const q = dbFilterQuery.toLowerCase();
        list = list.filter(n => (n.title || '').toLowerCase().includes(q) || sel().notePlain(n).toLowerCase().includes(q));
      }
      const groups = groupBy ? new Map() : null;
      list.forEach(n => {
        const row = buildRow(n, cols);
        if (groups) { const k = groupKey(n); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(row); }
        else body.appendChild(row);
      });
      if (groups) {
        Array.from(groups.entries()).forEach(([k, rows]) => {
          body.appendChild(h('tr', h('td', { colspan: String(cols.length), style: { background: 'var(--bg-sunken)', fontWeight: '650', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--tx-3)' } }, `${k} — ${rows.length}`)));
          rows.forEach(r => body.appendChild(r));
        });
      }
      if (!list.length) body.appendChild(h('tr', h('td', { colspan: String(cols.length) }, h('div.empty', [h('h4', 'No notes'), h('p', dbFilterQuery ? 'Nothing matches that filter.' : 'Create your first note to see it here.'), h('button.btn.primary', { onclick: () => NX.actions.newNote() }, 'New note')]))));
    }

    function buildRow(n, cols) {
      const tr = h('tr', { onclick: () => openNote(n.id) });
      NX.ui.bindMenu(tr, () => noteMenu(n));
      cols.forEach(c => {
        if (c.render) { tr.appendChild(h('td', c.render(n))); return; }
        if (c.key === 'title') {
          tr.appendChild(h('td', h('div.row', { style: { gap: '6px' } }, [
            n.pinned ? h('span', { html: iconHTML('pin', 11), style: { color: 'var(--tx-4)', display: 'flex' } }) : null,
            n.favorite ? h('span', { html: iconHTML('star', 11), style: { color: 'var(--acc-yel)', display: 'flex' } }) : null,
            h('b.nowrap', { style: { fontWeight: '550', maxWidth: '280px' } }, n.title || 'Untitled')
          ])));
          return;
        }
        tr.appendChild(h('td', String(getVal(n, c.key))));
      });
      return tr;
    }
    function getVal(n, key) {
      if (key.startsWith('prop:')) { const p = (n.properties || []).find(x => x.name === key.slice(5)); return p ? formatPropVal(p) : ''; }
      if (key === 'words') return sel().noteWordCount(n);
      if (key === 'updated') return NX.fmtDate(n.updated, 'medium');
      if (key === 'created') return NX.fmtDate(n.created, 'medium');
      return n[key] === undefined ? '' : n[key];
    }
    function groupKey(n) {
      if (groupBy === 'tag') return (n.tags || []).length ? sel().tagName(n.tags[0]) : 'No tag';
      if (groupBy === 'parent') return n.parentId ? ((store().notes.find(n.parentId) || {}).title || 'Untitled') : 'Top level';
      if (groupBy === 'month') return NX.fmtDate(n.created, 'medium').split(',')[0] + ' ' + new Date(n.created).getFullYear();
      if (groupBy === 'fav') return n.favorite ? '★ Favourites' : 'Everything else';
      return 'All';
    }

    page.appendChild(h('div.db-wrap', [h('div.db-scroll', table),
      h('div.db-foot', [
        h('span', `${notes.length} notes`),
        h('span', `${NX.fmtNum(NX.sum(notes.map(n => sel().noteWordCount(n))))} total words`),
        h('div.grow'),
        h('button.btn.xs.ghost', { onclick: exportDbCSV }, 'Export CSV'),
        h('button.btn.xs.ghost', { onclick: () => { viewMode = 'doc'; persistView(); } }, 'Back to document')
      ])]));
    return page;
  }

  function formatPropVal(p) {
    if (p.type === 'checkbox') return p.value ? '✓' : '';
    if (p.type === 'rating') return '★'.repeat(p.value || 0) + '☆'.repeat(5 - (p.value || 0));
    if (p.type === 'multiselect' && Array.isArray(p.value)) return p.value.join(', ');
    if (p.type === 'tags' && Array.isArray(p.value)) return p.value.map(t => sel().tagName(t)).filter(Boolean).join(', ');
    if (p.type === 'date') return p.value ? NX.fmtDate(p.value, 'medium') : '';
    return p.value === undefined || p.value === null ? '' : String(p.value);
  }

  let dbFilterQuery = '', groupBy = '', onlyPinned = false, onlyFav = false, onlyLinked = false;

  function exportDbCSV() {
    const notes = store().notes.all();
    const propNames = NX.unique(notes.flatMap(n => (n.properties || []).map(p => p.name)));
    const head = ['Title', 'Tags', 'Words', 'Favourite', 'Pinned', 'Archived', 'Parent', 'Created', 'Updated'].concat(propNames);
    const rows = notes.map(n => {
      const base = [n.title, (n.tags || []).map(t => sel().tagName(t)).join('; '), sel().noteWordCount(n), n.favorite ? 'yes' : '', n.pinned ? 'yes' : '', n.archived ? 'yes' : '',
        n.parentId ? ((store().notes.find(n.parentId) || {}).title || '') : '', n.created, n.updated];
      const props = propNames.map(pn => { const p = (n.properties || []).find(x => x.name === pn); return p ? formatPropVal(p) : ''; });
      return base.concat(props);
    });
    NX.download(`nexadesk-notes-${NX.todayStr()}.csv`, NX.md.toCSV([head].concat(rows)), 'text/csv');
    NX.ui.toast({ type: 'success', message: `${rows.length} rows exported as CSV` });
  }

  async function autoTagAll() {
    const notes = store().notes.all().filter(n => !n.archived && !(n.tags || []).length);
    if (!notes.length) { NX.ui.toast({ type: 'info', message: 'Every note already has a tag' }); return; }
    if (!await NX.ui.confirm({ title: 'Auto-tag notes', message: `Analyse ${notes.length} untagged notes and suggest tags for each?\n\nNothing is saved until you approve.`, confirmLabel: 'Start', danger: false })) return;
    const t = NX.ui.toast({ type: 'info', message: `Analysing ${notes.length} notes…`, duration: 0 });
    const vocab = sel().allTags().map(x => ({ name: x.name, id: x.id, color: x.color }));
    const results = [];
    for (const n of notes.slice(0, 40)) {
      const r = await NX.ai.features.suggestTags(sel().notePlain(n));
      results.push({ note: n, tags: r.tags.slice(0, 3), source: r.source });
    }
    t.close();
    showAutoTagResults(results);
  }

  function showAutoTagResults(results) {
    const chosen = new Map(results.map(r => [r.note.id, new Set(r.tags.map(t => t.name))]));
    const body = h('div', { style: { maxHeight: '52vh', overflow: 'auto' } });
    results.forEach(r => {
      body.appendChild(h('div', { style: { padding: '9px 0', borderBottom: '1px solid var(--bd)' } }, [
        h('div.row', [h('span', { style: { fontSize: '15px' } }, r.note.icon || '📄'), h('b.small.grow', r.note.title || 'Untitled'), h('span.tiny.muted', r.source === 'api' ? 'AI' : 'offline')]),
        h('div.row-wrap', { style: { marginTop: '6px', gap: '5px' } }, r.tags.map(t => {
          const on = chosen.get(r.note.id).has(t.name);
          return h('span.chip.clickable' + (on ? '.on' : ''), {
            style: { borderColor: t.color },
            onclick: e => { const s = chosen.get(r.note.id); if (s.has(t.name)) s.delete(t.name); else s.add(t.name); e.target.classList.toggle('on'); }
          }, (t.id ? '' : '+ ') + t.name);
        }))
      ]));
    });
    NX.ui.modal({
      title: `Suggested tags for ${results.length} notes`, size: 'wide', body,
      footer: [h('div.grow'), h('button.btn.primary', { onclick: () => {
        let count = 0;
        chosen.forEach((names, noteId) => {
          if (!names.size) return;
          const n = store().notes.find(noteId);
          const cur = new Set(n.tags || []);
          names.forEach(name => {
            let tag = store().tags.all().find(x => x.name === name);
            if (!tag) tag = store().tags.create({ name, color: NX.colorFromString(name) }, true);
            cur.add(tag.id);
          });
          store().notes.update(noteId, { tags: Array.from(cur) }, true);
          count++;
        });
        store().touch(); store().emit('notes'); store().emit('tags');
        NX.ui.closeTopModal(); NX.router.render();
        NX.ui.toast({ type: 'success', title: `${count} notes tagged` });
      } }, 'Apply tags')]
    });
  }

  function showClusters() {
    const clusters = NX.aiEngine.clusterNotes();
    NX.ui.modal({
      title: 'Topic clusters', subtitle: 'Grouped by the strongest keyword in each note', size: 'wide', hideFooter: true,
      body: h('div', clusters.slice(0, 24).map(c => h('div.card.pad-sm', { style: { marginBottom: '9px', background: 'var(--bg-sunken)' } }, [
        h('div.row', [h('b.small', '#' + c.name), h('span.badge-count', String(c.count)), h('div.grow'),
          h('button.btn.xs.ghost', { onclick: () => {
            const tag = store().tags.all().find(t => t.name === c.name) || store().tags.create({ name: c.name, color: NX.colorFromString(c.name) }, true);
            c.titles.forEach(title => { const n = store().notes.all().find(x => x.title === title); if (n) { const s = new Set(n.tags || []); s.add(tag.id); store().notes.update(n.id, { tags: Array.from(s) }, true); } });
            store().touch(); store().emit('notes'); NX.ui.toast({ type: 'success', message: `Tagged ${c.count} notes with #${c.name}` });
          } }, `Tag all ${c.count}`)]),
        h('div.small.muted', { style: { marginTop: '5px' } }, c.titles.slice(0, 8).join(' · ') + (c.titles.length > 8 ? ' …' : ''))
      ])))
    });
  }

  function editCover(id) {
    const n = store().notes.find(id);
    const GRADS = ['#7c6cff,#33b8a3', '#4aa8e8,#9b6cf0', '#e86cb0,#f2994a', '#4caf7d,#33b8a3', '#eb5757,#f2994a', '#2f80ed,#56ccf2', '#e3c14a,#f2994a', '#8b8f98,#4a4a4a'];
    NX.ui.modal({
      title: 'Note cover', size: '',
      body: h('div', [
        h('div.small.muted', { style: { marginBottom: '8px' } }, 'Gradient'),
        h('div.row-wrap', { style: { gap: '7px', marginBottom: '14px' } }, GRADS.map(g =>
          h('button', { style: { width: '58px', height: '34px', borderRadius: '8px', background: `linear-gradient(120deg, ${g})`, border: '2px solid transparent' },
            onclick: () => { store().notes.update(id, { coverColor: g.split(',')[0], cover: '' }); NX.ui.closeTopModal(); NX.router.render(); } }))),
        h('div.small.muted', { style: { marginBottom: '8px' } }, 'Or an image URL'),
        h('input.input', { id: 'coverUrl', placeholder: 'https://…', value: /^https?:/.test(n.cover || '') ? n.cover : '' }),
        h('div.divider'),
        h('button.btn.sm.ghost', { onclick: () => { store().notes.update(id, { cover: '', coverColor: '' }); NX.ui.closeTopModal(); NX.router.render(); } }, 'Remove cover')
      ]),
      footer: [h('div.grow'), h('button.btn.primary', { onclick: () => {
        const v = document.getElementById('coverUrl').value.trim();
        store().notes.update(id, { cover: v, coverColor: v ? '' : (n.coverColor || '#7c6cff') });
        NX.ui.closeTopModal(); NX.router.render();
      } }, 'Save')]
    });
  }

  /* =====================================================================
     LIFECYCLE
     ===================================================================== */
  function onMount() {
    const handler = e => {
      if (NX.router.currentId() !== 'notes') return;
      // click a [[wiki link]] to open it
      const wl = e.target.closest && e.target.closest('.wikilink');
      if (wl) {
        const title = wl.dataset.title;
        const target = store().notes.all().find(x => (x.title || '').toLowerCase() === String(title).toLowerCase()) ||
                       store().wiki.all().find(x => (x.title || '').toLowerCase() === String(title).toLowerCase());
        if (target) {
          if (store().notes.find(target.id)) openNote(target.id);
          else NX.router.go('wiki', { id: target.id });
        } else {
          NX.ui.confirm({ title: 'Page does not exist', message: `Create a new note called “${title}”?`, confirmLabel: 'Create note', danger: false })
            .then(ok => { if (!ok) return; const n2 = store().notes.create({ title, icon: '📄', emoji: '📄', tags: [], parentId: null, order: 0, favorite: false, archived: false, properties: [], blocks: [NX.md.newBlock('h1', { text: title }), NX.md.newBlock('text')] }); openNote(n2.id); });
        }
      }
      const ht = e.target.closest && e.target.closest('.hashtag');
      if (ht) { viewMode = 'db'; dbFilterQuery = ht.dataset.tag; persistView(); }
    };
    document.addEventListener('click', handler);
    document.addEventListener('nx:escape', () => { closeSlash(); if (wikiEl) wikiEl.hidden = true; wikiOpen = false; });
    return () => {
      document.removeEventListener('click', handler);
      closeSlash();
    };
  }

  NX.router.register({
    id: 'notes', name: 'Notes', icon: 'note', group: 'knowledge', order: 20,
    render, onMount,
    badgeCount: null,
    sidebarItems: () => {
      const out = [
        { label: 'All notes', icon: 'database', count: store().notes.all().filter(n => !n.archived).length, go: () => { viewMode = 'db'; dbFilter = ''; persistView(); } },
        { label: 'Favourites', icon: 'star', count: sel().favoriteNotes().length, go: () => { viewMode = 'db'; dbFilter = 'fav'; persistView(); } },
        { label: 'Recently edited', icon: 'history', count: null, go: () => { viewMode = 'db'; sortState = { key: 'updated', dir: -1 }; persistView(); } },
        { label: 'Templates', icon: 'copy', count: store().templates.count(), go: () => NX.router.go('settings', { tab: 'templates' }) },
        { label: 'Trash', icon: 'trash', count: store().trash.all().filter(t => t.collection === 'notes').length, go: () => NX.router.go('settings', { tab: 'trash' }) }
      ];
      sel().favoriteNotes().slice(0, 5).forEach(n => out.push({ emoji: n.icon || '📄', label: n.title || 'Untitled', go: () => openNote(n.id) }));
      return out;
    },
    commands: () => [
      { label: 'Notes: new note', icon: 'plus', run: () => NX.actions.newNote() },
      { label: 'Notes: switch to database view', icon: 'table', run: () => { viewMode = 'db'; persistView(); } },
      { label: 'Notes: switch to document view', icon: 'note', run: () => { viewMode = 'doc'; persistView(); } },
      { label: 'Notes: insert a template', icon: 'copy', run: () => { const n = store().notes.find(openNoteId); if (n) showTemplatePicker(n, null); else NX.ui.toast({ type: 'warn', message: 'Open a note first' }); } },
      { label: 'Notes: export everything as Markdown', icon: 'download', run: () => NX.actions.exportMarkdown() },
      { label: 'Notes: auto-tag untagged notes', icon: 'tag', run: autoTagAll },
      { label: 'Notes: summarise current note', icon: 'sparkle', run: () => summarizeNote(openNoteId) }
    ]
  });
})(window.NX);
