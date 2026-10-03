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

/* Remember-me: skip the name screen entirely next launch. A PIN still
   gates it when one is set — this is convenience, not a security
   decision, so it only ever applies when auth.pinHash is absent. */
const skipNextTime = !auth || !auth.pinHash;

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
              <label class="lg-remember"><input type="checkbox" id="lg-skip" checked><span>Don't ask again on this PC</span></label>
            ` : `
              <div class="field"><label>Your name</label>
                <input class="input" id="lg-name" maxlength="24" placeholder="e.g. Alex" value="${U.esc(profile.name==='You'?'':profile.name)}" autocomplete="name">
              </div>
              <div class="field"><label>Pick your avatar</label>
                <div class="avatar-pick">${COLORS.map((c,i)=>`<div class="av-opt ${c===avatar?'on':''}" data-c="${c}" style="background:${c}">${U.initials(profile.name!=='You'?profile.name:'Me')}</div>`).join('')}</div>
              </div>
              <div class="field"><label>PIN <span class="lg-opt">(optional — locks your workspace)</span></label>
                <input class="input" id="lg-pin" type="password" inputmode="numeric" maxlength="12" placeholder="Leave empty to skip next time">
              </div>
              <button class="btn btn-green btn-lg btn-full" id="lg-go">${NX.icon('rocket')} Open PebbleX</button>
              <div class="login-row"><span>Everything is stored locally &amp; private. Leave the PIN empty and we'll never ask again.</span></div>
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

    /* Everything after this is guarded: an exception here used to leave the
       button disabled and the user staring at a frozen login window. */
    let settling = false;
    async function finish(name){
      if(settling) return;
      const pinEl = q('#lg-pin', app);
      const pin = pinEl ? pinEl.value.trim() : '';
      const p = NX.store.get('profile', NX.defaults.profile);
      p.name = name; p.avatar = avatar;
      NX.store.set('profile', p);

      /* PIN is checked BEFORE the session is written and before the button
         is disabled. The old order set profile + session first, so a wrong
         PIN still created a session — and the user could then never unlock
         because the app thought it was already signed in. */
      if(auth && auth.pinHash){
        if(!U.verifyPin(pin, auth.pinHash)){
          showErr('Wrong PIN — try again.');
          try{ NX.sfx.play('err'); }catch(e){}
          if(pinEl){ pinEl.value = ''; pinEl.focus(); }
          return false;
        }
      } else if(pin){
        if(pin.length < 4){
          showErr('PIN needs at least 4 digits — or leave it empty to skip next time.');
          if(pinEl) pinEl.focus();
          return false;
        }
        NX.store.set('auth', { pinHash: U.hashPin(pin), skip: false });
      }

      /* Remember-me. An explicit choice on the unlock screen wins; with no
         PIN set we default to remembering, because asking every launch for
         no security benefit is the thing users actually complain about. */
      const skipBox = q('#lg-skip', app);
      const remember = skipBox ? skipBox.checked : skipNextTime;
      NX.store.set('ui:skipLogin', remember ? { on:true, name } : { on:false, name });

      settling = true;
      NX.store.set('session', { authed:true, at:Date.now() });
      try{ NX.sfx.play('login'); }catch(e){}

      const btn = q('#lg-go', app);
      if(btn){
        btn.innerHTML = 'Opening Pebble…';
        btn.disabled = true;
      }
      const err = q('#lg-err', app);
      if(err) err.classList.remove('show');

      /* Push to disk BEFORE handing off. The main window boots its own
         engines immediately and would otherwise restore a workspace with no
         session in it. */
      try{ if(NX.store && NX.store.flush) await NX.store.flush(); }catch(e){}

      if(NX.native.available && NX.native.mode === 'tauri'){
        try{
          await NX.native.loginDone(name);
          /* login_done shows the main window and closes this one. There is
             nothing left to do here — navigating in this window used to race
             the close and flash the login screen at the user. */
          return true;
        }catch(e){
          console.error('loginDone error', e);
          /* fall through: still try to land on the workspace in-window */
        }
      }

      /* Web build, or the handoff failed — route locally. */
      try{ location.hash = '#/dashboard'; }catch(e){ NX.router.go('dashboard'); }
      return true;
    }

    q('#lg-go', app).onclick = async ()=>{
      if(auth && auth.pinHash){
        await finish(profile.name);
        return;
      }
      const name = q('#lg-name', app).value.trim();
      if(!name){ showErr('Tell us your name — even a nickname works.'); return; }
      await finish(name);
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
