/* ============================================================
   PebbleX v0.1 — 22-notes.js
   Notion-Style Notes Tracker & Vault:
   - Complete "/" slash command menu: headings, checklists, toggles,
     callouts, tables, code blocks, math, quotes, dividers, dates
   - Interactive checklist toggles in live preview
   - Live word count, character count & estimated reading time
   - Note templates (Meeting, Project Sprint, Journal, Brainstorm)
   - Split-view, editor-only, and reader preview modes
   - Floating format tools (bold, italic, strike, highlight, code)
   - Real disk vault sync (.md files in Documents/PebbleX Notes)
   - Two-way sync & native .md/.txt import
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;
let curNoteId = null, listQuery = '', curFolder = '', curTag = 'all', viewMode = 'split'; // 'split', 'edit', 'preview'
let vault = { root:'', files:[], folders:[] };

/* ---------------- Enhanced Markdown -> HTML Renderer ---------------- */
function highlightCode(code, lang){
  let safe = U.esc(code);
  safe = safe.replace(/\b(const|let|var|function|return|import|export|from|class|fn|pub|mut|struct|enum|impl|async|await|if|else|for|while|match|try|catch|true|false|null|undefined)\b/g, '<span style="color:#d55fde;font-weight:700">$1</span>');
  safe = safe.replace(/(&quot;.*?&quot;|&#39;.*?&#39;|`.*?`)/g, '<span style="color:#89ca78">$1</span>');
  safe = safe.replace(/(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, '<span style="color:#7a839b;font-style:italic">$1</span>');
  return safe;
}

function mdRender(src){
  const rawText = String(src || '');
  const lines = rawText.split('\n');
  let html = '', inCode = false, codeLang = '', codeBuf = [], listMode = null, inTable = false, tableBuf = [], inToggle = false;
  
  const flushList = ()=>{ if(listMode){ html += `</${listMode}>`; listMode = null; } };
  const flushTable = ()=>{
    if(inTable && tableBuf.length){
      html += renderTable(tableBuf);
      tableBuf = [];
      inTable = false;
    }
  };
  const flushToggle = ()=>{ if(inToggle){ html += '</div></details>'; inToggle = false; } };

  const inline = s => {
    let out = U.esc(s);
    out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="md-img" loading="lazy">');
    out = out.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    out = out.replace(/==([^=]+)==/g, '<mark class="md-mark">$1</mark>');
    out = out.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m0, noteTitle, customLabel) => {
      const title = (noteTitle || '').trim();
      const label = (customLabel || title).trim();
      return `<a class="md-wikilink" data-wikilink="${U.esc(title)}" href="javascript:void(0)" title="Jump to note: ${U.esc(title)}"><span class="md-wiki-ic">📄</span> ${U.esc(label)}</a>`;
    });
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="md-link">$1</a>');
    out = out.replace(/#([a-zA-Z0-9_-]{2,24})/g, '<span class="tagchip" style="cursor:pointer" data-tag="$1">#$1</span>');
    out = out.replace(/\$([^\$\n]+)\$/g, '<code class="md-math">$1</code>');
    return out;
  };

  for(let i=0; i<lines.length; i++){
    const raw = lines[i];
    const line = raw;
    const trimmed = line.trim();

    // Code blocks
    if(/^```/.test(trimmed)){
      if(inCode){
        const codeContent = highlightCode(codeBuf.join('\n'), codeLang);
        html += `<div class="md-codeblock">
          <div class="md-codeblock-h"><span>${U.esc(codeLang||'code')}</span><button class="md-copy-btn" onclick="navigator.clipboard.writeText(this.closest('.md-codeblock').querySelector('pre').innerText);NX.toastOk('Copied code','');">Copy</button></div>
          <pre class="md-pre"><code>${codeContent}</code></pre>
        </div>`;
        codeBuf = []; inCode = false; codeLang = '';
      } else {
        flushList(); flushTable();
        inCode = true;
        codeLang = trimmed.replace(/^```/, '').trim() || 'plaintext';
      }
      continue;
    }
    if(inCode){ codeBuf.push(line); continue; }

    // Tables
    if(trimmed.startsWith('|') && trimmed.endsWith('|')){
      flushList();
      inTable = true;
      tableBuf.push(trimmed);
      continue;
    } else {
      flushTable();
    }

    // Collapsible Toggle: > ? Title or +++ Title
    let m;
    if(m = line.match(/^>\s*\?\s+(.*)$/)){
      flushList(); flushToggle();
      html += `<details class="md-toggle" open><summary>${inline(m[1])}</summary><div class="md-toggle-body">`;
      inToggle = true;
      continue;
    }
    if(trimmed === '>>>' || trimmed === '</details>'){
      flushToggle();
      continue;
    }

    // Headings
    if(m = line.match(/^(#{1,3})\s+(.*)$/)){
      flushList();
      const level = m[1].length;
      html += `<div class="md-h md-h${level}">${inline(m[2])}</div>`;
      continue;
    }

    // Checkboxes / Tasks (with nested indentation and data-line)
    if(m = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/)){
      if(listMode !== 'tasklist'){ flushList(); html += '<div class="md-tasklist">'; listMode = 'tasklist'; }
      const isDone = m[2].toLowerCase() === 'x';
      const indent = Math.min(4, Math.floor((m[1]||'').length / 2));
      html += `<label class="md-task ${isDone?'done':''}" data-line="${i}" style="${indent ? `margin-left:${indent*16}px`:''}">
        <input type="checkbox" ${isDone?'checked':''} class="md-task-cb" data-line="${i}">
        <span>${inline(m[3])}</span>
      </label>`;
      continue;
    }

    // Unordered list
    if(m = line.match(/^\s*[-*]\s+(.*)$/)){
      if(listMode !== 'ul'){ flushList(); html += '<ul class="md-ul">'; listMode = 'ul'; }
      html += `<li>${inline(m[1])}</li>`;
      continue;
    }

    // Ordered list
    if(m = line.match(/^\s*(\d+)[.)]\s+(.*)$/)){
      if(listMode !== 'ol'){ flushList(); html += '<ol class="md-ol">'; listMode = 'ol'; }
      html += `<li>${inline(m[2])}</li>`;
      continue;
    }

    // Callout boxes: > !tip, > !warning, > !info, > !danger, > !success, > !note
    if(m = line.match(/^>\s+!(\w+)\s+(.*)$/)){
      flushList();
      const type = m[1].toLowerCase();
      const iconsMap = { tip:'✨', warning:'⚠️', warn:'⚠️', info:'💡', danger:'🚨', note:'📝', success:'✅' };
      const sym = iconsMap[type] || '💡';
      html += `<div class="md-callout md-callout-${type}"><span class="md-co-icon">${sym}</span><div class="md-co-content">${inline(m[2])}</div></div>`;
      continue;
    }

    // Quote
    if(m = line.match(/^>\s?(.*)$/)){
      flushList();
      html += `<blockquote class="md-quote">${inline(m[1])}</blockquote>`;
      continue;
    }

    // Horizontal Rule
    if(/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)){
      flushList();
      html += '<hr class="md-hr">';
      continue;
    }

    // Math block ($$ ... $$)
    if(m = line.match(/^\$\$\s*(.*)\s*\$\$$/)){
      flushList();
      html += `<div class="md-mathblock"><code>${inline(m[1])}</code></div>`;
      continue;
    }

    // Empty line
    if(trimmed === ''){
      flushList();
      continue;
    }

    // Regular paragraph
    flushList();
    html += `<div class="md-p">${inline(line)}</div>`;
  }

  flushList();
  flushTable();
  flushToggle();
  if(inCode) html += `<pre class="md-pre">${highlightCode(codeBuf.join('\n'), codeLang)}</pre>`;
  return html;
}

function renderTable(tableLines){
  if(tableLines.length < 2) return '';
  let out = '<div class="md-table-wrap"><table class="md-table">';
  const parseRow = l => l.slice(1, -1).split('|').map(c => c.trim());
  const headers = parseRow(tableLines[0]);
  out += '<thead><tr>' + headers.map(h => `<th>${U.esc(h)}</th>`).join('') + '</tr></thead><tbody>';
  
  const startIdx = (tableLines[1].includes('---') || tableLines[1].includes('-|-')) ? 2 : 1;
  for(let j=startIdx; j<tableLines.length; j++){
    const cells = parseRow(tableLines[j]);
    out += '<tr>' + cells.map(c => `<td>${U.esc(c)}</td>`).join('') + '</tr>';
  }
  out += '</tbody></table></div>';
  return out;
}

NX.mdRender = mdRender;

/* ---------------- Store helpers ---------------- */
function notes(){ return NX.store.get('notes', []); }
function saveNotes(n){ NX.store.set('notes', n); NX.store.set('notesAutoSavedAt', Date.now()); }
function current(){
  if(curFolder === '__trash'){
    return notes().find(n=>n.id === curNoteId && n.trash) || notes().find(n=>n.trash);
  }
  return notes().find(n=>n.id === curNoteId && !n.trash) || notes().find(n=>!n.trash) || notes()[0];
}
function folders(){
  const set = new Set(notes().filter(n=>!n.trash).map(n=>n.folder || '').filter(Boolean));
  (vault.folders||[]).forEach(f=>set.add(f));
  return Array.from(set).sort();
}
function tags(){
  const set = new Set();
  notes().forEach(n => (n.tags || []).forEach(t => set.add(t)));
  return Array.from(set).sort();
}

/* ---------------- Vault disk sync ---------------- */
function relFor(note){
  const folder = (note.folder || '').trim();
  const safeTitle = (note.title || 'Untitled').replace(/[\\/:*?"<>|]/g,'-').slice(0,60).trim() || 'Untitled';
  return (folder ? folder + '/' : '') + safeTitle + '.md';
}
function mdContent(note){
  const fm = [
    '---',
    'title: ' + (note.title || 'Untitled'),
    'folder: ' + (note.folder || ''),
    'tags: ' + (note.tags||[]).join(', '),
    'updated: ' + new Date(note.updated||Date.now()).toISOString(),
    'app: PebbleX',
    '---',''
  ].join('\n');
  return fm + (note.body||'');
}

let diskTimer = null;
function syncToDisk(note){
  if(!NX.native.available || NX.native.mode !== 'tauri' || !note) return;
  clearTimeout(diskTimer);
  diskTimer = setTimeout(async ()=>{
    const rel = note.mdRel || relFor(note);
    const r = await NX.native.invoke('note_write_file', { rel, content: mdContent(note) });
    if(r && r.ok && r.data && r.data.ok){
      note.mdRel = r.data.rel;
      saveNotes(notes());
      const el = document.querySelector('#nt-disk');
      if(el) el.innerHTML = `<span style="color:var(--green)">${icon('check',13)}</span> Vault synced <span class="mono faint" style="font-size:10.5px">${U.esc(r.data.rel)}</span>`;
    }
  }, 600);
}

/* ---------------- Templates Catalog ---------------- */
const TEMPLATES = [
  {
    name: 'Project Roadmap & Sprint',
    icon: 'target',
    body: `# Project Roadmap & Sprint

> !tip Plan milestones, track deliverables and unblock team blockers.

## 🎯 Objectives
- [ ] Finalize MVP feature set
- [ ] Connect production database & backend
- [ ] Run end-to-end tests and security audit

## 📅 Sprint Schedule
| Week | Deliverable | Status |
| --- | --- | --- |
| Week 1 | Design tokens & Core components | Completed |
| Week 2 | Interactive Notes & Tasks Kanban | In Progress |
| Week 3 | Standalone Desktop Installer | Scheduled |

## 💡 Notes & Considerations
- Keep dependencies minimal for fast load time.
- Verify two-way vault sync for all note edits.`
  },
  {
    name: 'Meeting Notes & Actions',
    icon: 'chat',
    body: `# Team Meeting Notes

**Date:** ${new Date().toLocaleDateString(undefined, { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
**Attendees:** Team & Stakeholders

---

## 📌 Agenda
1. Review sprint progress & demo new features
2. Discuss release roadmap & packaging targets
3. Open Q&A and next action items

## 📝 Key Discussion Points
- Launching desktop app with portable & installer builds.
- Ensuring local disk vault syncs reliably without data loss.

## ✅ Action Items
- [ ] Update build workflow for Windows installer
- [ ] Test offline mode for notes and prompt saver
- [ ] Deploy companion Chrome extension to store`
  },
  {
    name: 'Daily Focus Journal',
    icon: 'clock',
    body: `# Daily Focus Journal — ${new Date().toLocaleDateString()}

> !info Start each morning by defining your top 3 non-negotiable outcomes.

## 🌟 Top 3 Priorities
1. 
2. 
3. 

## ⚡ Timeless Focus Check
- Target: 4 hours of deep focus time
- Main project: 

## 💭 Reflections & Gratitude
- What went well today?
- What could be streamlined tomorrow?`
  },
  {
    name: 'Brainstorm & Ideas Canvas',
    icon: 'star',
    body: `# Brainstorm & Ideas Canvas

> !idea No idea is too crazy during initial ideation!

### 💡 Core Problem
What is the primary friction point we are trying to eliminate?

### 🚀 Proposed Concepts
- Concept A: 
- Concept B: 

### 🔍 Pros & Cons
| Approach | Pros | Cons |
| --- | --- | --- |
| Native Tauri | Ultra lightweight, fast, tiny binary | Rust learning curve |
| Electron | Broad library ecosystem | Heavy memory usage |`
  }
];

/* ---------------- Notion Slash Menu ---------------- */
const SLASH_ITEMS = [
  { l:'Heading 1',        k:'H1', ic:'hash',   ins:'# ',                   tip:'Big section title' },
  { l:'Heading 2',        k:'H2', ic:'hash',   ins:'## ',                  tip:'Medium heading' },
  { l:'Heading 3',        k:'H3', ic:'hash',   ins:'### ',                 tip:'Sub-heading' },
  { l:'To-do checklist',  k:'TD', ic:'check',  ins:'- [ ] ',               tip:'Interactive checklist' },
  { l:'Bullet list',      k:'UL', ic:'list',   ins:'- ',                   tip:'Standard bullet point' },
  { l:'Numbered list',    k:'OL', ic:'list',   ins:'1. ',                  tip:'Step-by-step list' },
  { l:'Tip Callout',      k:'TIP',ic:'star',   ins:'> !tip ',              tip:'Highlighted tip box' },
  { l:'Warning Callout',  k:'WRN',ic:'bell',   ins:'> !warning ',          tip:'Warning highlight' },
  { l:'Info Callout',     k:'INF',ic:'eye',    ins:'> !info ',             tip:'Informational notice' },
  { l:'Toggle section',   k:'TOG',ic:'chevL',  ins:'> ? Toggle Title\nToggle content here...\n>>>\n', tip:'Collapsible block' },
  { l:'Quote',            k:'QT', ic:'chat',   ins:'> ',                   tip:'Blockquote style' },
  { l:'Code block',       k:'CD', ic:'code',   ins:'```javascript\n\n```', caretBack:4, tip:'Code snippet' },
  { l:'Table (3x3)',      k:'TB', ic:'grid',   ins:'\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Item A | Value 1 | Active |\n| Item B | Value 2 | Done |\n', tip:'Data table' },
  { l:'Divider',          k:'HR', ic:'minus',  ins:'\n---\n',              tip:'Horizontal separator' },
  { l:'Math equation',    k:'MTH',ic:'activity',ins:'$$ E = mc^2 $$',      tip:'Math formula block' },
  { l:'Current Date',     k:'DT', ic:'clock',  date:true,                  tip:'Insert today\'s date' },
  { l:'Add #Tag',         k:'TG', ic:'tag',    ins:'#ideas ',              tip:'Categorize for search' },
  { l:'Use Template',     k:'TMP',ic:'folder', template:true,              tip:'Insert full pre-made note' },
  { l:'Save as Prompt',   k:'PR', ic:'star',   prompt:true,                tip:'Save to Prompt Saver' }
];

function slashMenuFor(textarea){
  removeSlashMenu();
  const host = h('<div class="slash-menu" id="slash-menu"></div>');
  SLASH_ITEMS.forEach(it=>{
    const el = h(`<button class="sm-item" type="button">
      <span class="sm-ic">${icon(it.ic,14)}</span>
      <span class="sm-body"><b>${U.esc(it.l)}</b><span>${U.esc(it.tip)}</span></span>
      <span class="sm-kbd">${U.esc(it.k)}</span></button>`);
    el._data = it;
    el.onmousedown = (e)=>{
      e.preventDefault();
      applySlash(textarea, it);
    };
    host.appendChild(el);
  });
  document.body.appendChild(host);
  return host;
}

function positionSlashMenu(menu, textarea){
  const r = textarea.getBoundingClientRect();
  menu.style.left = Math.min(innerWidth - 290, Math.max(16, r.left + 24)) + 'px';
  menu.style.top  = Math.min(innerHeight - 380, r.top + 70) + 'px';
}

function removeSlashMenu(){ const m = q('#slash-menu'); if(m) m.remove(); }

function applySlash(textarea, it){
  removeSlashMenu();
  let v = textarea.value, pos = textarea.selectionStart;
  const before = v.slice(0, pos);
  const slashPos = before.lastIndexOf('/');
  if(slashPos >= 0 && (slashPos === 0 || /\s/.test(before[slashPos-1]))){
    v = v.slice(0, slashPos) + v.slice(pos);
    pos = slashPos;
  }

  if(it.template){
    openTemplateModal(textarea);
    return;
  }
  if(it.prompt){
    const n = current();
    const body = v.slice(0, pos).split('\n').pop() || (n ? n.body : '');
    NX.newPrompt({ title: (n ? n.title : 'Prompt'), body });
    return;
  }

  let insert = it.ins || '';
  if(it.date){
    insert = new Date().toLocaleDateString(undefined, { weekday:'long', year:'numeric', month:'long', day:'numeric' }) + ' ';
  }
  if(/^([#>|\-\$]|`)/.test(insert) && pos > 0 && v[pos-1] !== '\n'){
    insert = '\n' + insert;
  }

  const caret = it.caretBack ? pos + insert.length - it.caretBack : pos + insert.length;
  textarea.value = v.slice(0, pos) + insert + v.slice(pos);
  textarea.selectionStart = textarea.selectionEnd = caret;
  textarea.focus();
  textarea.dispatchEvent(new Event('input'));
  NX.sfx.play('pop');
}

function openTemplateModal(textarea){
  const list = TEMPLATES.map((t, idx) => `
    <div class="template-choice card" data-idx="${idx}" style="cursor:pointer;padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:12px">
      <div class="tile sm" style="background:var(--green-soft);color:var(--green-deep)">${icon(t.icon)}</div>
      <div style="flex:1"><b style="font-size:13.5px">${U.esc(t.name)}</b></div>
      <span class="btn btn-soft btn-sm">Use</span>
    </div>
  `).join('');

  const body = h(`<div><p class="faint small" style="margin-bottom:12px">Choose a template to insert into your note:</p>${list}</div>`);
  NX.modal({
    title: 'Insert Template',
    icon: 'folder',
    body,
    footer: [{ label:'Cancel', cls:'btn-soft' }]
  });

  qa('.template-choice', body).forEach(el => {
    el.onclick = () => {
      const idx = +el.dataset.idx;
      const t = TEMPLATES[idx];
      if(t){
        textarea.value = t.body;
        textarea.focus();
        textarea.dispatchEvent(new Event('input'));
        NX.closeAllModals();
        NX.toastOk('Template applied', t.name);
      }
    };
  });
}

/* ---------------- Note Creation ---------------- */
let globalSaveTimer = null;
let globalPersistFn = null;

NX.newNote = function(folder){
  if(globalSaveTimer && globalPersistFn){
    clearTimeout(globalSaveTimer);
    globalPersistFn();
  }
  const n = {
    id: U.uid('nt'),
    title: 'Untitled Note',
    body: '# Untitled Note\n\nStart writing here… Type **/** to insert checklists, tables, headings, or callouts.',
    tags: [],
    pinned: false,
    updated: Date.now(),
    folder: folder || curFolder || ''
  };
  const list = notes();
  list.unshift(n);
  saveNotes(list);
  curNoteId = n.id;
  NX.sfx.play('pop');
  syncToDisk(n);
  if(NX.router.currentName === 'notes' && window.__nx_refreshNotesView){
    window.__nx_refreshNotesView();
  } else {
    NX.router.go('notes');
  }
};

/* ---------------- Notes Module View ---------------- */
NX.routeInShell('notes', 'Notes', 'notes', function(view){
  if(!notes().length){
    saveNotes([{
      id: U.uid('nt'),
      title: 'Welcome to PebbleX Notes',
      body: `# Welcome to PebbleX Notes 📝

Your notes live as **real .md files** in \`Documents/PebbleX Notes\`.

## ⚡ Quick Guide
- Type **/** anywhere in the editor to open the Notion-style command palette!
- Click **Split / Edit / Preview** at the top right to switch layouts.
- Click any checkbox in the live preview to toggle it!

## 🚀 Interactive Features
- [x] Tested the local desktop vault
- [ ] Try pressing **/** for headings, tables & callouts
- [ ] Save an important prompt to Prompt Saver

> !tip Everything autosaves immediately — both to the app database and your disk vault.`,
      tags: ['welcome'],
      pinned: true,
      updated: Date.now(),
      folder: ''
    }]);
  }

  if(!curNoteId || !notes().find(n=>n.id===curNoteId)){
    curNoteId = current() ? current().id : null;
  }
  const isCollapsed = !!NX.store.get('ui:notesSidebarCollapsed', false);

  view.innerHTML = `
  <div class="page" style="height:100%;padding-bottom:0">
    <div class="notes-layout ${isCollapsed ? 'collapsed' : ''}" id="nt-layout">
      <!-- Left sidebar: Search, Folders, Notes list -->
      <div class="notes-list-col">
        <div class="row gap-8">
          <div class="search-box" style="flex:1;width:auto">${icon('search')}<input id="nt-search" placeholder="Search notes…"></div>
          <button class="btn btn-dark" id="nt-new" data-tip="New note">${icon('plus')} New</button>
          <button class="icon-btn sm" id="nt-collapse-sidebar" data-tip="Hide notes list" style="flex:none">${icon('chevL',14)}</button>
        </div>
        <div class="nt-folders" id="nt-folders"></div>
        <div class="notes-scroll" id="nt-list"></div>
        <div class="row gap-6" style="margin-top:8px">
          <button class="btn btn-soft btn-sm" id="nt-import" style="flex:1">${icon('download')} Import .md</button>
          <button class="btn btn-soft btn-sm" id="nt-template">${icon('folder')} Templates</button>
          <button class="btn btn-soft btn-sm" id="nt-graph" data-tip="Knowledge Graph View">${icon('activity',13)} Graph</button>
          <button class="icon-btn sm" id="nt-open-vault" data-tip="Open real notes folder on disk">${icon('folder')}</button>
        </div>
        <div class="nt-disk faint tiny" id="nt-disk"></div>
      </div>

      <!-- Right Editor: Toolbar, Split views, Stats -->
      <div class="card note-editor anim-in">
        <div id="ne-trash-banner-host"></div>
        <div class="ne-head">
          <button class="icon-btn sm" id="nt-expand-sidebar" data-tip="Show notes list" style="margin-right:4px;display:${isCollapsed ? 'inline-flex' : 'none'}">${icon('chevR',14)}</button>
          <input class="ne-title" id="ne-title" placeholder="Note title">
          <div class="nt-tools">
            <div class="seg sm" id="ne-view-modes" role="tablist" style="margin-right:6px">
              <button role="tab" class="${viewMode==='split'?'on':''}" data-m="split" data-tip="Split view">Split</button>
              <button role="tab" class="${viewMode==='edit'?'on':''}" data-m="edit" data-tip="Editor only">Edit</button>
              <button role="tab" class="${viewMode==='preview'?'on':''}" data-m="preview" data-tip="Reader preview">Read</button>
            </div>
            <button class="icon-btn sm" id="ne-folder" data-tip="Move to folder">${icon('layers')}</button>
            <button class="icon-btn sm" id="ne-pin" data-tip="Pin note to top">${icon('pin')}</button>
            <button class="icon-btn sm" id="ne-copy" data-tip="Copy note markdown">${icon('copy')}</button>
            <button class="icon-btn sm" id="ne-dup" data-tip="Duplicate note">${icon('plus')}</button>
            <button class="icon-btn sm" id="ne-export" data-tip="Export note as .md">${icon('download')}</button>
            <button class="icon-btn sm" id="ne-del" data-tip="Delete note" style="color:var(--red)">${icon('trash')}</button>
          </div>
        </div>

        <div class="ne-toolbar" id="ne-toolbar">
          ${[['H1','hash','Heading 1'],['H2','hash','Heading 2'],['TD','check','To-do task'],['UL','list','Bullet list'],['TB','grid','Table'],['QT','chat','Quote'],['CD','code','Code'],['TIP','star','Tip callout'],['WRN','bell','Warning']].map(([k,ic,tip])=>`<button class="nt-tb" data-slash="${k}" data-tip="${tip}">${icon(ic,13)}</button>`).join('')}
          <div style="height:14px;width:1px;background:var(--line);margin:0 4px"></div>
          <button class="nt-fmt" data-fmt="bold" data-tip="Bold (Ctrl+B)"><b>B</b></button>
          <button class="nt-fmt" data-fmt="italic" data-tip="Italic (Ctrl+I)"><i>I</i></button>
          <button class="nt-fmt" data-fmt="strike" data-tip="Strikethrough"><del>S</del></button>
          <button class="nt-fmt" data-fmt="code" data-tip="Inline code">&lt;/&gt;</button>
          <button class="nt-fmt" data-fmt="mark" data-tip="Highlight text">🖍️</button>
          <span style="flex:1"></span>
          <span class="faint tiny">Type <b>/</b> for Notion blocks · <b>[[</b> to link</span>
        </div>

        <div class="ne-split mode-${viewMode}" id="ne-split-container">
          <textarea class="ne-body" id="ne-body" placeholder="Start writing… type / for Notion commands or [[ to link notes."></textarea>
          <div class="ne-preview" id="ne-preview-box"></div>
        </div>
        <div id="ne-backlinks-host"></div>

        <div class="ne-foot">
          <span id="ne-saved">Saved just now</span>
          <span class="faint tiny" style="margin-left:14px" id="ne-stats">0 words · 0 chars</span>
          <span style="flex:1"></span>
          <span id="ne-tags"></span>
        </div>
      </div>
    </div>
  </div>`;

  const ta = q('#ne-body', view);
  const previewBox = q('#ne-preview-box', view);
  const splitContainer = q('#ne-split-container', view);

  function calculateStats(text){
    const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
    const chars = (text || '').length;
    const readMin = Math.max(1, Math.ceil(words / 200));
    return `${words} words · ${chars} chars · ~${readMin} min read`;
  }

  function filtered(){
    const s = listQuery.toLowerCase();
    const all = notes();
    if(curFolder === '__trash'){
      return all.filter(n => n.trash)
        .filter(n => !s || (n.title + ' ' + n.body + ' ' + (n.tags || []).join(' ')).toLowerCase().includes(s))
        .sort((a,b) => (b.trashedAt || b.updated) - (a.trashedAt || a.updated));
    }
    return all.filter(n => !n.trash)
      .filter(n => (curFolder ? (n.folder || '') === curFolder : true))
      .filter(n => curTag === 'all' || (n.tags || []).includes(curTag))
      .filter(n => !s || (n.title + ' ' + n.body + ' ' + (n.tags || []).join(' ')).toLowerCase().includes(s))
      .sort((a,b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updated - a.updated);
  }

  function promptNewFolder(){
    const body = h(`<div><div class="field"><label>New Folder Name</label><input class="input" id="new-fld-name" placeholder="e.g. Projects, Personal, Work"></div></div>`);
    NX.modal({
      title: 'Create Folder',
      icon: 'layers',
      body,
      footer: [
        { label: 'Cancel', cls: 'btn-soft' },
        { label: 'Create', cls: 'btn-green', onClick: () => {
          const name = q('#new-fld-name', body).value.trim();
          if(!name) return;
          vault.folders = vault.folders || [];
          if(!vault.folders.includes(name)) vault.folders.push(name);
          NX.store.set('vault_folders', vault.folders);
          curFolder = name;
          NX.closeAllModals();
          renderFolders(); renderList();
          NX.toastOk('Folder created', name);
        }}
      ]
    });
    setTimeout(() => q('#new-fld-name', body) && q('#new-fld-name', body).focus(), 40);
  }

  function promptRenameFolder(oldName){
    const body = h(`<div><div class="field"><label>Rename Folder</label><input class="input" id="ren-fld-name" value="${U.esc(oldName)}"></div></div>`);
    NX.modal({
      title: 'Rename Folder',
      icon: 'edit',
      body,
      footer: [
        { label: 'Cancel', cls: 'btn-soft' },
        { label: 'Save', cls: 'btn-green', onClick: () => {
          const newName = q('#ren-fld-name', body).value.trim();
          if(!newName || newName === oldName) return;
          const all = notes();
          all.forEach(n => { if((n.folder||'') === oldName) n.folder = newName; });
          saveNotes(all);
          vault.folders = (vault.folders || []).map(f => f === oldName ? newName : f);
          NX.store.set('vault_folders', vault.folders);
          if(curFolder === oldName) curFolder = newName;
          NX.closeAllModals();
          renderFolders(); renderList(); loadEditor();
          NX.toastOk('Folder renamed', newName);
        }}
      ]
    });
  }

  function promptDeleteFolder(folderName){
    NX.confirm('Delete Folder?', `Delete folder "${folderName}"? Notes inside will be moved to root.`, () => {
      const all = notes();
      all.forEach(n => { if((n.folder||'') === folderName) n.folder = ''; });
      saveNotes(all);
      vault.folders = (vault.folders || []).filter(f => f !== folderName);
      NX.store.set('vault_folders', vault.folders);
      if(curFolder === folderName) curFolder = '';
      renderFolders(); renderList(); loadEditor();
      NX.toastOk('Folder deleted');
    });
  }

  function renderFolders(){
    const host = q('#nt-folders', view);
    if(!host) return;
    const allFolders = folders();
    const allNotes = notes();
    const activeNotes = allNotes.filter(n => !n.trash);
    const trashCount = allNotes.filter(n => n.trash).length;
    const counts = {};
    activeNotes.forEach(n => { const f = n.folder || ''; counts[f] = (counts[f]||0) + 1; });

    host.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 4px 6px">
        <span class="faint tiny bold" style="text-transform:uppercase;letter-spacing:.05em">Folders</span>
        <button class="icon-btn sm" id="nt-add-folder" data-tip="New folder" style="width:22px;height:22px">${icon('plus',12)}</button>
      </div>
      <button class="nt-folder ${curFolder===''?'on':''}" data-f="">${icon('notes',14)} All notes <span class="n">${activeNotes.length}</span></button>
      ${allFolders.map(f=>`
        <button class="nt-folder ${curFolder===f?'on':''}" data-f="${U.esc(f)}" data-folder-name="${U.esc(f)}">
          <span class="fld-ic">${icon('layers',14)}</span> <span class="ellipsis" style="flex:1">${U.esc(f)}</span>
          <span class="n">${counts[f]||0}</span>
        </button>
      `).join('')}
      ${curTag !== 'all' ? `<div style="padding:4px 2px"><button class="chip active" id="nt-clear-tag" style="height:24px;font-size:11px">Filter: #${U.esc(curTag)} <span style="font-weight:900;margin-left:4px">&times;</span></button></div>` : ''}
      <div style="height:1px;background:var(--line);margin:6px 0"></div>
      <button class="nt-folder ${curFolder==='__trash'?'on':''}" data-f="__trash" style="color:${trashCount>0?'var(--red)':'var(--ink-3)'}">
        ${icon('trash',14)} Trash <span class="n" style="${trashCount>0?'color:var(--red);font-weight:700':''}">${trashCount}</span>
      </button>
    `;

    const addFldBtn = q('#nt-add-folder', host);
    if(addFldBtn) addFldBtn.onclick = () => promptNewFolder();

    qa('.nt-folder', host).forEach(b => {
      b.onclick = () => { curFolder = b.dataset.f; renderFolders(); renderList(); };

      // Right-click on folder
      b.oncontextmenu = (e) => {
        e.preventDefault();
        const fName = b.dataset.folderName;
        if(b.dataset.f === '__trash'){
          if(trashCount > 0){
            NX.menu(e, [{ label: 'Empty Trash', icon: 'trash', danger: true, onClick: emptyTrash }]);
          }
          return;
        }
        if(!fName){
          NX.menu(e, [
            { label: 'New Note', icon: 'plus', onClick: () => NX.newNote() },
            { label: 'New Folder…', icon: 'folder', onClick: promptNewFolder }
          ]);
          return;
        }
        NX.menu(e, [
          { label: 'New Note in "' + fName + '"', icon: 'plus', onClick: () => NX.newNote(fName) },
          { label: 'Rename folder…', icon: 'edit', onClick: () => promptRenameFolder(fName) },
          '-',
          { label: 'Delete folder', icon: 'trash', danger: true, onClick: () => promptDeleteFolder(fName) }
        ]);
      };

      // Drag and drop target on folder
      b.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        b.classList.add('drag-target');
      };
      b.ondragleave = () => b.classList.remove('drag-target');
      b.ondrop = (e) => {
        e.preventDefault();
        b.classList.remove('drag-target');
        const noteId = e.dataTransfer.getData('text/plain') || window.__draggedNoteId;
        if(!noteId) return;
        const all = notes();
        const n = all.find(x => x.id === noteId);
        if(!n) return;
        if(b.dataset.f === '__trash'){
          n.trash = true;
          n.trashedAt = Date.now();
          saveNotes(all);
          renderFolders(); renderList(); loadEditor();
          NX.sfx.play('pop');
          NX.toastOk('Note moved to Trash', n.title);
        } else {
          n.folder = b.dataset.f || '';
          n.trash = false;
          n.updated = Date.now();
          saveNotes(all);
          syncToDisk(n);
          renderFolders(); renderList(); loadEditor();
          NX.sfx.play('pop');
          NX.toastOk('Moved to ' + (n.folder || 'All notes'), n.title);
        }
      };
    });

    const clearTagBtn = q('#nt-clear-tag', host);
    if(clearTagBtn){
      clearTagBtn.onclick = () => { curTag = 'all'; renderFolders(); renderList(); };
    }
  }

  function selectNote(noteId){
    if(curNoteId === noteId) return;
    if(globalSaveTimer && globalPersistFn){
      clearTimeout(globalSaveTimer);
      globalPersistFn();
    }
    curNoteId = noteId;
    renderList();
    loadEditor();
    NX.sfx.play('click');
  }

  function openNoteContextMenu(e, n){
    if(n.trash){
      NX.menu(e, [
        { label: 'Restore Note', icon: 'refresh', onClick: () => restoreNote(n) },
        '-',
        { label: 'Delete Permanently', icon: 'trash', danger: true, onClick: () => permanentlyDeleteNote(n) }
      ]);
      return;
    }
    NX.menu(e, [
      { label: n.pinned ? 'Unpin from top' : 'Pin to top', icon: 'pin', onClick: () => {
        n.pinned = !n.pinned; saveNotes(notes()); renderList(); loadEditor(); NX.sfx.play('pop');
      }},
      { label: 'Move to folder…', icon: 'layers', onClick: () => moveNoteModal(n) },
      { label: 'Duplicate', icon: 'plus', onClick: () => duplicateNote(n) },
      { label: 'Copy Markdown', icon: 'copy', onClick: () => NX.native.clipboardWrite(n.body).then(()=>NX.toastOk('Copied to clipboard')) },
      { label: 'Export as .md', icon: 'download', onClick: () => exportNote(n) },
      '-',
      { label: 'Move to Trash', icon: 'trash', danger: true, onClick: () => trashNote(n) }
    ]);
  }

  function renderList(){
    const host = q('#nt-list', view);
    const f = filtered();
    host.innerHTML = '';

    if(curFolder === '__trash' && f.length){
      const topBar = h(`<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px 6px">
        <span class="faint tiny bold" style="color:var(--red)">Trash (${f.length})</span>
        <button class="btn btn-sm btn-soft" id="nt-empty-trash" style="color:var(--red);height:24px;font-size:11px">${icon('trash',12)} Empty</button>
      </div>`);
      host.appendChild(topBar);
      q('#nt-empty-trash', topBar).onclick = emptyTrash;
    }

    if(!f.length){
      host.innerHTML = `<div class="empty" style="padding:24px"><div class="e-sub">${curFolder==='__trash'?'Trash is empty.':'No notes found. Click "+ New" to create one.'}</div></div>`;
      return;
    }

    f.forEach(n => {
      const el = h(`<div class="note-card ${n.id===curNoteId?'on':''}" draggable="true" data-id="${n.id}">
        <div class="nc-title">${n.pinned ? `<span class="pin" style="color:var(--orange)">${icon('pin',13)}</span> ` : ''}${U.esc(n.title || 'Untitled')}</div>
        <div class="nc-prev">${U.esc((n.body||'').replace(/[#>*`\-\[\]]/g,'').slice(0, 100) || 'Empty note')}</div>
        <div class="nc-meta">${n.folder ? `<span class="fld-chip">${U.esc(n.folder)}</span>` : ''}${(n.tags||[]).map(t=>`<span class="tagchip">#${U.esc(t)}</span>`).join('')}
          <span class="faint tiny" style="margin-left:auto">${n.mdRel ? '<span class="disk-dot" title="Synced to disk"></span>' : ''}${U.esc(U.relTime(n.updated))}</span></div>
      </div>`);

      el.onclick = () => selectNote(n.id);

      el.ondragstart = (e) => {
        el.classList.add('dragging');
        window.__draggedNoteId = n.id;
        e.dataTransfer.setData('text/plain', n.id);
        e.dataTransfer.effectAllowed = 'move';
      };
      el.ondragend = () => {
        el.classList.remove('dragging');
        window.__draggedNoteId = null;
      };

      el.oncontextmenu = (e) => {
        e.preventDefault();
        openNoteContextMenu(e, n);
      };

      host.appendChild(el);
    });
  }

  function loadEditor(){
    const n = current();
    const bannerHost = q('#ne-trash-banner-host', view);
    if(bannerHost){
      if(n && n.trash){
        bannerHost.innerHTML = `
          <div class="note-trash-banner">
            <span>${icon('trash',14)} <b>Note is in Trash.</b> Restore it to edit or keep.</span>
            <div class="row gap-6">
              <button class="btn btn-sm btn-soft" id="ne-restore-btn">${icon('refresh',12)} Restore</button>
              <button class="btn btn-sm btn-soft" id="ne-purge-btn" style="color:var(--red)">${icon('trash',12)} Delete Permanently</button>
            </div>
          </div>`;
        q('#ne-restore-btn', bannerHost).onclick = () => restoreNote(n);
        q('#ne-purge-btn', bannerHost).onclick = () => permanentlyDeleteNote(n);
      } else {
        bannerHost.innerHTML = '';
      }
    }

    if(!n){
      q('#ne-title', view).value = '';
      ta.value = '';
      previewBox.innerHTML = '';
      q('#ne-stats', view).textContent = '0 words · 0 chars';
      return;
    }
    q('#ne-title', view).value = n.title;
    ta.value = n.body || '';
    q('#ne-pin', view).style.color = n.pinned ? 'var(--orange)' : '';
    q('#ne-tags', view).innerHTML = (n.tags||[]).map(t=>`<span class="tagchip">#${U.esc(t)}</span>`).join(' ');
    q('#ne-saved', view).textContent = 'Saved ' + U.relTime(n.updated);
    q('#ne-stats', view).textContent = calculateStats(n.body);
    refreshPreview();
    renderBacklinks();
  }

  function refreshPreview(){
    previewBox.innerHTML = mdRender(ta.value);
    // Wire up interactive task checkboxes in preview!
    qa('.md-task-cb', previewBox).forEach(cb => {
      cb.onclick = (e) => {
        e.stopPropagation();
        const lineIdx = +cb.dataset.line;
        const lines = ta.value.split('\n');
        if(lines[lineIdx] !== undefined){
          if(cb.checked){
            lines[lineIdx] = lines[lineIdx].replace(/\[ \]/, '[x]');
          } else {
            lines[lineIdx] = lines[lineIdx].replace(/\[[xX]\]/, '[ ]');
          }
          ta.value = lines.join('\n');
          persist();
          NX.sfx.play('tick');
        }
      };
    });

    // Wire up Obsidian-style [[wikilinks]] in preview!
    qa('.md-wikilink', previewBox).forEach(el => {
      el.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetTitle = (el.dataset.wikilink || '').trim();
        if(!targetTitle) return;
        const all = notes().filter(x => !x.trash);
        const target = all.find(x => (x.title || '').trim().toLowerCase() === targetTitle.toLowerCase());
        if(target){
          selectNote(target.id);
          NX.toastOk('Opened note', target.title);
        } else {
          NX.confirm('Create new note?', `Note "${targetTitle}" does not exist yet. Create it now?`, () => {
            const newN = {
              id: U.uid('nt'),
              title: targetTitle,
              body: `# ${targetTitle}\n\n*Linked from [[${current() ? (current().title || 'Note') : 'Note'}]]*\n\nStart writing here...\n`,
              folder: current() ? (current().folder || '') : '',
              tags: ['linked'],
              pinned: false,
              updated: Date.now()
            };
            const list = notes();
            list.unshift(newN);
            saveNotes(list);
            curNoteId = newN.id;
            renderFolders();
            renderList();
            loadEditor();
            NX.toastOk('Created linked note', targetTitle);
            NX.sfx.play('pop');
          });
        }
      };
    });
  }

  function persist(){
    const all = notes();
    const n = all.find(x => x.id === curNoteId);
    if(!n) return;
    let titleVal = (q('#ne-title', view)?.value || '').trim();
    n.body = ta.value;
    // Auto-sync title from first # Heading if title was untitled/empty
    if(!titleVal || titleVal === 'Untitled Note'){
      const h1Match = n.body.match(/^#\s+(.+)$/m);
      if(h1Match && h1Match[1].trim()){
        titleVal = h1Match[1].trim();
        const titleEl = q('#ne-title', view);
        if(titleEl) titleEl.value = titleVal;
      }
    }
    n.title = titleVal || 'Untitled Note';
    const foundTags = new Set((n.body.match(/#[a-zA-Z0-9_-]{2,20}/g)||[]).map(t=>t.slice(1).toLowerCase()));
    n.tags = Array.from(foundTags).slice(0, 8);
    n.updated = Date.now();
    saveNotes(all);

    // Synchronize card title and snippet in sidebar immediately
    const cardTitle = q(`.note-card[data-id="${curNoteId}"] .nc-title`, view);
    if(cardTitle){
      cardTitle.innerHTML = (n.pinned ? `<span class="pin" style="color:var(--orange)">${icon('pin',13)}</span> ` : '') + U.esc(n.title);
    }
    const cardPrev = q(`.note-card[data-id="${curNoteId}"] .nc-prev`, view);
    if(cardPrev){
      cardPrev.textContent = (n.body||'').replace(/[#>*`\-\[\]]/g,'').slice(0, 100).trim() || 'Empty note';
    }

    const savedEl = q('#ne-saved', view);
    if(savedEl) savedEl.textContent = 'Saved just now';
    const statsEl = q('#ne-stats', view);
    if(statsEl) statsEl.textContent = calculateStats(n.body);
    const tagsEl = q('#ne-tags', view);
    if(tagsEl){
      tagsEl.innerHTML = n.tags.map(t=>`<span class="tagchip" style="cursor:pointer" data-tag="${U.esc(t)}">#${U.esc(t)}</span>`).join(' ');
      qa('.tagchip', tagsEl).forEach(chip => {
        chip.onclick = () => { curTag = chip.dataset.tag; renderFolders(); renderList(); };
      });
    }
    syncToDisk(n);
    refreshPreview();
    renderBacklinks();
  }

  /* ---------------- Obsidian-Style Wikilinks & Backlinks ---------------- */
  let wikiMenu = null;
  function removeWikiMenu(){
    if(wikiMenu){ wikiMenu.remove(); wikiMenu = null; }
  }

  function maybeWikiLink(textarea){
    const pos = textarea.selectionStart;
    const val = textarea.value.slice(0, pos);
    const match = val.match(/\[\[([^\]\n]*)$/);
    if(!match){
      removeWikiMenu();
      return;
    }
    const query = match[1].toLowerCase().trim();
    const allNotes = notes().filter(n => !n.trash && n.id !== curNoteId);
    const matches = allNotes.filter(n => (n.title || '').toLowerCase().includes(query)).slice(0, 6);
    if(!matches.length){
      removeWikiMenu();
      return;
    }
    showWikiMenu(textarea, matches, match[0]);
  }

  function showWikiMenu(textarea, matches, queryPrefix){
    removeWikiMenu();
    wikiMenu = h(`<div class="wikilink-menu" id="wikilink-menu">
      <div style="padding:6px 10px 4px;font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--ink-3);border-bottom:1px solid var(--line)">Link to note</div>
      ${matches.map(n => `<div class="wl-item" data-title="${U.esc(n.title)}">
        <span style="font-size:14px">📄</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b>${U.esc(n.title)}</b></span>
        ${n.folder ? `<span class="fld-chip" style="font-size:10px">${U.esc(n.folder)}</span>` : ''}
      </div>`).join('')}
    </div>`);

    document.body.appendChild(wikiMenu);
    const r = textarea.getBoundingClientRect();
    wikiMenu.style.left = Math.min(innerWidth - 280, Math.max(20, r.left + 30)) + 'px';
    wikiMenu.style.top = Math.min(innerHeight - 260, r.top + 80) + 'px';

    qa('.wl-item', wikiMenu).forEach(item => {
      item.onmousedown = (e) => {
        e.preventDefault();
        const chosen = item.dataset.title;
        insertWikiLink(textarea, chosen, queryPrefix);
      };
    });
  }

  function insertWikiLink(textarea, chosenTitle, queryPrefix){
    removeWikiMenu();
    const pos = textarea.selectionStart;
    const v = textarea.value;
    const before = v.slice(0, pos - queryPrefix.length);
    const after = v.slice(pos);
    const insert = `[[${chosenTitle}]] `;
    textarea.value = before + insert + after;
    textarea.selectionStart = textarea.selectionEnd = before.length + insert.length;
    textarea.focus();
    persist();
    renderList();
    NX.sfx.play('pop');
  }

  function renderBacklinks(){
    const host = q('#ne-backlinks-host', view);
    if(!host) return;
    const n = current();
    if(!n || n.trash){ host.innerHTML = ''; return; }
    const title = (n.title || '').trim().toLowerCase();
    if(!title || title === 'untitled note'){ host.innerHTML = ''; return; }

    const all = notes().filter(x => !x.trash && x.id !== n.id);
    const linking = all.filter(x => {
      const b = (x.body || '').toLowerCase();
      return b.includes(`[[${title}]]`) || b.includes(`[[${title}|`);
    });

    if(!linking.length){
      host.innerHTML = '';
      return;
    }

    host.innerHTML = `
      <div class="ne-backlinks-panel">
        <div class="ne-bl-title">${icon('layers', 14)} <b>Linked References (${linking.length})</b></div>
        <div class="ne-bl-list">
          ${linking.map(x => {
            const snippet = extractSnippet(x.body, n.title);
            return `<div class="ne-bl-item" data-id="${x.id}">
              <div class="ne-bl-name">📄 <b>${U.esc(x.title || 'Untitled')}</b></div>
              <div class="ne-bl-snippet">${U.esc(snippet)}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;

    qa('.ne-bl-item', host).forEach(el => {
      el.onclick = () => selectNote(el.dataset.id);
    });
  }

  function extractSnippet(body, targetTitle){
    const lines = (body || '').split('\n');
    const matchLine = lines.find(l => l.toLowerCase().includes(targetTitle.toLowerCase()));
    if(matchLine) return matchLine.trim().slice(0, 120);
    return (body || '').slice(0, 80) + '...';
  }

  /* ---------------- Knowledge Graph Modal ---------------- */
  function openNotesGraphModal(){
    const activeNotes = notes().filter(n => !n.trash);
    if(!activeNotes.length){
      NX.toastInfo('No notes yet', 'Create some notes to visualize your knowledge graph.');
      return;
    }

    const titleToId = new Map();
    activeNotes.forEach(n => titleToId.set((n.title||'').trim().toLowerCase(), n.id));

    const nodes = activeNotes.map((n, i) => {
      const angle = (i / activeNotes.length) * Math.PI * 2;
      const dist = 120 + Math.random() * 80;
      return {
        id: n.id,
        title: n.title || 'Untitled',
        folder: n.folder || 'root',
        tags: n.tags || [],
        color: U.colorFor(n.folder || n.title),
        x: 350 + Math.cos(angle) * dist,
        y: 220 + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        radius: 12 + Math.min(10, (n.body||'').length / 200)
      };
    });

    const links = [];
    activeNotes.forEach(n => {
      const body = n.body || '';
      const matches = Array.from(body.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g));
      matches.forEach(m => {
        const targetTitle = (m[1]||'').trim().toLowerCase();
        const targetId = titleToId.get(targetTitle);
        if(targetId && targetId !== n.id){
          links.push({ source: n.id, target: targetId });
        }
      });
    });

    const body = h(`<div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span class="faint small"><b>${nodes.length}</b> notes · <b>${links.length}</b> connections · Drag nodes to explore</span>
        <span class="faint tiny">Click any node to open note</span>
      </div>
      <div style="position:relative;width:100%;height:440px;background:var(--surface-2);border-radius:12px;overflow:hidden;border:1px solid var(--line)">
        <canvas id="graph-canvas" width="680" height="440" style="display:block;width:100%;height:100%;cursor:grab"></canvas>
      </div>
    </div>`);

    NX.modal({
      title: 'Knowledge Graph View',
      icon: 'activity',
      body,
      footer: [
        { label: 'Close', cls: 'btn-soft' }
      ]
    });

    setTimeout(() => {
      const canvas = q('#graph-canvas', body);
      if(!canvas) return;
      const ctx = canvas.getContext('2d');
      let W = canvas.width = canvas.parentElement.clientWidth || 680;
      let H = canvas.height = 440;
      let animId = null;
      let draggedNode = null;
      let hoveredNode = null;

      function step(){
        for(let i=0; i<nodes.length; i++){
          for(let j=i+1; j<nodes.length; j++){
            const dx = nodes[j].x - nodes[i].x;
            const dy = nodes[j].y - nodes[i].y;
            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            if(dist < 180){
              const force = (180 - dist) / dist * 0.12;
              nodes[i].vx -= dx * force;
              nodes[i].vy -= dy * force;
              nodes[j].vx += dx * force;
              nodes[j].vy += dy * force;
            }
          }
        }

        links.forEach(l => {
          const s = nodes.find(n => n.id === l.source);
          const t = nodes.find(n => n.id === l.target);
          if(s && t){
            const dx = t.x - s.x;
            const dy = t.y - s.y;
            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            const force = (dist - 100) * 0.005;
            s.vx += dx * force;
            s.vy += dy * force;
            t.vx -= dx * force;
            t.vy -= dy * force;
          }
        });

        const cx = W / 2, cy = H / 2;
        nodes.forEach(n => {
          if(n !== draggedNode){
            n.vx += (cx - n.x) * 0.0015;
            n.vy += (cy - n.y) * 0.0015;
            n.x += n.vx;
            n.y += n.vy;
            n.vx *= 0.85;
            n.vy *= 0.85;
            n.x = Math.max(n.radius, Math.min(W - n.radius, n.x));
            n.y = Math.max(n.radius, Math.min(H - n.radius, n.y));
          }
        });

        ctx.clearRect(0, 0, W, H);

        ctx.lineWidth = 1.5;
        links.forEach(l => {
          const s = nodes.find(n => n.id === l.source);
          const t = nodes.find(n => n.id === l.target);
          if(s && t){
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(t.x, t.y);
            ctx.strokeStyle = 'rgba(124, 213, 110, 0.4)';
            ctx.stroke();
          }
        });

        nodes.forEach(n => {
          const isHover = n === hoveredNode;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + (isHover ? 3 : 0), 0, Math.PI * 2);
          ctx.fillStyle = n.color;
          ctx.fill();
          ctx.strokeStyle = isHover ? '#fff' : 'rgba(255,255,255,0.4)';
          ctx.lineWidth = isHover ? 3 : 1.5;
          ctx.stroke();

          ctx.font = isHover ? 'bold 12px sans-serif' : '11px sans-serif';
          ctx.fillStyle = isHover ? 'var(--ink)' : 'var(--ink-2)';
          ctx.textAlign = 'center';
          ctx.fillText(n.title.slice(0, 16), n.x, n.y + n.radius + 14);
        });

        animId = requestAnimationFrame(step);
      }

      animId = requestAnimationFrame(step);

      canvas.onmousedown = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        draggedNode = nodes.find(n => Math.hypot(n.x - mx, n.y - my) <= n.radius + 4);
        if(draggedNode) canvas.style.cursor = 'grabbing';
      };

      canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        if(draggedNode){
          draggedNode.x = mx;
          draggedNode.y = my;
          draggedNode.vx = draggedNode.vy = 0;
        } else {
          hoveredNode = nodes.find(n => Math.hypot(n.x - mx, n.y - my) <= n.radius + 4);
          canvas.style.cursor = hoveredNode ? 'pointer' : 'grab';
        }
      };

      window.addEventListener('mouseup', () => {
        if(draggedNode){ draggedNode = null; canvas.style.cursor = 'grab'; }
      });

      canvas.onclick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const clicked = nodes.find(n => Math.hypot(n.x - mx, n.y - my) <= n.radius + 4);
        if(clicked){
          NX.closeAllModals();
          cancelAnimationFrame(animId);
          selectNote(clicked.id);
          NX.toastOk('Opened note', clicked.title);
        }
      };
    }, 60);
  }

  globalPersistFn = persist;
  let saveTimer = null;
  const autosave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { persist(); renderList(); }, 350);
    globalSaveTimer = saveTimer;
  };

  q('#ne-title', view).addEventListener('input', (e) => {
    const val = e.target.value.trim() || 'Untitled Note';
    const cardTitle = q(`.note-card[data-id="${curNoteId}"] .nc-title`, view);
    if(cardTitle){
      const pinIcon = q(`.note-card[data-id="${curNoteId}"] .nc-title .pin`, view);
      cardTitle.innerHTML = (pinIcon ? pinIcon.outerHTML + ' ' : '') + U.esc(val);
    }
    autosave();
  });

  ta.addEventListener('input', () => {
    const prevText = ta.value.replace(/[#>*`\-\[\]]/g,'').slice(0, 100).trim() || 'Empty note';
    const cardPrev = q(`.note-card[data-id="${curNoteId}"] .nc-prev`, view);
    if(cardPrev) cardPrev.textContent = prevText;
    autosave();
    maybeSlash(ta);
    maybeWikiLink(ta);
  });

  // Format selection helper
  function wrapSelection(openTag, closeTag){
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = ta.value.slice(s, e);
    const before = ta.value.slice(0, s);
    const after = ta.value.slice(e);
    ta.value = before + openTag + (sel || 'text') + closeTag + after;
    ta.selectionStart = s + openTag.length;
    ta.selectionEnd = s + openTag.length + (sel.length || 4);
    ta.focus();
    autosave();
    NX.sfx.play('pop');
  }

  qa('.nt-fmt', view).forEach(b => {
    b.onclick = () => {
      const f = b.dataset.fmt;
      if(f === 'bold') wrapSelection('**', '**');
      else if(f === 'italic') wrapSelection('*', '*');
      else if(f === 'strike') wrapSelection('~~', '~~');
      else if(f === 'code') wrapSelection('`', '`');
      else if(f === 'mark') wrapSelection('==', '==');
    };
  });

  // Keyboard navigation & Shortcuts inside editor
  ta.addEventListener('keydown', e => {
    if(e.key === 'Escape') removeSlashMenu();
    const menu = q('#slash-menu');
    if(menu && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Tab')){
      const visible = qa('.sm-item', menu).filter(x => x.style.display !== 'none');
      if(visible.length){
        e.preventDefault();
        let idx = visible.findIndex(x => x.classList.contains('on'));
        if(idx < 0) idx = 0;
        if(e.key === 'Enter' || e.key === 'Tab'){
          applySlash(ta, visible[idx]._data);
          return;
        }
        const nextIdx = e.key === 'ArrowDown' ? (idx + 1) % visible.length : (idx - 1 + visible.length) % visible.length;
        visible.forEach(x => x.classList.remove('on'));
        visible[nextIdx].classList.add('on');
        visible[nextIdx].scrollIntoView({ block:'nearest' });
        return;
      }
    }
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b'){
      e.preventDefault(); wrapSelection('**', '**');
    } else if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i'){
      e.preventDefault(); wrapSelection('*', '*');
    } else if(e.key === 'Tab'){
      e.preventDefault();
      const s = ta.selectionStart;
      ta.value = ta.value.slice(0,s) + '  ' + ta.value.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = s + 2;
      autosave();
    }
  });

  ta.addEventListener('blur', () => setTimeout(removeSlashMenu, 150));

  function maybeSlash(textarea){
    removeSlashMenu();
    const pos = textarea.selectionStart;
    const before = textarea.value.slice(0, pos);
    const m = before.match(/(^|\n|[ \t])\/([a-zA-Z0-9]*)$/);
    if(m){
      const menu = slashMenuFor(textarea);
      positionSlashMenu(menu, textarea);
      const typed = m[2].toLowerCase();
      const items = qa('.sm-item', menu);
      items.forEach(el => {
        const it = el._data;
        const match = !typed || it.l.toLowerCase().includes(typed) || it.k.toLowerCase().includes(typed);
        el.style.display = match ? 'flex' : 'none';
        el.classList.remove('on');
      });
      const first = items.find(el => el.style.display !== 'none');
      if(first){
        first.classList.add('on');
      }
    }
  }

  // View modes: Split, Edit, Preview
  qa('#ne-view-modes button', view).forEach(b => {
    b.onclick = () => {
      viewMode = b.dataset.m;
      qa('#ne-view-modes button', view).forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
      splitContainer.className = `ne-split mode-${viewMode}`;
      refreshPreview();
    };
  });

  // Toolbar slash shortcuts
  qa('.nt-tb', view).forEach(b => {
    b.onclick = () => {
      const it = SLASH_ITEMS.find(x => x.k === b.dataset.slash);
      if(it) applySlash(ta, it);
    };
  });

  q('#nt-search', view).addEventListener('input', e => { listQuery = e.target.value; renderList(); });
  q('#nt-new', view).onclick = () => NX.newNote();
  q('#nt-template', view).onclick = () => openTemplateModal(ta);
  function setSidebarCollapsed(collapsed){
    const layout = q('#nt-layout', view);
    const expandBtn = q('#nt-expand-sidebar', view);
    if(layout) layout.classList.toggle('collapsed', collapsed);
    if(expandBtn) expandBtn.style.display = collapsed ? 'inline-flex' : 'none';
    NX.store.set('ui:notesSidebarCollapsed', collapsed);
  }

  const collapseBtn = q('#nt-collapse-sidebar', view);
  if(collapseBtn) collapseBtn.onclick = () => setSidebarCollapsed(true);
  const expandBtn = q('#nt-expand-sidebar', view);
  if(expandBtn) expandBtn.onclick = () => setSidebarCollapsed(false);

  // Right-click on empty list area
  const listEl = q('#nt-list', view);
  if(listEl){
    listEl.oncontextmenu = (e) => {
      if(e.target === listEl || e.target.closest('.empty')){
        e.preventDefault();
        NX.menu(e, [
          { label: 'New Note', icon: 'plus', onClick: () => NX.newNote(curFolder === '__trash' ? '' : curFolder) },
          { label: 'New Folder…', icon: 'folder', onClick: promptNewFolder }
        ]);
      }
    };
  }

  function trashNote(n){
    if(!n) return;
    const all = notes();
    const target = all.find(x => x.id === n.id);
    if(target){
      target.trash = true;
      target.trashedAt = Date.now();
      saveNotes(all);
    }
    renderFolders();
    renderList();
    if(curNoteId === n.id){
      const remaining = filtered();
      curNoteId = remaining.length ? remaining[0].id : null;
      loadEditor();
    }
    NX.toastOk('Note moved to Trash', n.title);
  }

  function restoreNote(n){
    if(!n) return;
    const all = notes();
    const target = all.find(x => x.id === n.id);
    if(target){
      target.trash = false;
      delete target.trashedAt;
      saveNotes(all);
    }
    renderFolders();
    renderList();
    loadEditor();
    NX.toastOk('Note restored', n.title);
  }

  async function permanentlyDeleteNote(n){
    if(!n) return;
    NX.confirm('Permanently Delete?', `"${n.title || 'Untitled'}" will be permanently removed. This cannot be undone.`, async () => {
      if(n.mdRel && NX.native.available && NX.native.mode === 'tauri'){
        await NX.native.invoke('note_delete_file', { rel: n.mdRel });
      }
      saveNotes(notes().filter(x => x.id !== n.id));
      if(curNoteId === n.id){
        const remaining = filtered();
        curNoteId = remaining.length ? remaining[0].id : null;
      }
      renderFolders();
      renderList();
      loadEditor();
      NX.toastOk('Note permanently deleted');
    });
  }

  async function emptyTrash(){
    const trashed = notes().filter(n => n.trash);
    if(!trashed.length) return;
    NX.confirm('Empty Trash?', `Permanently delete all ${trashed.length} note(s) in Trash? This cannot be undone.`, async () => {
      for(const n of trashed){
        if(n.mdRel && NX.native.available && NX.native.mode === 'tauri'){
          await NX.native.invoke('note_delete_file', { rel: n.mdRel });
        }
      }
      saveNotes(notes().filter(n => !n.trash));
      curNoteId = null;
      renderFolders();
      renderList();
      loadEditor();
      NX.toastOk('Trash emptied');
    });
  }

  function duplicateNote(n){
    if(!n) return;
    if(saveTimer){ clearTimeout(saveTimer); persist(); }
    const clone = {
      id: U.uid('nt'),
      title: (n.title || 'Untitled') + ' (Copy)',
      body: n.body,
      tags: [...(n.tags||[])],
      folder: n.folder || '',
      pinned: false,
      updated: Date.now()
    };
    const list = notes();
    list.unshift(clone);
    saveNotes(list);
    curNoteId = clone.id;
    renderFolders();
    renderList();
    loadEditor();
    syncToDisk(clone);
    NX.toastOk('Note duplicated', clone.title);
    NX.sfx.play('pop');
  }

  function exportNote(n){
    if(!n) return;
    const name = (n.title || 'note').replace(/[\\/:*?"<>|]/g, '-') + '.md';
    Promise.resolve(NX.native.saveTextFile(name, mdContent(n))).then(res => {
      NX.toastOk('Exported .md', res && res.path ? res.path : name);
    });
  }

  function moveNoteModal(n){
    if(!n) return;
    const all = folders();
    const body = h(`<div>
      <div class="field"><label>Folder name</label>
        <input class="input" id="nf-name" list="nf-list" placeholder="e.g. Work, Ideas, Sprints" value="${U.esc(n.folder||'')}">
        <datalist id="nf-list">${all.map(f=>`<option value="${U.esc(f)}">`).join('')}</datalist></div>
    </div>`);
    NX.modal({
      title: 'Move Note to Folder', icon: 'layers', body,
      footer: [
        { label:'Cancel', cls:'btn-soft' },
        { label:'Move', cls:'btn-green', onClick: async () => {
          const name = q('#nf-name', body).value.trim();
          const all = notes();
          const target = all.find(x => x.id === n.id);
          if(target){
            target.folder = name; target.trash = false; target.updated = Date.now();
            saveNotes(all);
            syncToDisk(target);
          }
          NX.closeAllModals();
          renderFolders(); renderList(); loadEditor();
          NX.toastOk(name ? 'Moved to ' + name : 'Moved to root');
        }}
      ]
    });
  }

  q('#ne-pin', view).onclick = () => {
    const all = notes();
    const target = all.find(x => x.id === curNoteId);
    if(target){ target.pinned = !target.pinned; saveNotes(all); renderList(); loadEditor(); NX.sfx.play('pop'); }
  };
  q('#ne-copy', view).onclick = () => {
    const n = current();
    if(n) NX.native.clipboardWrite(n.title + '\n\n' + n.body).then(()=>NX.toastOk('Copied to clipboard',''));
  };
  q('#ne-dup', view).onclick = () => duplicateNote(current());
  q('#ne-export', view).onclick = () => exportNote(current());
  q('#ne-del', view).onclick = () => {
    const n = current();
    if(!n) return;
    if(n.trash){
      permanentlyDeleteNote(n);
    } else {
      trashNote(n);
    }
  };

  q('#ne-folder', view).onclick = () => moveNoteModal(current());

  q('#nt-import', view).onclick = async () => {
    if(NX.native.available && NX.native.mode === 'tauri'){
      const picked = await NX.native.invoke('pick_text_files');
      const files = (picked && picked.ok && picked.data) || [];
      if(files.length){
        const list = notes();
        files.forEach(f => {
          const title = f.name.replace(/\.(md|txt)$/i,'');
          list.unshift({ id:U.uid('nt'), title, body:f.content||'', tags:['imported'], folder:curFolder||'Imported', pinned:false, updated:Date.now() });
          syncToDisk(list[0]);
        });
        saveNotes(list);
        renderFolders(); renderList();
        NX.toastOk('Imported ' + files.length + ' file(s)');
        return;
      }
    }
    // Web fallback
    const inp = h('<input type="file" accept=".md,.txt" multiple style="display:none">');
    document.body.appendChild(inp);
    inp.onchange = () => {
      const files = Array.from(inp.files || []);
      let done = 0;
      files.forEach(f => {
        const rd = new FileReader();
        rd.onload = () => {
          const list = notes();
          list.unshift({ id:U.uid('nt'), title:f.name.replace(/\.(md|txt)$/i,''), body:String(rd.result||''), tags:['imported'], folder:curFolder||'Imported', pinned:false, updated:Date.now() });
          saveNotes(list);
          if(++done === files.length){ renderFolders(); renderList(); NX.toastOk('Imported ' + done + ' file(s)'); }
        };
        rd.readAsText(f);
      });
      inp.remove();
    };
    inp.click();
  };

  q('#nt-open-vault', view).onclick = async () => {
    if(NX.native.available && NX.native.mode === 'tauri'){
      const r = await NX.native.invoke('note_vault_status');
      if(r && r.ok && r.data && r.data.root){
        NX.native.invoke('open_path', { path: r.data.root });
        NX.toastOk('Opening vault', r.data.root);
        return;
      }
    }
    NX.toastInfo('Vault', 'Notes are stored locally on your machine.');
  };

  const graphBtn = q('#nt-graph', view);
  if(graphBtn) graphBtn.onclick = openNotesGraphModal;
  NX.openNotesGraph = openNotesGraphModal;

  window.__nx_refreshNotesView = () => { renderFolders(); renderList(); loadEditor(); };
  window.__nx_selectNote = (id) => {
    const target = notes().find(n => n.id === id);
    if(target){
      if(target.trash) curFolder = '__trash';
      else if(target.folder) curFolder = target.folder;
      else curFolder = '';
      selectNote(id);
    }
  };
  renderFolders();
  renderList();
  loadEditor();
});
})(window.NX);
