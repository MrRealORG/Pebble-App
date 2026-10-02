/* ============================================================
   Pebble 3.2 — 33-spotlight.js
   Global Quick-Capture Bar (Alt+Space Spotlight Mode)
   - Quick Add Task: "t Buy groceries" or "todo Review code"
   - Quick Add Note: "n Meeting notes"
   - Quick AI Query: "? Summarize today"
   - Universal search across Notes, Tasks, Prompts, Modules
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

let spotlightOpen = false;

function openSpotlight(){
  if(spotlightOpen) return;
  spotlightOpen = true;

  const back = h(`<div class="cmdk-backdrop spotlight-backdrop anim-in" style="backdrop-filter:blur(10px);background:rgba(0,0,0,0.55);z-index:2000">
    <div class="spotlight-box card" style="width:min(640px,94vw);margin:12vh auto auto;border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.45);border:1px solid var(--line-strong);background:var(--surface)">
      <div class="spotlight-head" style="display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line)">
        <span class="spotlight-icon" style="color:var(--green);display:flex;align-items:center;flex:none">${icon('search', 20)}</span>
        <input class="spotlight-input" id="sl-input" placeholder="Search anything, or type 't Task', 'n Note', '? Ask AI'…" 
               style="flex:1;border:none;background:none;font-size:15.5px;font-weight:500;color:var(--ink);outline:none;min-width:0" autofocus>
        <span class="pill gray sm" id="sl-mode-badge" style="font-size:11px;font-weight:700">Global</span>
        <span class="faint tiny kbd" style="padding:2px 6px;border-radius:4px;border:1px solid var(--line-strong)">ESC</span>
      </div>
      <div class="spotlight-results" id="sl-results" style="max-height:360px;overflow-y:auto;padding:8px"></div>
      <div class="spotlight-foot" style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:var(--surface-2);border-top:1px solid var(--line);font-size:11px;color:var(--ink-3)">
        <div style="display:flex;gap:12px">
          <span><b>↵</b> Open / Add</span>
          <span><b>↑↓</b> Navigate</span>
          <span><b>ESC</b> Close</span>
        </div>
        <div>Prefixes: <code>t</code> task · <code>n</code> note · <code>?</code> AI · <code>v</code> voice</div>
      </div>
    </div>
  </div>`);

  document.body.appendChild(back);
  const input = q('#sl-input', back);
  const resultsHost = q('#sl-results', back);
  const badge = q('#sl-mode-badge', back);
  let selectedIndex = 0;
  let currentResults = [];

  function close(){
    spotlightOpen = false;
    back.remove();
    document.removeEventListener('keydown', onKeyDown);
  }

  function handleCreate(mode, query){
    if(mode === 'task'){
      const taskName = query.trim();
      if(!taskName) return;
      const tasks = NX.store.get('tasks', []);
      const newTask = {
        id: U.uid('tk'),
        name: taskName,
        done: false,
        priority: 1,
        dueDate: null,
        created: Date.now(),
        category: 'Tasks'
      };
      tasks.unshift(newTask);
      NX.store.set('tasks', tasks);
      NX.events.emit('tasks:changed');
      close();
      NX.toastOk('Task created', taskName);
      NX.sfx.play('pop');
    } else if(mode === 'note'){
      const noteTitle = query.trim() || 'Untitled Note';
      const allNotes = NX.store.get('notes', []);
      const newNote = {
        id: U.uid('nt'),
        title: noteTitle,
        body: `# ${noteTitle}\n\nStart writing here...\n`,
        folder: '',
        tags: ['quick'],
        pinned: false,
        updated: Date.now()
      };
      allNotes.unshift(newNote);
      NX.store.set('notes', allNotes);
      close();
      NX.router.go('notes');
      setTimeout(() => {
        if(window.__nx_selectNote) window.__nx_selectNote(newNote.id);
      }, 80);
      NX.toastOk('Note created', noteTitle);
      NX.sfx.play('pop');
    } else if(mode === 'ai'){
      close();
      if(NX.openAskPebble) NX.openAskPebble(query.trim());
      else NX.router.go('ai');
    } else if(mode === 'voice'){
      close();
      NX.router.go('notes');
      setTimeout(async () => {
        NX.toastInfo('🎙️ Voice Memo…', 'Listening… Speak your note.');
        try {
          let text = '';
          const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
          if(SpeechClass){
            const rec = new SpeechClass();
            rec.lang = navigator.language || 'en-US';
            rec.onresult = (e) => {
              text = e.results[0][0].transcript;
            };
            rec.onerror = () => {};
            rec.start();
            await new Promise(r => { rec.onend = r; setTimeout(r, 8000); });
          }
          if(!text && NX.native && NX.native.asrRecord){
            text = await NX.native.asrRecord(10000);
          }
          if(text && text.trim()){
            const title = '🎙️ Voice Note — ' + new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
            const notes = NX.store.get('notes', []);
            const newN = {
              id: U.uid('nt'),
              title,
              body: `# ${title}\n\n${text.trim()}\n`,
              folder: '',
              tags: ['voice-memo'],
              pinned: false,
              updated: Date.now()
            };
            notes.unshift(newN);
            NX.store.set('notes', notes);
            if(window.__nx_selectNote) window.__nx_selectNote(newN.id);
            NX.toastOk('Voice note saved!', title);
            NX.sfx.play('ok');
          } else {
            NX.toastInfo('No audio transcribed');
          }
        } catch(err){
          NX.toastErr('Voice memo error', String(err));
        }
      }, 100);
    }
  }

  function render(){
    const rawVal = input.value;
    const trimmed = rawVal.trim();
    let mode = 'search';
    let query = trimmed;

    if(/^t\s+/i.test(rawVal)){
      mode = 'task';
      query = rawVal.replace(/^t\s+/i, '');
      badge.textContent = 'New Task';
      badge.className = 'pill green sm';
    } else if(/^n\s+/i.test(rawVal)){
      mode = 'note';
      query = rawVal.replace(/^n\s+/i, '');
      badge.textContent = 'New Note';
      badge.className = 'pill blue sm';
    } else if(/^\?\s*/i.test(rawVal)){
      mode = 'ai';
      query = rawVal.replace(/^\?\s*/i, '');
      badge.textContent = 'Ask AI';
      badge.className = 'pill purple sm';
    } else if(/^v\s*/i.test(rawVal)){
      mode = 'voice';
      query = rawVal.replace(/^v\s*/i, '');
      badge.textContent = 'Voice Memo';
      badge.className = 'pill red sm';
    } else {
      badge.textContent = 'Global';
      badge.className = 'pill gray sm';
    }

    currentResults = [];

    if(mode === 'task'){
      if(query){
        currentResults.push({
          type: 'create-task',
          icon: 'check',
          title: `Create task: "${query}"`,
          subtitle: 'Press Enter to add to your To-Do list immediately',
          action: () => handleCreate('task', query)
        });
      }
    } else if(mode === 'note'){
      if(query){
        currentResults.push({
          type: 'create-note',
          icon: 'notes',
          title: `Create note: "${query}"`,
          subtitle: 'Press Enter to create and open in Notes editor',
          action: () => handleCreate('note', query)
        });
      }
    } else if(mode === 'ai'){
      currentResults.push({
        type: 'ask-ai',
        icon: 'robot',
        title: query ? `Ask Pebble AI: "${query}"` : 'Ask Pebble AI Copilot',
        subtitle: 'Grounds response with your active notes, tasks, and today\'s tracked time',
        action: () => handleCreate('ai', query)
      });
    } else if(mode === 'voice'){
      currentResults.push({
        type: 'voice-memo',
        icon: 'mic',
        title: query ? `Dictate Voice Note: "${query}"` : 'Record Voice Note',
        subtitle: 'Press Enter to start speech recognition and transcribe to note',
        action: () => handleCreate('voice', query)
      });
    } else {
      // Global search
      if(!query){
        // Quick access shortcuts
        currentResults = [
          { type:'action', icon:'notes', title:'New Note', subtitle:'Start a fresh note (or type n Title)', action:()=>handleCreate('note', 'New Note') },
          { type:'action', icon:'check', title:'New Task', subtitle:'Add a task (or type t Title)', action:()=>handleCreate('task', 'New Task') },
          { type:'action', icon:'mic', title:'Record Voice Note', subtitle:'Dictate thoughts with microphone (or type v)', action:()=>handleCreate('voice', '') },
          { type:'action', icon:'robot', title:'Ask Pebble AI', subtitle:'Chat with your notes & productivity data (or type ?)', action:()=>handleCreate('ai', '') },
          { type:'nav', icon:'clock', title:'Timeless Activity', subtitle:'View system app time tracking & focus score', action:()=>NX.router.go('timeless') },
          { type:'nav', icon:'target', title:'Focus Pomodoro', subtitle:'Start deep focus round', action:()=>{ NX.router.go('focus'); NX.pomo && NX.pomo.start(); } }
        ];
      } else {
        const qLower = query.toLowerCase();

        // 1. Notes
        const notesList = NX.store.get('notes', []).filter(n => !n.trash);
        notesList.filter(n => (n.title||'').toLowerCase().includes(qLower) || (n.body||'').toLowerCase().includes(qLower))
          .slice(0, 4).forEach(n => {
            currentResults.push({
              type: 'note',
              icon: 'notes',
              title: n.title || 'Untitled',
              subtitle: (n.body||'').replace(/[#>*`\-\[\]]/g,'').slice(0, 70),
              badge: n.folder || 'Note',
              badgeCls: 'blue',
              action: () => {
                close();
                NX.router.go('notes');
                setTimeout(() => window.__nx_selectNote && window.__nx_selectNote(n.id), 80);
              }
            });
          });

        // 2. Tasks
        const tasksList = NX.store.get('tasks', []);
        tasksList.filter(t => (t.name||'').toLowerCase().includes(qLower))
          .slice(0, 4).forEach(t => {
            currentResults.push({
              type: 'task',
              icon: 'check',
              title: t.name,
              subtitle: t.done ? 'Completed task' : 'Active task',
              badge: t.category || 'Task',
              badgeCls: t.done ? 'gray' : 'green',
              action: () => {
                close();
                NX.router.go('todo');
              }
            });
          });

        // 3. Prompts
        const promptsList = NX.store.get('prompts', []);
        promptsList.filter(p => (p.title||'').toLowerCase().includes(qLower) || (p.body||'').toLowerCase().includes(qLower))
          .slice(0, 3).forEach(p => {
            currentResults.push({
              type: 'prompt',
              icon: 'star',
              title: p.title,
              subtitle: (p.body||'').slice(0, 70),
              badge: 'Prompt',
              badgeCls: 'yellow',
              action: () => {
                close();
                NX.router.go('prompts');
              }
            });
          });

        // 4. Quick Actions
        currentResults.push({
          type: 'create-task',
          icon: 'plus',
          title: `Add "${query}" as a Task`,
          subtitle: 'Create this directly in your To-Do list',
          action: () => handleCreate('task', query)
        });
      }
    }

    selectedIndex = U.clamp(selectedIndex, 0, Math.max(0, currentResults.length - 1));

    if(!currentResults.length){
      resultsHost.innerHTML = `<div class="empty" style="padding:24px"><div class="e-sub">No results for “${U.esc(query)}”</div></div>`;
      return;
    }

    resultsHost.innerHTML = currentResults.map((r, i) => `
      <div class="spotlight-item ${i === selectedIndex ? 'selected' : ''}" data-idx="${i}" 
           style="display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:10px;cursor:pointer;transition:background .12s ease;margin-bottom:2px">
        <div class="si-icon" style="width:30px;height:30px;border-radius:8px;background:var(--surface-3);color:var(--ink-2);display:flex;align-items:center;justify-content:center;flex:none">
          ${icon(r.icon, 15)}
        </div>
        <div style="flex:1;min-width:0">
          <div class="si-title" style="font-size:13.5px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(r.title)}</div>
          <div class="si-sub" style="font-size:11.5px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(r.subtitle)}</div>
        </div>
        ${r.badge ? `<span class="pill ${r.badgeCls||'gray'}" style="height:18px;font-size:10px">${U.esc(r.badge)}</span>` : ''}
        <span class="si-enter faint tiny" style="opacity:${i === selectedIndex ? '1':'0'};font-weight:700">↵</span>
      </div>
    `).join('');

    qa('.spotlight-item', resultsHost).forEach(el => {
      el.onclick = () => {
        const item = currentResults[+el.dataset.idx];
        if(item && item.action) item.action();
      };
      el.onmouseenter = () => {
        selectedIndex = +el.dataset.idx;
        qa('.spotlight-item', resultsHost).forEach((x, idx) => {
          x.classList.toggle('selected', idx === selectedIndex);
          const ent = q('.si-enter', x);
          if(ent) ent.style.opacity = idx === selectedIndex ? '1':'0';
        });
      };
    });
  }

  function onKeyDown(e){
    if(e.key === 'Escape'){
      close();
    } else if(e.key === 'ArrowDown'){
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
      render();
    } else if(e.key === 'ArrowUp'){
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      render();
    } else if(e.key === 'Enter'){
      e.preventDefault();
      const item = currentResults[selectedIndex];
      if(item && item.action){
        item.action();
      }
    }
  }

  input.addEventListener('input', () => { selectedIndex = 0; render(); });
  document.addEventListener('keydown', onKeyDown);
  back.onclick = (e) => { if(e.target === back) close(); };

  render();
  setTimeout(() => input.focus(), 30);
}

NX.openSpotlight = openSpotlight;
NX.openQuickCapture = openSpotlight;

})(window.NX);
