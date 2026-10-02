/* ============================================================
   Pebble 3.2 — 19-extsync.js
   Bridge between the Chrome extension and the workspace.
   Drains the native queue every few seconds (desktop) and:
   - 'session' → Timeless site time
   - 'task'    → Tasks board
   - 'note'    → Notes
   - 'message' → Chat channel
   Also exposes NX.extsync.status() for connection chips.
   ============================================================ */
(function(NX){
'use strict';
const { util:U } = NX;

let lastStatus = { connected:false, lastSeen:0, queued:0, extSessions:0 };
let drainTimer = null;

function mapCat(c){
  if(c === 'productive') return 'prod';
  if(c === 'distracting') return 'distr';
  return 'neut';
}

function findChannelKey(name){
  const chans = NX.store.get('channels', {});
  const servers = NX.store.get('servers', []);
  for(const srv of servers){
    const list = chans[srv.id] || [];
    const ch = list.find(c=>c.name === name);
    if(ch) return srv.id + ':' + ch.id;
  }
  const first = servers[0];
  const firstCh = first ? (chans[first.id] || [])[0] : null;
  return first && firstCh ? first.id + ':' + firstCh.id : null;
}

function handle(ev){
  if(!ev || !ev.kind) return false;
  try{
    if(ev.kind === 'session' && Array.isArray(ev.sessions)){
      let added = 0;
      ev.sessions.forEach(s=>{
        const host = String(s.app || s.site || '').toLowerCase();
        const secs = Math.max(0, Math.min(3600, +s.secs || 0));
        if(host && secs > 1 && NX.timeless){
          NX.timeless.bump(host, secs, true);
          added += secs;
        }
      });
      if(added > 0) NX.events.emit('timeless:tick');
      return added > 0;
    }
    if(ev.kind === 'task' && ev.payload && ev.payload.title){
      const tasks = NX.store.get('tasks', []);
      tasks.push({
        id: U.uid('tk'),
        name: String(ev.payload.title).slice(0,140),
        col: 'today',
        cat: ev.payload.cat || 'work',
        note: String(ev.payload.note||''),
        due: ev.payload.due || '',
        myDay: !!ev.payload.myDay,
        important: !!ev.payload.important,
        created: Date.now(),
        timeLinked: 0,
        done: false,
        fromExt: true
      });
      NX.store.set('tasks', tasks);
      NX.refreshBadges && NX.refreshBadges();
      NX.pushNotif('Task from MCP / Browser', ev.payload.title, 'todo');
      NX.toastOk('Task added from MCP / Browser', ev.payload.title);
      return true;
    }
    if(ev.kind === 'task_complete' && ev.payload){
      const tasks = NX.store.get('tasks', []);
      const query = String(ev.payload.id || ev.payload.title || '').trim().toLowerCase();
      const tk = tasks.find(t => t.id === query || (t.name || '').toLowerCase().includes(query));
      if(tk){
        tk.done = true;
        tk.completedAt = Date.now();
        NX.store.set('tasks', tasks);
        NX.refreshBadges && NX.refreshBadges();
        NX.toastOk('Task marked completed via MCP', tk.name);
        return true;
      }
    }
    if(ev.kind === 'note' && ev.payload && (ev.payload.title || ev.payload.body)){
      const notes = NX.store.get('notes', []);
      const n = {
        id: U.uid('nt'),
        title: String(ev.payload.title||'Quick note').slice(0,120),
        body: String(ev.payload.body||''),
        tags: ev.payload.tags || ['mcp'],
        folder: ev.payload.folder || '',
        pinned: false,
        updated: Date.now(),
        fromExt: true
      };
      notes.unshift(n);
      NX.store.set('notes', notes);
      NX.pushNotif('Note from MCP / Browser', n.title, 'notes');
      NX.toastOk('Note added from MCP / Browser', n.title);
      return true;
    }
    if(ev.kind === 'prompt' && ev.payload && ev.payload.body){
      const list = NX.store.get('prompts', []);
      list.unshift({
        id: U.uid('pr'),
        title: String(ev.payload.title || 'Prompt from browser').slice(0, 100),
        category: 'writing',
        body: String(ev.payload.body),
        tags: ['from-browser'],
        favorite: false,
        used: 0,
        created: Date.now()
      });
      NX.store.set('prompts', list);
      NX.pushNotif('Prompt saved from browser', ev.payload.title || 'Prompt', 'star');
      NX.toastOk('Prompt saved from browser', ev.payload.title || 'Prompt');
      return true;
    }
    if(ev.kind === 'message' && ev.payload && ev.payload.text){
      const key = findChannelKey(String(ev.payload.channel||'general'));
      if(key){
        const msgs = NX.store.get('messages', {});
        const profile = NX.store.get('profile', NX.defaults.profile);
        msgs[key] = msgs[key] || [];
        msgs[key].push({ who:'You (browser)', avatar:profile.avatar, text:String(ev.payload.text).slice(0,1000), ts:Date.now(), me:true, fromExt:true });
        NX.store.set('messages', msgs);
        NX.pushNotif('Message sent from browser', '#' + (ev.payload.channel||'general') + ' · ' + String(ev.payload.text).slice(0,60), 'chat');
        NX.toastOk('Message from browser', 'Delivered to #' + (ev.payload.channel||'general'));
        NX.events.emit('ext:message', key);
        return true;
      }
    }
  }catch(e){ console.error('[extsync]', e); }
  return false;
}

async function drainOnce(){
  if(!(NX.native.available && NX.native.mode === 'tauri')) return;
  try{
    const events = await NX.native.drainExt();
    let hit = false;
    (events || []).forEach(ev=>{ if(handle(ev)) hit = true; });
    if(hit){ NX.refreshBadges && NX.refreshBadges(); }
  }catch(e){}
}

async function pollStatus(){
  if(!(NX.native.available && NX.native.mode === 'tauri')){
    lastStatus = { connected:false, lastSeen:0, queued:0, extSessions:0, web:true };
    return;
  }
  try{
    const st = await NX.native.extStatus();
    if(st){
      const was = lastStatus.connected;
      lastStatus = st;
      if(!was && st.connected) NX.events.emit('ext:connected');
    }
  }catch(e){}
}

NX.extsync = {
  status(){ return lastStatus; },
  start(){
    if(drainTimer) return;
    drainTimer = setInterval(()=>{ drainOnce(); pollStatus(); }, 4000);
    drainOnce(); pollStatus();
  },
  drainOnce
};
})(window.NX);
