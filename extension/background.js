/* PebbleX Timeless v2.2 — active-tab time tracker + workspace link.
   AUTO-CONNECTS to the PebbleX desktop app: a heartbeat pings the local
   bridge every 25s so the app always knows the extension is alive, and
   the popup goes green the moment it lands. Default endpoint is the
   PebbleX app on 127.0.0.1:47615 — no server, no setup. */
const BATCH_MS = 30000;
const HEARTBEAT_MS = 25000;
const DEFAULT_URL = 'http://127.0.0.1:47615';
let current = null;   // { url, start }
let batch = [];       // sessions ready to send
let connected = false;
let cfg = { url: DEFAULT_URL, token: 'pebble' };

chrome.storage.local.get(['cfg'], r => {
  if (r.cfg) cfg = Object.assign({ url: DEFAULT_URL, token: 'pebble' }, r.cfg);
  if (!cfg.url) cfg.url = DEFAULT_URL;
  heartbeat();          // connect as early as possible
});

function catOf(url) {
  const u = (url || '').toLowerCase();
  if (/youtube|instagram|tiktok|twitter|x\.com|reddit|netflix|twitch|facebook|snapchat|pinterest|threads/.test(u)) return 'distracting';
  if (/docs\.google|sheets\.google|slides\.google|notion|figma|github|gitlab|stackoverflow|localhost|vercel\.app|jira|linear|trello|asana/.test(u)) return 'productive';
  return 'neutral';
}
function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url || 'unknown'; } }

function rotate(tab) {
  const now = Date.now();
  if (current && tab && current.url === tab.url) return;
  if (current) {
    const secs = Math.round((now - current.start) / 1000);
    if (secs > 2) batch.push({ id: 'x' + now.toString(36) + Math.random().toString(36).slice(2, 6), app: hostOf(current.url), url: current.url, cat: catOf(current.url), secs, source: 'extension', start: current.start, end: now });
  }
  current = tab && tab.url ? { url: tab.url, start: now } : null;
}

chrome.tabs.onActivated.addListener(async a => { try { rotate(await chrome.tabs.get(a.tabId)); } catch (e) {} });
chrome.tabs.onUpdated.addListener((id, ch, tab) => { if (ch.url && tab.active) rotate(tab); });
chrome.windows.onFocusChanged.addListener(async wid => {
  if (wid === chrome.windows.WINDOW_ID_NONE) { rotate(null); return; }
  try { const [tab] = await chrome.tabs.query({ windowId: wid, active: true }); rotate(tab); } catch (e) {}
});
chrome.idle.onStateChanged?.addListener(st => { if (st !== 'active') rotate(null); });

async function api(path, method, body) {
  const tryUrls = [cfg.url.replace(/\/$/, '')];
  if (cfg.url.includes('127.0.0.1')) {
    tryUrls.push(cfg.url.replace('127.0.0.1', 'localhost').replace(/\/$/, ''));
  } else if (cfg.url.includes('localhost')) {
    tryUrls.push(cfg.url.replace('localhost', '127.0.0.1').replace(/\/$/, ''));
  }

  let lastErr = null;
  for (const base of tryUrls) {
    try {
      const res = await fetch(base + path, {
        method: method || 'GET',
        headers: Object.assign({ 'Content-Type': 'application/json' }, cfg.token ? { 'Authorization': 'Bearer ' + cfg.token } : {}),
        body: body ? JSON.stringify(body) : undefined
      });
      if (res.ok) {
        if (cfg.url !== base) {
          cfg.url = base;
          chrome.storage.local.set({ cfg });
        }
        return await res.json();
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Connection failed');
}

/* heartbeat: keeps PebbleX's "browser link" dot green + auto-reconnects */
async function heartbeat() {
  try {
    const h = await api('/api/health');
    connected = !!(h && h.ok);
    if (connected) {
      try {
        const pf = await api('/api/profile');
        if (pf && pf.ok) chrome.storage.local.set({ profile: pf });
      } catch (e) {}
    }
  } catch (e) { connected = false; }
  try { chrome.storage.local.set({ lastSeen: Date.now(), connected }); } catch (e) {}
}
setInterval(heartbeat, HEARTBEAT_MS);

async function flush() {
  rotate(null);
  if (current) current.start = Date.now();
  if (!batch.length) return;
  const payload = batch.splice(0, batch.length);
  try {
    await api('/api/timelens', 'POST', { sessions: payload });
    try { chrome.storage.local.set({ lastSync: Date.now() }); } catch (e) {}
  } catch (e) {
    if (batch.length < 400) batch.push(...payload);
  }
}
setInterval(flush, BATCH_MS);

/* message API for the popup */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'status') {
        const s = await api('/api/status');
        let pf = null;
        try { pf = await api('/api/profile'); } catch(e){}
        sendResponse({ ok: true, status: s, url: cfg.url, connected, profile: pf });
      } else if (msg.type === 'get_profile') {
        try {
          const pf = await api('/api/profile');
          if (pf && pf.ok) chrome.storage.local.set({ profile: pf });
          sendResponse({ ok: true, profile: pf });
        } catch(e) {
          chrome.storage.local.get(['profile'], r => {
            sendResponse({ ok: !!(r && r.profile), profile: r ? r.profile : null });
          });
        }
      } else if (msg.type === 'upload_logo') {
        const r = await api('/api/profile', 'POST', { avatarImg: msg.dataUrl, avatar: msg.dataUrl });
        chrome.storage.local.set({ userLogo: msg.dataUrl });
        sendResponse({ ok: true, result: r });
      } else if (msg.type === 'today') {
        const j = await api('/api/timelens');
        sendResponse({ ok: true, sessions: j.sessions || [] });
      } else if (msg.type === 'task') {
        await api('/api/tasks', 'POST', { title: msg.title, note: msg.note || '' });
        sendResponse({ ok: true });
      } else if (msg.type === 'note') {
        await api('/api/notes', 'POST', { title: msg.title, body: msg.body || '' });
        sendResponse({ ok: true });
      } else if (msg.type === 'prompt') {
        await api('/api/prompts', 'POST', { title: msg.title || 'Prompt from browser', body: msg.body || '' });
        sendResponse({ ok: true });
      } else if (msg.type === 'message') {
        await api('/api/message', 'POST', { text: msg.text, channel: msg.channel || 'general' });
        sendResponse({ ok: true });
      } else if (msg.type === 'savepage') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return sendResponse({ ok: false, error: 'no active tab' });
        const host = hostOf(tab.url || '');
        await api('/api/notes', 'POST', { title: tab.title || host, body: `**${tab.title || ''}**\n\n${tab.url || ''}\n\nSaved from browser on ${new Date().toLocaleString()}.` });
        sendResponse({ ok: true, title: tab.title });
      } else if (msg.type === 'openapp') {
        await api('/api/show');
        sendResponse({ ok: true });
      } else if (msg.type === 'setcfg') {
        cfg = { url: msg.url || DEFAULT_URL, token: msg.token || 'pebble' };
        chrome.storage.local.set({ cfg });
        const h = await api('/api/health');
        connected = !!(h && h.ok);
        sendResponse({ ok: true, health: h });
      } else sendResponse({ ok: false, error: 'unknown message' });
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message || e) });
    }
  })();
  return true; // async response
});
