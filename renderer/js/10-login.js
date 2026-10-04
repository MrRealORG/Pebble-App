/* ============================================================
   PebbleX v0.1 — 10-login.js
   Modern Dark Glassmorphism Login & Cloud Authentication Screen
   - Supabase Cloud Sign-In & Registration with live device sync
   - Google OAuth authentication
   - Local Offline Profile & PIN lock
   - Cross-device workspace data restore & reconcile
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
    let activeTab = (auth && auth.pinHash) ? 'local' : 'cloud'; // Default to Cloud Sync for new users
    let cloudMode = 'signin'; // 'signin' or 'signup'

    const resumeCard = (returning && !auth) ? `
      <div class="resume-card">
        <div class="rc-ic">${icon('history')}</div>
        <div class="rc-txt">
          <b>Welcome back, ${U.esc(profile.name === 'You' ? 'friend' : profile.name)}!</b>
          <span>Found PebbleX data on this PC — ${resume.open} task${resume.open===1?'':'s'},
          ${resume.notes} note${resume.notes===1?'':'s'}${resume.yesterdaySec>60 ? ` and ${U.fmtTime(resume.yesterdaySec)} tracked yesterday` : ''}.</span>
        </div>
        <button class="btn btn-green btn-sm" id="lg-resume">${icon('play')} Continue</button>
      </div>` : '';

    /* Remember-me flag */
    const skipNextTime = !auth || !auth.pinHash;

    app.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <div class="login-dots"><i class="g"></i><i></i><i></i></div>
          
          <div class="login-logo">
            <div class="login-mark">${NX.brandMark()}</div>
            <div>
              <h1>PebbleX <span class="env-badge">PRO</span></h1>
              <div class="ver">One calm workspace · Cloud sync &amp; local vault</div>
            </div>
          </div>

          <!-- Tab Navigation: Cloud Account vs Local Workspace -->
          <div class="lg-tabs" role="tablist">
            <button class="lg-tab-btn ${activeTab==='cloud'?'on':''}" id="btn-tab-cloud">
              <span class="lg-tab-ic">${icon('cloud', 14)}</span>
              <span>Cloud Sync</span>
            </button>
            <button class="lg-tab-btn ${activeTab==='local'?'on':''}" id="btn-tab-local">
              <span class="lg-tab-ic">${icon('user', 14)}</span>
              <span>Local PIN</span>
            </button>
          </div>

          <div class="login-err" id="lg-err"></div>

          ${resumeCard}

          <!-- CLOUD SYNC SECTION (Supabase) -->
          <div class="lg-panel ${activeTab==='cloud'?'show':''}" id="panel-cloud">
            <div class="cloud-sub-toggle">
              <button class="cst-btn ${cloudMode==='signin'?'on':''}" id="btn-cloud-signin">Sign In</button>
              <button class="cst-btn ${cloudMode==='signup'?'on':''}" id="btn-cloud-signup">Create Account</button>
            </div>

            <div class="login-form">
              <div class="field" id="field-cloud-name" style="display:${cloudMode==='signup'?'block':'none'}">
                <label>Your Full Name</label>
                <input class="input" id="lg-cloud-name" placeholder="e.g. Alex Rivera" autocomplete="name">
              </div>

              <div class="field">
                <label>Email Address</label>
                <input class="input" id="lg-cloud-email" type="email" placeholder="name@domain.com" autocomplete="email" value="${U.esc(profile.email || '')}">
              </div>

              <div class="field">
                <label>Password</label>
                <div class="input-pass-wrap">
                  <input class="input" id="lg-cloud-password" type="password" placeholder="••••••••" autocomplete="current-password">
                  <button type="button" class="btn-toggle-pass" id="btn-toggle-pass" title="Show/hide password">${icon('eye', 14)}</button>
                </div>
              </div>

              <button class="btn btn-green btn-lg btn-full" id="lg-cloud-submit">
                ${icon('cloud')} <span id="lg-cloud-btn-txt">${cloudMode==='signin'?'Sign In &amp; Sync':'Create Cloud Account'}</span>
              </button>

              <div class="or-divider"><span>OR</span></div>

              <button class="btn btn-soft btn-lg btn-full btn-google-oauth" id="lg-google-oauth">
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3h3.88c2.27-2.09 3.665-5.17 3.665-9.09z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.1C3.26 21.48 7.33 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.32c-.25-.72-.38-1.49-.38-2.32s.13-1.6.38-2.32V6.58H1.24A11.95 11.95 0 0 0 0 12c0 1.92.45 3.74 1.24 5.42l4.04-3.1z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.52 1.24 6.58l4.04 3.1c.95-2.83 3.6-4.93 6.72-4.93z"/></svg>
                Continue with Google
              </button>
            </div>
            <div class="login-row cloud-status-hint">
              <span>Syncs notes, tasks, &amp; prompts across PebbleX desktop &amp; web.</span>
            </div>
          </div>

          <!-- LOCAL / OFFLINE SECTION -->
          <div class="lg-panel ${activeTab==='local'?'show':''}" id="panel-local">
            <div class="login-form">
              ${auth && auth.pinHash ? `
                <div class="field"><label>Workspace PIN</label>
                  <input class="input" id="lg-pin" type="password" inputmode="numeric" maxlength="12" placeholder="••••" autocomplete="current-password">
                </div>
                <button class="btn btn-green btn-lg btn-full" id="lg-go">${icon('logout')} Unlock PebbleX</button>
                <label class="lg-remember"><input type="checkbox" id="lg-skip" checked><span>Don't ask again on this PC</span></label>
              ` : `
                <div class="field"><label>Your name</label>
                  <input class="input" id="lg-name" maxlength="24" placeholder="e.g. Alex" value="${U.esc(profile.name==='You'?'':profile.name)}" autocomplete="name">
                </div>
                <div class="field"><label>Pick your avatar</label>
                  <div class="avatar-pick">${COLORS.map((c)=>`<div class="av-opt ${c===avatar?'on':''}" data-c="${c}" style="background:${c}">${U.initials(profile.name!=='You'?profile.name:'Me')}</div>`).join('')}</div>
                </div>
                <div class="field"><label>PIN <span class="lg-opt">(optional — locks your workspace)</span></label>
                  <input class="input" id="lg-pin" type="password" inputmode="numeric" maxlength="12" placeholder="Leave empty to skip next time">
                </div>
                <button class="btn btn-green btn-lg btn-full" id="lg-go">${NX.icon('rocket')} Open PebbleX</button>
                <label class="lg-remember" style="margin-top:6px"><input type="checkbox" id="lg-skip" checked><span>Don't ask again on this PC</span></label>
              `}
            </div>
          </div>

          <div class="login-foot">PebbleX v0.1 · Real AI · Notes · Tasks · Timeless · Prompts</div>
        </div>
      </div>`;

    const err = q('#lg-err', app);
    const showErr = (m)=>{
      err.textContent = m;
      err.classList.remove('show');
      void err.offsetWidth;
      err.classList.add('show');
      try { NX.sfx.play('err'); } catch(e){}
    };
    const hideErr = ()=>{ err.classList.remove('show'); };

    // Tab switching
    const tabCloud = q('#btn-tab-cloud', app);
    const tabLocal = q('#btn-tab-local', app);
    const panelCloud = q('#panel-cloud', app);
    const panelLocal = q('#panel-local', app);

    function setTab(t){
      activeTab = t;
      tabCloud.classList.toggle('on', t === 'cloud');
      tabLocal.classList.toggle('on', t === 'local');
      panelCloud.classList.toggle('show', t === 'cloud');
      panelLocal.classList.toggle('show', t === 'local');
      hideErr();
      try{ NX.sfx.play('nav'); }catch(e){}
    }
    if(tabCloud) tabCloud.onclick = ()=> setTab('cloud');
    if(tabLocal) tabLocal.onclick = ()=> setTab('local');

    // Cloud sub-mode: Sign In vs Sign Up
    const btnSignIn = q('#btn-cloud-signin', app);
    const btnSignUp = q('#btn-cloud-signup', app);
    const fieldName = q('#field-cloud-name', app);
    const btnTxt = q('#lg-cloud-btn-txt', app);

    function setCloudMode(m){
      cloudMode = m;
      btnSignIn.classList.toggle('on', m === 'signin');
      btnSignUp.classList.toggle('on', m === 'signup');
      if(fieldName) fieldName.style.display = m === 'signup' ? 'block' : 'none';
      if(btnTxt) btnTxt.innerHTML = m === 'signup' ? 'Create Cloud Account' : 'Sign In &amp; Sync';
      hideErr();
      try{ NX.sfx.play('tick'); }catch(e){}
    }
    if(btnSignIn) btnSignIn.onclick = ()=> setCloudMode('signin');
    if(btnSignUp) btnSignUp.onclick = ()=> setCloudMode('signup');

    // Password toggle
    const btnTogglePass = q('#btn-toggle-pass', app);
    const passInp = q('#lg-cloud-password', app);
    if(btnTogglePass && passInp){
      btnTogglePass.onclick = ()=>{
        const isPass = passInp.type === 'password';
        passInp.type = isPass ? 'text' : 'password';
        btnTogglePass.innerHTML = icon(isPass ? 'eyeOff' : 'eye', 14);
      };
    }

    // Avatar picker
    qa('.av-opt', app).forEach(el=>{
      el.onclick = ()=>{
        qa('.av-opt', app).forEach(x=>x.classList.remove('on'));
        el.classList.add('on'); avatar = el.dataset.c;
        NX.sfx.play('tick');
      };
    });

    let settling = false;
    async function finish(name){
      if(settling) return;
      const pinEl = q('#lg-pin', app);
      const pin = pinEl ? pinEl.value.trim() : '';
      const p = NX.store.get('profile', NX.defaults.profile);
      p.name = name; p.avatar = avatar;
      NX.store.set('profile', p);

      /* PIN is checked BEFORE the session is written and before the button is disabled */
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

      /* Remember-me */
      const skipBox = q('#lg-skip', app);
      const remember = skipBox ? skipBox.checked : skipNextTime;
      NX.store.set('ui:skipLogin', remember ? { on:true, name } : { on:false, name });

      settling = true;
      NX.store.set('session', { authed:true, at:Date.now() });
      try{ NX.sfx.play('login'); }catch(e){}

      const btn = q('#lg-go', app) || q('#lg-cloud-submit', app);
      if(btn){
        btn.innerHTML = 'Opening Pebble…';
        btn.disabled = true;
      }
      hideErr();

      /* Push to disk BEFORE handing off */
      try{ if(NX.store && NX.store.flush) await NX.store.flush(); }catch(e){}

      /* Electron / Tauri native handoff */
      if(NX.native.available && (NX.native.mode === 'tauri' || NX.native.mode === 'electron')){
        try{
          await NX.native.loginDone(name);
          return true;
        }catch(e){
          console.error('loginDone error', e);
        }
      }

      /* Web build fallback */
      try{ location.hash = '#/dashboard'; }catch(e){ NX.router.go('dashboard'); }
      return true;
    }

    // Cloud Authentication Handler (Supabase)
    const cloudBtn = q('#lg-cloud-submit', app);
    if(cloudBtn){
      cloudBtn.onclick = async ()=>{
        hideErr();
        const email = (q('#lg-cloud-email', app)?.value || '').trim();
        const pass = (q('#lg-cloud-password', app)?.value || '').trim();
        const name = (q('#lg-cloud-name', app)?.value || '').trim() || (email.split('@')[0] || 'You');

        if(!email || !email.includes('@')){
          showErr('Please enter a valid email address.');
          q('#lg-cloud-email', app)?.focus();
          return;
        }
        if(!pass || pass.length < 6){
          showErr('Password must be at least 6 characters.');
          q('#lg-cloud-password', app)?.focus();
          return;
        }

        cloudBtn.disabled = true;
        cloudBtn.innerHTML = `${icon('refresh')} Connecting to Supabase…`;

        try {
          if(!NX.cloud || !NX.cloud.auth){
            throw new Error('Supabase cloud service not initialized');
          }
          let res;
          if(cloudMode === 'signup'){
            res = await NX.cloud.auth.register(email, pass, name);
          } else {
            res = await NX.cloud.auth.signIn(email, pass);
          }

          if(!res || !res.ok){
            throw new Error(res && res.error ? res.error : 'Authentication failed.');
          }

          // Successfully authenticated! Reconcile data from Supabase
          const p = NX.store.get('profile', NX.defaults.profile);
          p.email = email;
          p.name = name || p.name;
          NX.store.set('profile', p);

          cloudBtn.innerHTML = `${icon('check')} Connected! Loading data…`;
          try{
            if(NX.cloud.sync && NX.cloud.sync.reconcile) await NX.cloud.sync.reconcile();
          }catch(err){ console.warn('reconcile error:', err); }

          await finish(p.name);
        } catch(err) {
          console.error('Supabase auth error:', err);
          showErr(err.message || 'Could not authenticate. Check network and credentials.');
          cloudBtn.disabled = false;
          cloudBtn.innerHTML = `${icon('cloud')} <span>${cloudMode==='signin'?'Sign In &amp; Sync':'Create Cloud Account'}</span>`;
        }
      };
    }

    // Google OAuth Handler
    const googleBtn = q('#lg-google-oauth', app);
    if(googleBtn){
      googleBtn.onclick = async ()=>{
        hideErr();
        googleBtn.disabled = true;
        googleBtn.innerHTML = `${icon('refresh')} Opening Google Sign-In…`;
        try {
          if(NX.cloud && NX.cloud.auth && NX.cloud.auth.signInWithGoogle){
            const res = await NX.cloud.auth.signInWithGoogle();
            if(res.ok && res.url && NX.native && NX.native.openExternal){
              NX.native.openExternal(res.url);
            }
          }
        } catch(err){
          showErr(err.message || 'Google sign-in could not be started.');
        } finally {
          setTimeout(()=>{
            if(googleBtn){
              googleBtn.disabled = false;
              googleBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3h3.88c2.27-2.09 3.665-5.17 3.665-9.09z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.1C3.26 21.48 7.33 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.32c-.25-.72-.38-1.49-.38-2.32s.13-1.6.38-2.32V6.58H1.24A11.95 11.95 0 0 0 0 12c0 1.92.45 3.74 1.24 5.42l4.04-3.1z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.52 1.24 6.58l4.04 3.1c.95-2.83 3.6-4.93 6.72-4.93z"/></svg> Continue with Google`;
            }
          }, 3000);
        }
      };
    }

    // Local PIN / Nickname Submit
    const localBtn = q('#lg-go', app);
    if(localBtn){
      localBtn.onclick = async ()=>{
        if(auth && auth.pinHash){
          await finish(profile.name);
          return;
        }
        const name = (q('#lg-name', app)?.value || '').trim();
        if(!name){ showErr('Tell us your name — even a nickname works.'); return; }
        await finish(name);
      };
    }

    /* One-click continue for returning users */
    const rbtn = q('#lg-resume', app);
    if(rbtn) rbtn.onclick = ()=>finish(profile.name === 'You' ? (q('#lg-name', app)?.value.trim() || 'You') : profile.name);

    // Keyboard enter handlers
    qa('#lg-name,#lg-pin', app).forEach(inp=>{
      inp.addEventListener('keydown', e=>{ if(e.key === 'Enter') q('#lg-go', app)?.click(); });
    });
    qa('#lg-cloud-email,#lg-cloud-password,#lg-cloud-name', app).forEach(inp=>{
      inp.addEventListener('keydown', e=>{ if(e.key === 'Enter') q('#lg-cloud-submit', app)?.click(); });
    });

    setTimeout(()=>{
      const f = q('#lg-resume', app) ? null : (q('#lg-cloud-email', app) || q('#lg-name', app) || q('#lg-pin', app));
      f && f.focus();
    }, 80);
  }
});
})(window.NX);
