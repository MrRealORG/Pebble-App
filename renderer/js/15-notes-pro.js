/* ============================================================
   PebbleX v0.1 — 15-notes-pro.js
   Notes depth + task depth, added as injected panels so no two
   files have to own the same module's markup.

   Notes:  wiki links · backlinks · vault search · version history
   Tasks:  subtask ring · weekday repeat · templates · estimates
           · one thing today
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

const notes = ()=> NX.store.get('notes', []) || [];
const tasks = ()=> NX.store.get('tasks', []) || [];

/* ============================================================
   NOTES — wiki links
   ============================================================ */
const WIKI = /\[\[([^\]\n|]{1,80})(?:\|([^\]\n]{1,80}))?\]\]/g;

function noteByTitle(title){
  const t = String(title || '').trim().toLowerCase();
  if(!t) return null;
  return notes().find(n => String(n.title || '').trim().toLowerCase() === t) || null;
}

/* rewrite [[Title]] into anchors inside any rendered preview */
function enhanceWikiLinks(root){
  if(!root) return;
  const containers = [];
  if(root.matches && root.matches('.ne-preview, .md-p, .md-h1, .md-h2, .md-h3, .md-ul, .md-ol, .md-quote, .md-callout, .api-result')) containers.push(root);
  containers.push.apply(containers, root.querySelectorAll('.ne-preview, .md-p, .md-h1, .md-h2, .md-h3, .md-ul, .md-ol, .md-quote, .md-callout, .api-result'));

  for(let i=0;i<containers.length;i++){
    const el = containers[i];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(n){
        if(!n.nodeValue || n.nodeValue.indexOf('[[') === -1) return NodeFilter.FILTER_REJECT;
        const p = n.parentNode;
        if(!p) return NodeFilter.FILTER_REJECT;
        /* never touch code, existing links or anything already converted */
        const tag = p.nodeName;
        if(tag === 'CODE' || tag === 'PRE' || tag === 'A' || tag === 'TEXTAREA') return NodeFilter.FILTER_REJECT;
        if(p.closest && p.closest('.wiki-link, pre, code, a, .wiki-pop')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const texts = [];
    let n;
    while((n = walk.nextNode())) texts.push(n);
    texts.forEach(tn=>{
      const s = tn.nodeValue;
      if(!s || s.indexOf('[[') === -1) return;
      const frag = document.createDocumentFragment();
      let last = 0, m;
      WIKI.lastIndex = 0;
      while((m = WIKI.exec(s))){
        if(m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
        const target = noteByTitle(m[1]);
        const label = m[2] || m[1];
        const a = document.createElement('a');
        a.className = 'wiki-link' + (target ? '' : ' missing');
        a.textContent = label;
        a.setAttribute('data-wiki-title', m[1]);
        frag.appendChild(a);
        last = m.index + m[0].length;
      }
      if(last === 0) return;
      if(last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
      tn.parentNode.replaceChild(frag, tn);
    });
  }
}
document.addEventListener('click', e=>{
  const a = e.target.closest && e.target.closest('.wiki-link');
  if(!a) return;
  e.preventDefault();
  const t = noteByTitle(a.getAttribute('data-wiki-title'));
  if(t) NX.openNoteById && NX.openNoteById(t.id);
  else NX.openCapture && NX.openCapture('note');
});

NX.enhanceWikiLinks = enhanceWikiLinks;

/* [[ autocomplete inside the editor */
let wikiOpen = false, wikiSel = 0, wikiItems = [], wikiAnchor = null;
function closeWiki(){
  const p = q('.wiki-pop');
  if(p) p.remove();
  wikiOpen = false; wikiItems = []; wikiAnchor = null;
}
function showWikiPop(anchor, term){
  closeWiki();
  wikiItems = notes()
    .filter(n => !term || String(n.title||'').toLowerCase().indexOf(term.toLowerCase()) > -1)
    .slice(0, 8);
  if(!wikiItems.length) return;
  wikiSel = 0;
  wikiOpen = true;
  const pop = h(`<div class="wiki-pop">
    ${wikiItems.map((n,i)=>`<button class="wiki-item ${i===0?'on':''}" data-i="${i}">
      <span class="ni-icon">${icon('notes')}</span>
      <span class="ellipsis">${U.esc(n.title || 'Untitled')}</span></button>`).join('')}
    <button class="wiki-item wiki-new" data-new="1">
      <span class="ni-icon">${icon('plus')}</span>
      <span>Create “${U.esc(term)}”</span></button>
  </div>`);
  anchor.parentNode.appendChild(pop);
  wikiAnchor = anchor;
  qa('.wiki-item', pop).forEach(b=>b.onclick = ()=>pickWiki(b));
  paintWiki();
}
function paintWiki(){
  qa('.wiki-item').forEach((b,i)=>b.classList.toggle('on', i === wikiSel));
}
function pickWiki(btn){
  const pop = q('.wiki-pop');
  if(!pop || !wikiAnchor) return closeWiki();
  const title = btn.hasAttribute('data-new')
    ? (btn.textContent.match(/“(.+)”/) || [,''])[1]
    : (wikiItems[+btn.dataset.i] || {}).title;
  if(!title) return closeWiki();
  const el = wikiAnchor;
  const caret = el.selectionStart != null ? el.selectionStart : (el.innerText || '').length;
  const before = el.value != null ? el.value.slice(0, caret) : '';
  const match = before.match(/\[\[[^\]\n|]*$/);
  if(!match) return closeWiki();
  const head = before.slice(0, before.length - match[0].length);
  const tail = el.value != null ? el.value.slice(caret) : '';
  const ins = '[[' + title + ']] ';
  if(el.value != null){
    el.value = head + ins + tail;
    const pos = head.length + ins.length;
    el.focus();
    try{ el.setSelectionRange(pos, pos); }catch(e){}
    el.dispatchEvent(new Event('input', { bubbles:true }));
  }
  closeWiki();
}

document.addEventListener('input', e=>{
  const el = e.target;
  if(!el || !el.classList || !el.classList.contains('ne-body')) return;
  const caret = el.selectionStart;
  if(caret == null) return;
  const before = el.value.slice(0, caret);
  const m = before.match(/\[\[([^\]\n|]{0,60})$/);
  if(!m) return closeWiki();
  showWikiPop(el, m[1]);
});
document.addEventListener('keydown', e=>{
  if(!wikiOpen) return;
  const items = qa('.wiki-item');
  if(e.key === 'ArrowDown'){ e.preventDefault(); wikiSel = Math.min(wikiSel+1, items.length-1); paintWiki(); }
  else if(e.key === 'ArrowUp'){ e.preventDefault(); wikiSel = Math.max(wikiSel-1, 0); paintWiki(); }
  else if(e.key === 'Enter' || e.key === 'Tab'){ e.preventDefault(); if(items[wikiSel]) pickWiki(items[wikiSel]); }
  else if(e.key === 'Escape'){ e.preventDefault(); closeWiki(); }
});

/* ============================================================
   NOTES — backlinks
   ============================================================ */
function backlinksFor(id){
  const target = notes().find(n => n.id === id);
  if(!target) return [];
  const t = String(target.title || '').trim().toLowerCase();
  if(!t) return [];
  return notes().filter(n =>
    n.id !== id &&
    /\[\[[^\]\n|]*/.test(String(n.body||'')) &&
    (function(){
      WIKI.lastIndex = 0;
      let m;
      while((m = WIKI.exec(String(n.body||'')))){
        if(String(m[1]).trim().toLowerCase() === t) return true;
      }
      return false;
    })()
  );
}
NX.backlinksFor = backlinksFor;

/* ============================================================
   NOTES — version history
   ============================================================ */
const HIST_MAX = 20;
function histFor(id){ const h = NX.store.get('noteHistory', {}) || {}; return Array.isArray(h[id]) ? h[id] : []; }
function snapshot(id, title, body){
  const all = NX.store.get('noteHistory', {}) || {};
  const cur = Array.isArray(all[id]) ? all[id] : [];
  const last = cur[cur.length-1];
  if(last && last.body === body) return;
  cur.push({ at:Date.now(), title:title || '', body:String(body || '') });
  all[id] = cur.slice(-HIST_MAX);
  NX.store.set('noteHistory', all);
}
let prevNotes = null;
function watchNotes(){
  const cur = notes();
  if(prevNotes){
    const byId = {};
    prevNotes.forEach(n=> byId[n.id] = n);
    cur.forEach(n=>{
      const was = byId[n.id];
      /* keep the version you are leaving, so "restore" always has
         somewhere to go back to */
      if(was && String(was.body||'') !== String(n.body||'')) snapshot(n.id, was.title, was.body);
    });
  }
  prevNotes = JSON.parse(JSON.stringify(cur));
}
NX.events.on('store:notes', watchNotes);
NX.snapshotNoteNow = function(){ prevNotes = null; watchNotes(); };
NX.noteHistory = { for: histFor, restore(id, entry){
  const list = notes();
  const n = list.find(x => x.id === id);
  if(!n) return false;
  const was = n.body;
  n.body = entry.body;
  NX.store.set('notes', list);
  NX.undoable('Version restored', new Date(entry.at).toLocaleString(), ()=>{
    const l2 = notes();
    const x = l2.find(y => y.id === id);
    if(!x) return;
    x.body = was; NX.store.set('notes', l2);
    NX.toastOk('Reverted');
  });
  return true;
} };

/* ============================================================
   NOTES — vault search with filters
   ============================================================ */
NX.openVaultSearch = function(){
  const folders = [...new Set(notes().map(n=>n.folder).filter(Boolean))].sort();
  const tags = [...new Set(notes().flatMap(n=>Array.isArray(n.tags)?n.tags:[]))].sort();
  let fFolder = '', fTag = '', sort = 'updated';

  const body = h(`<div class="vault">
    <div class="vault-bar">
      <div class="search-box grow" style="width:auto">
        ${icon('search')}<input id="vs-q" placeholder="Search every note, heading and tag…">
      </div>
      <select class="select" id="vs-folder" style="width:140px;height:34px"><option value="">All folders</option>${folders.map(f=>`<option value="${U.esc(f)}">${U.esc(f)}</option>`).join('')}</select>
      <select class="select" id="vs-tag" style="width:130px;height:34px"><option value="">All tags</option>${tags.map(t=>`<option value="${U.esc(t)}">${U.esc(t)}</option>`).join('')}</select>
      <select class="select" id="vs-sort" style="width:130px;height:34px">
        <option value="updated">Newest</option><option value="title">A–Z</option><option value="size">Longest</option>
      </select>
    </div>
    <div class="vault-count tiny faint" id="vs-count"></div>
    <div class="vault-results" id="vs-res"></div>
  </div>`);

  function snippet(note, term){
    const src = String(note.body || '');
    if(!term) return src.replace(/[#*`>\-]/g,'').trim().slice(0,120);
    const i = src.toLowerCase().indexOf(term.toLowerCase());
    if(i < 0) return src.replace(/[#*`>\-]/g,'').trim().slice(0,120);
    const from = Math.max(0, i - 40);
    return (from ? '…' : '') + src.slice(from, from + 140).replace(/[#*`>\-]/g,'').trim() + '…';
  }
  function run(){
    const term = q('#vs-q', body).value.trim();
    const low = term.toLowerCase();
    let rows = notes().filter(n => {
      if(fFolder && n.folder !== fFolder) return false;
      if(fTag && !(Array.isArray(n.tags) && n.tags.indexOf(fTag) > -1)) return false;
      if(!term) return true;
      return String(n.title||'').toLowerCase().indexOf(low) > -1 ||
             String(n.body||'').toLowerCase().indexOf(low) > -1 ||
             (Array.isArray(n.tags) && n.tags.some(t => String(t).toLowerCase().indexOf(low) > -1));
    });
    if(sort === 'title') rows.sort((a,b)=> String(a.title||'').localeCompare(String(b.title||'')));
    else if(sort === 'size') rows.sort((a,b)=> String(b.body||'').length - String(a.body||'').length);
    else rows.sort((a,b)=> (b.updated||0) - (a.updated||0));

    q('#vs-count', body).textContent = rows.length + (rows.length === 1 ? ' note' : ' notes');
    q('#vs-res', body).innerHTML = rows.length ? rows.slice(0,60).map(n=>{
      const bl = backlinksFor(n.id).length;
      return `<button class="vault-row" data-id="${n.id}">
        <span class="vault-ic">${icon('notes')}</span>
        <span class="vault-txt">
          <b class="ellipsis">${U.esc(n.title || 'Untitled')}</b>
          <i>${U.esc(snippet(n, term))}</i>
        </span>
        <span class="vault-meta">
          ${n.folder ? `<span class="pill gray">${U.esc(n.folder)}</span>` : ''}
          ${bl ? `<span class="pill blue" data-tip="${bl} backlink(s)">${icon('link',11)} ${bl}</span>` : ''}
          <span class="tiny faint">${U.esc(U.relTime(n.updated || Date.now()))}</span>
        </span>
      </button>`;
    }).join('') : `<div class="empty" style="padding:34px"><div class="e-title">Nothing matched</div><div class="e-sub">Try a different term or clear the filters.</div></div>`;

    qa('.vault-row', body).forEach(r=>r.onclick = ()=>{
      NX.closeAllModals();
      NX.openNoteById && NX.openNoteById(r.dataset.id);
    });
  }

  q('#vs-q', body).oninput = run;
  q('#vs-folder', body).onchange = e=>{ fFolder = e.target.value; run(); };
  q('#vs-tag', body).onchange = e=>{ fTag = e.target.value; run(); };
  q('#vs-sort', body).onchange = e=>{ sort = e.target.value; run(); };
  NX.modal({ title:'Search the vault', icon:'search', size:'m-xl', body });
  setTimeout(()=>{ const i = q('#vs-q', body); i && i.focus(); run(); }, 60);
};

/* ============================================================
   NOTES — injected toolbar: search, history, backlinks
   ============================================================ */
NX.afterRouteRender('notes', function(view){
  enhanceWikiLinks(view);
  const bar = q('#ne-toolbar', view) || q('.ne-head', view);
  if(bar && !bar.querySelector('#np-search')){
    const grp = h(`<span class="nt-tools" id="np-search">
      <button class="icon-btn sm" data-tip="Search the vault (Ctrl+⇧S)" data-np="search">${icon('search')}</button>
      <button class="icon-btn sm" data-tip="Backlinks" data-np="links">${icon('link')}</button>
      <button class="icon-btn sm" data-tip="Version history" data-np="hist">${icon('history')}</button>
    </span>`);
    qa('[data-np]', grp).forEach(b=>b.onclick = ()=>{
      const k = b.dataset.np;
      const cur = NX.currentNoteId && NX.currentNoteId();
      if(k === 'search') NX.openVaultSearch();
      else if(k === 'links') showBacklinks(cur);
      else if(k === 'hist') showHistory(cur);
    });
    bar.appendChild(grp);
  }
  /* live preview keeps getting wiki links as you type */
  const prev = q('.ne-preview', view);
  if(prev && !prev._wikiObs){
    prev._wikiObs = true;
    new MutationObserver(()=> enhanceWikiLinks(prev)).observe(prev, { childList:true, subtree:true, characterData:true });
  }
});

function showBacklinks(id){
  const n = notes().find(x => x.id === id);
  const rows = id ? backlinksFor(id) : [];
  NX.modal({
    title:'Backlinks', icon:'link',
    body: !id
      ? `<div class="empty" style="padding:30px"><div class="e-sub">Open a note first.</div></div>`
      : rows.length
        ? `<div class="ag-list">${rows.map(r=>`
            <div class="ag-row" data-go="${r.id}">
              <span class="ag-ic">${icon('notes')}</span>
              <span class="ag-txt"><b class="ellipsis">${U.esc(r.title || 'Untitled')}</b>
                <i>${U.esc(String(r.body||'').replace(/\[\[([^\]]+)\]\]/g,'$1').slice(0,90))}</i></span>
            </div>`).join('')}</div>`
        : `<div class="empty" style="padding:34px">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${NX.ICON_PATHS.link}"/></svg>
             <div class="e-title">No backlinks yet</div>
             <div class="e-sub">Type <b>[[${U.esc((n.title||'').slice(0,20))}]]</b> in another note and it will show up here.</div>
           </div>`
  });
  const dlg = q('.modal-backdrop');
  if(dlg) qa('[data-go]', dlg).forEach(r=>r.onclick = ()=>{ NX.closeAllModals(); NX.openNoteById(r.dataset.go); });
}

function showHistory(id){
  const n = notes().find(x => x.id === id);
  const vs = id ? histFor(id) : [];
  NX.modal({
    title:'Version history', icon:'history',
    body: !id
      ? `<div class="empty" style="padding:30px"><div class="e-sub">Open a note first.</div></div>`
      : vs.length
        ? `<div class="ag-list">${vs.slice().reverse().map((v,i)=>`
            <div class="ag-row">
              <span class="ag-ic">${icon('history')}</span>
              <span class="ag-txt"><b>${U.esc(new Date(v.at).toLocaleString())}</b>
                <i>${U.esc(String(v.body||'').replace(/[#*`>\-]/g,'').trim().slice(0,80) || 'empty')}</i></span>
              <button class="btn btn-soft btn-sm" data-restore="${vs.length-1-i}">Restore</button>
            </div>`).join('')}</div>`
        : `<div class="empty" style="padding:34px"><div class="e-title">No saved versions</div>
             <div class="e-sub">Pebble keeps the last ${HIST_MAX} edits of every note while you work.</div></div>`
  });
  const dlg = q('.modal-backdrop');
  if(dlg) qa('[data-restore]', dlg).forEach(b=>b.onclick = ()=>{
    const v = vs[+b.dataset.restore];
    if(!v) return;
    NX.closeAllModals();
    NX.noteHistory.restore(id, v);
  });
}

/* ============================================================
   TASKS — subtask ring, weekday repeat, templates,
           estimates, one thing today
   ============================================================ */
function stepRing(task){
  const steps = Array.isArray(task.steps) ? task.steps : [];
  if(!steps.length) return '';
  const done = steps.filter(s => s.done).length;
  const pct = Math.round(done/steps.length*100);
  const r = 8, c = 2*Math.PI*r;
  return `<span class="sub-ring" data-tip="${done} of ${steps.length} steps">
    <svg viewBox="0 0 20 20" width="18" height="18">
      <circle cx="10" cy="10" r="${r}" fill="none" stroke="var(--line-strong)" stroke-width="2.6"/>
      <circle cx="10" cy="10" r="${r}" fill="none" stroke="${pct===100?'var(--green)':'var(--green-deep)'}" stroke-width="2.6"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-pct/100)}" transform="rotate(-90 10 10)"/>
    </svg>
    <i>${done}/${steps.length}</i>
  </span>`;
}
NX.taskStepRing = stepRing;

/* weekday-aware repeat */
function nextRepeat(task){
  const rep = task.repeat || 'none';
  if(rep === 'none' || !task.due) return null;
  const base = new Date(task.due + 'T12:00:00');
  if(isNaN(base)) return null;
  if(rep === 'weekdays'){
    do{ base.setDate(base.getDate()+1); }
    while(base.getDay() === 0 || base.getDay() === 6);
  } else if(rep === 'weekly') base.setDate(base.getDate()+7);
  else if(rep === 'daily') base.setDate(base.getDate()+1);
  else if(rep === 'monthly') base.setMonth(base.getMonth()+1);
  else return null;
  return U.todayKey(base);
}
NX.nextRepeat = nextRepeat;

function templates(){
  const t = NX.store.get('taskTemplates', null);
  if(Array.isArray(t)) return t;
  const def = [
    { id:'tpl_r', name:'Standup prep', text:'Review yesterday · write today · flag blockers', steps:['Review yesterday','Write today','Flag blockers'], est:15, cat:'work', repeat:'weekdays' },
    { id:'tpl_w', name:'Weekly review', text:'Close the week', steps:['Inbox zero','Reschedule leftovers','Plan next week'], est:45, cat:'work', repeat:'weekly' },
    { id:'tpl_g', name:'Gym session', text:'Train', steps:['Warm up','Main sets','Stretch'], est:60, cat:'health', repeat:'none' }
  ];
  NX.store.set('taskTemplates', def);
  return def;
}
NX.taskTemplates = templates;

function useTemplate(tpl, count){
  const list = tasks();
  const today = U.todayKey();
  const made = [];
  for(let i=0;i<(count||1);i++){
    const t = {
      id:U.uid('tk'), name:tpl.text || tpl.name, note:'', col:'today',
      cat:tpl.cat || 'all', listId:tpl.cat || 'all', myDay:true,
      due:today, created:Date.now(), done:false,
      steps:(tpl.steps||[]).map(s=>({ id:U.uid('st'), text:s, done:false })),
      estimateMin:tpl.est || 0, timeLinked:0,
      repeat:tpl.repeat || 'none'
    };
    made.push(t);
  }
  NX.store.set('tasks', made.concat(list));
  NX.refreshBadges && NX.refreshBadges();
  NX.sfx.play('pop');
  NX.undoable(`${made.length} task${made.length===1?'':'s'} from template`, tpl.name, ()=>{
    NX.store.set('tasks', (NX.store.get('tasks',[])||[]).filter(t => !made.some(m=>m.id===t.id)));
    NX.refreshBadges && NX.refreshBadges();
    NX.toastOk('Removed');
  });
  if(NX.router.currentName === 'todo') NX.router.go('todo');
}

NX.afterRouteRender('todo', function(view){
  /* subtask rings on every row that has steps */
  qa('.mstodo-task-item', view).forEach(row=>{
    const id = row.dataset.id;
    const t = tasks().find(x => x.id === id);
    if(!t) return;
    if(row.querySelector('.sub-ring')) return;
    const anchor = row.querySelector('.mstodo-task-sub') || row;
    anchor.insertAdjacentHTML('beforeend', stepRing(t));
    /* estimate vs actual */
    if(t.estimateMin){
      const actual = Math.round((t.timeLinked||0)/60);
      const over = actual > t.estimateMin;
      anchor.insertAdjacentHTML('beforeend',
        `<span class="pill ${over?'red':'gray'}" data-tip="${over?'over':'under'} estimate">${icon('clock',11)} ${t.estimateMin}m${actual? ' / '+actual+'m':''}</span>`);
    }
    if(t.repeat && t.repeat !== 'none'){
      const nxt = nextRepeat(t);
      if(nxt) anchor.insertAdjacentHTML('beforeend',
        `<span class="pill blue" data-tip="repeats ${t.repeat}">${icon('refresh',11)} ${t.repeat}</span>`);
    }
  });

  /* toolbar: templates + one thing today */
  const bar = q('#td-content', view) ? view : null;
  const head = q('.mstodo-header', view);
  if(head && !head.querySelector('#tk-extras')){
    const grp = h(`<span class="nt-tools" id="tk-extras">
      <button class="icon-btn sm" data-tip="Task templates" data-tk="tpl">${icon('layers')}</button>
      <button class="icon-btn sm" data-tip="One thing today" data-tk="one">${icon('target')}</button>
    </span>`);
    qa('[data-tk]', grp).forEach(b=>b.onclick = ()=>{
      if(b.dataset.tk === 'tpl') openTemplates();
      else openOneThing();
    });
    const toggle = q('#td-select-toggle', view);
    if(toggle) toggle.parentNode.insertBefore(grp, toggle);
    else head.appendChild(grp);
  }
});

function openTemplates(){
  const tpls = templates();
  const body = h(`<div>
    <div class="ag-list">
      ${tpls.map(t=>`
        <div class="ag-row">
          <span class="ag-ic">${icon('layers')}</span>
          <span class="ag-txt"><b>${U.esc(t.name)}</b>
            <i>${t.steps && t.steps.length ? t.steps.length + ' steps · ' : ''}${t.est ? t.est + ' min' : ''}${t.repeat && t.repeat!=='none' ? ' · ' + t.repeat : ''}</i></span>
          <button class="btn btn-soft btn-sm" data-use="${t.id}">Add</button>
        </div>`).join('') || '<div class="empty" style="padding:26px"><div class="e-sub">No templates yet.</div></div>'}
    </div>
    <div class="field" style="margin-top:14px">
      <label>Save the current quick-add text as a template</label>
      <div class="row gap-8">
        <input class="input grow" id="tpl-name" placeholder="Template name">
        <button class="btn btn-green btn-sm" id="tpl-save">${icon('plus')} Save</button>
      </div>
    </div>
  </div>`);
  const dlg = NX.modal({ title:'Task templates', icon:'layers', body });
  qa('[data-use]', body).forEach(b=>b.onclick = ()=>{
    const t = tpls.find(x=>x.id===b.dataset.use);
    if(t) useTemplate(t, 1);
    NX.closeAllModals();
  });
  q('#tpl-save', body).onclick = ()=>{
    const nm = q('#tpl-name', body).value.trim();
    if(!nm) return NX.toastErr('Name required', 'Give the template a name first.');
    const next = templates().concat([{ id:U.uid('tpl'), name:nm, text:nm, steps:[], est:0, cat:'all', repeat:'none' }]);
    NX.store.set('taskTemplates', next);
    NX.closeAllModals();
    NX.toastOk('Template saved', nm);
  };
}

function openOneThing(){
  const open = tasks().filter(t => !t.done);
  const scored = open.map(t => {
    let score = 0;
    if(t.due && t.due <= U.todayKey()) score += 40;
    if(t.important) score += 25;
    if(t.myDay) score += 15;
    if(t.due && t.due === U.todayKey()) score += 10;
    score += Math.min(10, ((t.steps||[]).filter(s=>s.done).length));
    return { t, score };
  }).sort((a,b)=> b.score - a.score);
  const top = scored[0];
  NX.modal({
    title:'One thing today', icon:'target',
    body: !open.length
      ? `<div class="empty" style="padding:34px"><div class="e-title">Inbox zero</div><div class="e-sub">Nothing to pick from.</div></div>`
      : `<p class="muted" style="margin:0 0 14px">Highest-impact open task, weighing due date, importance and My Day.</p>
        <div class="card" style="background:var(--green-soft)">
          <div class="card-b" style="padding:16px">
            <div class="row gap-10">
              <span class="tile" style="background:var(--green)">${icon('target')}</span>
              <div style="min-width:0">
                <b style="font-size:15px">${U.esc(top.t.name)}</b>
                <div class="tiny faint">${top.t.due ? 'Due ' + U.esc(top.t.due) : 'No due date'}${top.t.important ? ' · important' : ''}${top.t.myDay ? ' · My Day' : ''}</div>
              </div>
            </div>
            ${(top.t.steps||[]).length ? `<div class="fx-rounds" style="margin-top:12px">${top.t.steps.map(s=>`
              <div class="ag-round"><span class="ag-ic" style="width:20px;height:20px">${icon('check',11)}</span>
              <span class="ag-txt"><b>${U.esc(s.text)}</b></span></div>`).join('')}</div>` : ''}
          </div>
        </div>
        <div class="row gap-8" style="margin-top:14px">
          <button class="btn btn-green" id="ot-focus">${icon('timer')} Focus 25 min on this</button>
          <button class="btn btn-soft" id="ot-done">${icon('check')} Mark done</button>
        </div>`,
    footer:[{ label:'Close', cls:'btn-soft' }]
  });
  const dlg = q('.modal-backdrop');
  if(!dlg) return;
  const focus = q('#ot-focus', dlg);
  if(focus) focus.onclick = ()=>{
    NX.closeAllModals();
    NX.router.go('focus');
    setTimeout(()=>{
      if(NX.pomo) NX.pomo.start({ task: top.t.name });
      NX.toastInfo('Round started', top.t.name);
    }, 140);
  };
  const done = q('#ot-done', dlg);
  if(done) done.onclick = ()=>{
    const list = tasks();
    const t = list.find(x=>x.id===top.t.id);
    if(t){ t.done = true; t.doneAt = Date.now(); t.col='done'; NX.store.set('tasks', list); NX.refreshBadges && NX.refreshBadges(); }
    NX.closeAllModals();
    NX.undoable('Task completed', top.t.name, ()=>{
      const l2 = tasks();
      const x = l2.find(y=>y.id===top.t.id);
      if(x){ x.done = false; delete x.doneAt; x.col='today'; NX.store.set('tasks', l2); NX.refreshBadges && NX.refreshBadges(); }
    });
    setTimeout(()=>NX.router.go('todo'), 40);
  };
}

/* global shortcut for the vault search */
document.addEventListener('keydown', e=>{
  const mod = e.ctrlKey || e.metaKey;
  if(mod && e.shiftKey && e.key.toLowerCase() === 's'){ e.preventDefault(); NX.openVaultSearch(); }
});
})(window.NX);
