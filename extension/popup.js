/* PebbleX Timeless v2.2 popup — one-click everything */
const $ = id => document.getElementById(id);

/* tabs */
document.querySelectorAll('nav button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(x => x.classList.remove('on'));
    document.querySelectorAll('main').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    $('tab-' + b.dataset.tab).classList.add('on');
    if (b.dataset.tab === 'today') refreshToday();
  });
});

function send(msg) {
  return new Promise(res => chrome.runtime.sendMessage(msg, r => res(r || { ok: false, error: 'no response' })));
}

function fmtDur(s) {
  s = Math.round(s || 0);
  if (s < 60) return s + 's';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

async function refreshToday() {
  const st = await send({ type: 'status' });
  const dot = $('connDot'), line = $('connLine');
  if (st.ok && st.status && st.status.connected) {
    dot.classList.add('on');
    line.innerHTML = '<b>Connected</b> to the PebbleX app · ' + (st.status.extSessions || 0) + ' tab sessions today';
  } else if (st.ok) {
    dot.classList.remove('on');
    line.textContent = 'PebbleX found but quiet — open the app and browse a tab';
  } else {
    dot.classList.remove('on');
    line.textContent = 'not connected — is the PebbleX app running? (Setup tab)';
  }
  const td = await send({ type: 'today' });
  if (!td.ok) return;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const sessions = (td.sessions || []).filter(s => (s.end || 0) >= t0.getTime());
  let p = 0, n = 0, d = 0;
  const per = new Map();
  sessions.forEach(s => {
    if (s.cat === 'productive') p += s.secs; else if (s.cat === 'distracting') d += s.secs; else n += s.secs;
    const k = s.app || 'unknown';
    if (!per.has(k)) per.set(k, { secs: 0, cat: s.cat });
    per.get(k).secs += s.secs;
  });
  $('stProd').textContent = fmtDur(p);
  $('stNeut').textContent = fmtDur(n);
  $('stDistr').textContent = fmtDur(d);
  const list = $('appList');
  if (!per.size) { list.innerHTML = '<li class="empty">browse something — time shows up here</li>'; return; }
  const max = Math.max(...[...per.values()].map(x => x.secs));
  const colors = { productive: '#7ed268', neutral: '#a7d7f9', distracting: '#eb5757' };
  list.innerHTML = [...per.entries()].sort((a, b) => b[1].secs - a[1].secs).slice(0, 8).map(([app, v]) => {
    const c = colors[v.cat] || '#a7d7f9';
    return '<li><span style="width:8px;height:8px;border-radius:99px;background:' + c + ';flex:none"></span>' +
      '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + app + '</span>' +
      '<span class="t">' + fmtDur(v.secs) + '</span>' +
      '<span style="display:none"></span></li>' +
      '<li style="padding-top:0"><span class="bar" style="flex:1"><i style="width:' + Math.round(v.secs / max * 100) + '%;background:' + c + '"></i></span></li>';
  }).join('');
}

function compressToWebP(file, maxDim = 512, quality = 0.86) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      let dataUrl = canvas.toDataURL('image/webp', quality);
      if (!dataUrl.startsWith('data:image/webp')) {
        dataUrl = canvas.toDataURL('image/png');
      }
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image'));
    };
    img.src = url;
  });
}

async function handleLogoUpload(file) {
  if (!file) return;
  try {
    flash($('sendMsg'), 'Compressing to .webp…');
    const webpUrl = await compressToWebP(file, 512, 0.86);
    $('userLogo').src = webpUrl;
    const r = await send({ type: 'upload_logo', dataUrl: webpUrl });
    flash($('sendMsg'), r.ok ? 'Logo compressed to .webp & saved ✓' : 'Logo saved locally — PebbleX quiet', !r.ok);
  } catch(e) {
    flash($('sendMsg'), 'Error processing logo: ' + e.message, true);
  }
}

const fileInp = $('extFileInput');
if (fileInp) {
  fileInp.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) handleLogoUpload(f);
  });
}
const btnLogoPick = $('btnLogoPick');
if (btnLogoPick) btnLogoPick.addEventListener('click', () => fileInp && fileInp.click());
const qUploadLogo = $('qUploadLogo');
if (qUploadLogo) qUploadLogo.addEventListener('click', () => fileInp && fileInp.click());

async function refreshConn() {
  const st = await send({ type: 'status' });
  if (st.ok && st.status && st.status.connected) $('connDot').classList.add('on');
  if (st.ok && st.profile) {
    if (st.profile.name) $('userName').textContent = st.profile.name;
    const logoSrc = st.profile.avatarImg || (st.profile.avatar && st.profile.avatar.startsWith('data:') ? st.profile.avatar : null);
    if (logoSrc) $('userLogo').src = logoSrc;
  }
}

/* send tab */
function flash(el, text, err) {
  el.textContent = text;
  el.className = 'msg' + (err ? ' err' : '');
  setTimeout(() => { el.textContent = ''; }, 4000);
}
$('qSavePage').addEventListener('click', async () => {
  const r = await send({ type: 'savepage' });
  flash($('sendMsg'), r.ok ? 'Saved “' + (r.title || 'page').slice(0, 40) + '” to Notes ✓' : 'Failed — is PebbleX running?', !r.ok);
});
$('qOpenApp').addEventListener('click', async () => {
  const r = await send({ type: 'openapp' });
  flash($('sendMsg'), r.ok ? 'Bringing PebbleX to the front…' : 'Failed — is PebbleX running?', !r.ok);
});
$('sendTask').addEventListener('click', async () => {
  const v = $('taskTitle').value.trim();
  if (!v) return flash($('sendMsg'), 'Type a task first', true);
  const r = await send({ type: 'task', title: v });
  flash($('sendMsg'), r.ok ? 'Task added ✓  (check Tasks in PebbleX)' : 'Failed — is PebbleX running?', !r.ok);
  if (r.ok) $('taskTitle').value = '';
});
$('sendNote').addEventListener('click', async () => {
  const t = $('noteTitle').value.trim(), b = $('noteBody').value.trim();
  if (!t && !b) return flash($('sendMsg'), 'Nothing to save', true);
  const r = await send({ type: 'note', title: t || b.slice(0, 60), body: b });
  flash($('sendMsg'), r.ok ? 'Note saved ✓  (check Notes in PebbleX)' : 'Failed — is PebbleX running?', !r.ok);
  if (r.ok) { $('noteTitle').value = ''; $('noteBody').value = ''; }
});
$('sendPrompt').addEventListener('click', async () => {
  const v = $('promptText').value.trim();
  if (!v) return flash($('sendMsg'), 'Type a prompt first', true);
  const r = await send({ type: 'prompt', title: 'Prompt from browser', body: v });
  flash($('sendMsg'), r.ok ? 'Prompt saved ✓  (check Notes in PebbleX)' : 'Failed — is PebbleX running?', !r.ok);
  if (r.ok) $('promptText').value = '';
});
$('sendMessage').addEventListener('click', async () => {
  const v = $('msgText').value.trim();
  if (!v) return flash($('sendMsg'), 'Type a message first', true);
  const r = await send({ type: 'message', text: v });
  flash($('sendMsg'), r.ok ? 'Sent to #general ✓' : 'Failed — is PebbleX running?', !r.ok);
  if (r.ok) $('msgText').value = '';
});

/* settings tab */
chrome.storage.local.get(['cfg', 'profile', 'userLogo'], r => {
  const c = r.cfg || {};
  $('cfgUrl').value = c.url || 'http://127.0.0.1:47615';
  $('cfgToken').value = c.token || 'pebble';
  if (r.userLogo) $('userLogo').src = r.userLogo;
  if (r.profile && r.profile.name) $('userName').textContent = r.profile.name;
});
$('saveCfg').addEventListener('click', async () => {
  const r = await send({ type: 'setcfg', url: $('cfgUrl').value.trim(), token: $('cfgToken').value.trim() });
  if (r.ok && r.health && r.health.ok) flash($('cfgMsg'), 'Connected to PebbleX ✓');
  else flash($('cfgMsg'), 'Saved — but PebbleX did not answer', true);
  refreshConn();
});

refreshConn();
refreshToday();
