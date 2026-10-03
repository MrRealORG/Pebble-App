/* ============================================================
   PebbleX — 47-chat-commands.js
   Slash commands for chat.

   A command is a plain object so it stays serialisable and testable:
     { name, aliases, desc, arg, run(ctx, arg) }
   `ctx` is the composer context: { send, me, path, user, close }.

   The picker is driven entirely by this list, so adding a command
   anywhere makes it discoverable in the "/" menu for free.
   ============================================================ */
(function(NX){
'use strict';

const { q, qa, util:U, icon, h } = NX;

/* ---------- registry ---------- */
const CMDS = [];
function define(list){ list.forEach(c => CMDS.push(c)); }

/* every command is wrapped so a throw can never kill the composer */
function safe(c){
  const run = c.run;
  return Object.assign({}, c, {
    run(ctx, arg){
      try{ return run(ctx, arg); }
      catch(e){
        console.error('[cmd:' + c.name + ']', e);
        NX.toastErr('Command failed', c.name + ': ' + (e && e.message || e));
      }
    }
  });
}

define([
  /* ---------- sharing your own stuff ---------- */
  { name:'note', aliases:['notes','sendnote'], arg:'[title]', desc:'Share a note from your library',
    run(ctx, arg){
      const notes = NX.store.get('notes', []) || [];
      if(!notes.length) return ctx.send('You have no notes yet.');
      if(arg){
        const hit = notes.find(n => (n.title || '').toLowerCase().includes(arg.toLowerCase()));
        if(!hit) return ctx.send('No note matching “' + arg + '”. Try /note');
        return ctx.send('📄 ' + (hit.title || 'Untitled') + '\n' + String(hit.body || '').slice(0, 600));
      }
      const top = notes.slice(0, 5).map(n => '• ' + (n.title || 'Untitled')).join('\n');
      return ctx.send('Your notes:\n' + top + '\n\nUse /note <title> to share one.');
    }},

  { name:'task', aliases:['tasks','todo'], arg:'[title]', desc:'Share a task, or create one',
    run(ctx, arg){
      if(!arg) return ctx.send('Use /task <what you need to do>');
      const tasks = NX.store.get('tasks', []) || [];
      const t = { id:'t' + Date.now().toString(36), title:arg.slice(0,120), done:false, ts:Date.now(), cloud:true };
      tasks.unshift(t);
      NX.store.set('tasks', tasks);
      NX.events.emit('todo:changed');
      return ctx.send('✅ Task added: ' + arg);
    }},

  { name:'prompt', aliases:['prompts'], arg:'[name]', desc:'Share one of your prompts',
    run(ctx, arg){
      const list = NX.store.get('prompts', []) || [];
      if(!list.length) return ctx.send('You have no prompts yet.');
      if(!arg){
        return ctx.send('Your prompts:\n' + list.slice(0,5).map(p => '• ' + (p.name || p.title || 'Untitled')).join('\n') +
                        '\n\nUse /prompt <name> to share one.');
      }
      const hit = list.find(p => ((p.name || p.title || '') + '').toLowerCase().includes(arg.toLowerCase()));
      if(!hit) return ctx.send('No prompt matching “' + arg + '”.');
      return ctx.send('⭐ ' + (hit.name || hit.title || 'Prompt') + '\n' + String(hit.body || hit.text || '').slice(0, 600));
    }},

  /* ---------- focus / timeless ---------- */
  { name:'ban', aliases:['block'], arg:'[app or site]', desc:'Ban an app or site in Timeless',
    run(ctx, arg){
      if(!arg) return ctx.send('Use /ban youtube.com or /ban steam');
      const list = NX.store.get('timelessBans', []) || [];
      const clean = arg.trim().toLowerCase();
      if(list.includes(clean)) return ctx.send('Already banned: ' + clean);
      list.push(clean);
      NX.store.set('timelessBans', list);
      NX.events.emit('timeless:bans-changed');
      return ctx.send('🚫 Banned ' + clean + ' in Timeless. Your focus, your rules.');
    }},
  { name:'unban', arg:'[app or site]', desc:'Remove a Timeless ban',
    run(ctx, arg){
      if(!arg) return ctx.send('Use /unban youtube.com');
      const list = NX.store.get('timelessBans', []) || [];
      const clean = arg.trim().toLowerCase();
      const next = list.filter(x => x !== clean);
      if(next.length === list.length) return ctx.send(clean + ' is not banned.');
      NX.store.set('timelessBans', next);
      NX.events.emit('timeless:bans-changed');
      return ctx.send('✅ Unbanned ' + clean);
    }},
  { name:'bans', desc:'List your Timeless bans',
    run(ctx){
      const list = NX.store.get('timelessBans', []) || [];
      return ctx.send(list.length ? '🚫 Banned:\n' + list.map(x => '• ' + x).join('\n') : 'Nothing banned.');
    }},
  { name:'focus', aliases:['pomo'], arg:'[minutes]', desc:'Start a focus session',
    run(ctx, arg){
      const mins = parseInt(arg, 10) || 25;
      try{ if(NX.pomo && NX.pomo.start) NX.pomo.start({ mins }); }catch(e){}
      return ctx.send('🎯 Focus session started — ' + mins + ' minutes.');
    }},
  { name:'remind', aliases:['reminder'], arg:'<text>', desc:'Create a reminder',
    run(ctx, arg){
      if(!arg) return ctx.send('Use /remind call mum at 6pm');
      const list = NX.store.get('reminders', []) || [];
      list.unshift({ id:'r' + Date.now().toString(36), text:arg.slice(0,200), when:Date.now()+3600e3, fired:false });
      NX.store.set('reminders', list);
      return ctx.send('⏰ Reminder set: ' + arg);
    }},

  /* ---------- rewards ---------- */
  { name:'points', aliases:['me'], desc:'Show your points and level',
    run(ctx){
      const p = NX.points && NX.points.state ? NX.points.state() : null;
      if(!p) return ctx.send('Points are not available yet.');
      return ctx.send('⭐ ' + (p.total || 0) + ' points · level ' + (p.level || 1));
    }},
  { name:'rank', aliases:['leaderboard','top'], arg:'[n]', desc:'Show the leaderboard',
    run(ctx, arg){
      const n = parseInt(arg, 10) || 5;
      const rows = NX.leaderboard && NX.leaderboard.top ? (NX.leaderboard.top(n) || []) : [];
      if(!rows.length) return ctx.send('The leaderboard is offline right now.');
      return ctx.send('🏆 Top ' + rows.length + '\n' +
        rows.map((r, i) => (i + 1) + '. ' + (r.name || r.handle || '—') + ' — ' + (r.points || 0)).join('\n'));
    }},

  /* ---------- chat control ---------- */
  { name:'help', aliases:['commands','?'], desc:'Show every command',
    run(ctx){
      const groups = [
        ['Sharing', ['note','task','prompt']],
        ['Focus', ['ban','unban','bans','focus','remind']],
        ['Rewards', ['points','rank']],
        ['Chat', ['who','clear','leave']]
      ];
      const byName = {}; CMDS.forEach(c => { byName[c.name] = c; (c.aliases || []).forEach(a => { byName[a] = c; }); });
      const lines = groups.map(([g, names]) =>
        g + '\n' + names.map(n => {
          const c = byName[n]; if(!c) return '';
          return '  /' + c.name + (c.arg ? ' ' + c.arg : '') + ' — ' + c.desc;
        }).filter(Boolean).join('\n')
      );
      return ctx.send('Commands\n' + lines.join('\n\n'));
    }},
  { name:'who', aliases:['online'], desc:'Who is in this conversation',
    run(ctx){
      const online = ctx.members ? ctx.members() : [];
      if(!online || !online.length) return ctx.send('Nobody else is here right now.');
      return ctx.send('Here now: ' + online.map(m => m.name || m.email || 'someone').join(', '));
    }},
  { name:'clear', desc:'Clear your view of this chat',
    run(ctx){ if(ctx.clear) ctx.clear(); }},
  { name:'leave', aliases:['close'], desc:'Close this conversation',
    run(ctx){ if(ctx.close) ctx.close(); }},

  /* ---------- plain-text fun ---------- */
  { name:'shrug', desc:'¯\\_(ツ)_/¯',
    run(ctx, arg){ return ctx.send('¯\\_(ツ)_/¯' + (arg ? ' ' + arg : '')); }},
  { name:'me', aliases:['action'], arg:'<text>', desc:'Send an italic action',
    run(ctx, arg){ return ctx.send('_' + arg + '_', { kind:'action' }); }},
  { name:'roll', aliases:['dice'], arg:'[d20|d6]', desc:'Roll dice',
    run(ctx, arg){
      const m = /d(\d+)/i.exec(arg || '') || /d(\d+)/i.exec('d' + (arg || '20'));
      const sides = m ? Math.min(1000, parseInt(m[1], 10)) : 20;
      const r = 1 + Math.floor(Math.random() * sides);
      return ctx.send('🎲 rolled ' + r + ' on a d' + sides);
    }}
].map(safe));

/* ---------- lookup ---------- */
function all(){ return CMDS.slice(); }
function find(token){
  if(!token) return null;
  const t = String(token).toLowerCase();
  return CMDS.find(c => c.name === t) || CMDS.find(c => (c.aliases || []).some(a => a === t)) || null;
}
/* fuzzy filter for the picker: prefix first, then substring */
function search(query){
  const q = String(query || '').toLowerCase().replace(/^\//,'');
  if(!q) return all();
  const prefix = all().filter(c => c.name.startsWith(q) || (c.aliases || []).some(a => a.startsWith(q)));
  if(prefix.length) return prefix;
  return all().filter(c => c.name.includes(q) || c.desc.toLowerCase().includes(q) || (c.aliases || []).some(a => a.includes(q)));
}

NX.chatCommands = { all, find, search, get count(){ return CMDS.length; } };

/* ---------- command palette (the "/" menu) ---------- */
NX.chatCommandPalette = function(anchor, onPick, query){
  const rows = search(query);
  const box = h(`<div class="cmdpane" role="listbox">
    ${rows.length ? rows.map(c => `
      <button class="cmdrow" data-cmd="${U.esc(c.name)}" role="option">
        <span class="cmd-slash">/${U.esc(c.name)}</span>
        ${c.arg ? `<span class="cmd-arg">${U.esc(c.arg)}</span>` : ''}
        <span class="cmd-desc">${U.esc(c.desc)}</span>
      </button>`).join('') : '<div class="cmdrow empty">No matching command</div>'}
  </div>`);
  const host = q('#chat-cmdhost') || document.body;
  host.appendChild(box);
  qa('.cmdrow[data-cmd]', box).forEach(b => { b.onclick = () => onPick(b.dataset.cmd); });
  return box;
};

})(window.NX);