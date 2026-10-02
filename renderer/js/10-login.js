/* ============================================================
   PebbleX v0.1 — 10-login.js
   Small-window login screen (local profile + optional PIN).
   - detects previous workspace data on this PC and offers a
     one-click "Continue where you left off" (tasks, notes,
     focus time are all resumed automatically)
   - closing this window without signing in QUITS PebbleX
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

const COLORS = ['#7CD56E','#5EB8FF','#E8853D','#8B5CF6','#E05C9C','#0FA3A3','#E25C4A','#D4A017'];

function hashPin(pin){
  let h1 = 5381;
  for(let i=0;i<pin.length;i++) h1 = ((h1<<5)+h1+pin.charCodeAt(i))|0;
  return 'h'+(h1>>>0).toString(36);
}

/* summary of what this PC already holds — powers the resume card */
function resumeSummary(){
  const tasks = NX.store.get('tasks', []);
  const notes = NX.store.get('notes', []);
  const tlAll = NX.store.get('timeless', {});
  const hasData = tasks.length > 0 || notes.length > 1 || Object.keys(tlAll).length > 0;
  const yesterday = tlAll[U.todayKey(new Date(Date.now()-86400e3))] || {};
  let ySec = 0;
  Object.entries(yesterday).forEach(([k,a])=>{ if(k!=='__hours' && a && a.sec) ySec += a.sec; });
  const open = tasks.filter(t=>!t.done).length;
  return { hasData, open, notes: notes.length, yesterdaySec: ySec };
}

NX.login = {
  isAuthed(){
    const s = NX.store.get('session', null);
    return !!(s && s.authed);
  },
  logout(){
    NX.store.set('session', { authed:false });
    location.hash = '#/login';
    location.reload();
  }
};

NX.router.register('login', {
  title:'Sign in', layout:'login', icon:'user',
  render(app){
    const profile = NX.store.get('profile', NX.defaults.profile);
    const auth = NX.store.get('auth', null);   // { pinHash } if PIN set
    const resume = resumeSummary();
    const returning = resume.hasData || (profile.name && profile.name !== 'You');
    let avatar = profile.avatar || COLORS[0];

    const resumeCard = (returning && !auth) ? `
      <div class="resume-card">
        <div class="rc-ic">${icon('history')}</div>
        <div class="rc-txt">
          <b>Welcome back, ${U.esc(profile.name === 'You' ? 'friend' : profile.name)}!</b>
          <span>We found your PebbleX data on this PC — ${resume.open} open task${resume.open===1?'':'s'},
          ${resume.notes} note${resume.notes===1?'':'s'}${resume.yesterdaySec>60 ? ` and ${U.fmtTime(resume.yesterdaySec)} tracked yesterday` : ''}.
          Continue where you left off?</span>
        </div>
        <button class="btn btn-green btn-sm" id="lg-resume">${icon('play')} Continue</button>
      </div>` : '';

    app.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <div class="login-dots"><i class="g"></i><i></i><i></i></div>
          <div class="login-logo">
            <div class="login-mark">${NX.brandMark()}</div>
            <div><h1>PebbleX</h1><div class="ver">v0.1 — the X series · one calm workspace</div></div>
          </div>
          <div class="login-sub">${auth && auth.pinHash ? 'Enter your PIN to unlock your workspace.' : returning ? 'Your workspace is ready — pick up right where you left off.' : 'Set up your workspace profile. It stays on this device.'}</div>
          ${resumeCard}
          <div class="login-form">
            <div class="login-err" id="lg-err"></div>
            ${auth && auth.pinHash ? `
              <div class="field"><label>PIN</label>
                <input class="input" id="lg-pin" type="password" inputmode="numeric" maxlength="12" placeholder="••••" autocomplete="current-password">
              </div>
              <button class="btn btn-green btn-lg btn-full" id="lg-go">${icon('logout')} Unlock PebbleX</button>
            ` : `
              <div class="field"><label>Your name</label>
                <input class="input" id="lg-name" maxlength="24" placeholder="e.g. Alex" value="${U.esc(profile.name==='You'?'':profile.name)}" autocomplete="name">
              </div>
              <div class="field"><label>Pick your avatar</label>
                <div class="avatar-pick">${COLORS.map((c,i)=>`<div class="av-opt ${c===avatar?'on':''}" data-c="${c}" style="background:${c}">${U.initials(profile.name!=='You'?profile.name:'Me')}</div>`).join('')}</div>
              </div>
              <div class="field"><label>PIN (optional — locks your workspace)</label>
                <input class="input" id="lg-pin" type="password" inputmode="numeric" maxlength="12" placeholder="4+ digits, or leave empty">
              </div>
              <button class="btn btn-green btn-lg btn-full" id="lg-go">${NX.icon('rocket')} Open PebbleX</button>
              <div class="login-row"><span>Everything is stored locally &amp; private.</span></div>
            `}
          </div>
          <div class="login-foot">PebbleX v0.1 · Chat · Notes · Timeless · Real AI · Prompts · Games</div>
        </div>
      </div>`;

    const err = q('#lg-err', app);
    const showErr = (m)=>{ err.textContent = m; err.classList.remove('show'); void err.offsetWidth; err.classList.add('show'); };

    qa('.av-opt', app).forEach(el=>{
      el.onclick = ()=>{
        qa('.av-opt', app).forEach(x=>x.classList.remove('on'));
        el.classList.add('on'); avatar = el.dataset.c;
        NX.sfx.play('tick');
      };
    });

    function finish(name){
      const pin = q('#lg-pin', app) ? q('#lg-pin', app).value.trim() : '';
      const p = NX.store.get('profile', NX.defaults.profile);
      p.name = name; p.avatar = avatar;
      NX.store.set('profile', p);
      if(auth && auth.pinHash){
        if(hashPin(pin) !== auth.pinHash){ showErr('Wrong PIN — try again.'); NX.sfx.play('err'); return; }
      } else if(pin){
        if(pin.length < 4){ showErr('PIN needs at least 4 digits (or leave it empty).'); return; }
        NX.store.set('auth', { pinHash: hashPin(pin) });
      }
      NX.store.set('session', { authed:true, at:Date.now() });
      NX.sfx.play('login');
      const btn = q('#lg-go', app);
      if(btn){ btn.innerHTML = 'Welcome, ' + U.esc(name) + ' ✨'; btn.disabled = true; }
      setTimeout(async ()=>{
        if(NX.native.available && NX.native.mode === 'tauri'){
          try {
            await NX.native.loginDone(name);
          } catch(e) {
            console.error('loginDone error', e);
          }
        }
        NX.router.go('dashboard');
      }, 350);
    }

    q('#lg-go', app).onclick = ()=>{
      if(auth && auth.pinHash){ finish(profile.name); return; }
      const name = q('#lg-name', app).value.trim();
      if(!name){ showErr('Tell us your name — even a nickname works.'); return; }
      finish(name);
    };
    /* one-click continue for returning users */
    const rbtn = q('#lg-resume', app);
    if(rbtn) rbtn.onclick = ()=>finish(profile.name === 'You' ? (q('#lg-name', app).value.trim() || 'You') : profile.name);
    qa('#lg-name,#lg-pin', app).forEach(inp=>{
      inp.addEventListener('keydown', e=>{ if(e.key === 'Enter') q('#lg-go', app).click(); });
    });
    setTimeout(()=>{ const f = q('#lg-resume', app) ? null : (q('#lg-name', app) || q('#lg-pin', app)); f && f.focus(); }, 80);
  }
});
})(window.NX);
