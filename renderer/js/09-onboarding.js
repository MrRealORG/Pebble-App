/* ============================================================
   PebbleX v0.1 — 09-onboarding.js
   Brand-new first-run wizard + What's-new for upgraders.
   Steps: Welcome → Theme → Features → Browser link → Done.
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

const OB_CSS_DONE = 'ob-in';

function overlay(){
  const root = document.getElementById('nx-overlay-root');
  const el = h(`<div class="ob-backdrop"><div class="ob-card ${OB_CSS_DONE}"></div></div>`);
  root.appendChild(el);
  return { root: el, card: el.querySelector('.ob-card') };
}

function dots(host, n, cur){
  const d = h(`<div class="ob-dots">${Array.from({length:n},(_,i)=>`<i class="${i===cur?'on':i<cur?'done':''}"></i>`).join('')}</div>`);
  const old = host.querySelector('.ob-dots'); if(old) old.remove();
  host.appendChild(d);
}

function featureCard(ic, color, t, d){
  return `<div class="ob-feat"><div class="of-ic" style="background:${color}1a;color:${color}">${icon(ic)}</div>
    <div><div class="of-t">${U.esc(t)}</div><div class="of-d">${U.esc(d)}</div></div></div>`;
}

function startWizard(){
  const { root, card } = overlay();
  const profile = NX.store.get('profile', NX.defaults.profile);
  const colors = ['#7CD56E','#5EB8FF','#E8853D','#8B5CF6','#E05C9C','#0FA3A3','#E25C4A','#D4A017'];
  let step = 0, avatar = profile.avatar || colors[0];
  const TOTAL = 5;

  function render(){
    card.innerHTML = '';
    if(step === 0){
      card.innerHTML = `
        <div class="ob-logo">${NX.brandMark()}</div>
        <h1 class="ob-h">Welcome to PebbleX <span class="ob-ver">v0.1</span></h1>
        <p class="ob-p">The X series begins: your chat, notes, tasks, time and <b>real AI</b> — in one calm place. Let's set you up in 30 seconds.</p>
        <div class="field" style="max-width:320px;margin:18px auto 8px;text-align:left"><label>What should we call you?</label>
          <input class="input" id="ob-name" maxlength="24" placeholder="Your name" value="${U.esc(profile.name==='You'?'':profile.name)}"></div>
        <div class="ob-avatars" id="ob-av">${colors.map(c=>`<i class="${c===avatar?'on':''}" data-c="${c}" style="background:${c}"></i>`).join('')}</div>
        <div class="ob-actions">
          <button class="btn btn-soft ob-skip">Skip setup</button>
          <button class="btn btn-green" id="ob-next1">Continue ${icon('chevR')}</button>
        </div>`;
      qa('#ob-av i', card).forEach(el=>el.onclick = ()=>{ avatar = el.dataset.c; qa('#ob-av i', card).forEach(x=>x.classList.remove('on')); el.classList.add('on'); NX.sfx.play('tick'); });
      q('#ob-next1', card).onclick = ()=>{
        const nm = q('#ob-name', card).value.trim();
        if(nm) profile.name = nm;
        profile.avatar = avatar;
        NX.store.set('profile', profile);
        step = 1; render(); NX.sfx.play('nav');
      };
      q('.ob-skip', card).onclick = finish;
      setTimeout(()=>{ const f = q('#ob-name', card); f && f.focus(); }, 60);
    }

    if(step === 1){
      const s = NX.store.get('settings', {});
      card.innerHTML = `
        <div class="ob-logo">${NX.brandMark()}</div>
        <h1 class="ob-h">Pick your vibe</h1>
        <p class="ob-p">13 hand-tuned themes. Click one to try it live — you can switch anytime with <b>Ctrl+J</b>.</p>
        <div class="ob-themes" id="ob-themes"></div>
        <div class="ob-actions">
          <button class="btn btn-soft" id="ob-back">Back</button>
          <button class="btn btn-green" id="ob-next2">Continue ${icon('chevR')}</button>
        </div>`;
      q('#ob-themes', card).innerHTML = NX.THEMES.map(t=>`
        <div class="ob-theme ${s.theme===t.id?'on':''}" data-th="${t.id}">
          <div class="theme-swatch" style="background:${t.bg}"><i class="ts-side" style="background:${t.side}"></i><i class="ts-main" style="background:${t.main}"></i><i class="ts-pill" style="background:${t.pill}"></i></div>
          <div class="theme-name">${U.esc(t.name)}</div>
        </div>`).join('');
      qa('.ob-theme', card).forEach(el=>el.onclick = ()=>{
        NX.applyTheme(el.dataset.th); NX.sfx.play('pop');
        qa('.ob-theme', card).forEach(x=>x.classList.remove('on')); el.classList.add('on');
      });
      q('#ob-back', card).onclick = ()=>{ step = 0; render(); };
      q('#ob-next2', card).onclick = ()=>{ step = 2; render(); NX.sfx.play('nav'); };
    }

    if(step === 2){
      const done = NX.store.get('pomoStats', { done:0 }).done || 0;
      card.innerHTML = `
        <div class="ob-logo">${NX.brandMark()}</div>
        <h1 class="ob-h">Everything, in one calm place</h1>
        <p class="ob-p">Eleven modules, fourteen games and a focus suite — all running locally on your machine.</p>
        <div class="ob-feats">
          ${featureCard('chat',   '#7CD56E', 'Chat, ultra simple', 'Discord-style channels — or flip on Simple mode for one clean column. @Pel answers with a real LLM, streaming live.')}
          ${featureCard('notes',  '#5EB8FF', 'Notes like Notion', 'Press / for headings, to-dos, quotes, code & tables. Every note is a REAL .md file in a real folder on disk — and imports .md files.')}
          ${featureCard('todo',   '#0FA3A3', 'Tasks, Microsoft To Do style', 'My Day, Important, Planned — subtasks, due dates, repeats, lists and a slide-over detail panel. Mark one done and hit Undo if you change your mind.')}
          ${featureCard('target', '#E8853D', 'Focus suite', 'A pomodoro timer you can fire from any tab (Ctrl+⇧+Enter), box breathing, on-device ambient noise and 20-20-20 eye breaks.')}
          ${featureCard('game',   '#8B5CF6', 'Arcade — 14 games, zero loading', '2048, Minesweeper, Sudoku, Typing Speed, Color Match and more. Every skill game here makes the rest of the app faster to use.')}
          ${featureCard('clock',  '#B98900', 'Timeless + graphs', 'System-wide app & site tracking with real icons, re-categorization that sticks, 7-day trend graphs and a focus donut.')}
          ${featureCard('star',   '#E25C4A', 'Prompt Saver', 'Keep the prompts you type over and over — one click to copy, tag, send to Pel or share into chat.')}
          ${featureCard('bell',   '#E05C9C', 'Reminders & widget', 'Native reminders, a notification centre, and an always-on desktop widget for your clock and quick capture.')}
        </div>
        <div class="ob-hint">${done?'':'Tip — press <b>?</b> any time for the full keyboard shortcut sheet.'}</div>
        <div class="ob-actions">
          <button class="btn btn-soft" id="ob-back">Back</button>
          <button class="btn btn-green" id="ob-next3">Continue ${icon('chevR')}</button>
        </div>`;
      q('#ob-back', card).onclick = ()=>{ step = 1; render(); };
      q('#ob-next3', card).onclick = ()=>{ step = 3; render(); NX.sfx.play('nav'); };
    }

    if(step === 3){
      card.innerHTML = `
        <div class="ob-logo">${NX.brandMark()}</div>
        <h1 class="ob-h">Link your browser</h1>
        <p class="ob-p">The <b>PebbleX Timeless</b> extension auto-connects to the app and sends every tab's time straight into this dashboard — with one-click tasks, notes, prompts & messages.</p>
        <div class="ob-steps">
          <div class="ob-step"><b>1</b><span>Open <code>chrome://extensions</code> → enable <b>Developer mode</b></span></div>
          <div class="ob-step"><b>2</b><span>Click <b>Load unpacked</b> → pick the <code>extension</code> folder that came with PebbleX</span></div>
          <div class="ob-step"><b>3</b><span>Pin the Pebble icon — it auto-connects and the dot turns green</span></div>
        </div>
        <div class="ob-link-status" id="ob-link"><span class="ob-dot"></span> Checking connection…</div>
        <div class="ob-actions">
          <button class="btn btn-soft" id="ob-back">Back</button>
          <button class="btn btn-green" id="ob-next4">Continue ${icon('chevR')}</button>
        </div>`;
      q('#ob-back', card).onclick = ()=>{ step = 2; render(); };
      q('#ob-next4', card).onclick = ()=>{ step = 4; render(); NX.sfx.play('nav'); };
      (async ()=>{
        const el = q('#ob-link', card); if(!el) return;
        const st = NX.native.available ? await NX.native.extStatus() : null;
        if(st && st.connected){ el.classList.add('ok'); el.innerHTML = `<span class="ob-dot"></span> Connected — ${st.extSessions || 0} tab sessions received today`; }
        else { el.classList.add('no'); el.innerHTML = `<span class="ob-dot"></span> ${NX.native.available ? 'Not connected yet — you can link it later in Timeless' : 'Desktop feature — connect when running the Pebble app'}`; }
      })();
    }

    if(step === 4){
      card.innerHTML = `
        <div class="ob-logo big">${NX.brandMark()}</div>
        <h1 class="ob-h">You're all set, ${U.esc(NX.store.get('profile', NX.defaults.profile).name)} 🎉</h1>
        <p class="ob-p">Your PebbleX workspace is ready. Press <b>Ctrl+K</b> anytime to jump anywhere.</p>
        <div class="ob-actions center">
          <button class="btn btn-green btn-lg" id="ob-done">${icon('rocket')} Open PebbleX</button>
        </div>`;
      q('#ob-done', card).onclick = finish;
    }
    dots(card, TOTAL, step);
  }

  function finish(){
    root.classList.add('out');
    NX.store.set('onboarded', true);
    NX.store.set('whatsnew', '0.1.0');
    NX.confetti(innerWidth/2, innerHeight*0.35);
    NX.sfx.play('login');
    setTimeout(()=>root.remove(), 350);
  }

  render();
}

/* compact What's-new for users who already onboarded on an older version */
function maybeWhatsNew(){
  if(NX.store.get('onboarded') && NX.store.get('whatsnew') !== '0.1.0'){
    NX.modal({
      title:'What\'s new in PebbleX v0.1', icon:'rocket',
      body:`<div style="display:flex;flex-direction:column;gap:10px;font-size:13.5px;color:var(--ink-2);line-height:1.55">
        <div>📝 <b>Notes 2.0</b> — Notion-style / menu, REAL .md files & folders on your disk, .md import & two-way sync.</div>
        <div>⭐ <b>Prompt Saver</b> — save prompts you reuse, copy with one click, send to Pel or chat.</div>
        <div>💬 <b>Ultra-simple chat</b> — one clean column toggle + real streaming AI in @Pel.</div>
        <div>📈 <b>Timeless graphs</b> — 7-day trend, focus donut, day switcher, categories that stay saved.</div>
        <div>🎮 <b>3 new games</b> — Simon Says, Math Rush, Aim Trainer (9 total).</div>
        <div>🛠 <b>Fixed</b> — login → app handoff, close = quit, single-instance, filters, tasks board toggle, reminders firing, file sync.</div>
      </div>`,
      footer:[{ label:'Let\'s go', cls:'btn-green', onClick:()=>NX.closeAllModals() }]
    });
    NX.store.set('whatsnew', '0.1.0');
  }
}

NX.onboarding = { start: startWizard, maybeWhatsNew };
})(window.NX);
