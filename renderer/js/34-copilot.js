/* ============================================================
   Pebble 3.2 — 34-copilot.js
   AI Second Brain ("Ask Pebble" Copilot)
   - Grounded in your local Notes, Tasks, and Timeless data
   - One-click "Daily Productivity Debrief"
   - One-click "Extract Tasks from Active Note"
   - One-click "Summarize Active Note"
   - Natural language workspace Q&A
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

let copilotModal = null;

function getWorkspaceContext(){
  const notesList = NX.store.get('notes', []).filter(n => !n.trash);
  const tasksList = NX.store.get('tasks', []);
  const timelessAll = NX.store.get('timeless', {});
  const todayKey = U.todayKey();
  const day = timelessAll[todayKey] || {};
  const activeTasks = tasksList.filter(t => !t.done);
  const completedToday = tasksList.filter(t => t.done && t.completedAt && (Date.now() - t.completedAt < 86400e3));

  let prodSec = 0, distrSec = 0, neutSec = 0;
  const appList = [];
  Object.entries(day).forEach(([k, a]) => {
    if(k === '__hours' || !a || !a.sec) return;
    if(a.cat === 'prod') prodSec += a.sec;
    else if(a.cat === 'distr') distrSec += a.sec;
    else neutSec += a.sec;
    appList.push({ name: a.name || k, sec: a.sec, cat: a.cat, isSite: a.isSite });
  });
  appList.sort((a,b) => b.sec - a.sec);

  // Active note in editor
  const curNote = (typeof NX.currentNote === 'function') ? NX.currentNote() : notesList[0];

  return {
    notesCount: notesList.length,
    activeTasksCount: activeTasks.length,
    completedTodayCount: completedToday.length,
    activeTasks: activeTasks.slice(0, 8),
    notes: notesList.slice(0, 10),
    topApps: appList.slice(0, 6),
    trackedTotal: prodSec + distrSec + neutSec,
    prodSec,
    distrSec,
    focusScore: Math.round(prodSec / Math.max(1, prodSec + distrSec) * 100),
    activeNote: curNote
  };
}

function generateLocalAnswer(prompt, ctx){
  const p = prompt.toLowerCase();

  // 1. Productivity debrief
  if(p.includes('debrief') || p.includes('summarize today') || p.includes('productivity') || p.includes('how did i do')){
    let res = `### 📊 Daily Productivity Debrief (${U.todayKey()})\n\n`;
    res += `**Focus Score:** ${ctx.focusScore}%\n`;
    res += `- **Total Tracked Time:** ${U.fmtTime(ctx.trackedTotal)}\n`;
    res += `- **Deep Work / Productive:** ${U.fmtTime(ctx.prodSec)}\n`;
    res += `- **Distractions:** ${U.fmtTime(ctx.distrSec)}\n\n`;
    
    if(ctx.topApps.length){
      res += `**Top Applications & Sites Today:**\n`;
      ctx.topApps.forEach((a, i) => {
        const catEmoji = a.cat === 'prod' ? '🟩' : (a.cat === 'distr' ? '🟥' : '🟨');
        res += `${i+1}. ${catEmoji} **${a.name}** — ${U.fmtTime(a.sec)}\n`;
      });
    }

    res += `\n**To-Do Progress:** You have **${ctx.activeTasksCount} open tasks** and finished **${ctx.completedTodayCount} tasks** today.\n`;
    if(ctx.focusScore >= 70) res += `\n> !tip Fantastic job! You maintained high deep focus today. Keep up the rhythm!`;
    else res += `\n> !info Try scheduling a 25-minute Pomodoro focus round to tackle your remaining priorities.`;
    return res;
  }

  // 2. Extract tasks from active note
  if(p.includes('extract task') || p.includes('action item') || p.includes('create tasks')){
    if(!ctx.activeNote || !ctx.activeNote.body){
      return `No active note open to extract tasks from. Please open a note first!`;
    }
    const lines = ctx.activeNote.body.split('\n');
    const extracted = [];
    lines.forEach(l => {
      const taskMatch = l.match(/^[-*]\s+\[ \]\s+(.*)$/);
      if(taskMatch) extracted.push(taskMatch[1].trim());
      else if(/^[-*]\s+(TODO|Fix|Implement|Review|Build|Update|Call|Send|Check)\b/i.test(l)){
        extracted.push(l.replace(/^[-*]\s+/, '').trim());
      }
    });

    if(!extracted.length){
      return `I scanned **"${ctx.activeNote.title}"**, but did not find uncompleted checkboxes (\`- [ ]\`) or action items. Try adding some bullet points with action verbs!`;
    }

    let res = `### 📋 Extracted ${extracted.length} Tasks from "${ctx.activeNote.title}"\n\n`;
    extracted.forEach((t, i) => {
      res += `${i+1}. [ ] **${t}**\n`;
    });
    res += `\nWould you like me to add these directly to your To-Do list? Click below:\n\n<button class="btn btn-green btn-sm" id="cp-add-extracted-tasks">➕ Add all to To-Do List</button>`;
    
    setTimeout(() => {
      const btn = q('#cp-add-extracted-tasks');
      if(btn){
        btn.onclick = () => {
          const tasks = NX.store.get('tasks', []);
          extracted.forEach(item => {
            tasks.unshift({
              id: U.uid('tk'),
              name: item,
              done: false,
              priority: 1,
              created: Date.now(),
              category: ctx.activeNote.folder || 'Notes'
            });
          });
          NX.store.set('tasks', tasks);
          NX.events.emit('tasks:changed');
          btn.outerHTML = `<span class="pill green">✓ All ${extracted.length} tasks added to To-Do</span>`;
          NX.toastOk('Tasks added', `${extracted.length} tasks created`);
          NX.sfx.play('pop');
        };
      }
    }, 100);

    return res;
  }

  // 3. Summarize active note
  if(p.includes('summarize note') || p.includes('note summary')){
    if(!ctx.activeNote || !ctx.activeNote.body){
      return `Please open a note first to generate a summary.`;
    }
    const body = ctx.activeNote.body;
    const words = body.trim().split(/\s+/).length;
    const headings = (body.match(/^#{1,3}\s+(.+)$/gm)||[]).map(h=>h.replace(/^#{1,3}\s+/,''));

    let res = `### 📝 Summary of "${ctx.activeNote.title}"\n`;
    res += `*Word Count:* ~${words} words · *Folder:* ${ctx.activeNote.folder || 'Root'}\n\n`;
    if(headings.length){
      res += `**Key Sections Covered:**\n`;
      headings.slice(0, 5).forEach(h => res += `- **${h}**\n`);
      res += `\n`;
    }
    res += `**Brief Outline:**\n`;
    const cleanLines = body.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---')).slice(0, 3);
    cleanLines.forEach(l => {
      res += `> ${l.slice(0, 160)}\n`;
    });
    return res;
  }

  // 4. Tasks query
  if(p.includes('task') || p.includes('to-do') || p.includes('todo') || p.includes('what should i do')){
    if(!ctx.activeTasks.length){
      return `🎉 You have **0 open tasks**! Your To-Do list is completely clear.`;
    }
    let res = `### 📋 Your Pending Priorities (${ctx.activeTasksCount} open tasks):\n\n`;
    ctx.activeTasks.forEach((t, i) => {
      res += `${i+1}. [ ] **${t.name}** ${t.category ? `<span class="pill gray sm">${t.category}</span>` : ''}\n`;
    });
    res += `\n*Tip: Knock out the first one in a focused 25-min Pomodoro round.*`;
    return res;
  }

  // 5. Notes search query
  const matchingNotes = ctx.notes.filter(n => (n.title + ' ' + n.body).toLowerCase().includes(p));
  if(matchingNotes.length){
    let res = `Found **${matchingNotes.length} notes** matching your query:\n\n`;
    matchingNotes.slice(0, 4).forEach(n => {
      res += `- 📄 **[[${n.title}]]** ${n.folder ? `(${n.folder})` : ''}\n  *${(n.body||'').slice(0, 90).replace(/[#*]/g,'')}...*\n`;
    });
    return res;
  }

  // Generic intelligent response
  return `I reviewed your local workspace:\n- **${ctx.notesCount} notes** saved\n- **${ctx.activeTasksCount} tasks** pending\n- **${ctx.focusScore}% focus score** today (${U.fmtTime(ctx.prodSec)} focused)\n\nTry asking:\n- *"Summarize today's productivity"*\n- *"Extract tasks from active note"*\n- *"What tasks are due?"*\n- *"Summarize active note"*`;
}

function openAskPebble(initialQuery = ''){
  if(copilotModal) copilotModal.remove();

  const ctx = getWorkspaceContext();
  const back = h(`<div class="cmdk-backdrop anim-fade" style="backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);background:rgba(0,0,0,0.5);z-index:2100;contain:strict;will-change:opacity">
    <div class="card copilot-modal anim-pop" style="width:min(620px,94vw);margin:8vh auto auto;border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.4);border:1px solid var(--line-strong);background:var(--surface);display:flex;flex-direction:column;max-height:84vh;transform:translate3d(0,0,0);will-change:transform,opacity;contain:layout style">
      <div class="copilot-head" style="display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line);background:var(--surface-2)">
        <div class="tile sm" style="background:var(--green);color:#0E2B0A">${icon('robot', 18)}</div>
        <div style="flex:1">
          <div style="font-size:14.5px;font-weight:800;color:var(--ink);display:flex;align-items:center;gap:6px">
            Ask Pebble <span class="pill green sm" style="font-size:9.5px">Second Brain</span>
          </div>
          <div class="faint tiny">Grounded in your Notes, Tasks &amp; Timeless data</div>
        </div>
        <button class="icon-btn sm" id="cp-close">${icon('x', 14)}</button>
      </div>

      <!-- Quick prompts bar -->
      <div class="copilot-prompts" style="display:flex;gap:6px;padding:8px 16px;background:var(--surface-3);overflow-x:auto;white-space:nowrap;border-bottom:1px solid var(--line)">
        <button class="chip" data-q="Summarize today's productivity">📊 Today's Debrief</button>
        <button class="chip" data-q="Extract tasks from active note">📋 Extract Tasks</button>
        <button class="chip" data-q="Summarize active note">📝 Summarize Note</button>
        <button class="chip" data-q="What tasks are due?">⏰ Pending Tasks</button>
      </div>

      <!-- Chat history -->
      <div class="copilot-msgs" id="cp-msgs" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;min-height:220px">
        <div class="cp-msg assistant" style="display:flex;gap:10px;align-items:flex-start">
          <div class="tile sm" style="background:var(--green-soft);color:var(--green-deep);flex:none">${icon('robot', 14)}</div>
          <div class="cp-bubble" style="background:var(--surface-2);border:1px solid var(--line);padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.5;max-width:88%;color:var(--ink)">
            Hello! I am your <b>Pebble Copilot</b>. I have direct context over your <b>${ctx.notesCount} notes</b>, <b>${ctx.activeTasksCount} tasks</b>, and today's <b>${ctx.focusScore}% focus score</b>.<br><br>How can I help you today?
          </div>
        </div>
      </div>

      <!-- Input box -->
      <div class="copilot-input-wrap" style="padding:12px 16px;border-top:1px solid var(--line);display:flex;gap:8px;background:var(--surface)">
        <input class="input" id="cp-input" placeholder="Ask anything about your notes, tasks, or day…" style="flex:1" value="${U.esc(initialQuery)}">
        <button class="btn btn-green" id="cp-send">${icon('send', 15)} Ask</button>
      </div>
    </div>
  </div>`);

  document.body.appendChild(back);
  copilotModal = back;

  const msgsHost = q('#cp-msgs', back);
  const input = q('#cp-input', back);
  const sendBtn = q('#cp-send', back);

  function appendMsg(role, text){
    const isUser = role === 'user';
    const msgEl = h(`<div class="cp-msg ${role}" style="display:flex;gap:10px;align-items:flex-start;${isUser ? 'justify-content:flex-end':''}">
      ${!isUser ? `<div class="tile sm" style="background:var(--green-soft);color:var(--green-deep);flex:none">${icon('robot', 14)}</div>` : ''}
      <div class="cp-bubble" style="background:${isUser ? 'var(--green)' : 'var(--surface-2)'};color:${isUser ? '#0E2B0A' : 'var(--ink)'};border:1px solid ${isUser ? 'transparent':'var(--line)'};padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.55;max-width:88%">
        ${isUser ? U.esc(text) : (NX.mdRender ? NX.mdRender(text) : U.esc(text))}
      </div>
      ${isUser ? `<div class="tile sm" style="background:var(--surface-3);color:var(--ink);flex:none">${icon('user', 14)}</div>` : ''}
    </div>`);
    msgsHost.appendChild(msgEl);
    msgsHost.scrollTop = msgsHost.scrollHeight;
  }

  function handleSend(promptText){
    const text = (promptText || input.value).trim();
    if(!text) return;
    input.value = '';
    appendMsg('user', text);
    NX.sfx.play('pop');

    // Thinking state
    const thinkingEl = h(`<div class="cp-thinking faint tiny" style="display:flex;align-items:center;gap:6px;padding:4px 8px">
      <span class="ob-dot" style="animation:nx-pulse 1.2s infinite"></span> Synthesizing workspace knowledge…
    </div>`);
    msgsHost.appendChild(thinkingEl);
    msgsHost.scrollTop = msgsHost.scrollHeight;

    setTimeout(() => {
      thinkingEl.remove();
      const answer = generateLocalAnswer(text, getWorkspaceContext());
      appendMsg('assistant', answer);
      NX.sfx.play('ok');
    }, 450);
  }

  sendBtn.onclick = () => handleSend();
  input.onkeydown = (e) => { if(e.key === 'Enter') handleSend(); };
  q('#cp-close', back).onclick = () => back.remove();
  back.onclick = (e) => { if(e.target === back) back.remove(); };

  qa('[data-q]', back).forEach(btn => {
    btn.onclick = () => handleSend(btn.dataset.q);
  });

  if(initialQuery){
    setTimeout(() => handleSend(initialQuery), 100);
  } else {
    setTimeout(() => input.focus(), 60);
  }
}

NX.openAskPebble = openAskPebble;

})(window.NX);
