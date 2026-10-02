/* ============================================================
   Pebble 3.0 — 23-todo.js
   Elera patient-flow style kanban with filters + time links
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

const COLS = [
  { id:'today', name:'Today',        kc:'#7CD56E', target:'focus today' },
  { id:'week',  name:'This week',    kc:'#5EB8FF', target:'plan ahead' },
  { id:'doing', name:'In progress',  kc:'#E8853D', target:'wip limit 3' },
  { id:'done',  name:'Done',         kc:'#8B8D93', target:'ship it' }
];
const CATS = [
  { v:'work',   l:'Work',   pill:'blue' },
  { v:'life',   l:'Life',   pill:'purple' },
  { v:'health', l:'Health', pill:'green' },
  { v:'learn',  l:'Learn',  pill:'teal' }
];
let filterCat = 'all', view = 'board';

function tasks(){ return NX.store.get('tasks', []); }
function saveTasks(t){ NX.store.set('tasks', t); NX.refreshBadges(); }

NX.newTask = function(){
  const body = h(`<div>
    <div class="field" style="margin-bottom:12px"><label>Task</label><input class="input" id="ntk-name" placeholder="What needs doing?"></div>
    <div class="row gap-10" style="margin-bottom:12px">
      <div class="field grow"><label>Column</label><select class="select" id="ntk-col">${COLS.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select></div>
      <div class="field grow"><label>Category</label><select class="select" id="ntk-cat">${CATS.map(c=>`<option value="${c.v}">${c.l}</option>`).join('')}</select></div>
    </div>
    <div class="row gap-10" style="margin-bottom:12px">
      <div class="field grow"><label>Due date (optional)</label><input class="input" id="ntk-due" type="date"></div>
      <div class="field grow"><label>Note (optional)</label><input class="input" id="ntk-note" placeholder="Extra context"></div>
    </div>
  </div>`);
  NX.modal({ title:'New task', icon:'todo', body, footer:[
    { label:'Cancel', cls:'btn-soft' },
    { label:'Add task', cls:'btn-green', onClick:()=>{
        const name = q('#ntk-name', body).value.trim(); if(!name){ q('#ntk-name', body).focus(); return; }
        const list = tasks();
        list.unshift({ id:U.uid('tk'), name, col:q('#ntk-col', body).value, cat:q('#ntk-cat', body).value, note:q('#ntk-note', body).value.trim(), due:q('#ntk-due', body).value||'', created:Date.now(), timeLinked:0, done:false });
        saveTasks(list); NX.closeAllModals(); NX.sfx.play('ok'); NX.router.go('todo');
      } }
  ]});
  setTimeout(()=>q('#ntk-name', body) && q('#ntk-name', body).focus(), 50);
};

function catPill(cat){
  const c = CATS.find(x=>x.v===cat) || CATS[0];
  return `<span class="pill ${c.pill}">${c.l}</span>`;
}

function linkedTime(taskId){
  const sess = NX.store.get('sessions', []).filter(s=>s.taskId===taskId);
  return sess.reduce((n,s)=>n+s.sec, 0);
}

function dueChip(t){
  if(!t.due || t.done) return '';
  const today = U.todayKey();
  const overdue = t.due < today;
  const soon = t.due === today || t.due === U.todayKey(new Date(Date.now()+86400e3));
  if(!overdue && !soon) return `<span class="tc-time">${icon('calendar')} ${U.esc(t.due)}</span>`;
  return `<span class="tc-time ${overdue?'overdue':'soon'}">${icon('bell')} ${overdue?'Overdue':'Due soon'} · ${U.esc(t.due)}</span>`;
}

NX.routeInShell('todo', 'Tasks', 'todo', function(view){
  const viewMode = NX.store.get('ui:todoView', 'board') === 'list' ? 'list' : 'board';
  view.innerHTML = `
  <div class="page">
    <div class="row" style="gap:12px;flex-wrap:wrap">
      <div class="todo-filters" id="td-filters"></div>
      <span style="flex:1"></span>
      <div id="td-view-seg"></div>
      <button class="btn btn-dark" id="td-new">${icon('plus')} New task</button>
    </div>
    <div id="td-body"></div>
  </div>`;

  const seg = NX.seg([{v:'board',l:'Board'},{v:'list',l:'List'}], viewMode, v=>{
    NX.store.set('ui:todoView', v);
    seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.v === v));
    renderBody(v);
  });
  q('#td-view-seg', view).replaceWith(seg);
  seg.id = 'td-view-seg';

  function renderFilters(){
    const f = q('#td-filters', view);
    f.innerHTML = ['all', ...CATS.map(c=>c.v)].map(c=>{
      const l = c==='all' ? 'All' : CATS.find(x=>x.v===c).l;
      const n = c==='all' ? tasks().length : tasks().filter(t=>t.cat===c).length;
      return `<button class="chip ${filterCat===c?'active':''}" data-c="${c}">${l} <span class="n">${n}</span></button>`;
    }).join('');
    qa('.chip', f).forEach(b=>b.onclick = ()=>{ filterCat = b.dataset.c; renderFilters(); renderBody(); });
  }

  function taskCard(t){
    const tl = linkedTime(t.id);
    return `<div class="task-card" draggable="true" data-id="${t.id}">
      <div class="tc-top">
        <span class="check ${t.done?'checked':''}" data-check="${t.id}">${icon('check')}</span>
        <span class="tc-name ${t.done?'done':''} ellipsis">${U.esc(t.name)}</span>
      </div>
      ${t.note?`<div class="tc-sub">${U.esc(t.note)}</div>`:''}
      <div class="tc-meta">
        ${catPill(t.cat)}
        ${dueChip(t)}
        ${tl>0?`<span class="tc-time">${icon('clock')} ${U.fmtTime(tl)} linked</span>`:''}
        <span style="flex:1"></span>
        <button class="icon-btn sm" data-menu="${t.id}" data-tip="More">${icon('dots')}</button>
      </div>
    </div>`;
  }

  function renderBody(mode){
    const body = q('#td-body', view);
    const list = tasks().filter(t=>filterCat==='all' || t.cat===filterCat);
    const v = mode || NX.store.get('ui:todoView', 'board');
    if(v === 'list'){
      body.innerHTML = `<div class="card" style="padding:6px 18px 12px">
        <table class="etable"><thead><tr><th>Task</th><th>Category</th><th>Column</th><th>Linked time</th><th></th></tr></thead><tbody>
        ${list.map(t=>`<tr>
          <td style="display:flex;align-items:center;gap:10px"><span class="check ${t.done?'checked':''}" data-check="${t.id}">${icon('check')}</span><b class="${t.done?'':''}" style="${t.done?'text-decoration:line-through;color:var(--ink-3)':''}">${U.esc(t.name)}</b></td>
          <td>${catPill(t.cat)}</td><td><span class="pill gray">${U.esc((COLS.find(c=>c.id===t.col)||{}).name||t.col)}</span></td>
          <td class="mono-num">${tl?U.fmtTime(linkedTime(t.id)):'—'}</td>
          <td style="text-align:right"><button class="icon-btn sm" data-menu="${t.id}">${icon('dots')}</button></td></tr>`).join('')}
        </tbody></table></div>`;
      bindCommon(body);
      return;
    }
    body.innerHTML = `<div class="kanban">${COLS.map(c=>{
      const items = list.filter(t=>(c.id==='done' ? t.done : !t.done && t.col===c.id));
      return `<div class="kcol" data-col="${c.id}" style="--kc:${c.kc}">
        <div class="kcol-h"><div class="kc-name"><i></i>${c.name}</div>
          <span class="count-chip">${items.length}</span><span class="kc-target">${c.target}</span></div>
        <div class="kcol-body">${items.map(taskCard).join('')}</div>
        <button class="kadd" data-add="${c.id}">+ Add task</button>
      </div>`;
    }).join('')}</div>`;

    /* drag & drop */
    qa('.task-card', body).forEach(card=>{
      card.addEventListener('dragstart', e=>{ card.classList.add('dragging'); e.dataTransfer.setData('text/plain', card.dataset.id); });
      card.addEventListener('dragend', ()=>card.classList.remove('dragging'));
    });
    qa('.kcol', body).forEach(col=>{
      col.addEventListener('dragover', e=>{ e.preventDefault(); col.classList.add('dragover'); });
      col.addEventListener('dragleave', ()=>col.classList.remove('dragover'));
      col.addEventListener('drop', e=>{
        e.preventDefault(); col.classList.remove('dragover');
        const id = e.dataTransfer.getData('text/plain');
        const list = tasks(); const t = list.find(x=>x.id===id); if(!t) return;
        if(col.dataset.col === 'done'){ t.done = true; NX.confetti(e.clientX, e.clientY); NX.sfx.play('ok'); }
        else { t.done = false; t.col = col.dataset.col; NX.sfx.play('pop'); }
        saveTasks(list); renderBody();
      });
    });
    qa('[data-add]', body).forEach(b=>b.onclick = ()=>NX.newTask());
    bindCommon(body);
  }

  function bindCommon(root){
    qa('[data-check]', root).forEach(ch=>{
      ch.onclick = (e)=>{
        const list = tasks(); const t = list.find(x=>x.id===ch.dataset.check); if(!t) return;
        t.done = !t.done;
        if(t.done){ t.doneAt = Date.now(); NX.confetti(e.clientX||innerWidth/2, e.clientY||innerHeight/2); NX.sfx.play('ok'); }
        saveTasks(list); renderFilters(); renderBody();
      };
    });
    qa('[data-menu]', root).forEach(b=>{
      b.onclick = (e)=>{
        e.stopPropagation();
        const t = tasks().find(x=>x.id===b.dataset.menu);
        NX.menu(e.currentTarget, [
          { label:'Link last Timeless session', icon:'clock', onClick:()=>{
              const sess = NX.store.get('sessions', []);
              const last = sess[sess.length-1];
              if(last){ last.taskId = t.id; NX.store.set('sessions', sess); NX.toastOk('Linked', `${U.fmtTime(last.sec)} of ${last.app} → task`); renderBody(); }
              else NX.toastInfo('No sessions yet', 'Let Timeless run for a bit first.');
            } },
          { label:'Set due date…', icon:'calendar', onClick:()=>{
              const body = h(`<div class="field"><label>Due date for “${U.esc(t.name)}”</label><input class="input" id="dt-due" type="date" value="${U.esc(t.due||'')}"></div>`);
              NX.modal({ title:'Due date', icon:'calendar', body, footer:[
                { label:'Remove', cls:'btn-soft', onClick:()=>{ const l=tasks(); const tt=l.find(x=>x.id===t.id); tt.due=''; saveTasks(l); NX.closeAllModals(); renderBody(); } },
                { label:'Save', cls:'btn-green', onClick:()=>{ const l=tasks(); const tt=l.find(x=>x.id===t.id); tt.due=q('#dt-due', body).value||''; saveTasks(l); NX.closeAllModals(); renderBody(); } }
              ]});
            } },
          { label:'Move to…', icon:'arrow' },
          ...COLS.filter(c=>c.id!=='done').map(c=>({ label:'→ '+c.name, onClick:()=>{ const list=tasks(); const tt=list.find(x=>x.id===t.id); tt.col=c.id; tt.done=false; saveTasks(list); renderBody(); } })),
          '-',
          { label:'Delete task', icon:'trash', danger:true, onClick:()=>{
              saveTasks(tasks().filter(x=>x.id!==t.id)); renderFilters(); renderBody(); NX.toastOk('Task deleted');
            } }
        ]);
      };
    });
  }

  q('#td-new', view).onclick = ()=>NX.newTask();
  renderFilters(); renderBody();
});
})(window.NX);
